import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedPromptIndex } from "@/shared/ipc";
import { readCachedThreadPromptIndex, readThreadPromptIndex } from "./threadPromptIndex";
import { forgetThreadPromptIndex } from "./threadPromptIndexCache";

const mocks = vi.hoisted(() => ({
  activation: {} as object | null,
  isManagedRootHistoryThread: vi.fn<(threadId: string) => boolean>(),
  readManagedRootPromptIndex: vi.fn<(threadId: string, signal?: AbortSignal) => Promise<unknown>>(),
  dbGetThreadPromptIndex: vi.fn<(input: { threadId: string }) => Promise<unknown>>(),
}));
vi.mock("./managedRootCatalog/rootHistory", () => ({
  isManagedRootHistoryThread: mocks.isManagedRootHistoryThread,
  readManagedRootPromptIndex: mocks.readManagedRootPromptIndex,
}));
vi.mock("../bridge", () => {
  const bridge = { dbGetThreadPromptIndex: mocks.dbGetThreadPromptIndex };
  return { readBridge: () => bridge };
});
vi.mock("../browser/remoteBridge", () => ({ getRemoteBridgeClient: () => null }));
vi.mock("./appStore", () => ({ useAppStore: { getState: () => ({ threads: [] }) } }));
vi.mock("../hostTransport/loopbackHttpWsTransport", () => ({
  readManagedLoopbackActivation: () => mocks.activation,
}));

const INDEX: PersistedPromptIndex = {
  prompts: [{ itemId: "prompt-1", position: 2, text: "Hello" }],
  truncated: false,
};

describe("readThreadPromptIndex", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.activation = {};
    for (const id of ["thread-1", "remote-thread"]) forgetThreadPromptIndex(id);
  });

  it("reads this desktop's own threads over the managed loopback leg", async () => {
    mocks.isManagedRootHistoryThread.mockReturnValue(true);
    mocks.readManagedRootPromptIndex.mockResolvedValue(INDEX);

    await expect(readThreadPromptIndex("thread-1")).resolves.toEqual(INDEX);
    expect(mocks.dbGetThreadPromptIndex).not.toHaveBeenCalled();
  });

  it("reads every other thread through the routed bridge procedure", async () => {
    mocks.isManagedRootHistoryThread.mockReturnValue(false);
    mocks.dbGetThreadPromptIndex.mockResolvedValue(INDEX);

    await expect(readThreadPromptIndex("remote-thread")).resolves.toEqual(INDEX);
    expect(mocks.dbGetThreadPromptIndex).toHaveBeenCalledWith({ threadId: "remote-thread" });
    expect(mocks.readManagedRootPromptIndex).not.toHaveBeenCalled();
  });

  it("treats an older paired host that answers 404 as having no index", async () => {
    mocks.isManagedRootHistoryThread.mockReturnValue(false);
    mocks.dbGetThreadPromptIndex.mockRejectedValue(
      Object.assign(new Error("Not found"), { status: 404 }),
    );

    await expect(readThreadPromptIndex("remote-thread")).resolves.toBeNull();
  });

  it("treats a host or main that rejects the unknown procedure name as having no index", async () => {
    mocks.isManagedRootHistoryThread.mockReturnValue(false);
    mocks.dbGetThreadPromptIndex.mockRejectedValue(new Error("Unknown IPC procedure"));

    await expect(readThreadPromptIndex("thread-1")).resolves.toBeNull();
  });

  it("discards a result that arrives after the caller aborted", async () => {
    mocks.isManagedRootHistoryThread.mockReturnValue(true);
    const controller = new AbortController();
    mocks.readManagedRootPromptIndex.mockImplementation(async () => {
      controller.abort();
      return INDEX;
    });

    await expect(readThreadPromptIndex("thread-1", controller.signal)).resolves.toBeNull();
  });
  it("reuses the complete index across pane remounts without another host read", async () => {
    mocks.isManagedRootHistoryThread.mockReturnValue(true);
    mocks.readManagedRootPromptIndex.mockResolvedValue(INDEX);
    await readThreadPromptIndex("thread-1");
    expect(readCachedThreadPromptIndex("thread-1")).toBe(INDEX);
    await readThreadPromptIndex("thread-1");
    expect(mocks.readManagedRootPromptIndex).toHaveBeenCalledOnce();
  });

  it("shares an in-flight read and retains it when the first pane leaves", async () => {
    mocks.isManagedRootHistoryThread.mockReturnValue(true);
    let complete!: (index: PersistedPromptIndex) => void;
    mocks.readManagedRootPromptIndex.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const controller = new AbortController();
    const first = readThreadPromptIndex("thread-1", controller.signal);
    const second = readThreadPromptIndex("thread-1");
    await Promise.resolve();
    controller.abort();
    complete(INDEX);
    expect(await first).toBeNull();
    expect(await second).toBe(INDEX);
    expect(readCachedThreadPromptIndex("thread-1")).toBe(INDEX);
    expect(mocks.readManagedRootPromptIndex).toHaveBeenCalledOnce();
  });

  it("discards an old connection's response and reads from the new owner", async () => {
    mocks.isManagedRootHistoryThread.mockReturnValue(true);
    let complete!: (index: PersistedPromptIndex) => void;
    mocks.readManagedRootPromptIndex.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = readThreadPromptIndex("thread-1");
    await Promise.resolve();
    mocks.activation = {};
    complete(INDEX);
    expect(await pending).toBeNull();
    expect(readCachedThreadPromptIndex("thread-1")).toBeUndefined();
    mocks.readManagedRootPromptIndex.mockResolvedValue(INDEX);
    expect(await readThreadPromptIndex("thread-1")).toBe(INDEX);
    expect(mocks.readManagedRootPromptIndex).toHaveBeenCalledTimes(2);
  });

  it("does not admit a response invalidated by rollback", async () => {
    mocks.isManagedRootHistoryThread.mockReturnValue(true);
    let complete!: (index: PersistedPromptIndex) => void;
    mocks.readManagedRootPromptIndex.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = readThreadPromptIndex("thread-1");
    await Promise.resolve();
    forgetThreadPromptIndex("thread-1");
    complete(INDEX);
    expect(await pending).toBeNull();
    expect(readCachedThreadPromptIndex("thread-1")).toBeUndefined();
  });
});
