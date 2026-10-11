import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RuntimeEvent, Thread } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { startGoalItemEvents, updateGoalItemEvents } from "@/supervisor/agents/goalRuntime";
import { selectThreadGoalDockState } from "../components/thread/threadGoalState";
import { useAppStore } from "./appStore";
import {
  boundVisibleThreadRuntimeWindows,
  alignThreadRuntimeHistoryControl,
  hasHydratedThreadRuntimeItems,
  forgetThreadRuntimeWindow,
  loadOlderThreadRuntimeItems,
  retainThreadRuntimeItems,
  releaseThreadRuntimeItems,
} from "./chatRuntimePersister";
import {
  applyThreadSnapshot,
  clearPendingRuntimeEvents,
  dispatchRemoteSupervisorEvent,
} from "./remote/sync";
import { runtimeHistoryBoundary } from "./runtimeHistoryBoundary";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";

const { readPage } = vi.hoisted(() => ({
  readPage:
    vi.fn<
      (input: {
        beforePosition?: number;
      }) => Promise<{ items: PersistedRuntimeItem[]; nextCursor: number | null }>
    >(),
}));
vi.mock("../bridge", () => ({ readBridge: () => ({ dbGetThreadRuntimeItemsPage: readPage }) }));

const original = useAppStore.getState();
const MIB = 1024 * 1024;
let serial = 0;
let threadId: string;
let thread: Thread;

function row(id: string, patch: Partial<RuntimeChatItem> = {}): RuntimeChatItem {
  return { id, type: "assistant_message", state: "completed", streams: {}, ...patch };
}

function rows(start: number, end: number): RuntimeChatItem[] {
  return Array.from({ length: end - start + 1 }, (_, i) => row(`row-${start + i}`));
}

function goal(action = "set"): RuntimeChatItem {
  return row("goal", {
    type: "goal",
    payload: { action, objective: "Keep going", status: "active" },
  });
}

function snapshot(items: RuntimeChatItem[], cursor: number | null, seq = 1): RemoteThreadSnapshot {
  return {
    thread,
    runtimeItems: items,
    runtimeNextCursor: cursor,
    snapshotSeq: seq,
    completedTurns: [],
    contextUsage: null,
    updatedAt: thread.updatedAt,
  };
}

function ids(): readonly string[] {
  return useAppStore.getState().runtimeItemIdsByThread[threadId] ?? [];
}

function send(
  events: RuntimeEvent[],
  delivery: "foreground" | "background" | "immediate" = "immediate",
): void {
  dispatchRemoteSupervisorEvent(
    { type: "thread-runtime-events", threadId, events },
    delivery === "immediate" ? { deliverRuntimeEventsImmediately: true } : undefined,
  );
  if (delivery === "foreground") vi.advanceTimersToNextFrame();
  if (delivery === "background") vi.advanceTimersByTime(251);
}

