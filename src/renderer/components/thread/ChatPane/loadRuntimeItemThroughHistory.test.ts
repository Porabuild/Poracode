import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { useAppStore } from "@/renderer/state/appStore";
import {
  CONVERSATION_MATCH_WINDOW,
  loadRuntimeItemThroughHistory,
  locateConversationSearchMatch,
  type ConversationMatchReaders,
} from "./loadRuntimeItemThroughHistory";
import { buildDeepConversationCdpFixture } from "./conversationSearchJump.fixture";

const { loadOlderThreadRuntimeItems } = vi.hoisted(() => ({
  loadOlderThreadRuntimeItems: vi.fn<(threadId: string) => Promise<boolean>>(),
}));
vi.mock("@/renderer/state/chatRuntimePersister", () => ({ loadOlderThreadRuntimeItems }));

type LocatedReader = ConversationMatchReaders["readLocatedItem"];
type WindowReader = ConversationMatchReaders["readWindow"];

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

function makeItem(id: string): PersistedRuntimeItem {
  return { id, type: "user_message", state: "completed", payload: {}, streams: {} };
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

describe("locateConversationSearchMatch", () => {
  const exact = makeItem("target");
  const current = () => true;

  beforeEach(() => {
    loadOlderThreadRuntimeItems.mockReset();
  });

  it("reads one exact item and one bounded window instead of many pages", async () => {
    const fixture = buildDeepConversationCdpFixture();
    const readLocatedItem = vi.fn<LocatedReader>(async () => fixture.locatedItemResponse);
    const readWindow = vi.fn<WindowReader>(async () => fixture.windowResponse.items);
    const readers: ConversationMatchReaders = { readLocatedItem, readWindow };

    const result = await locateConversationSearchMatch(
      THREAD_ID,
      fixture.exactItemId,
      current,
      undefined,
      readers,
    );

    expect(readLocatedItem).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(readWindow).toHaveBeenCalledExactlyOnceWith(
      fixture.exactPosition + CONVERSATION_MATCH_WINDOW + 1,
      undefined,
    );
    // Deterministic before/after: many sequential pages before, 2 reads after.
    expect(fixture.legacyPageCount).toBeGreaterThan(fixture.positionedReadCount);
    expect(loadOlderThreadRuntimeItems).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "focused",
      threadId: THREAD_ID,
      itemId: fixture.exactItemId,
      items: fixture.windowResponse.items,
      neighbors: true,
    });
    expect(
      result.kind === "focused" && result.items.some((x) => x.id === fixture.exactItemId),
    ).toBe(true);
  });

  it("shows the exact item alone when neighboring items cannot be obtained", async () => {
    const readWindow = vi.fn<WindowReader>(async () => undefined);
    const readers: ConversationMatchReaders = {
      readLocatedItem: vi.fn<LocatedReader>(async () => ({ item: exact, position: 100 })),
      readWindow,
    };
    const result = await locateConversationSearchMatch(
      THREAD_ID,
      "target",
      current,
      undefined,
      readers,
    );
    expect(readWindow).toHaveBeenCalledOnce();
    expect(result).toEqual({
      kind: "focused",
      threadId: THREAD_ID,
      itemId: "target",
      items: [exact],
      neighbors: false,
    });
  });

  it("never shows a discontinuous window that lacks the exact match", async () => {
    const readers: ConversationMatchReaders = {
      readLocatedItem: vi.fn<LocatedReader>(async () => ({ item: exact, position: 100 })),
      readWindow: vi.fn<WindowReader>(async () => [makeItem("unrelated")]),
    };
    const result = await locateConversationSearchMatch(
      THREAD_ID,
      "target",
      current,
      undefined,
      readers,
    );
    expect(result).toEqual({
      kind: "focused",
      threadId: THREAD_ID,
      itemId: "target",
      items: [exact],
      neighbors: false,
    });
  });

  it("falls back to legacy paging for an older response without position", async () => {
    const readWindow = vi.fn<WindowReader>(async () => [exact]);
    const readers: ConversationMatchReaders = {
      readLocatedItem: vi.fn<LocatedReader>(async () => ({ item: exact })),
      readWindow,
    };
    const result = await locateConversationSearchMatch(
      THREAD_ID,
      "target",
      current,
      undefined,
      readers,
    );
    expect(result).toEqual({ kind: "legacy" });
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("falls back to legacy when the positioned read is unavailable", async () => {
    const readers: ConversationMatchReaders = {
      readLocatedItem: vi.fn<LocatedReader>(async () => {
        throw new Error("host unavailable");
      }),
      readWindow: vi.fn<WindowReader>(async () => [exact]),
    };
    await expect(
      locateConversationSearchMatch(THREAD_ID, "target", current, undefined, readers),
    ).resolves.toEqual({ kind: "legacy" });
  });

  it("does not attribute a result after a host/session/thread/scope switch during the located read", async () => {
    let live = true;
    const readWindow = vi.fn<WindowReader>(async () => [exact]);
    const readers: ConversationMatchReaders = {
      readLocatedItem: vi.fn<LocatedReader>(async () => {
        live = false;
        return { item: exact, position: 50 };
      }),
      readWindow,
    };
    const result = await locateConversationSearchMatch(
      THREAD_ID,
      "target",
      () => live,
      undefined,
      readers,
    );
    expect(result).toEqual({ kind: "unavailable" });
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("does not attribute a window after the caller moves on during the window read", async () => {
    let live = true;
    const readers: ConversationMatchReaders = {
      readLocatedItem: vi.fn<LocatedReader>(async () => ({ item: exact, position: 50 })),
      readWindow: vi.fn<WindowReader>(async () => {
        live = false;
        return [exact];
      }),
    };
    const result = await locateConversationSearchMatch(
      THREAD_ID,
      "target",
      () => live,
      undefined,
      readers,
    );
    expect(result).toEqual({ kind: "unavailable" });
  });

  it("abandons the read when its abort signal fires", async () => {
    const controller = new AbortController();
    const readWindow = vi.fn<WindowReader>(async () => [exact]);
    const readers: ConversationMatchReaders = {
      readLocatedItem: vi.fn<LocatedReader>(async () => {
        controller.abort();
        return { item: exact, position: 50 };
      }),
      readWindow,
    };
    const result = await locateConversationSearchMatch(
      THREAD_ID,
      "target",
      current,
      controller.signal,
      readers,
    );
    expect(result).toEqual({ kind: "unavailable" });
    expect(readWindow).not.toHaveBeenCalled();
  });
});
