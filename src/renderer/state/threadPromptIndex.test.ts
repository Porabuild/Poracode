import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedPromptIndex } from "@/shared/ipc";
import { readThreadPromptIndex } from "./threadPromptIndex";

const mocks = vi.hoisted(() => ({
  isManagedRootHistoryThread: vi.fn<(threadId: string) => boolean>(),
  readManagedRootPromptIndex: vi.fn<(threadId: string, signal?: AbortSignal) => Promise<unknown>>(),
  dbGetThreadPromptIndex: vi.fn<(input: { threadId: string }) => Promise<unknown>>(),
}));
vi.mock("./managedRootCatalog/rootHistory", () => ({
  isManagedRootHistoryThread: mocks.isManagedRootHistoryThread,
  readManagedRootPromptIndex: mocks.readManagedRootPromptIndex,
}));
vi.mock("../bridge", () => ({
  readBridge: () => ({ dbGetThreadPromptIndex: mocks.dbGetThreadPromptIndex }),
}));

const INDEX: PersistedPromptIndex = {
  prompts: [{ itemId: "prompt-1", position: 2, text: "Hello" }],
  truncated: false,
};

describe("readThreadPromptIndex", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
});
