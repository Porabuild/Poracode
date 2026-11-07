import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { loadRuntimeItemThroughHistory } from "./loadRuntimeItemThroughHistory";

const { loadOlderThreadRuntimeItems } = vi.hoisted(() => ({
  loadOlderThreadRuntimeItems: vi.fn<(threadId: string) => Promise<boolean>>(),
}));
vi.mock("@/renderer/state/chatRuntimePersister", () => ({ loadOlderThreadRuntimeItems }));

const THREAD_ID = "thread-1";

function storeItem(id: string) {
  useAppStore.setState((state) => ({
    runtimeItemsByIdByThread: {
      ...state.runtimeItemsByIdByThread,
      [THREAD_ID]: {
        ...state.runtimeItemsByIdByThread[THREAD_ID],
        [id]: { id, type: "user_message", state: "completed", payload: {}, streams: {} },
      },
    },
  }));
}

describe("loadRuntimeItemThroughHistory", () => {
  beforeEach(() => {
    loadOlderThreadRuntimeItems.mockReset();
    useAppStore.setState({ runtimeItemsByIdByThread: {} });
  });

  it("pages older history until the item is in the store", async () => {
    loadOlderThreadRuntimeItems
      .mockImplementationOnce(async () => true)
      .mockImplementationOnce(async () => {
        storeItem("target");
        return true;
      });

    await expect(loadRuntimeItemThroughHistory(THREAD_ID, "target", () => true)).resolves.toBe(
      true,
    );
    expect(loadOlderThreadRuntimeItems).toHaveBeenCalledTimes(2);
  });

  it("does not page when the item is already loaded", async () => {
    storeItem("target");
    await expect(loadRuntimeItemThroughHistory(THREAD_ID, "target", () => true)).resolves.toBe(
      true,
    );
    expect(loadOlderThreadRuntimeItems).not.toHaveBeenCalled();
  });

  it("gives up when history is exhausted before the item appears", async () => {
    loadOlderThreadRuntimeItems.mockResolvedValue(false);
    await expect(loadRuntimeItemThroughHistory(THREAD_ID, "missing", () => true)).resolves.toBe(
      false,
    );
    expect(loadOlderThreadRuntimeItems).toHaveBeenCalledOnce();
  });

  it("stops paging as soon as the caller moves on", async () => {
    let current = true;
    loadOlderThreadRuntimeItems.mockImplementation(async () => {
      current = false;
      return true;
    });
    await expect(loadRuntimeItemThroughHistory(THREAD_ID, "target", () => current)).resolves.toBe(
      false,
    );
    expect(loadOlderThreadRuntimeItems).toHaveBeenCalledOnce();
  });
});
