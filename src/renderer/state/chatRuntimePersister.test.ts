import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./appStore";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import {
  boundVisibleThreadRuntimeWindows,
  compactRuntimeItemsForHydration,
  evictOversizedInactiveThreadRuntimeItems,
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
  releaseThreadRuntimeItems,
  retainThreadRuntimeItems,
  seedOlderThreadRuntimeItemsCursor,
} from "./chatRuntimePersister";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    dbGetThreadRuntimeItemsPage: vi.fn<
      (input: {
        threadId: string;
        beforePosition?: number;
        limit: number;
        targetTimelineEntryCount?: number;
      }) => Promise<{
        items: RuntimeChatItem[];
        nextCursor: number | null;
      }>
    >(),
    dbGetThreadCompletedTurns: vi
      .fn<(threadId: string) => Promise<never[]>>()
      .mockResolvedValue([]),
    dbGetThreadContextUsage: vi.fn<(threadId: string) => Promise<null>>().mockResolvedValue(null),
    dbGetLatestThreadGoalItem: vi
      .fn<
        (input: { threadId: string }) => Promise<{
          id: string;
          type: string;
          state: "started" | "updated" | "completed";
          payload?: unknown;
          streams: Record<string, string>;
          parentItemId?: string;
        } | null>
      >()
      .mockResolvedValue(null),
  },
}));

vi.mock("../bridge", () => ({ readBridge: () => bridge }));

function makeItem(
  input: Partial<RuntimeChatItem> & Pick<RuntimeChatItem, "id" | "type">,
): RuntimeChatItem {
  return {
    id: input.id,
    type: input.type,
    state: input.state ?? "completed",
    streams: input.streams ?? {},
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
    ...(input.parentItemId ? { parentItemId: input.parentItemId } : {}),
    ...(input.observedLive === true ? { observedLive: true } : {}),
  };
}

describe("compactRuntimeItemsForHydration", () => {
  it("compacts completed tool-call runs", () => {
    const items = compactRuntimeItemsForHydration([
      makeItem({ id: "assistant-1", type: "assistant_message" }),
      makeItem({
        id: "tool-1",
        type: "tool_call",
        payload: { name: "Viewing src/a.ts", status: "success" },
      }),
      makeItem({ id: "search-1", type: "web_search" }),
      makeItem({
        id: "command-1",
        type: "command_execution",
        payload: { command: "pnpm run test", exitCode: 0 },
      }),
      makeItem({ id: "assistant-2", type: "assistant_message" }),
    ]);

    expect(items.map((item) => item.id)).toEqual([
      "assistant-1",
      "tool-call-summary:tool-1:command-1:3",
      "assistant-2",
    ]);
  });

  it("compacts edits together with the rest of the tool-call run", () => {
    const items = compactRuntimeItemsForHydration([
      makeItem({ id: "assistant-1", type: "assistant_message" }),
      makeItem({
        id: "edit-1",
        type: "file_change",
        payload: { path: "src/foo.ts", changeKind: "edit" },
      }),
      makeItem({
        id: "edit-2",
        type: "file_change",
        payload: { path: "src/foo.ts", changeKind: "edit" },
      }),
      makeItem({
        id: "command-1",
        type: "command_execution",
        payload: { command: "pnpm run typecheck", exitCode: 0 },
      }),
      makeItem({
        id: "command-2",
        type: "command_execution",
        payload: { command: "pnpm run lint", exitCode: 0 },
      }),
      makeItem({
        id: "edit-3",
        type: "file_change",
        payload: { path: "src/bar.ts", changeKind: "edit" },
      }),
    ]);

    expect(items.map((item) => item.id)).toEqual([
      "assistant-1",
      "tool-call-summary:edit-1:edit-3:5",
    ]);
  });

  it("keeps an image-bearing tool call discrete so the image survives reload", () => {
    const imagePayload = {
      name: "imageGeneration",
      status: "success",
      result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwAD",
    };
    const items = compactRuntimeItemsForHydration([
      makeItem({
        id: "command-1",
        type: "command_execution",
        payload: { command: "ls", exitCode: 0 },
      }),
      makeItem({ id: "image-1", type: "image_view", payload: imagePayload }),
    ]);

    const ids = items.map((item) => item.id);
    expect(ids).toEqual(["command-1", "image-1"]);
    expect(items.find((item) => item.id === "image-1")?.payload).toEqual(imagePayload);
    expect(ids.some((id) => id.startsWith("tool-call-summary:"))).toBe(false);
  });

  it("drops error items so stale errors do not resurface on reopen", () => {
    const items = compactRuntimeItemsForHydration([
      makeItem({ id: "user-1", type: "user_message" }),
      makeItem({ id: "assistant-1", type: "assistant_message" }),
      makeItem({ id: "err-1", type: "error", payload: { message: "boom" } }),
    ]);

    expect(items.map((item) => item.id)).toEqual(["user-1", "assistant-1"]);
  });

  it("drops empty completed reasoning items", () => {
    const items = compactRuntimeItemsForHydration([
      makeItem({ id: "assistant-1", type: "assistant_message" }),
      makeItem({
        id: "reason-1",
        type: "reasoning",
        streams: { reasoning_text: "   " },
      }),
      makeItem({ id: "assistant-2", type: "assistant_message" }),
    ]);

    expect(items.map((item) => item.id)).toEqual(["assistant-1", "assistant-2"]);
  });
});

