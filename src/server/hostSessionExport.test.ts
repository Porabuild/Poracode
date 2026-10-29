import { EventEmitter } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_EXPORT_CHUNK_BYTES,
  sessionExportStartSchema,
  sessionExportReadSchema,
} from "@/shared/contracts/sessionExport";
import { HostSessionExports } from "./hostSessionExport";

type SendFrame = { kind: string; exportId: string };
type Send = (frame: SendFrame, callback?: (error: Error | null) => void) => boolean;
const mocks = vi.hoisted(() => ({
  fork: vi.fn<
    (
      path: string,
      args: string[],
      options: { execArgv: string[]; env: NodeJS.ProcessEnv; windowsHide: boolean },
    ) => unknown
  >(),
  exists: vi.fn<() => boolean>(() => true),
  begin: vi.fn<(threadId: string) => unknown>(),
  flush: vi.fn<(token: unknown) => Promise<{ kind: string }>>(),
  read: vi.fn<(token: unknown, read: () => Promise<void>) => Promise<void>>(),
  release: vi.fn<(token: unknown) => void>(),
  notice: vi.fn<() => null>(() => null),
}));
vi.mock("node:child_process", () => ({ fork: mocks.fork }));
vi.mock("node:fs", () => ({ existsSync: mocks.exists }));
vi.mock("@/host/db", () => ({ getRuntimeThreadGapNotice: mocks.notice }));
vi.mock("@/host/db/runtimeItems", () => ({ fenceRefusalError: () => new Error("Fence refused") }));
vi.mock("@/host/db/runtimePersistenceRuntime", () => ({
  beginRuntimeFence: mocks.begin,
  flushRuntimeFence: mocks.flush,
  readRuntimeFenceAsync: mocks.read,
  releaseRuntimeFence: mocks.release,
}));