function grow(delivery: "foreground" | "background" | "immediate" = "immediate"): void {
  for (let i = 0; i < 32; i += 1) {
    vi.setSystemTime(Date.now() + 5_001);
    send(
      [
        {
          type: "item.started",
          threadId,
          itemId: `large-${i}`,
          itemType: "assistant_message",
          payload: { role: "assistant", content: [{ kind: "text", text: "x".repeat(MIB / 4) }] },
        },
        { type: "item.completed", threadId, itemId: `large-${i}` },
      ],
      delivery,
    );
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  readPage.mockReset();
  threadId = `history-boundary-${++serial}`;
  thread = {
    id: threadId,
    remoteServerId: "test-host",
    projectId: "project",
    title: "History",
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
  retainThreadRuntimeItems(threadId);
  useAppStore.setState({
    threads: [thread],
    view: { kind: "thread", panes: [threadId] },
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
  releaseThreadRuntimeItems(threadId);
  forgetThreadRuntimeWindow(threadId);
  useAppStore.setState(original, true);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(["foreground", "background", "immediate"] as const)(
  "bounds more than 6 Mi of completed history with a constant old goal through the %s dispatcher",
  (delivery) => {
    if (delivery === "background") useAppStore.setState({ view: { kind: "home" } });
    applyThreadSnapshot(snapshot([], 100));
    send(
      startGoalItemEvents(threadId, "goal", {
        action: "set",
        objective: "Keep going",
        status: "active",
      }),
      delivery,
    );
    const oldGoal = useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal;
    send(
      [
        {
          type: "request.opened",
          threadId,
          requestId: "approval",
          requestType: "tool_call_approval",
          payload: { summary: "Read" },
        },
      ],
      delivery,
    );
    grow(delivery);
    expect(ids()[0]).toBe("goal");
    expect(ids()).not.toContain("large-0");
    expect(ids().at(-1)).toBe("large-31");
    expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal).toBe(oldGoal);
    const ordinaryBytes = ids()
      .filter((id) => id !== "goal")
      .reduce((bytes, id) => {
        const item = useAppStore.getState().runtimeItemsByIdByThread[threadId]![id]!;
        return (
          bytes +
          96 +
          (JSON.stringify(item.payload)?.length ?? 0) +
          Object.values(item.streams).reduce((sum, text) => sum + text.length, 0)
        );
      }, 0);
    expect(ordinaryBytes).toBeLessThanOrEqual(6 * MIB);
    send(
      updateGoalItemEvents(threadId, "goal", {
        action: "updated",
        objective: "Keep going",
        status: "active",
        tokensUsed: 123,
      }),
      delivery,
    );
    expect(selectThreadGoalDockState(useAppStore.getState(), threadId)).toMatchObject({
      sourceItemId: "goal",
      tokensUsed: 123,
    });
    expect(useAppStore.getState().runtimeRequestsByThread[threadId]).toHaveLength(1);
    expect(readPage).not.toHaveBeenCalled();
  },
);

it("preserves the actual older ordinary span and cursor through a sparse-goal snapshot replacement", async () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 150)], 80));
  const readerRow = useAppStore.getState().runtimeItemsByIdByThread[threadId]!["row-80"];
  const generation = runtimeHistoryBoundary(threadId).generation;
  applyThreadSnapshot(snapshot([goal(), ...rows(120, 160)], 120, 2));
  expect(ids()).toEqual(["goal", ...rows(80, 160).map((item) => item.id)]);
  expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]!["row-80"]).toBe(readerRow);
  expect(runtimeHistoryBoundary(threadId).cursor).toBe(80);
  expect(runtimeHistoryBoundary(threadId).generation).not.toBe(generation);
  readPage.mockResolvedValueOnce({ items: rows(40, 79), nextCursor: 40 });
  expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
  expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ beforePosition: 80 }));
  expect(ids()).toEqual(["goal", ...rows(40, 160).map((item) => item.id)]);
});

it("relocates a sparse goal once on canonical overlap and preserves a late live update's object", async () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 82)], 80));
  const before = useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal;
  readPage.mockResolvedValueOnce({ items: rows(40, 79), nextCursor: 40 });
  await loadOlderThreadRuntimeItems(threadId);
  expect(ids()).toEqual(["goal", ...rows(40, 82).map((item) => item.id)]);
  expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal).toBe(before);
  let resolve!: (value: { items: RuntimeChatItem[]; nextCursor: number | null }) => void;
  readPage.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = loadOlderThreadRuntimeItems(threadId);
  send(updateGoalItemEvents(threadId, "goal", { action: "updated", tokensUsed: 45 }));
  const live = useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal;
  resolve({ items: [row("before-goal"), goal(), ...rows(11, 39)], nextCursor: 5 });
  expect(await pending).toBe(true);
  expect(ids()).toEqual(["before-goal", "goal", ...rows(11, 82).map((item) => item.id)]);
  expect(runtimeHistoryBoundary(threadId).sparseControlIds.size).toBe(0);
  expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal).toBe(live);
  readPage.mockResolvedValueOnce({ items: [row("oldest")], nextCursor: null });
  await loadOlderThreadRuntimeItems(threadId);
  expect(ids().slice(0, 3)).toEqual(["oldest", "before-goal", "goal"]);
  expect(ids().filter((id) => id === "goal")).toHaveLength(1);
});

