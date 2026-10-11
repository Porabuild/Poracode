import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAppStore } from "./appStore";
import {
  evictOversizedInactiveThreadRuntimeItems,
  hydrateThreadRuntimeItems,
  releaseThreadRuntimeItems,
  retainThreadRuntimeItems,
} from "./chatRuntimePersister";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    dbGetThreadRuntimeItemsPage:
      vi.fn<
        (input: {
          threadId: string;
          beforePosition?: number;
          limit: number;
          targetTimelineEntryCount?: number;
        }) => Promise<{ items: RuntimeChatItem[]; nextCursor: number | null }>
      >(),
    dbGetThreadCompletedTurns: vi.fn<() => Promise<never[]>>().mockResolvedValue([]),
    dbGetThreadContextUsage: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    dbGetLatestThreadGoalItem: vi.fn<() => Promise<null>>().mockResolvedValue(null),
  },
}));
vi.mock("../bridge", () => ({ readBridge: () => bridge }));
const original = useAppStore.getState();
const retained = new Map<string, number>();
const MIB = 1024 * 1024;
const largeRows = (): RuntimeChatItem[] =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `large-${index}`,
    type: "assistant_message",
    state: "completed",
    streams: { assistant_text: `${index}:${"x".repeat(3 * MIB)}` },
  }));
function retain(id: string) {
  retainThreadRuntimeItems(id);
  retained.set(id, (retained.get(id) ?? 0) + 1);
}
function release(id: string) {
  releaseThreadRuntimeItems(id);
  retained.set(id, (retained.get(id) ?? 1) - 1);
}
beforeEach(() => {
  useAppStore.setState({
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeHydrationStatus: {},
    runtimeCompletedTurnsByThread: {},
  });
  bridge.dbGetThreadRuntimeItemsPage.mockReset();
});
afterEach(() => {
  for (const [id, count] of retained) for (let i = 0; i < count; i++) releaseThreadRuntimeItems(id);
  retained.clear();
  useAppStore.setState(original, true);
});