const hosts: HostSessionExports[] = [];
function fixture(
  options: { ready?: boolean; data?: Buffer; closeOnKill?: boolean; finish?: boolean } = {},
) {
  vi.clearAllMocks();
  mocks.exists.mockReturnValue(true);
  mocks.begin.mockReturnValue({ threadId: "thread" });
  mocks.flush.mockResolvedValue({ kind: "committed" });
  mocks.read.mockImplementation(async (_token, read: () => Promise<void>) => read());
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as string | null,
    kill: vi.fn<() => boolean>(),
    send: vi.fn<Send>(),
  });
  let id = "";
  child.kill.mockImplementation(() => {
    if (options.closeOnKill !== false) queueMicrotask(() => child.emit("close", null));
    return true;
  });
  child.send.mockImplementation(
    (frame: { kind: string; exportId: string }, callback?: (error: Error | null) => void) => {
      id = frame.exportId;
      if (frame.kind === "initialize" && options.ready !== false)
        queueMicrotask(() => child.emit("message", { kind: "ready", version: 1, exportId: id }));
      if (frame.kind === "continue" && options.finish !== false) {
        const data = options.data ?? Buffer.from('{"fixture":"🦉"}\n');
        child.stdout.end(data);
        child.emit("message", {
          kind: "complete",
          version: 1,
          exportId: id,
          bytes: data.length,
          sha256: createHash("sha256").update(data).digest("hex"),
        });
        child.exitCode = 0;
        queueMicrotask(() => child.emit("close", 0));
      }
      callback?.(null);
      return true;
    },
  );
  mocks.fork.mockReturnValue(child);
  const host = new HostSessionExports({ path: "owned-worker.cjs", dbPath: "owned.sqlite" });
  hosts.push(host);
  const controller = new AbortController();
  const context = {
    signal: controller.signal,
    assertActive: () => controller.signal.throwIfAborted(),
  };
  const start = () =>
    host.execute({ action: "sessions-export-start", threadId: "thread" }, context);
  return { host, child, controller, context, start, id: () => id };
}
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("owned session export lifecycle", () => {
  it("streams bounded chunks with exact offsets and a joined, matching checksum", async () => {
    const data = Buffer.from("α🧪".repeat(40_000));
    const f = fixture({ data });
    const started = sessionExportStartSchema.parse(await f.start());
    const received: Buffer[] = [];
    let final: { nextOffset: number; sha256: string } | undefined;
    let offset = 0;
    for (;;) {
      const reply = sessionExportReadSchema.parse(
        await f.host.execute(
          {
            action: "sessions-export-read",
            threadId: "thread",
            exportId: started.exportId,
            offset,
          },
          f.context,
        ),
      );
      if (reply.finished) {
        final = reply;
        break;
      }
      const bytes = Buffer.from(reply.data, "base64");
      expect(bytes.length).toBeLessThanOrEqual(SESSION_EXPORT_CHUNK_BYTES);
      received.push(bytes);
      offset = reply.nextOffset;
    }
    expect(Buffer.concat(received)).toEqual(data);
    expect(final).toMatchObject({
      nextOffset: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
    expect(
      await f.host.execute(
        { action: "sessions-export-cancel", threadId: "thread", exportId: started.exportId },
        f.context,
      ),
    ).toMatchObject({ closed: true });
  });

  it("keeps wrong identity and offset requests from consuming or closing the selected snapshot", async () => {
    const f = fixture();
    const started = sessionExportStartSchema.parse(await f.start());
    await expect(f.start()).rejects.toThrow("Another session export");
    for (const extra of [{ exportId: randomUUID() }, { threadId: "elsewhere" }, { offset: 1 }])
      await expect(
        f.host.execute(
          {
            action: "sessions-export-read",
            threadId: "thread",
            exportId: started.exportId,
            offset: 0,
            ...extra,
          },
          f.context,
        ),
      ).rejects.toThrow(/unknown|offset/);
    expect(f.child.kill).not.toHaveBeenCalled();
    expect(
      await f.host.execute(
        {
          action: "sessions-export-read",
          threadId: "thread",
          exportId: started.exportId,
          offset: 0,
        },
        f.context,
      ),
    ).toMatchObject({ finished: false });
  });

  it("joins child and pipe closure before cancellation is confirmed, including repeated cancellation", async () => {
    const f = fixture({ closeOnKill: false, finish: false });
    const started = sessionExportStartSchema.parse(await f.start());
    const command = {
      action: "sessions-export-cancel",
      threadId: "thread",
      exportId: started.exportId,
    } as const;
    let closed = false;
    const pending = f.host.execute(command, f.context).then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    expect(f.child.stdout.destroyed).toBe(true);
    expect(f.child.stderr.destroyed).toBe(true);
    f.child.emit("close", null);
    await pending;
    expect(await f.host.execute(command, f.context)).toMatchObject({ closed: true });
    expect(f.child.kill).toHaveBeenCalledTimes(1);
  });

  it("shutdown retains startup custody until a pending persistence fence settles without spawning", async () => {
    const f = fixture();
    const flush = Promise.withResolvers<{ kind: string }>();
    mocks.flush.mockReturnValue(flush.promise);
    const start = f.start();
    const rejection = start.catch((error: unknown) => error);
    let disposed = false;
    const disposal = f.host.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(disposed).toBe(false);
    expect(mocks.release).toHaveBeenCalledTimes(1);
    flush.resolve({ kind: "committed" });
    expect(await rejection).toMatchObject({ message: expect.stringMatching(/cancelled|expired/) });
    await disposal;
    expect(mocks.fork).not.toHaveBeenCalled();
  });

  it("aborts a held snapshot read and waits for owned process closure", async () => {
    const f = fixture({ finish: false, closeOnKill: false });
    const started = sessionExportStartSchema.parse(await f.start());
    const read = f.host.execute(
      { action: "sessions-export-read", threadId: "thread", exportId: started.exportId, offset: 0 },
      f.context,
    );
    const rejected = read.catch((error: unknown) => error);
    f.controller.abort(new Error("request cancelled"));
    let disposed = false;
    const dispose = f.host.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect(disposed).toBe(false);
    f.child.emit("close", null);
    expect(await rejected).toMatchObject({ message: expect.stringMatching(/cancelled/) });
    await dispose;
  });

  it("enforces the idle deadline on a read even before the next sweep", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"],
    });
    const f = fixture({ finish: false });
    const started = sessionExportStartSchema.parse(await f.start());
    vi.setSystemTime(Date.now() + 120_001);
    await expect(
      f.host.execute(
        {
          action: "sessions-export-read",
          threadId: "thread",
          exportId: started.exportId,
          offset: 0,
        },
        f.context,
      ),
    ).rejects.toThrow(/expired/);
    expect(f.child.kill).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing worker and an uncommitted prefix before spawn", async () => {
    const f = fixture();
    mocks.exists.mockReturnValueOnce(false);
    await expect(f.start()).rejects.toThrow("Upgrade");
    mocks.flush.mockResolvedValue({ kind: "degraded" });
    await expect(f.start()).rejects.toThrow("Fence refused");
    expect(mocks.fork).not.toHaveBeenCalled();
  });

  it("admits a replacement after the idle lease and refuses the absolute deadline despite recent reads", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"],
    });
    const f = fixture({ finish: false });
    const first = sessionExportStartSchema.parse(await f.start());
    vi.setSystemTime(Date.now() + 120_001);
    // Replacement uses a fresh worker stream after exact prior retirement.
    const originalChild = f.child;
    const replacement = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      signalCode: null,
      kill: vi.fn<() => boolean>(() => {
        queueMicrotask(() => replacement.emit("close", null));
        return true;
      }),
      send: vi.fn<Send>((frame, done) => {
        if (frame.kind === "initialize")
          queueMicrotask(() =>
            replacement.emit("message", { version: 1, kind: "ready", exportId: frame.exportId }),
          );
        done?.(null);
        return true;
      }),
    });
    mocks.fork.mockReturnValue(replacement);
    const next = sessionExportStartSchema.parse(await f.start());
    expect(next.exportId).not.toBe(first.exportId);
    expect(originalChild.kill).toHaveBeenCalledOnce();
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(Date.now() + 110_000);
      replacement.stdout.write("a".repeat(SESSION_EXPORT_CHUNK_BYTES));
      await f.host.execute(
        {
          action: "sessions-export-read",
          threadId: "thread",
          exportId: next.exportId,
          offset: i * SESSION_EXPORT_CHUNK_BYTES,
        },
        f.context,
      );
    }
    vi.setSystemTime(next.expiresAt);
    await expect(
      f.host.execute(
        {
          action: "sessions-export-read",
          threadId: "thread",
          exportId: next.exportId,
          offset: 5 * SESSION_EXPORT_CHUNK_BYTES,
        },
        f.context,
      ),
    ).rejects.toThrow("expired");
    expect(replacement.kill).toHaveBeenCalledOnce();
  });

  it("retires a worker which never confirms its snapshot before the fence deadline", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"],
    });
    const f = fixture({ ready: false });
    const start = f.start();
    const rejected = start.catch((error: unknown) => error);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await rejected).toMatchObject({
      message: expect.stringContaining("export worker failed"),
    });
    expect(f.child.kill).toHaveBeenCalledOnce();
    expect(f.child.send.mock.calls.map(([frame]) => frame.kind)).toEqual(["initialize"]);
  });

  it("does not forward provider, host, device credentials or Node injection flags", async () => {
    vi.stubEnv("PRIVATE_PROVIDER_KEY", "private");
    vi.stubEnv("NODE_OPTIONS", "--require private.cjs");
    vi.stubEnv("PORACODE_DEVICE_SIGNING_KEY", "private");
    const f = fixture();
    await f.start();
    const options = mocks.fork.mock.calls[0]![2];
    expect(options.execArgv).toEqual([]);
    for (const name of ["PRIVATE_PROVIDER_KEY", "NODE_OPTIONS", "PORACODE_DEVICE_SIGNING_KEY"])
      expect(options.env).not.toHaveProperty(name);
    expect(options.windowsHide).toBe(true);
  });
});