describe("paged runtime hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.dbGetThreadCompletedTurns.mockResolvedValue([]);
    bridge.dbGetThreadContextUsage.mockResolvedValue(null);
    bridge.dbGetLatestThreadGoalItem.mockResolvedValue(null);
    useAppStore.setState((state) => ({
      ...state,
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
    }));
  });

  it("hydrates the tail and coalesces concurrent requests for the next cursor", async () => {
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "newer", type: "assistant_message" })],
      nextCursor: 100,
    });

    await hydrateThreadRuntimeItems("paged-thread");

    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledWith({
      threadId: "paged-thread",
      limit: 500,
      targetTimelineEntryCount: 40,
    });

    let resolveOlderPage: (page: {
      items: RuntimeChatItem[];
      nextCursor: number | null;
    }) => void = () => undefined;
    bridge.dbGetThreadRuntimeItemsPage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOlderPage = resolve;
      }),
    );

    const firstLoad = loadOlderThreadRuntimeItems("paged-thread");
    const duplicateLoad = loadOlderThreadRuntimeItems("paged-thread");
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(2);
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith({
      threadId: "paged-thread",
      beforePosition: 100,
      limit: 500,
      targetTimelineEntryCount: 40,
    });

    resolveOlderPage({
      items: [makeItem({ id: "older", type: "user_message" })],
      nextCursor: null,
    });
    await expect(Promise.all([firstLoad, duplicateLoad])).resolves.toEqual([true, true]);

    expect(useAppStore.getState().runtimeItemIdsByThread["paged-thread"]).toEqual([
      "older",
      "newer",
    ]);
    await expect(loadOlderThreadRuntimeItems("paged-thread")).resolves.toBe(false);
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(2);
  });

  it("reports pending then failed hydration status, clearing on success", async () => {
    let resolvePage: (page: { items: RuntimeChatItem[]; nextCursor: number | null }) => void = () =>
      undefined;
    bridge.dbGetThreadRuntimeItemsPage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );

    const first = hydrateThreadRuntimeItems("status-thread");
    expect(useAppStore.getState().runtimeHydrationStatus["status-thread"]).toBe("pending");

    resolvePage({ items: [makeItem({ id: "i1", type: "assistant_message" })], nextCursor: null });
    await first;
    expect(useAppStore.getState().runtimeHydrationStatus["status-thread"]).toBeUndefined();

    // A failed read marks the thread retryable while the transcript is empty.
    bridge.dbGetThreadRuntimeItemsPage.mockRejectedValueOnce(new Error("db gone"));
    await hydrateThreadRuntimeItems("status-thread-2");
    expect(useAppStore.getState().runtimeHydrationStatus["status-thread-2"]).toBe("failed");
  });

  it("keeps the remote snapshot cursor through ChatPane hydration", async () => {
    seedOlderThreadRuntimeItemsCursor("remote-paged-thread", 77);
    await hydrateThreadRuntimeItems("remote-paged-thread");
    expect(bridge.dbGetThreadRuntimeItemsPage).not.toHaveBeenCalled();

    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "remote-older", type: "assistant_message" })],
      nextCursor: null,
    });

    await expect(loadOlderThreadRuntimeItems("remote-paged-thread")).resolves.toBe(true);

    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledWith({
      threadId: "remote-paged-thread",
      beforePosition: 77,
      limit: 500,
      targetTimelineEntryCount: 40,
    });
    expect(useAppStore.getState().runtimeItemIdsByThread["remote-paged-thread"]).toEqual([
      "remote-older",
    ]);
  });

  it("does not rewind an advanced remote cursor on a periodic tail refresh", async () => {
    seedOlderThreadRuntimeItemsCursor("remote-refresh-thread", 80);
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "middle-page", type: "assistant_message" })],
      nextCursor: 40,
    });
    await expect(loadOlderThreadRuntimeItems("remote-refresh-thread")).resolves.toBe(true);

    seedOlderThreadRuntimeItemsCursor("remote-refresh-thread", 80, {
      preserveExistingCursor: true,
    });
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "oldest-page", type: "assistant_message" })],
      nextCursor: null,
    });
    await expect(loadOlderThreadRuntimeItems("remote-refresh-thread")).resolves.toBe(true);

    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith({
      threadId: "remote-refresh-thread",
      beforePosition: 40,
      limit: 500,
      targetTimelineEntryCount: 40,
    });
    expect(useAppStore.getState().runtimeItemIdsByThread["remote-refresh-thread"]).toEqual([
      "oldest-page",
      "middle-page",
    ]);
  });

  it("adopts a fresh cursor when the authoritative tail is disjoint", async () => {
    seedOlderThreadRuntimeItemsCursor("remote-disjoint-thread", 80);
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "replaced-middle-page", type: "assistant_message" })],
      nextCursor: 40,
    });
    await expect(loadOlderThreadRuntimeItems("remote-disjoint-thread")).resolves.toBe(true);

    seedOlderThreadRuntimeItemsCursor("remote-disjoint-thread", 120);
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "fresh-middle-page", type: "assistant_message" })],
      nextCursor: null,
    });
    await expect(loadOlderThreadRuntimeItems("remote-disjoint-thread")).resolves.toBe(true);

    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith({
      threadId: "remote-disjoint-thread",
      beforePosition: 120,
      limit: 500,
      targetTimelineEntryCount: 40,
    });
  });

  it("rehydrates a transcript after the inactive cache evicts it", async () => {
    const threadIds = Array.from({ length: 11 }, (_, index) => `cached-thread-${index}`);
    bridge.dbGetThreadRuntimeItemsPage.mockImplementation(async ({ threadId }) => ({
      items: [makeItem({ id: `${threadId}-item`, type: "assistant_message" })],
      nextCursor: null,
    }));

    for (const threadId of threadIds) {
      await hydrateThreadRuntimeItems(threadId);
      retainThreadRuntimeItems(threadId);
      releaseThreadRuntimeItems(threadId);
    }

    expect(useAppStore.getState().runtimeItemIdsByThread[threadIds[0]!]).toBeUndefined();
    for (const threadId of threadIds.slice(1)) {
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBeDefined();
    }

    bridge.dbGetThreadRuntimeItemsPage.mockClear();
    await hydrateThreadRuntimeItems(threadIds[0]!);
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledWith({
      threadId: threadIds[0],
      limit: 500,
      targetTimelineEntryCount: 40,
    });
    expect(useAppStore.getState().runtimeItemIdsByThread[threadIds[0]!]).toEqual([
      `${threadIds[0]}-item`,
    ]);
  });

  it("evicts an oversized transcript as soon as it becomes inactive", async () => {
    const threadId = "oversized-cached-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: Array.from({ length: 5_001 }, (_, index) =>
        makeItem({ id: `message-${index}`, type: "assistant_message" }),
      ),
      nextCursor: 1,
    });

    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toHaveLength(5_001);

    releaseThreadRuntimeItems(threadId);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBeUndefined();

    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "tail-message", type: "assistant_message" })],
      nextCursor: 5_000,
    });
    await hydrateThreadRuntimeItems(threadId);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["tail-message"]);
  });

  it("merges the persisted tail with live items received after eviction", async () => {
    const threadId = "evicted-live-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: Array.from({ length: 5_001 }, (_, index) =>
        makeItem({ id: `history-${index}`, type: "assistant_message" }),
      ),
      nextCursor: 1,
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);
    releaseThreadRuntimeItems(threadId);

    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "item.started",
      threadId,
      itemId: "live-message",
      itemType: "tool_call",
      payload: {
        name: "Active agent",
        status: "running",
        isSubAgent: true,
      },
    });
    expect(hasHydratedThreadRuntimeItems(threadId)).toBe(false);

    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [
        makeItem({ id: "tail-message", type: "assistant_message" }),
        makeItem({
          id: "live-message",
          type: "tool_call",
          state: "started",
          payload: { name: "Active agent", status: "running", isSubAgent: true },
        }),
      ],
      nextCursor: 5_000,
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);

    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
      "tail-message",
      "live-message",
    ]);
    expect(
      useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["live-message"],
    ).toMatchObject({
      state: "started",
      payload: { status: "running" },
    });
  });

  it("reconciles persisted stale agents without terminating merged live agents", async () => {
    const threadId = "mixed-stale-live-thread";
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "item.started",
      threadId,
      itemId: "live-agent",
      itemType: "tool_call",
      payload: { name: "Live agent", status: "running", isSubAgent: true },
    });
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [
        makeItem({
          id: "stale-agent",
          type: "tool_call",
          state: "started",
          payload: { name: "Stale agent", status: "running", isSubAgent: true },
        }),
      ],
      nextCursor: null,
    });

    await hydrateThreadRuntimeItems(threadId);

    expect(
      useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["stale-agent"],
    ).toMatchObject({ state: "completed", payload: { status: "error" } });
    expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["live-agent"]).toMatchObject(
      {
        state: "started",
        payload: { status: "running" },
        observedLive: true,
      },
    );
  });

  it("discards an older page that resolves after eviction and rehydration", async () => {
    const threadId = "stale-page-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: Array.from({ length: 5_001 }, (_, index) =>
        makeItem({ id: `history-${index}`, type: "assistant_message" }),
      ),
      nextCursor: 1_000,
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);

    let resolveStalePage: (page: {
      items: RuntimeChatItem[];
      nextCursor: number | null;
    }) => void = () => undefined;
    bridge.dbGetThreadRuntimeItemsPage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStalePage = resolve;
      }),
    );
    const staleLoad = loadOlderThreadRuntimeItems(threadId);
    releaseThreadRuntimeItems(threadId);

    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "fresh-tail", type: "assistant_message" })],
      nextCursor: 2_000,
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);

    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "fresh-older", type: "assistant_message" })],
      nextCursor: null,
    });
    const freshLoad = loadOlderThreadRuntimeItems(threadId);

    resolveStalePage({
      items: [makeItem({ id: "stale-page", type: "assistant_message" })],
      nextCursor: 500,
    });
    await expect(staleLoad).resolves.toBe(false);
    await expect(freshLoad).resolves.toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
      "fresh-older",
      "fresh-tail",
    ]);
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenNthCalledWith(4, {
      threadId,
      beforePosition: 2_000,
      limit: 500,
      targetTimelineEntryCount: 40,
    });
  });

  it("invalidates a pending older page when a remote cursor becomes exhausted", async () => {
    const threadId = "remote-exhausted-thread";
    seedOlderThreadRuntimeItemsCursor(threadId, 100);

    let resolveStalePage: (page: {
      items: RuntimeChatItem[];
      nextCursor: number | null;
    }) => void = () => undefined;
    bridge.dbGetThreadRuntimeItemsPage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStalePage = resolve;
      }),
    );
    const staleLoad = loadOlderThreadRuntimeItems(threadId);

    seedOlderThreadRuntimeItemsCursor(threadId, null, { preserveExistingCursor: true });
    resolveStalePage({
      items: [makeItem({ id: "stale-remote-page", type: "assistant_message" })],
      nextCursor: 50,
    });

    await expect(staleLoad).resolves.toBe(false);
    await expect(loadOlderThreadRuntimeItems(threadId)).resolves.toBe(false);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBeUndefined();
  });

  it("re-evicts an inactive transcript that regrows from background events", async () => {
    const threadId = "regrown-background-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: Array.from({ length: 5_001 }, (_, index) =>
        makeItem({ id: `history-${index}`, type: "assistant_message" }),
      ),
      nextCursor: 1,
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);
    releaseThreadRuntimeItems(threadId);

    useAppStore.getState().applyRuntimeEvents(
      threadId,
      Array.from({ length: 5_001 }, (_, index) => ({
        type: "item.started" as const,
        threadId,
        itemId: `background-${index}`,
        itemType: "assistant_message" as const,
      })),
    );
    evictOversizedInactiveThreadRuntimeItems([threadId]);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBeUndefined();
  });

  it("re-pins an out-of-window goal item when the paged tail has none", async () => {
    const threadId = "long-goal-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "assistant-recent", type: "assistant_message" })],
      nextCursor: 50,
    });
    bridge.dbGetLatestThreadGoalItem.mockResolvedValueOnce({
      id: "goal-old",
      type: "goal",
      state: "updated",
      payload: { action: "set", objective: "ship coverage", status: "active" },
      streams: {},
    });

    await hydrateThreadRuntimeItems(threadId);

    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
      "goal-old",
      "assistant-recent",
    ]);
    const goal = useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["goal-old"];
    expect(goal?.type).toBe("goal");
  });

  it("retries hydration after the latest goal lookup fails", async () => {
    const threadId = "goal-retry-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValue({
      items: [makeItem({ id: "assistant-recent", type: "assistant_message" })],
      nextCursor: 50,
    });
    bridge.dbGetLatestThreadGoalItem
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({
        id: "goal-old",
        type: "goal",
        state: "updated",
        payload: { action: "set", objective: "retry coverage", status: "active" },
        streams: {},
      });

    await hydrateThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);

    expect(bridge.dbGetLatestThreadGoalItem).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
      "goal-old",
      "assistant-recent",
    ]);
  });

  it("does not duplicate a goal item already present in the tail", async () => {
    const threadId = "goal-in-tail-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [
        makeItem({ id: "goal-in-tail", type: "goal", payload: { objective: "keep me" } }),
        makeItem({ id: "assistant-recent", type: "assistant_message" }),
      ],
      nextCursor: 50,
    });
    bridge.dbGetLatestThreadGoalItem.mockResolvedValueOnce({
      id: "goal-in-tail",
      type: "goal",
      state: "updated",
      payload: { objective: "keep me" },
      streams: {},
    });

    await hydrateThreadRuntimeItems(threadId);

    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
      "goal-in-tail",
      "assistant-recent",
    ]);
  });

  it("does not pin when no persisted goal exists", async () => {
    const threadId = "no-goal-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "assistant-recent", type: "assistant_message" })],
      nextCursor: null,
    });
    bridge.dbGetLatestThreadGoalItem.mockResolvedValueOnce(null);

    await hydrateThreadRuntimeItems(threadId);

    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["assistant-recent"]);
  });
});