it("evicts a few large inactive messages and reloads their exact canonical text", async () => {
  const id = "inactive-byte-replay";
  const rows = largeRows();
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValue({ items: rows, nextCursor: null });
  retain(id);
  await hydrateThreadRuntimeItems(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toHaveLength(3);
  expect(useAppStore.getState().runtimeItemsByIdByThread[id]?.[rows[0]!.id]?.streams).toEqual(
    rows[0]!.streams,
  );
  release(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toBeUndefined();
  retain(id);
  await hydrateThreadRuntimeItems(id);
  expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(2);
  for (const row of rows)
    expect(useAppStore.getState().runtimeItemsByIdByThread[id]?.[row.id]?.streams).toEqual(
      row.streams,
    );
});

it("keeps a large transcript while either of its two readers remains", async () => {
  const id = "inactive-byte-two-readers";
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValue({ items: largeRows(), nextCursor: null });
  retain(id);
  retain(id);
  await hydrateThreadRuntimeItems(id);
  const items = useAppStore.getState().runtimeItemsByIdByThread[id];
  release(id);
  evictOversizedInactiveThreadRuntimeItems([id]);
  expect(useAppStore.getState().runtimeItemsByIdByThread[id]).toBe(items);
  release(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toBeUndefined();
});

it("keeps a small completed transcript cached without a second history read", async () => {
  const id = "inactive-byte-small";
  const rows: RuntimeChatItem[] = [
    {
      id: "small",
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: "small ordinary reply" },
    },
  ];
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValue({ items: rows, nextCursor: null });
  retain(id);
  await hydrateThreadRuntimeItems(id);
  release(id);
  retain(id);
  await hydrateThreadRuntimeItems(id);
  expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(1);
  expect(useAppStore.getState().runtimeItemsByIdByThread[id]?.small?.streams).toEqual(
    rows[0]!.streams,
  );
});

it("evicts least recently used inactive history by aggregate size before the count limit", async () => {
  const ids = Array.from({ length: 7 }, (_, index) => `inactive-byte-aggregate-${index}`);
  bridge.dbGetThreadRuntimeItemsPage.mockImplementation(
    async ({ threadId }: { threadId: string }) => ({
      items: [
        {
          id: `${threadId}-reply`,
          type: "assistant_message",
          state: "completed",
          streams: {},
          payload: {
            role: "assistant",
            content: [{ kind: "text", text: `${threadId}:${"x".repeat(5 * MIB)}` }],
          },
        },
      ],
      nextCursor: null,
    }),
  );
  for (const id of ids.slice(0, 6)) {
    retain(id);
    await hydrateThreadRuntimeItems(id);
    release(id);
  }
  // Reopening the oldest small-enough window refreshes its recency.
  retain(ids[0]!);
  await hydrateThreadRuntimeItems(ids[0]!);
  release(ids[0]!);
  retain(ids[6]!);
  await hydrateThreadRuntimeItems(ids[6]!);
  release(ids[6]!);
  expect(useAppStore.getState().runtimeItemIdsByThread[ids[1]!]).toBeUndefined();
  for (const id of [ids[0]!, ...ids.slice(2)])
    expect(useAppStore.getState().runtimeItemIdsByThread[id]).toHaveLength(1);
  expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(7);
});

it("readmits background windows after eviction and bounds never-opened threads together", () => {
  const ids = Array.from({ length: 7 }, (_, index) => `inactive-byte-background-${index}`);
  const write = (id: string, units: number) => {
    useAppStore.getState().hydrateThreadRuntimeItems(id, [
      {
        id: `${id}-row`,
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "x".repeat(units) },
        payload: { role: "assistant", content: [{ kind: "text", text: "y".repeat(units) }] },
      },
    ]);
    evictOversizedInactiveThreadRuntimeItems([id]);
  };
  write(ids[0]!, 5 * MIB);
  expect(useAppStore.getState().runtimeItemIdsByThread[ids[0]!]).toBeUndefined();
  for (const id of ids) write(id, 3 * MIB);
  expect(useAppStore.getState().runtimeItemIdsByThread[ids[0]!]).toBeUndefined();
  for (const id of ids.slice(2))
    expect(useAppStore.getState().runtimeItemIdsByThread[id]).toHaveLength(1);
});

it("preserves an unresolved approval when its inactive transcript is evicted", async () => {
  const id = "inactive-byte-permission";
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValue({ items: largeRows(), nextCursor: null });
  retain(id);
  await hydrateThreadRuntimeItems(id);
  useAppStore.getState().applyRuntimeEvent(id, {
    type: "request.opened",
    threadId: id,
    requestId: "approval",
    requestType: "tool_call_approval",
    payload: { summary: "Review the proposed edit" },
  });
  const requests = useAppStore.getState().runtimeRequestsByThread[id];
  release(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toBeUndefined();
  expect(useAppStore.getState().runtimeRequestsByThread[id]).toBe(requests);
  expect(requests?.[0]?.requestId).toBe("approval");
});

it.each([false, true])(
  "checks partial hydration after release without evicting a retained reader=%s",
  async (keepReader) => {
    const id = `inactive-byte-partial-${keepReader}`;
    const rows = largeRows();
    let resolvePage!: (value: { items: RuntimeChatItem[]; nextCursor: number | null }) => void;
    bridge.dbGetThreadRuntimeItemsPage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    bridge.dbGetLatestThreadGoalItem.mockRejectedValueOnce(new Error("goal read failed"));
    retain(id);
    const pending = hydrateThreadRuntimeItems(id);
    if (!keepReader) release(id);
    resolvePage({ items: rows, nextCursor: null });
    await pending;
    expect(useAppStore.getState().runtimeHydrationStatus[id]).toBe("failed");
    expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual(
      keepReader ? rows.map((row) => row.id) : undefined,
    );
    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({ items: rows, nextCursor: null });
    if (!keepReader) retain(id);
    await hydrateThreadRuntimeItems(id);
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().runtimeHydrationStatus[id]).toBeUndefined();
    for (const row of rows)
      expect(useAppStore.getState().runtimeItemsByIdByThread[id]?.[row.id]?.streams).toEqual(
        row.streams,
      );
  },
);
