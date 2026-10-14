import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent, Thread } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import { useAppStore } from "@/renderer/state/appStore";
import {
  loadOlderThreadRuntimeItems,
  releaseThreadRuntimeItems,
  retainThreadRuntimeItems,
  seedOlderThreadRuntimeItemsCursor,
} from "@/renderer/state/chatRuntimePersister";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { clearPendingRuntimeEvents, dispatchRemoteSupervisorEvent } from "../sync";
import {
  createSupervisorEventReducer,
  type SupervisorEventReducerConfig,
} from "./supervisorEventReducer";

const original = useAppStore.getState();
const { bridge } = vi.hoisted(() => ({
  bridge: {
    dbGetThreadRuntimeItemsPage:
      vi.fn<
        (input: {
          threadId: string;
          beforePosition?: number;
          limit: number;
          targetTimelineEntryCount?: number;
        }) => Promise<{ items: PersistedRuntimeItem[]; nextCursor: number | null }>
      >(),
  },
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
const ITEM_UNITS = 256 * 1024;
const TAIL_UNITS = 6 * 1024 * 1024;
let nextThread = 0;
const retained = new Set<string>();

type Delivery = "foreground" | "background" | "immediate";

function setupThread(delivery: Delivery): string {
  const threadId = remoteThreadId("retention-host", `thread-${++nextThread}`);
  const thread: Thread = {
    id: threadId,
    remoteServerId: "retention-host",
    projectId: "project",
    title: "Retention fixture",
    agentKind: "test-agent",
    config: { model: "default" },
    presentationMode: "gui",
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  useAppStore.setState({
    threads: [thread],
    view: delivery === "foreground" ? { kind: "thread", panes: [threadId] } : { kind: "home" },
  });
  retainThreadRuntimeItems(threadId);
  retained.add(threadId);
  seedOlderThreadRuntimeItemsCursor(threadId, 100);
  return threadId;
}

function deliver(threadId: string, events: RuntimeEvent[], delivery: Delivery): void {
  dispatchRemoteSupervisorEvent(
    { type: "thread-runtime-events", threadId, events },
    delivery === "immediate" ? { deliverRuntimeEventsImmediately: true } : undefined,
  );
  if (delivery === "foreground") vi.advanceTimersToNextFrame();
  else if (delivery === "background") vi.advanceTimersByTime(251);
}

function completed(threadId: string, itemId: string, units = ITEM_UNITS): RuntimeEvent[] {
  return [
    {
      type: "item.started",
      threadId,
      itemId,
      itemType: "assistant_message",
      payload: { role: "assistant", content: [{ kind: "text", text: "x".repeat(units) }] },
    },
    { type: "item.completed", threadId, itemId },
  ];
}

function grow(threadId: string, delivery: Delivery, count = 32): void {
  // Each frame fits the real 2 MiB per-thread queue budget. Time advances
  // independently of the timer drain so retention's five-second gate opens.
  for (let index = 0; index < count; index += 1) {
    vi.setSystemTime(Date.now() + 5_001);
    deliver(threadId, completed(threadId, `done-${index}`), delivery);
  }
}

function retainedUnits(threadId: string): number {
  const state = useAppStore.getState();
  return (state.runtimeItemIdsByThread[threadId] ?? []).reduce((total, id) => {
    const item = state.runtimeItemsByIdByThread[threadId]![id]!;
    return (
      total +
      96 +
      (JSON.stringify(item.payload)?.length ?? 0) +
      Object.values(item.streams).reduce((sum, text) => sum + text.length, 0)
    );
  }, 0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  useAppStore.setState({
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeStructuralVersionByThread: {},
    runtimeCompletedTurnsByThread: {},
    runtimeRequestsByThread: {},
    runtimeOpenTurnByThread: {},
  });
});

afterEach(() => {
  clearPendingRuntimeEvents();
  for (const threadId of retained) releaseThreadRuntimeItems(threadId);
  retained.clear();
  useAppStore.setState(original, true);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each<Delivery>(["foreground", "background", "immediate"])(
  "shared remote retention: %s delivery",
  (delivery) => {
    it("bounds completed history through the real remote dispatcher and keeps the newest row", () => {
      const threadId = setupThread(delivery);
      grow(threadId, delivery);
      expect(retainedUnits(threadId)).toBeLessThanOrEqual(TAIL_UNITS);
      const ids = useAppStore.getState().runtimeItemIdsByThread[threadId]!;
      expect(ids.at(-1)).toBe("done-31");
      expect(ids).not.toContain("done-0");
      expect(ids.length).toBeGreaterThan(1);
    });

    it("preserves old live rows, goals and open requests beyond a full newer tail", () => {
      const threadId = setupThread(delivery);
      deliver(
        threadId,
        [
          ...completed(threadId, "older-prefix"),
          { type: "item.started", threadId, itemId: "old-live", itemType: "assistant_message" },
          { type: "item.started", threadId, itemId: "old-goal", itemType: "goal" },
          { type: "item.completed", threadId, itemId: "old-goal" },
          {
            type: "request.opened",
            threadId,
            requestId: "approval",
            requestType: "tool_call_approval",
            payload: { summary: "Pending approval" },
          },
        ],
        delivery,
      );
      grow(threadId, delivery);
      const state = useAppStore.getState();
      expect(state.runtimeItemIdsByThread[threadId]).toContain("old-live");
      expect(state.runtimeItemIdsByThread[threadId]).toContain("old-goal");
      expect(state.runtimeRequestsByThread[threadId]).toMatchObject([{ requestId: "approval" }]);
      // One protected old row retains its intervening suffix. Keeping that
      // explicit exception avoids an unreadable gap between it and the tail.
      expect(state.runtimeItemIdsByThread[threadId]).toEqual([
        "old-live",
        "old-goal",
        ...Array.from({ length: 32 }, (_, index) => `done-${index}`),
      ]);

      deliver(
        threadId,
        [
          {
            type: "content.delta",
            threadId,
            itemId: "old-live",
            stream: "assistant_text",
            delta: "still delivered",
          },
          {
            type: "item.updated",
            threadId,
            itemId: "old-goal",
            payload: { description: "updated goal" },
          },
          { type: "request.resolved", threadId, requestId: "approval", outcome: "accepted" },
        ],
        delivery,
      );
      expect(
        useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["old-live"]?.streams
          .assistant_text,
      ).toBe("still delivered");
      expect(
        useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["old-goal"]?.payload,
      ).toEqual({ description: "updated goal" });
      expect(useAppStore.getState().runtimeRequestsByThread[threadId]).toEqual([]);
    });

    it("caps real completed-turn boundaries after the next successful runtime drain", () => {
      const threadId = setupThread(delivery);
      for (let index = 0; index < 520; index += 1) {
        dispatchRemoteSupervisorEvent({
          type: "thread-state",
          threadId,
          status: "working",
          attention: "working",
          canResumeWithConfig: true,
        });
        deliver(threadId, completed(threadId, `turn-${index}`, 10), delivery);
        vi.setSystemTime(Date.now() + 1_001);
        dispatchRemoteSupervisorEvent({
          type: "thread-state",
          threadId,
          status: "idle",
          attention: "none",
          canResumeWithConfig: true,
        });
      }
      vi.setSystemTime(Date.now() + 5_001);
      deliver(
        threadId,
        [{ type: "turn.completed", threadId, turnId: "last", state: "completed" }],
        delivery,
      );
      const turns = useAppStore.getState().runtimeCompletedTurnsByThread[threadId]!;
      expect(turns).toHaveLength(500);
      expect(turns[0]?.anchorItemId).toBe("turn-20");
      expect(turns.at(-1)?.anchorItemId).toBe("turn-519");
    });

    it("rebases a trimmed prefix only on explicit paging, with canonical order and position holes", async () => {
      const threadId = setupThread(delivery);
      grow(threadId, delivery);
      const beforePaging = useAppStore.getState().runtimeItemsByIdByThread[threadId]!;
      const liveNewest = beforePaging["done-31"];
      const durable = Array.from({ length: 33 }, (_, index) => ({
        // Deliberate holes: item counts/event sequences are not DB cursors.
        position: 10 + index * 7,
        item: {
          id: index === 0 ? "durable-only" : `done-${index - 1}`,
          type: "assistant_message",
          state: "completed" as const,
          streams: { assistant_text: `persisted-${index}` },
        },
      }));
      bridge.dbGetThreadRuntimeItemsPage.mockImplementation(async (input) => {
        const eligible = durable.filter((row) => row.position < input.beforePosition!);
        const rows = eligible.slice(-4);
        return {
          items: rows.map((row) => row.item),
          nextCursor: eligible.length > rows.length ? rows[0]!.position : null,
        };
      });
      expect(bridge.dbGetThreadRuntimeItemsPage).not.toHaveBeenCalled();
      // A previously exhausted cursor must still recover evicted newer rows.
      // Preserve the retention marker while recording the existing boundary.
      seedOlderThreadRuntimeItemsCursor(threadId, null, { preserveExistingCursor: true });
      expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
      expect(bridge.dbGetThreadRuntimeItemsPage.mock.calls[0]?.[0].beforePosition).toBe(
        Number.MAX_SAFE_INTEGER,
      );
      expect(bridge.dbGetThreadRuntimeItemsPage.mock.calls.length).toBeGreaterThan(1);
      // The rewalk discarded duplicate-only pages without replacing live data.
      expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["done-31"]).toBe(
        liveNewest,
      );
      let pages = 0;
      while (await loadOlderThreadRuntimeItems(threadId)) {
        expect(++pages).toBeLessThan(20);
      }
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(
        durable.map((row) => row.item.id),
      );
      const calls = bridge.dbGetThreadRuntimeItemsPage.mock.calls;
      for (let index = 1; index < calls.length; index += 1) {
        expect(calls[index]![0].beforePosition!).toBeLessThan(calls[index - 1]![0].beforePosition!);
      }
      expect(durable).toHaveLength(33);
    });
  },
);

it("retains local usage hooks and sequenced synchronous drain ordering", () => {
  const threadId = setupThread("background");
  const afterApply = vi.fn<NonNullable<SupervisorEventReducerConfig["afterApply"]>>();
  const noteSequence = vi.fn<NonNullable<SupervisorEventReducerConfig["onSequencedEvent"]>>();
  const reducer = createSupervisorEventReducer({
    recovery: {
      recoverFromQueueOverflow: () => undefined,
      recoverFromThreadReset: (_id, resume) => resume(),
    },
    afterApply,
    onSequencedEvent: noteSequence,
  });
  try {
    for (let index = 0; index < 32; index += 1) {
      vi.setSystemTime(Date.now() + 5_001);
      reducer.dispatch(
        { type: "thread-runtime-events", threadId, events: completed(threadId, `sync-${index}`) },
        index + 1,
      );
      reducer.flushSync(threadId);
    }
    expect(retainedUnits(threadId)).toBeLessThanOrEqual(TAIL_UNITS);
    expect(afterApply).toHaveBeenCalledTimes(32);
    expect(noteSequence).toHaveBeenLastCalledWith(expect.anything(), 32, "ipc");
    expect(reducer.arbitration.hasUnsequenced(threadId)).toBe(false);
  } finally {
    reducer.clear();
  }
});

it("rejects a pre-reset rebase page and uses the reconnect snapshot cursor", async () => {
  const threadId = setupThread("immediate");
  grow(threadId, "immediate");
  let resolvePage!: (page: { items: PersistedRuntimeItem[]; nextCursor: number | null }) => void;
  bridge.dbGetThreadRuntimeItemsPage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
  );
  const pending = loadOlderThreadRuntimeItems(threadId);
  expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(1);
  dispatchRemoteSupervisorEvent({ type: "thread-reset", threadId });
  deliver(threadId, completed(threadId, "new-session", 10), "immediate");
  seedOlderThreadRuntimeItemsCursor(threadId, 17);
  resolvePage({
    items: [{ id: "stale", type: "assistant_message", state: "completed", streams: {} }],
    nextCursor: 9,
  });
  expect(await pending).toBe(false);
  expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["new-session"]);

  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
    items: [
      { id: "older-new-session", type: "assistant_message", state: "completed", streams: {} },
    ],
    nextCursor: null,
  });
  expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
  expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith(
    expect.objectContaining({ beforePosition: 17 }),
  );
  expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
    "older-new-session",
    "new-session",
  ]);
});

