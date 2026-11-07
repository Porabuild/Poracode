import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  forgetThread: vi.fn<(hostId: string | undefined, threadId: string) => void>(),
  forgetEdit: vi.fn<(kind: string, id: string) => void>(),
  deleteThread: vi.fn<(id: string) => void>(),
  dropLaunch: vi.fn<(id: string) => void>(),
  clearNotice: vi.fn<(id: string) => void>(),
}));

vi.mock("./appStore", () => ({
  useAppStore: { getState: () => ({ deleteThread: mocks.deleteThread }) },
}));
vi.mock("./nativeVisualUiStore", () => ({
  useNativeVisualUiStore: { getState: () => ({ forgetThread: mocks.forgetThread }) },
}));
vi.mock("./pendingCatalogEdits", () => ({ forgetPendingCatalogEdit: mocks.forgetEdit }));
vi.mock("./remote/historyNoticeStore", () => ({ clearThreadHistoryNotice: mocks.clearNotice }));
vi.mock("./threadLaunchIntents", () => ({ dropPendingThreadLaunch: mocks.dropLaunch }));

import { removeConfirmedHostThread } from "./hostThreadRowRemoval";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("removeConfirmedHostThread", () => {
  it("removes the row and everything this client keeps about it, under the right ids", () => {
    removeConfirmedHostThread({
      viewThreadId: "remote:pc:thread:t1",
      hostThreadId: "t1",
      visualHostId: "pc",
    });

    expect(mocks.forgetThread).toHaveBeenCalledWith("pc", "t1");
    expect(mocks.forgetEdit).toHaveBeenCalledWith("thread", "remote:pc:thread:t1");
    expect(mocks.deleteThread).toHaveBeenCalledWith("remote:pc:thread:t1");
    expect(mocks.dropLaunch).toHaveBeenCalledWith("remote:pc:thread:t1");
    expect(mocks.clearNotice).toHaveBeenCalledWith("remote:pc:thread:t1");
  });

  it("serves the desktop's own host the same way, with no visual host id", () => {
    removeConfirmedHostThread({ viewThreadId: "t2", hostThreadId: "t2", visualHostId: undefined });

    expect(mocks.forgetThread).toHaveBeenCalledWith(undefined, "t2");
    expect(mocks.deleteThread).toHaveBeenCalledWith("t2");
    expect(mocks.dropLaunch).toHaveBeenCalledWith("t2");
  });
});
