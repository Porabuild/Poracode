import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LspSessionStatus, LspStartPayload } from "@/shared/lsp";
import type { SupervisorEvent } from "@/shared/ipc";
import { LanguageServerManager } from "./index";
const mocks = vi.hoisted(() => ({
  instances: [] as FakeInstance[],
  starts: [] as Promise<void>[],
}));
vi.mock("./serverInstance", () => ({
  ServerInstance: class {
    start = vi.fn<() => Promise<void>>();
    dispose = vi.fn<() => void>();
    sendMessage = vi
      .fn<(message: unknown) => Promise<unknown>>()
      .mockResolvedValue("current owner");
    isReady = vi.fn<() => boolean>(() => true);
    constructor(
      _id: string,
      _config: unknown,
      _location: unknown,
      readonly message: (message: unknown) => void,
      readonly status: (status: LspSessionStatus, error?: string) => void,
    ) {
      this.start.mockReturnValue(mocks.starts.shift() ?? Promise.resolve());
      mocks.instances.push(this);
    }
  },
}));
interface FakeInstance {
  isReady: ReturnType<typeof vi.fn<() => boolean>>;
  start: ReturnType<typeof vi.fn<() => Promise<void>>>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
  sendMessage: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;
  message(message: unknown): void;
  status(status: LspSessionStatus, error?: string): void;
}
function deferred() {
  let resolve!: () => void, reject!: (e: Error) => void;
  const promise = new Promise<void>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const payload: LspStartPayload = {
  sessionId: "lsp-1",
  languageId: "typescript",
  projectLocation: { kind: "posix", path: "/repo" },
};

const diagnosticMessage = {
  method: "textDocument/publishDiagnostics",
  params: {
    uri: "file:///repo/a.ts",
    diagnostics: [
      {
        message: "Actual issue",
        severity: 1,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      },
    ],
  },
};

describe("host diagnostics source ownership", () => {
  it("distinguishes unavailable from a ready empty source and isolates project scopes", async () => {
    const manager = new LanguageServerManager(() => {});
    const gate = deferred();
    const { pending, instance } = begin(manager, gate);
    expect(manager.readDiagnostics(payload.projectLocation)).toBeUndefined();
    instance.status("ready");
    gate.resolve();
    await pending;
    expect(manager.readDiagnostics(payload.projectLocation)).toEqual({
      documents: [],
      truncated: false,
    });
    expect(manager.readDiagnostics({ kind: "posix", path: "/other" })).toBeUndefined();
    instance.message(diagnosticMessage);
    expect(
      manager.readDiagnostics(payload.projectLocation)?.documents[0]?.diagnostics[0]?.message,
    ).toBe("Actual issue");
    instance.isReady.mockReturnValue(false);
    expect(manager.readDiagnostics(payload.projectLocation)).toBeUndefined();
    manager.dispose();
  });
  it("retires diagnostics on restart, stop and owner replacement, ignoring late old publications", async () => {
    const manager = new LanguageServerManager(() => {});
    const gate = deferred();
    const { pending, instance } = begin(manager, gate);
    instance.status("ready");
    gate.resolve();
    await pending;
    instance.message(diagnosticMessage);
    instance.status("starting");
    expect(manager.readDiagnostics(payload.projectLocation)).toBeUndefined();
    instance.status("ready");
    expect(manager.readDiagnostics(payload.projectLocation)?.documents).toEqual([]);
    instance.message(diagnosticMessage);
    await manager.stop({ sessionId: payload.sessionId });
    expect(manager.readDiagnostics(payload.projectLocation)).toBeUndefined();
    const next = deferred();
    const successor = begin(manager, next);
    successor.instance.status("ready");
    next.resolve();
    await successor.pending;
    instance.message(diagnosticMessage);
    expect(manager.readDiagnostics(payload.projectLocation)?.documents).toEqual([]);
    manager.dispose();
    expect(manager.readDiagnostics(payload.projectLocation)).toBeUndefined();
  });
  it("invalidates published data when the renderer sends a real document update", async () => {
    const manager = new LanguageServerManager(() => {});
    const gate = deferred();
    const { pending, instance } = begin(manager, gate);
    instance.status("ready");
    gate.resolve();
    await pending;
    instance.message(diagnosticMessage);
    await manager.sendMessage({
      sessionId: payload.sessionId,
      message: {
        method: "textDocument/didChange",
        params: { textDocument: { uri: "file:///repo/a.ts", version: 2 } },
      },
    });
    expect(manager.readDiagnostics(payload.projectLocation)?.documents).toEqual([]);
    manager.dispose();
  });
});
beforeEach(() => {
  mocks.instances.length = 0;
  mocks.starts.length = 0;
});
// Each mock instance owns its deferred readiness before manager.start calls it.
function begin(manager: LanguageServerManager, ready: ReturnType<typeof deferred>) {
  mocks.starts.push(ready.promise);
  const pending = manager.start(payload);
  const instance = mocks.instances.at(-1)!;
  return { pending, instance };
}
describe("LanguageServerManager ownership", () => {
  it("pending duplicates await readiness instead of succeeding early", async () => {
    const events: SupervisorEvent[] = [];
    const manager = new LanguageServerManager((e) => events.push(e));
    const gate = deferred();
    const { pending, instance } = begin(manager, gate);
    let duplicateSettled = false;
    const duplicate = manager.start(payload).then(() => {
      duplicateSettled = true;
    });
    await Promise.resolve();
    const early = duplicateSettled;
    instance.status("ready");
    gate.resolve();
    await Promise.all([pending, duplicate]);
    expect(early).toBe(false);
    expect(mocks.instances).toHaveLength(1);
    manager.dispose();
    expect(instance.dispose).toHaveBeenCalledOnce();
  });
  it("late failure from a stopped predecessor cannot erase a replacement", async () => {
    const manager = new LanguageServerManager(() => {});
    const old = deferred();
    const { pending: a, instance: first } = begin(manager, old);
    const oldResult = a.catch((e) => e as Error);
    await Promise.resolve();
    await manager.stop({ sessionId: payload.sessionId });
    const next = deferred();
    const { pending: b, instance: second } = begin(manager, next);
    await Promise.resolve();
    second.status("ready");
    next.resolve();
    await b;
    old.reject(new Error("Language server failed to initialize."));
    await oldResult;
    await expect(
      manager.sendMessage({
        sessionId: payload.sessionId,
        message: { method: "textDocument/didOpen" },
      }),
    ).resolves.toBe("current owner");
    expect(second.sendMessage).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
    manager.dispose();
  });
  it("suppresses obsolete messages and statuses without hiding current readiness", async () => {
    const events: SupervisorEvent[] = [];
    const manager = new LanguageServerManager((e) => events.push(e));
    const gate = deferred();
    const { pending, instance } = begin(manager, gate);
    await Promise.resolve();
    await manager.stop({ sessionId: payload.sessionId });
    const count = events.length;
    instance.message({ stale: true });
    instance.status("ready");
    gate.resolve();
    await pending;
    expect(events).toHaveLength(count);
    expect(instance.dispose).toHaveBeenCalledOnce();
    manager.dispose();
  });
});

it("preserves privacy-safe initialization rejection and visible error status", async () => {
  const events: SupervisorEvent[] = [];
  const manager = new LanguageServerManager((e) => events.push(e)),
    gate = deferred();
  const { pending, instance } = begin(manager, gate);
  const outcome = pending.catch((error: unknown) => error);
  await Promise.resolve();
  instance.status("error", "provider detail stays in the user-facing status");
  gate.reject(new Error("Language server failed to initialize."));
  expect(await outcome).toHaveProperty("message", "Language server failed to initialize.");
  expect(events).toContainEqual({
    type: "lsp-status",
    sessionId: "lsp-1",
    languageId: "typescript",
    status: "error",
    error: "provider detail stays in the user-facing status",
  });
  expect(instance.dispose).toHaveBeenCalledOnce();
  manager.dispose();
});
it("does not drop a notification received while startup is still pending", async () => {
  const manager = new LanguageServerManager(() => {}),
    gate = deferred();
  const { pending, instance } = begin(manager, gate);
  await Promise.resolve();
  const reply = manager.sendMessage({
    sessionId: payload.sessionId,
    message: { method: "textDocument/didOpen" },
  });
  await Promise.resolve();
  const sentEarly = instance.sendMessage.mock.calls.length;
  instance.status("ready");
  gate.resolve();
  await pending;
  await reply;
  expect(sentEarly).toBe(0);
  expect(instance.sendMessage).toHaveBeenCalledOnce();
  manager.dispose();
});
it("rejects unavailable language configuration instead of reporting successful readiness", async () => {
  const manager = new LanguageServerManager(() => {});
  await expect(manager.start({ ...payload, languageId: "unsupported" })).rejects.toThrow(
    "Language server is unavailable.",
  );
  expect(mocks.instances).toHaveLength(0);
  manager.dispose();
});

it("joins restart readiness and avoids replaying stale protocol messages during backoff", async () => {
  const manager = new LanguageServerManager(() => {}),
    gate = deferred();
  const { pending, instance } = begin(manager, gate);
  await Promise.resolve();
  instance.status("ready");
  gate.resolve();
  await pending;
  instance.status("starting");
  let settled = false;
  const restart = manager.start(payload).then(() => {
    settled = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  const early = settled;
  await manager.sendMessage({
    sessionId: payload.sessionId,
    message: { method: "textDocument/didChange" },
  });
  const sent = instance.sendMessage.mock.calls.length;
  instance.status("ready");
  await restart;
  manager.dispose();
  expect(early).toBe(false);
  expect(sent).toBe(0);
});
