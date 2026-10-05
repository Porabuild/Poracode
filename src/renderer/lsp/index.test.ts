import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { PoracodeBridge, SupervisorEvent } from "@/shared/ipc";
import { LspOrchestrator } from "./index";

const state = vi.hoisted(() => ({
  listeners: new Set<(event: SupervisorEvent) => void>(),
  docDisposals: [] as Array<ReturnType<typeof vi.fn<() => void>>>,
  providerDisposals: [] as Array<ReturnType<typeof vi.fn<() => void>>>,
}));
const bridge = vi.hoisted(() => ({
  lspStart: vi.fn<PoracodeBridge["lspStart"]>(),
  lspStop: vi.fn<PoracodeBridge["lspStop"]>().mockResolvedValue(undefined),
  lspSendMessage: vi.fn<PoracodeBridge["lspSendMessage"]>(),
  onSupervisorEvent: vi.fn<PoracodeBridge["onSupervisorEvent"]>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("./documentSync", () => ({
  DocumentSyncManager: class {
    dispose = vi.fn<() => void>();
    constructor() {
      state.docDisposals.push(this.dispose);
    }
  },
}));
vi.mock("./monacoProviders", () => ({
  registerLspProviders: () => {
    const dispose = vi.fn<() => void>();
    state.providerDisposals.push(dispose);
    return [{ dispose }];
  },
}));
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const monaco = { Uri: { parse: (uri: string) => ({ toString: () => uri }) } } as unknown as Monaco;
const location = { kind: "posix" as const, path: "/repo" };
const owners: LspOrchestrator[] = [];
function owner() {
  const o = new LspOrchestrator();
  owners.push(o);
  return o;
}
const start = (o: LspOrchestrator) => o.ensureServer(monaco, "project", location, "src/index.ts");
beforeEach(() => {
  vi.clearAllMocks();
  state.listeners.clear();
  state.docDisposals.length = 0;
  state.providerDisposals.length = 0;
  bridge.lspStart.mockReset().mockResolvedValue(undefined);
  bridge.lspStop.mockReset().mockResolvedValue(undefined);
  bridge.onSupervisorEvent.mockImplementation((fn) => {
    state.listeners.add(fn);
    return () => {
      state.listeners.delete(fn);
    };
  });
});
afterEach(() => {
  for (const o of owners.splice(0)) o.dispose();
  state.listeners.clear();
});

it("does not start a local language server for a remote project path", async () => {
  await expect(
    owner().ensureServer(
      monaco,
      "remote-project",
      { ...location, remoteServerId: "d1" },
      "src/index.ts",
    ),
  ).resolves.toBeNull();
  expect(bridge.lspStart).not.toHaveBeenCalled();
});
it("shares concurrent startup and owns one transport/providers/document manager", async () => {
  const ready = deferred();
  bridge.lspStart.mockReturnValue(ready.promise);
  const o = owner();
  const a = start(o),
    b = start(o);
  await Promise.resolve();
  ready.resolve();
  const [one, two] = await Promise.all([a, b]);
  expect(bridge.lspStart).toHaveBeenCalledTimes(1);
  expect(one).toBe(two);
  expect(one).not.toBeNull();
  expect(state.listeners.size).toBe(1);
  expect(state.providerDisposals).toHaveLength(1);
  await o.stopProject("project");
  expect(state.listeners.size).toBe(0);
  expect(state.docDisposals[0]).toHaveBeenCalledOnce();
  expect(state.providerDisposals[0]).toHaveBeenCalledOnce();
});
it("does not publish a pending start after project shutdown", async () => {
  const ready = deferred();
  bridge.lspStart.mockReturnValue(ready.promise);
  const o = owner();
  const pending = start(o);
  await Promise.resolve();
  await o.stopProject("project");
  ready.resolve();
  await expect(pending).resolves.toBeNull();
  expect(o.getSession("project", "src/index.ts")).toBeNull();
  expect(state.listeners.size).toBe(0);
  expect(state.providerDisposals).toHaveLength(0);
});
it("final disposal rejects late publication and future startup", async () => {
  const ready = deferred();
  bridge.lspStart.mockReturnValue(ready.promise);
  const o = owner();
  const pending = start(o);
  await Promise.resolve();
  o.dispose();
  ready.resolve();
  await expect(pending).resolves.toBeNull();
  await expect(start(o)).resolves.toBeNull();
  expect(state.listeners.size).toBe(0);
  expect(state.providerDisposals).toHaveLength(0);
});
it("waits for the previous stop acknowledgement before starting the same key again", async () => {
  const o = owner();
  await start(o);
  const stopping = deferred();
  bridge.lspStop.mockReturnValue(stopping.promise);
  const stopped = o.stopProject("project");
  const reopened = start(o);
  await Promise.resolve();
  const before = bridge.lspStart.mock.calls.length;
  stopping.resolve();
  await stopped;
  await reopened;
  expect(before).toBe(1);
  expect(bridge.lspStart).toHaveBeenCalledTimes(2);
  expect(state.listeners.size).toBe(1);
});
it("keeps another project live and permits retry after a failed start", async () => {
  const o = owner();
  const other = await o.ensureServer(monaco, "other", location, "src/index.ts");
  bridge.lspStart.mockRejectedValueOnce(new Error("Language server failed to initialize."));
  await expect(start(o)).resolves.toBeNull();
  const current = await start(o);
  expect(current).not.toBeNull();
  await o.stopProject("project");
  expect(o.getSession("other", "src/index.ts")).toBe(other);
});

it("retires terminal status so later opens can retry a stopped service", async () => {
  const o = owner();
  await start(o);
  for (const listener of [...state.listeners])
    listener({
      type: "lsp-status",
      sessionId: "project:typescript",
      languageId: "typescript",
      status: "stopped",
    });
  expect(o.getSession("project", "src/index.ts")).toBeNull();
  expect(state.listeners.size).toBe(0);
  await expect(start(o)).resolves.not.toBeNull();
  expect(bridge.lspStart).toHaveBeenCalledTimes(2);
});

it("keeps a shared project live until the last editor lease ends", async () => {
  const o = owner(),
    first = o.retainProject("project"),
    second = o.retainProject("project");
  const session = await start(o);
  first.dispose();
  first.dispose();
  expect(o.getSession("project", "src/index.ts")).toBe(session);
  expect(bridge.lspStop).not.toHaveBeenCalled();
  second.dispose();
  await o.stopProject("project");
  expect(o.getSession("project", "src/index.ts")).toBeNull();
  expect(state.listeners.size).toBe(0);
  expect(bridge.lspStop).toHaveBeenCalledOnce();
});