it("keeps a cleared constant goal authoritative across trimming and canonical older goals", async () => {
  applyThreadSnapshot(snapshot([goal()], 20));
  send(updateGoalItemEvents(threadId, "goal", { action: "cleared" }));
  grow();
  expect(ids()).toContain("goal");
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)).toBeNull();
  const firstOrdinary = ids()[1]!;
  readPage.mockResolvedValueOnce({
    items: [
      row("old-goal", { type: "goal", payload: { action: "set", objective: "Previous" } }),
      goal(),
      row(firstOrdinary),
    ],
    nextCursor: null,
  });
  await loadOlderThreadRuntimeItems(threadId);
  expect(ids().slice(0, 2)).toEqual(["old-goal", "goal"]);
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)).toBeNull();
});

it("does not resurrect a previous-era goal when both it and its visible handoff have been evicted", async () => {
  applyThreadSnapshot(snapshot([goal(), row("handoff", { type: "provider_handoff" })], 5));
  grow();
  expect(ids()).not.toContain("goal");
  expect(ids()).not.toContain("handoff");
  const retainedRows = ids().map(
    (id) => useAppStore.getState().runtimeItemsByIdByThread[threadId]![id]!,
  );
  applyThreadSnapshot(snapshot([goal(), ...retainedRows], 100, 2));
  expect(ids()).not.toContain("goal");
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)).toBeNull();
  readPage.mockResolvedValueOnce({
    items: [goal(), row("handoff", { type: "provider_handoff" }), retainedRows[0]!],
    nextCursor: null,
  });
  expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
  expect(ids().slice(0, 2)).toEqual(["goal", "handoff"]);
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)).toBeNull();
});

it("keeps the latest goal after a handoff authoritative when older eras are recovered", async () => {
  const oldGoal = row("previous-goal", {
    type: "goal",
    payload: { action: "set", objective: "Previous era" },
  });
  const handoff = row("handoff", { type: "provider_handoff" });
  applyThreadSnapshot(snapshot([oldGoal, handoff, goal()], null));
  grow();
  expect(ids()).not.toContain("handoff");
  expect(ids()).not.toContain("previous-goal");
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)?.sourceItemId).toBe("goal");
  const live = useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal;
  const first = ids()[1]!;
  readPage.mockResolvedValueOnce({
    items: [oldGoal, handoff, goal(), row("intervening"), row(first)],
    nextCursor: null,
  });
  expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
  expect(ids().slice(0, 4)).toEqual(["previous-goal", "handoff", "goal", "intervening"]);
  expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal).toBe(live);
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)?.sourceItemId).toBe("goal");
});