it.each(["rejected", "non-advancing"])(
  "keeps a %s rebase retryable without altering history",
  async (failure) => {
    const threadId = setupThread("immediate");
    grow(threadId, "immediate");
    const before = useAppStore.getState().runtimeItemIdsByThread[threadId];
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    if (failure === "rejected")
      bridge.dbGetThreadRuntimeItemsPage.mockRejectedValueOnce(new Error("page unavailable"));
    else
      bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
        items: [],
        nextCursor: Number.MAX_SAFE_INTEGER,
      });
    expect(await loadOlderThreadRuntimeItems(threadId)).toBe(false);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBe(before);

    bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
      items: [
        { id: "recovered-prefix", type: "assistant_message", state: "completed", streams: {} },
        { id: before![0]!, type: "assistant_message", state: "completed", streams: {} },
      ],
      nextCursor: 3,
    });
    expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
    expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ beforePosition: Number.MAX_SAFE_INTEGER }),
    );
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
      "recovered-prefix",
      ...before!,
    ]);
  },
);

it("preserves the reader while a rebase read overlaps new streaming history", async () => {
  const threadId = setupThread("immediate");
  grow(threadId, "immediate");
  const boundary = useAppStore.getState().runtimeItemIdsByThread[threadId]![0]!;
  let resolvePage!: (page: { items: PersistedRuntimeItem[]; nextCursor: number | null }) => void;
  bridge.dbGetThreadRuntimeItemsPage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
  );
  const pending = loadOlderThreadRuntimeItems(threadId);
  for (let index = 0; index < 10; index += 1) {
    vi.setSystemTime(Date.now() + 5_001);
    deliver(threadId, completed(threadId, `during-page-${index}`), "immediate");
  }
  expect(useAppStore.getState().runtimeItemIdsByThread[threadId]![0]).toBe(boundary);
  resolvePage({
    items: [
      { id: "reading-page", type: "assistant_message", state: "completed", streams: {} },
      { id: boundary, type: "assistant_message", state: "completed", streams: {} },
    ],
    nextCursor: 3,
  });
  expect(await pending).toBe(true);
  vi.setSystemTime(Date.now() + 5_001);
  deliver(threadId, completed(threadId, "after-page"), "immediate");
  const ids = useAppStore.getState().runtimeItemIdsByThread[threadId]!;
  expect(ids[0]).toBe("reading-page");
  expect(ids).toContain(boundary);
  expect(ids.at(-1)).toBe("after-page");
});
