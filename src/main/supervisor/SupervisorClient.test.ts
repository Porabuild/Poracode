import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";

const forkMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
const terminateChildProcessTreeMock = vi.hoisted(() => vi.fn<() => void>());

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, fork: forkMock };
});

vi.mock("@/shared/processTree", () => ({
  terminateChildProcessTree: terminateChildProcessTreeMock,
}));

import { SupervisorClient, type SupervisorClientOptions } from "./SupervisorClient";

type SendCallback = (error?: Error | null) => void;

interface FakeChild extends EventEmitter {
  connected: boolean;
  pid?: number;
  stdout: null;
  stderr: null;
  send: ReturnType<typeof vi.fn<(message: unknown, callback?: SendCallback) => boolean>>;
  kill: ReturnType<typeof vi.fn<() => boolean>>;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.connected = true;
  child.stdout = null;
  child.stderr = null;
  child.send = vi.fn<(message: unknown, callback?: SendCallback) => boolean>();
  child.kill = vi.fn<() => boolean>();
  return child;
}

function makeClient(options: Pick<SupervisorClientOptions, "prepareStartThread"> = {}) {
  const child = makeFakeChild();
  forkMock.mockReturnValue(child);
  const client = new SupervisorClient({
    appVersion: "test",
    isDev: true,
    supervisorPath: "/fake/supervisor.cjs",
    wslHelpersDir: "/fake/wsl",
    secretStorageKey: "key",
    onEvent: vi.fn<(event: SupervisorEvent) => void>(),
    onReset: vi.fn<() => void>(),
    ...options,
  });
  client.start("/base");
  return { client, child };
}

const epipe = () => Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

/** Capture the request id passed to `send`, replying via the provided callback. */
function captureSentId(child: FakeChild): () => string {
  let id = "";
  child.send.mockImplementation((message, callback) => {
    id = (message as { id: string }).id;
    callback?.();
    return true;
  });
  return () => id;
}

describe("SupervisorClient.call", () => {
  beforeEach(() => {
    forkMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects (does not orphan the caller) when send fails with EPIPE", async () => {
    const { client, child } = makeClient();
    child.send.mockImplementation((_message, callback) => {
      callback?.(epipe());
      return true;
    });
    await expect(client.call("any" as never, undefined as never)).rejects.toThrow("EPIPE");
  });

  it("rejects when send throws synchronously with EPIPE", async () => {
    const { client, child } = makeClient();
    child.send.mockImplementation(() => {
      throw epipe();
    });
    await expect(client.call("any" as never, undefined as never)).rejects.toThrow("EPIPE");
  });

  it("rejects on a non-EPIPE send error", async () => {
    const { client, child } = makeClient();
    child.send.mockImplementation((_message, callback) => {
      callback?.(new Error("boom"));
      return true;
    });
    await expect(client.call("any" as never, undefined as never)).rejects.toThrow("boom");
  });

  it("resolves when a matching reply arrives", async () => {
    const { client, child } = makeClient();
    const getId = captureSentId(child);
    const promise = client.call("any" as never, undefined as never);
    await vi.waitFor(() => expect(child.send).toHaveBeenCalled());
    child.emit("message", { replyTo: getId(), ok: true, data: "result-value" });
    await expect(promise).resolves.toBe("result-value");
  });

  it("applies main-process start invariants before sending the request", async () => {
    const { client, child } = makeClient({
      prepareStartThread: (payload) => ({
        ...payload,
        invariantDisabledBuiltInMcpServerIds: ["crossagents"],
      }),
    });
    let request: { id: string; payload: unknown } | undefined;
    child.send.mockImplementation((message, callback) => {
      request = message as { id: string; payload: unknown };
      callback?.();
      return true;
    });
    const promise = client.call("startThread", {
      threadId: "child-thread",
      projectLocation: { kind: "windows", path: "C:\\repo" },
      agentKind: "codex",
      config: { model: "test" },
      prompt: "Inspect this.",
      initialSize: { cols: 120, rows: 40 },
    });
    await vi.waitFor(() => expect(request).toBeDefined());
    expect(request?.payload).toMatchObject({
      invariantDisabledBuiltInMcpServerIds: ["crossagents"],
    });
    child.emit("message", { replyTo: request!.id, ok: true, data: { threadId: "child-thread" } });
    await expect(promise).resolves.toEqual({ threadId: "child-thread" });
  });

  it("rejects when the reply reports failure", async () => {
    const { client, child } = makeClient();
    const getId = captureSentId(child);
    const promise = client.call("any" as never, undefined as never);
    await vi.waitFor(() => expect(child.send).toHaveBeenCalled());
    child.emit("message", { replyTo: getId(), ok: false, error: "handler failed" });
    await expect(promise).rejects.toThrow("handler failed");
  });

  it("times out a request whose reply never arrives", async () => {
    vi.useFakeTimers();
    const { client, child } = makeClient();
    captureSentId(child);
    const promise = client.call("slow" as never, undefined as never);
    // Capture the eventual rejection now so it is never an unhandled rejection.
    const guarded = promise.catch((error: unknown) => error);
    // Flush the `await startedGate` continuation so the request + timer register…
    await vi.advanceTimersByTimeAsync(0);
    expect(child.send).toHaveBeenCalled();
    // …then advance past the timeout window.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);
    const error = await guarded;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/timed out/);
  });

  it("clears the timeout once resolved (no late rejection)", async () => {
    vi.useFakeTimers();
    const { client, child } = makeClient();
    const getId = captureSentId(child);
    const promise = client.call("any" as never, undefined as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(child.send).toHaveBeenCalled();
    child.emit("message", { replyTo: getId(), ok: true, data: "ok" });
    await expect(promise).resolves.toBe("ok");
    // Advancing past the timeout window must not produce a late rejection.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);
  });
});

describe("SupervisorClient lifecycle", () => {
  beforeEach(() => {
    forkMock.mockReset();
    terminateChildProcessTreeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("terminates the supervisor tree without restarting it when disposed", async () => {
    vi.useFakeTimers();
    const { client, child } = makeClient();

    client.dispose();
    child.emit("exit", 1);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(terminateChildProcessTreeMock).toHaveBeenCalledExactlyOnceWith(child);
    expect(forkMock).toHaveBeenCalledOnce();
  });
});