it.each(["before", "after"] as const)(
  "locates a newly discovered snapshot goal %s a retained handoff without losing reader pages",
  async (side) => {
    const handoff = row("handoff", { type: "provider_handoff" });
    const oldRows = [goal(), ...rows(80, 84), handoff, ...rows(86, 150)];
    applyThreadSnapshot(snapshot(oldRows, 80));
    const reader = useAppStore.getState().runtimeItemsByIdByThread[threadId]!["row-80"];
    const discovered = { ...goal(), id: "discovered" };
    let resolve!: (value: { items: RuntimeChatItem[]; nextCursor: number | null }) => void;
    readPage.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    applyThreadSnapshot(snapshot([discovered, ...rows(120, 160)], 120, 2));
    expect(runtimeHistoryBoundary(threadId).unlocatedControl?.id).toBe("discovered");
    expect(selectThreadGoalDockState(useAppStore.getState(), threadId)).toBeNull();
    expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ beforePosition: 120 }));
    send(updateGoalItemEvents(threadId, "discovered", { action: "updated", tokensUsed: 55 }));
    const live = useAppStore.getState().runtimeItemsByIdByThread[threadId]!.discovered;
    resolve({
      items:
        side === "before"
          ? [discovered, ...rows(80, 84), handoff, ...rows(86, 119)]
          : [...rows(90, 99), discovered, ...rows(100, 119)],
      nextCursor: 60,
    });
    expect(await alignThreadRuntimeHistoryControl(threadId)).toBe(true);
    expect(runtimeHistoryBoundary(threadId).unlocatedControl).toBeNull();
    expect(runtimeHistoryBoundary(threadId).cursor).toBe(80);
    expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]!["row-80"]).toBe(reader);
    expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]!.discovered).toBe(live);
    expect(ids().filter((id) => id !== "discovered")).toEqual([
      "goal",
      ...rows(80, 84).map((item) => item.id),
      "handoff",
      ...rows(86, 160).map((item) => item.id),
    ]);
    expect(ids().indexOf("discovered")).toBeLessThan(
      ids().indexOf(side === "before" ? "row-80" : "row-100"),
    );
    expect(selectThreadGoalDockState(useAppStore.getState(), threadId)?.sourceItemId ?? null).toBe(
      side === "before" ? null : "discovered",
    );
  },
);

it("does not treat an unlocated goal from a superseded snapshot as source-order evidence", async () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 150)], 80));
  const discovered = { ...goal(), id: "discovered" };
  let resolveOld!: (value: { items: RuntimeChatItem[]; nextCursor: number | null }) => void;
  let resolveNew!: (value: { items: RuntimeChatItem[]; nextCursor: number | null }) => void;
  readPage
    .mockReturnValueOnce(
      new Promise((done) => {
        resolveOld = done;
      }),
    )
    .mockReturnValueOnce(
      new Promise((done) => {
        resolveNew = done;
      }),
    );
  applyThreadSnapshot(snapshot([discovered, ...rows(120, 160)], 120, 2));
  const older = alignThreadRuntimeHistoryControl(threadId);
  applyThreadSnapshot(snapshot([discovered, ...rows(125, 165)], 125, 3));
  resolveOld({ items: [discovered, row("row-80")], nextCursor: 10 });
  expect(await older).toBe(false);
  expect(runtimeHistoryBoundary(threadId).unlocatedControl?.id).toBe("discovered");
  resolveNew({ items: [row("row-99"), discovered, row("row-100")], nextCursor: 90 });
  expect(await alignThreadRuntimeHistoryControl(threadId)).toBe(true);
  expect(ids().indexOf("discovered")).toBe(ids().indexOf("row-100") - 1);
  expect(runtimeHistoryBoundary(threadId).cursor).toBe(80);
});

it("yields a long control lookup and leaves a rejected location retryable without showing an older goal", async () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 150)], 80));
  const discovered = { ...goal(), id: "discovered" };
  let reads = 0;
  readPage.mockImplementation(async ({ beforePosition }) => {
    reads += 1;
    if (reads === 18) throw new Error("location unavailable");
    return { items: [row(`unloaded-${reads}`)], nextCursor: beforePosition! - 1 };
  });
  applyThreadSnapshot(snapshot([discovered, ...rows(120, 160)], 120, 2));
  const pending = alignThreadRuntimeHistoryControl(threadId);
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
  expect(reads).toBe(16);
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)).toBeNull();
  await vi.advanceTimersToNextTimerAsync();
  expect(await pending).toBe(false);
  expect(runtimeHistoryBoundary(threadId).cursor).toBe(80);
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)).toBeNull();
  readPage.mockResolvedValueOnce({
    items: [row("row-99"), discovered, row("row-100")],
    nextCursor: 90,
  });
  expect(await alignThreadRuntimeHistoryControl(threadId)).toBe(true);
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)?.sourceItemId).toBe(
    "discovered",
  );
  expect(ids().indexOf("discovered")).toBe(ids().indexOf("row-100") - 1);
});

