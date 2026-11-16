import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedPromptIndex } from "@/shared/ipc";
import { readCachedThreadPromptIndex, readThreadPromptIndex } from "./threadPromptIndex";
import { forgetThreadPromptIndex } from "./threadPromptIndexCache";

const mocks = vi.hoisted(() => ({
  hostThreadIds: new Set<string>(),
  sessionKey: "managed:1",
  threadPromptIndex: vi.fn<(threadId: string) => Promise<unknown>>(),
  dbGetThreadPromptIndex: vi.fn<(input: { threadId: string }) => Promise<unknown>>(),
}));
vi.mock("./entityHost", () => ({
  entityHost: ({ id }: { id: string }) =>
    mocks.hostThreadIds.has(id)
      ? {
          hostId: `host-${id}`,
          sessionKey: mocks.sessionKey,
          withClient: (run: (client: unknown) => Promise<unknown>) =>
            run({ threadPromptIndex: mocks.threadPromptIndex }),
        }
      : undefined,
}));
vi.mock("../bridge", () => {
  const bridge = { dbGetThreadPromptIndex: mocks.dbGetThreadPromptIndex };
  return { readBridge: () => bridge };
});
vi.mock("../browser/remoteBridge", () => ({ getRemoteBridgeClient: () => null }));
vi.mock("./appStore", () => ({ useAppStore: { getState: () => ({ threads: [] }) } }));

const INDEX: PersistedPromptIndex = {
  prompts: [{ itemId: "prompt-1", position: 2, text: "Hello" }],
  truncated: false,
};

describe("readThreadPromptIndex", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.sessionKey = "managed:1";
    mocks.hostThreadIds = new Set(["thread-1"]);
    for (const id of ["thread-1", "local-thread"]) forgetThreadPromptIndex(id);
  });

  it("reads a host-owned thread through its owning host's client, by the host's id", async () => {
    mocks.threadPromptIndex.mockResolvedValue(INDEX);

    await expect(readThreadPromptIndex("thread-1")).resolves.toEqual(INDEX);
    expect(mocks.threadPromptIndex).toHaveBeenCalledWith("host-thread-1");
    expect(mocks.dbGetThreadPromptIndex).not.toHaveBeenCalled();
  });

  it("reads a thread no host owns through the bridge procedure", async () => {
    mocks.dbGetThreadPromptIndex.mockResolvedValue(INDEX);

    await expect(readThreadPromptIndex("local-thread")).resolves.toEqual(INDEX);
    expect(mocks.dbGetThreadPromptIndex).toHaveBeenCalledWith({ threadId: "local-thread" });
    expect(mocks.threadPromptIndex).not.toHaveBeenCalled();
  });

  it("treats an older host that answers 404 as having no index", async () => {
    mocks.threadPromptIndex.mockRejectedValue(
      Object.assign(new Error("Not found"), { status: 404 }),
    );

    await expect(readThreadPromptIndex("thread-1")).resolves.toBeNull();
  });

  it("treats a main that rejects the unknown procedure name as having no index", async () => {
    mocks.dbGetThreadPromptIndex.mockRejectedValue(new Error("Unknown IPC procedure"));

    await expect(readThreadPromptIndex("local-thread")).resolves.toBeNull();
  });

  it("discards a result that arrives after the caller aborted", async () => {
    const controller = new AbortController();
    mocks.threadPromptIndex.mockImplementation(async () => {
      controller.abort();
      return INDEX;
    });

    await expect(readThreadPromptIndex("thread-1", controller.signal)).resolves.toBeNull();
  });
  it("reuses the complete index across pane remounts without another host read", async () => {
    mocks.threadPromptIndex.mockResolvedValue(INDEX);
    await readThreadPromptIndex("thread-1");
    expect(readCachedThreadPromptIndex("thread-1")).toBe(INDEX);
    await readThreadPromptIndex("thread-1");
    expect(mocks.threadPromptIndex).toHaveBeenCalledOnce();
  });

  it("shares an in-flight read and retains it when the first pane leaves", async () => {
    let complete!: (index: PersistedPromptIndex) => void;
    mocks.threadPromptIndex.mockImplementation(
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
    expect(mocks.threadPromptIndex).toHaveBeenCalledOnce();
  });

  it("discards an old connection's response and reads from the new owner", async () => {
    let complete!: (index: PersistedPromptIndex) => void;
    mocks.threadPromptIndex.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = readThreadPromptIndex("thread-1");
    await Promise.resolve();
    mocks.sessionKey = "managed:2";
    complete(INDEX);
    expect(await pending).toBeNull();
    expect(readCachedThreadPromptIndex("thread-1")).toBeUndefined();
    mocks.threadPromptIndex.mockResolvedValue(INDEX);
    expect(await readThreadPromptIndex("thread-1")).toBe(INDEX);
    expect(mocks.threadPromptIndex).toHaveBeenCalledTimes(2);
  });

  it("does not admit a response invalidated by rollback", async () => {
    let complete!: (index: PersistedPromptIndex) => void;
    mocks.threadPromptIndex.mockImplementationOnce(
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