/**
 * BEHAVIOR CHANGE (Gate 4 Batch 1): bounded visible window for LIVE threads.
 * The tests in this block pin the new eviction contract and are structured to
 * be committed separately from the rest of the batch.
 */
describe("bounded visible window (live threads)", () => {
  const WINDOW_ITEM_BYTES = 256 * 1024;

  function bigEvent(
    threadId: string,
    itemId: string,
  ): Parameters<ReturnType<typeof useAppStore.getState>["applyRuntimeEvents"]>[1][number] {
    return {
      type: "item.started",
      threadId,
      itemId,
      itemType: "assistant_message",
      payload: { content: "x".repeat(WINDOW_ITEM_BYTES) },
    };
  }

  /** Started + completed pair: the shape the window bound exists for — a
   * long history of COMPLETED rows. Bare started rows are live rows, which
   * the tail walk never trims (their remaining stream would be dropped). */
  function completedBigEvents(
    threadId: string,
    itemId: string,
  ): Parameters<ReturnType<typeof useAppStore.getState>["applyRuntimeEvents"]>[1] {
    return [
      bigEvent(threadId, itemId),
      {
        type: "item.completed",
        threadId,
        itemId,
        payload: { content: "x".repeat(WINDOW_ITEM_BYTES) },
      },
    ];
  }

  /** Runs one window pass per applied batch; passes are time-gated (5 s). */
  async function boundAfterGrowth(threadId: string, batches: string[][]): Promise<void> {
    for (const batch of batches) {
      useAppStore.getState().applyRuntimeEvents(
        threadId,
        batch.flatMap((itemId) => completedBigEvents(threadId, itemId)),
      );
      vi.advanceTimersByTime(6_000);
      boundVisibleThreadRuntimeWindows([threadId]);
      await Promise.resolve();
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    vi.clearAllMocks();
    bridge.dbGetThreadCompletedTurns.mockResolvedValue([]);
    bridge.dbGetThreadContextUsage.mockResolvedValue(null);
    bridge.dbGetLatestThreadGoalItem.mockResolvedValue(null);
    useAppStore.setState((state) => ({
      ...state,
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
      runtimeCompletedTurnsByThread: {},
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("trims a live thread's history to a recent byte tail, keeping the newest rows", async () => {
    const threadId = "bounded-live-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "seed", type: "assistant_message" })],
      nextCursor: 1,
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);

    // 30 x 256 KiB live items (~7.5 MiB) exceed the 6 MiB tail budget.
    const batches = Array.from({ length: 3 }, (_batchGroup, batch) =>
      Array.from({ length: 10 }, (_itemSlot, index) => `live-${batch * 10 + index}`),
    );
    await boundAfterGrowth(threadId, batches);

    const ids = useAppStore.getState().runtimeItemIdsByThread[threadId] ?? [];
    expect(ids.length).toBeLessThan(31);
    expect(ids.length).toBeGreaterThanOrEqual(20);
    // The newest row always survives; the oldest live rows were trimmed into
    // the middle gap (the DB still holds them behind the older-page cursor).
    expect(ids.at(-1)).toBe("live-29");
    expect(ids).not.toContain("seed");
    expect(ids).not.toContain("live-0");
    expect(ids).not.toContain("live-299");
    const retainedPayloadBytes = ids.reduce((total, id) => {
      const payload = useAppStore.getState().runtimeItemsByIdByThread[threadId]?.[id]?.payload as
        | { content?: string }
        | undefined;
      return total + (payload?.content?.length ?? 0);
    }, 0);
    // Tail budget plus one in-flight item of slack.
    expect(retainedPayloadBytes).toBeLessThanOrEqual(6 * 1024 * 1024 + WINDOW_ITEM_BYTES);
  });

  it("never trims a live (non-completed) row, but trims it once completed", async () => {
    const threadId = "bounded-live-row-guard";
    retainThreadRuntimeItems(threadId);
    // Completed history beyond the budget, then one OLD live row mid-list.
    await boundAfterGrowth(threadId, [Array.from({ length: 20 }, (_v, i) => `done-${i}`)]);
    useAppStore.getState().applyRuntimeEvents(threadId, [bigEvent(threadId, "still-running")]);
    useAppStore.getState().applyRuntimeEvents(
      threadId,
      Array.from({ length: 10 }, (_v, i) => i).flatMap((i) =>
        completedBigEvents(threadId, `done-2x-${i}`),
      ),
    );
    vi.advanceTimersByTime(6_000);
    boundVisibleThreadRuntimeWindows([threadId]);
    await Promise.resolve();
    let ids = useAppStore.getState().runtimeItemIdsByThread[threadId] ?? [];
    // The live row survived even though it sits deep inside the byte budget.
    expect(ids).toContain("still-running");
    const liveItem = useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["still-running"];
    expect(liveItem?.state).toBe("started");
    // Once it completes AND enough newer payload pushes the window past the
    // budget again, a later pass trims it with the rest of the middle.
    useAppStore.getState().applyRuntimeEvents(threadId, [
      {
        type: "item.completed",
        threadId,
        itemId: "still-running",
        payload: { content: "x".repeat(WINDOW_ITEM_BYTES) },
      },
    ]);
    useAppStore.getState().applyRuntimeEvents(
      threadId,
      // 26 x 256 KiB (~6.5 MiB) of NEWER rows alone exceeds the 6 MiB tail
      // budget, so the completed still-running row lands in the trimmed
      // middle rather than inside the retained tail.
      Array.from({ length: 26 }, (_v, i) => i).flatMap((i) =>
        completedBigEvents(threadId, `done-3x-${i}`),
      ),
    );
    vi.advanceTimersByTime(6_000);
    boundVisibleThreadRuntimeWindows([threadId]);
    await Promise.resolve();
    ids = useAppStore.getState().runtimeItemIdsByThread[threadId] ?? [];
    expect(ids).not.toContain("still-running");
    expect(ids.at(-1)).toBe("done-3x-25");
  });

  it("keeps explicitly paged history protected while trimming the unprotected middle", async () => {
    const threadId = "bounded-paged-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "seed", type: "assistant_message" })],
      nextCursor: 100,
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);

    // The user pages one older batch in: 3 x 256 KiB, inside the 2 MiB
    // protected budget.
    const pagedIds = ["paged-0", "paged-1", "paged-2"];
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: pagedIds.map((id) => makeItem({ id, type: "assistant_message" })),
      nextCursor: 97,
    });
    await expect(loadOlderThreadRuntimeItems(threadId)).resolves.toBe(true);

    const batches = Array.from({ length: 3 }, (_batchGroup, batch) =>
      Array.from({ length: 10 }, (_itemSlot, index) => `live-${batch * 10 + index}`),
    );
    await boundAfterGrowth(threadId, batches);

    const ids = useAppStore.getState().runtimeItemIdsByThread[threadId] ?? [];
    for (const id of pagedIds) expect(ids).toContain(id);
    // Paged rows stay the contiguous protected prefix.
    expect(ids.slice(0, pagedIds.length)).toEqual(pagedIds);
    // The newest live rows survive right behind the protected prefix window.
    expect(ids.at(-1)).toBe("live-29");
    // Something in the unprotected middle was trimmed.
    expect(ids.length).toBeLessThan(pagedIds.length + 30);
  });

  it("drops completed-turn records anchored in trimmed ranges and caps retained records", async () => {
    const threadId = "bounded-turns-thread";
    const turns = Array.from({ length: 600 }, (_, index) => ({
      startedAt: 1_000 + index,
      endedAt: 2_000 + index,
      anchorItemId: `live-${index}`,
    }));
    bridge.dbGetThreadCompletedTurns.mockResolvedValueOnce(turns as never[]);
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [makeItem({ id: "seed", type: "assistant_message" })],
      nextCursor: 1,
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);
    // Hard cap on hydrated anchor metadata.
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[threadId]).toHaveLength(500);

    const batches = Array.from({ length: 3 }, (_batchGroup, batch) =>
      Array.from({ length: 10 }, (_itemSlot, index) => `live-${batch * 10 + index}`),
    );
    await boundAfterGrowth(threadId, batches);

    const retainedIds = new Set(useAppStore.getState().runtimeItemIdsByThread[threadId] ?? []);
    const keptTurns = useAppStore.getState().runtimeCompletedTurnsByThread[threadId] ?? [];
    expect(keptTurns.length).toBeLessThanOrEqual(500);
    // No kept record points at a row that WAS in the store and got trimmed.
    // (Records anchored to DB-only rows — the hydrated 600-turn history —
    // legitimately remain.) The store held exactly: seed + live-0..29.
    const storeEverHeld = new Set(["seed", ...Array.from({ length: 30 }, (_, i) => `live-${i}`)]);
    const trimmed = [...storeEverHeld].filter((id) => !retainedIds.has(id));
    for (const turn of keptTurns) {
      if (turn.anchorItemId !== null && trimmed.includes(turn.anchorItemId)) {
        throw new Error(`kept turn still anchored to trimmed row ${turn.anchorItemId}`);
      }
    }
  });

  it("forgets the window ledger when the thread is evicted", async () => {
    const threadId = "bounded-evicted-thread";
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValue({
      items: [makeItem({ id: "seed", type: "assistant_message" })],
      nextCursor: 1,
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);
    // Releasing an undersized thread only marks it inactive (the LRU keeps
    // it); its window state must not leak into a later fresh mount.
    releaseThreadRuntimeItems(threadId);

    // A fresh mount re-hydrates and the bound applies cleanly again.
    bridge.dbGetThreadRuntimeItemsPage.mockClear();
    useAppStore.setState((state) => {
      const { [threadId]: _remountIds, ...runtimeItemIdsByThread } = state.runtimeItemIdsByThread;
      const { [threadId]: _remountItems, ...runtimeItemsByIdByThread } =
        state.runtimeItemsByIdByThread;
      return { ...state, runtimeItemIdsByThread, runtimeItemsByIdByThread };
    });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);
    await boundAfterGrowth(threadId, [Array.from({ length: 10 }, (_, index) => `live-${index}`)]);
    const ids = useAppStore.getState().runtimeItemIdsByThread[threadId] ?? [];
    // The re-mounted thread keeps its hydration marker, so only the live tail
    // was re-applied; the bound pass over it must be clean either way.
    expect(ids.at(-1)).toBe("live-9");
    expect(ids).not.toContain("live--1");
  });
});