it("rejects a pending pre-snapshot read even when the ordinary overlap and reader cursor survive", async () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 90)], 80));
  let resolve!: (value: { items: RuntimeChatItem[]; nextCursor: number | null }) => void;
  readPage.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = loadOlderThreadRuntimeItems(threadId);
  applyThreadSnapshot(snapshot([goal(), ...rows(85, 95)], 85, 2));
  resolve({ items: [row("stale")], nextCursor: 1 });
  expect(await pending).toBe(false);
  expect(ids()).not.toContain("stale");
  expect(runtimeHistoryBoundary(threadId).cursor).toBe(80);
});

it("does not let a stale snapshot replace either the cursor or its installation generation", () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 90)], 80, 10));
  const generation = runtimeHistoryBoundary(threadId).generation;
  applyThreadSnapshot(snapshot([goal(), ...rows(120, 125)], 120, 5), {
    fromServer: true,
    lastSeenEventSeq: 10,
  });
  expect(runtimeHistoryBoundary(threadId).generation).toBe(generation);
  expect(runtimeHistoryBoundary(threadId).cursor).toBe(80);
  expect(ids()).toEqual(["goal", ...rows(80, 90).map((item) => item.id)]);
});

it("initializes recoverable paging when live items beat a shorter first active snapshot", async () => {
  useAppStore.getState().hydrateThreadRuntimeItems(threadId, rows(80, 81));
  const live = useAppStore.getState().runtimeItemsByIdByThread[threadId]!["row-81"];
  const incoming = snapshot([row("row-80")], 80);
  applyThreadSnapshot({ ...incoming, thread: { ...thread, status: "working" } });
  expect(hasHydratedThreadRuntimeItems(threadId)).toBe(true);
  expect(runtimeHistoryBoundary(threadId).needsRebase).toBe(true);
  readPage.mockResolvedValueOnce({ items: rows(79, 81), nextCursor: 78 });
  expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
  expect(readPage).toHaveBeenCalledWith(
    expect.objectContaining({ beforePosition: Number.MAX_SAFE_INTEGER }),
  );
  expect(ids()).toEqual(["row-79", "row-80", "row-81"]);
  expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]!["row-81"]).toBe(live);
});

it("keeps an active live goal clear when an unsequenced sparse snapshot only covers ordinary text", () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 90)], 80));
  send(updateGoalItemEvents(threadId, "goal", { action: "cleared" }));
  const before = useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal;
  const incoming = snapshot([goal(), ...rows(85, 90)], 85, 2);
  applyThreadSnapshot({ ...incoming, thread: { ...thread, status: "working" } });
  expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]!.goal).toBe(before);
  expect(selectThreadGoalDockState(useAppStore.getState(), threadId)).toBeNull();
});

it("uses the authoritative cursor when only the hidden goal overlaps a disjoint snapshot", async () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 90)], 80));
  applyThreadSnapshot(snapshot([goal(), ...rows(120, 125)], 120, 2));
  readPage.mockResolvedValueOnce({ items: rows(91, 119), nextCursor: 91 });
  expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
  expect(readPage).toHaveBeenCalledWith(expect.objectContaining({ beforePosition: 120 }));
  expect(ids()).toEqual(["goal", ...rows(91, 125).map((item) => item.id)]);
});

it("drops a read after a truncate that keeps its oldest boundary, even if the old tail ID is reintroduced", async () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 90)], 80));
  let resolve!: (value: { items: RuntimeChatItem[]; nextCursor: number | null }) => void;
  readPage.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = loadOlderThreadRuntimeItems(threadId);
  send([
    { type: "runtime.truncated", threadId, itemId: "row-85", removedCompletedTurnAnchors: [] },
  ]);
  send([{ type: "item.started", threadId, itemId: "row-90", itemType: "assistant_message" }]);
  resolve({ items: [row("stale")], nextCursor: 1 });
  expect(await pending).toBe(false);
  expect(ids()).not.toContain("stale");
  expect(runtimeHistoryBoundary(threadId).cursor).toBe(80);
});

it("fences a truncate to an absent checkpoint before any stale read can install", async () => {
  applyThreadSnapshot(snapshot([goal(), ...rows(80, 90)], 80));
  let resolve!: (value: { items: RuntimeChatItem[]; nextCursor: number | null }) => void;
  readPage.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = loadOlderThreadRuntimeItems(threadId);
  send([
    {
      type: "runtime.truncated",
      threadId,
      itemId: "unloaded-checkpoint",
      removedCompletedTurnAnchors: [],
    },
  ]);
  resolve({ items: [row("stale")], nextCursor: 1 });
  expect(await pending).toBe(false);
  expect(ids()).not.toContain("stale");
  expect(runtimeHistoryBoundary(threadId).cursor).toBe(80);
  expect(runtimeHistoryBoundary(threadId).needsRebase).toBe(true);
});

it("cancels a scheduled continuation on reset without reading or installing into the new generation", async () => {
  applyThreadSnapshot(snapshot([goal()], 5));
  grow();
  let reads = 0;
  readPage.mockImplementation(async ({ beforePosition }) => ({
    items: [row(`scan-${++reads}`)],
    nextCursor: beforePosition! - 1,
  }));
  const pending = loadOlderThreadRuntimeItems(threadId);
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
  expect(reads).toBe(16);
  dispatchRemoteSupervisorEvent({ type: "thread-reset", threadId });
  applyThreadSnapshot(snapshot([row("new-generation")], 50, 2));
  await vi.runAllTimersAsync();
  expect(await pending).toBe(false);
  expect(reads).toBe(16);
  expect(ids()).toEqual(["new-generation"]);
  expect(runtimeHistoryBoundary(threadId).cursor).toBe(50);
});

it("cooperatively skips fully filtered pages until older visible history is available", async () => {
  applyThreadSnapshot(snapshot([goal(), row("tail")], 100));
  let reads = 0;
  readPage.mockImplementation(async ({ beforePosition }) => {
    reads += 1;
    return reads <= 18
      ? { items: [row(`empty-${reads}`, { type: "reasoning" })], nextCursor: beforePosition! - 1 }
      : { items: [row("visible-older")], nextCursor: null };
  });
  const pending = loadOlderThreadRuntimeItems(threadId);
  await vi.runAllTimersAsync();
  expect(await pending).toBe(true);
  expect(reads).toBe(19);
  expect(ids()).toEqual(["goal", "visible-older", "tail"]);
});

it("continues over duplicate-only canonical pages without reporting an invisible success", async () => {
  applyThreadSnapshot(snapshot([goal(), row("tail")], 100));
  readPage
    .mockResolvedValueOnce({ items: [row("tail")], nextCursor: 99 })
    .mockResolvedValueOnce({ items: [row("older")], nextCursor: null });
  const pending = loadOlderThreadRuntimeItems(threadId);
  await vi.runAllTimersAsync();
  expect(await pending).toBe(true);
  expect(readPage).toHaveBeenCalledTimes(2);
  expect(ids()).toEqual(["goal", "older", "tail"]);
});

it("keeps canonical scan progress retryable after rejection without installing partial pages", async () => {
  applyThreadSnapshot(snapshot([goal()], 1));
  grow();
  const before = ids();
  const boundaryId = before[1]!;
  readPage
    .mockResolvedValueOnce({ items: [row("newer")], nextCursor: 99 })
    .mockRejectedValueOnce(new Error("temporary"));
  expect(await loadOlderThreadRuntimeItems(threadId)).toBe(false);
  expect(ids()).toBe(before);
  readPage.mockResolvedValueOnce({ items: [row("restored"), row(boundaryId)], nextCursor: 90 });
  expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
  expect(readPage).toHaveBeenLastCalledWith(expect.objectContaining({ beforePosition: 99 }));
  expect(ids().slice(0, 2)).toEqual(["goal", "restored"]);
  vi.setSystemTime(Date.now() + 5_001);
  boundVisibleThreadRuntimeWindows([threadId]);
  expect(ids()).toContain("restored");
});
