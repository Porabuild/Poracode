import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import { selectThreadGoalDockState } from "../components/thread/threadGoalState";
import { selectThreadTodoDockState } from "../components/thread/threadTodoState";
import { useAppStore } from "./appStore";
import {
  boundVisibleThreadRuntimeWindows,
  forgetThreadRuntimeWindow,
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
  releaseThreadRuntimeItems,
  retainThreadRuntimeItems,
  seedOlderThreadRuntimeItemsCursor,
} from "./chatRuntimePersister";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import { useWorkflowRunStore } from "./workflowRunStore";

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
    dbGetThreadCompletedTurns: vi.fn<() => Promise<never[]>>().mockResolvedValue([]),
    dbGetThreadContextUsage: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    dbGetLatestThreadGoalItem: vi.fn<() => Promise<null>>().mockResolvedValue(null),
  },
}));
vi.mock("../bridge", () => ({ readBridge: () => bridge }));

const original = useAppStore.getState();
const retained = new Set<string>();
let nextThread = 0;
const MIB = 1024 * 1024;

function item(id: string, size = 10, patch: Partial<RuntimeChatItem> = {}): RuntimeChatItem {
  return {
    id,
    type: "assistant_message",
    state: "completed",
    streams: {},
    payload: { role: "assistant", content: [{ kind: "text", text: "x".repeat(size) }] },
    ...patch,
  };
}

function thread(items?: RuntimeChatItem[]): string {
  const id = `window-policy-${++nextThread}`;
  retainThreadRuntimeItems(id);
  retained.add(id);
  if (items) {
    useAppStore.getState().hydrateThreadRuntimeItems(id, items);
    seedOlderThreadRuntimeItemsCursor(id, 100);
  }
  return id;
}

function bound(id: string): void {
  vi.setSystemTime(Date.now() + 5_001);
  boundVisibleThreadRuntimeWindows([id]);
}

function longTail(): RuntimeChatItem[] {
  return Array.from({ length: 30 }, (_, index) => item(`tail-${index}`, MIB / 4));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  bridge.dbGetThreadRuntimeItemsPage.mockReset();
  useAppStore.setState({
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeStructuralVersionByThread: {},
    runtimeCompletedTurnsByThread: {},
  });
  useWorkflowRunStore.setState({ byItemId: {} });
});

afterEach(() => {
  for (const id of retained) {
    releaseThreadRuntimeItems(id);
    forgetThreadRuntimeWindow(id);
  }
  retained.clear();
  useAppStore.setState(original, true);
  useWorkflowRunStore.setState({ byItemId: {} });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("rebases a sparse goal and compacted tool run through its raw source boundary without duplicate tools", async () => {
  const id = thread();
  const goal = item("goal", 0, { type: "goal", payload: { action: "set", objective: "Continue" } });
  const old = item("old", MIB);
  const tools = ["tool:a", "tool:b"].map((key) =>
    item(key, 0, {
      type: "command_execution",
      payload: { command: "read fixture", status: "success" },
    }),
  );
  const newest = item("newest", 6 * MIB - 2_000);
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
    items: [goal, old, ...tools, newest],
    nextCursor: 5,
  });
  await hydrateThreadRuntimeItems(id);
  const summary = useAppStore.getState().runtimeItemIdsByThread[id]![2]!;
  expect(summary).toMatch(/^tool-call-summary:/);
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual(["goal", summary, "newest"]);

  bridge.dbGetThreadRuntimeItemsPage
    .mockResolvedValueOnce({ items: [newest], nextCursor: 90 })
    .mockResolvedValueOnce({ items: tools, nextCursor: 40 })
    .mockResolvedValueOnce({ items: [goal, old], nextCursor: null });
  expect(await loadOlderThreadRuntimeItems(id)).toBe(true);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual([
    "goal",
    "old",
    summary,
    "newest",
  ]);
  expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(4);
});

it("retains a durable predecessor when an error would become the paging boundary", async () => {
  const prefix = item("discard", MIB);
  const predecessor = item("predecessor", MIB);
  const newest = item("newest", 6 * MIB - 2_000);
  const id = thread([prefix, predecessor]);
  useAppStore
    .getState()
    .applyRuntimeEvent(id, { type: "error", threadId: id, message: "transient" });
  const errorId = useAppStore.getState().runtimeItemIdsByThread[id]!.at(-1)!;
  useAppStore.getState().applyRuntimeEvents(id, [
    {
      type: "item.started",
      threadId: id,
      itemId: newest.id,
      itemType: newest.type,
      payload: newest.payload,
    },
    { type: "item.completed", threadId: id, itemId: newest.id },
  ]);
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual([
    "predecessor",
    errorId,
    "newest",
  ]);
  // The durable source never contained the renderer-generated error id.
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
    items: [prefix, predecessor, newest],
    nextCursor: null,
  });
  expect(await loadOlderThreadRuntimeItems(id)).toBe(true);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual([
    "discard",
    "predecessor",
    errorId,
    "newest",
  ]);
});

it("closes ancestry over completed children in the intervening protected suffix", () => {
  const items = [
    item("discard", MIB),
    item("parent", 0, {
      type: "tool_call",
      payload: { name: "Delegate", status: "success", isSubAgent: true },
    }),
    item("goal", 0, {
      type: "goal",
      payload: { action: "set", objective: "keep history", status: "active" },
    }),
    ...longTail(),
    item("child", 10, { parentItemId: "parent" }),
  ];
  const id = thread(items);
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual(
    items.slice(1).map((row) => row.id),
  );
  expect(useAppStore.getState().runtimeItemsByIdByThread[id]?.parent).toBe(items[1]);
});

it("preserves completed background workflow rows until their manifest is terminal", () => {
  const workflow = item("background-workflow", 0, {
    type: "tool_call",
    observedLive: true,
    payload: {
      name: "Workflow",
      status: "success",
      workflow: { runId: "run", transcriptDir: "/tmp/workflow-fixture/subagents/workflows/run" },
    },
  });
  const id = thread([item("discard", MIB), workflow, ...longTail()]);
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]![0]).toBe(workflow.id);
  useWorkflowRunStore.setState({
    byItemId: {
      [workflow.id]: {
        manifestPath: "/tmp/workflow-fixture/workflows/run.json",
        loading: false,
        error: null,
        run: { runId: "run", status: "completed", agentCount: 0, phases: [], unphasedAgents: [] },
      },
    },
  });
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).not.toContain(workflow.id);
});

it("preserves canonical running tools despite item completion", () => {
  const id = thread([
    item("discard", MIB),
    item("background-tool", 0, {
      type: "tool_call",
      payload: { name: "Delegate", status: "running", isSubAgent: true },
    }),
    ...longTail(),
  ]);
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]![0]).toBe("background-tool");
  useAppStore.getState().applyRuntimeEvent(id, {
    type: "item.completed",
    threadId: id,
    itemId: "background-tool",
    payload: { name: "Delegate", status: "success", isSubAgent: true },
  });
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).not.toContain("background-tool");
});

it("evicts historical handoffs and goals while preserving the latest cleared marker", () => {
  const oldGoal = item("old-goal", 0, {
    type: "goal",
    payload: { action: "set", objective: "Old goal", status: "active" },
  });
  const handoff = item("handoff", 0, { type: "provider_handoff" });
  const id = thread([item("discard", MIB), oldGoal, handoff, ...longTail()]);
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).not.toContain("handoff");
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).not.toContain("old-goal");
  expect(selectThreadGoalDockState(useAppStore.getState(), id)).toBeNull();
  useAppStore.getState().applyRuntimeEvents(id, [
    {
      type: "item.started",
      threadId: id,
      itemId: "cleared",
      itemType: "goal",
      payload: { action: "cleared" },
    },
    { type: "item.completed", threadId: id, itemId: "cleared" },
  ]);
  useAppStore.getState().applyRuntimeEvents(
    id,
    longTail().flatMap((row) => [
      {
        type: "item.started",
        threadId: id,
        itemId: `new-${row.id}`,
        itemType: row.type,
        payload: row.payload,
      } as const,
      { type: "item.completed", threadId: id, itemId: `new-${row.id}` } as const,
    ]),
  );
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toContain("cleared");
  expect(selectThreadGoalDockState(useAppStore.getState(), id)).toBeNull();
});

it("keeps only the latest authoritative completed goal among many historical goals", () => {
  const rows = longTail().flatMap((row, index) => [
    item(`goal-${index}`, 0, {
      type: "goal",
      payload: { action: "set", objective: `Goal ${index}`, status: "active" },
    }),
    row,
  ]);
  const id = thread(rows);
  bound(id);
  const ids = useAppStore.getState().runtimeItemIdsByThread[id]!;
  expect(ids).not.toContain("goal-0");
  expect(ids).toContain("goal-29");
  expect(selectThreadGoalDockState(useAppStore.getState(), id)?.sourceItemId).toBe("goal-29");
  expect(ids.length).toBeLessThan(rows.length);
});

it("charges newly paged protection before measurement and keeps one oversized requested row", async () => {
  const id = thread([item("newest", 6 * MIB - 2_000)]);
  const page = Array.from({ length: 10 }, (_, index) => item(`page-${index}`, MIB / 4));
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({ items: page, nextCursor: 20 });
  expect(await loadOlderThreadRuntimeItems(id)).toBe(true);
  bound(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual([
    ...page.slice(3).map((row) => row.id),
    "newest",
  ]);

  const oversizedId = thread([item("tail", MIB)]);
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
    items: [item("oversized-page", 7 * MIB)],
    nextCursor: null,
  });
  expect(await loadOlderThreadRuntimeItems(oversizedId)).toBe(true);
  bound(oversizedId);
  expect(useAppStore.getState().runtimeItemIdsByThread[oversizedId]).toEqual([
    "oversized-page",
    "tail",
  ]);
});

it("drops rebase metadata through release and eleven-thread LRU churn", async () => {
  const first = thread(longTail());
  bound(first);
  releaseThreadRuntimeItems(first);
  retained.delete(first);
  for (let index = 0; index < 11; index += 1) {
    const id = thread([item(`cached-${index}`)]);
    releaseThreadRuntimeItems(id);
    retained.delete(id);
  }
  expect(hasHydratedThreadRuntimeItems(first)).toBe(false);
  expect(useAppStore.getState().runtimeItemIdsByThread[first]).toBeUndefined();
  retainThreadRuntimeItems(first);
  retained.add(first);
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
    items: [item("fresh")],
    nextCursor: 12,
  });
  await hydrateThreadRuntimeItems(first);
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
    items: [item("fresh-older")],
    nextCursor: null,
  });
  expect(await loadOlderThreadRuntimeItems(first)).toBe(true);
  expect(bridge.dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith(
    expect.objectContaining({ beforePosition: 12 }),
  );
  expect(useAppStore.getState().runtimeItemIdsByThread[first]).toEqual(["fresh-older", "fresh"]);
});

it("yields after 16 duplicate pages and continues at a stationary top without another gesture", async () => {
  const id = thread(longTail());
  bound(id);
  const before = useAppStore.getState().runtimeItemIdsByThread[id]!;
  const boundary = before[0]!;
  let reads = 0;
  bridge.dbGetThreadRuntimeItemsPage.mockImplementation(async ({ beforePosition }) => {
    reads += 1;
    return reads <= 17
      ? { items: [item(`newer-page-${reads}`)], nextCursor: beforePosition! - 10 }
      : { items: [item("restored"), item(boundary)], nextCursor: 1 };
  });
  let settled = false;
  const pending = loadOlderThreadRuntimeItems(id).then((result) => {
    settled = true;
    return result;
  });
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
  expect(settled).toBe(false);
  expect(reads).toBe(16);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toBe(before);
  bound(id);
  await vi.advanceTimersToNextTimerAsync();
  expect(await pending).toBe(true);
  expect(reads).toBe(18);
  expect(bridge.dbGetThreadRuntimeItemsPage.mock.calls[16]?.[0].beforePosition).toBe(
    Number.MAX_SAFE_INTEGER - 160,
  );
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual(["restored", ...before]);
});

it("retains persistent plans sparsely without pinning completed history and relocates them on older paging", async () => {
  const plan1 = item("plan-1", 0, {
    type: "plan",
    state: "updated",
    observedLive: true,
    payload: {
      steps: [
        { step: "Audit memory", status: "completed" },
        { step: "Bound window", status: "in_progress" },
      ],
    },
  });
  const plan2 = item("plan-2", 0, {
    type: "plan",
    state: "updated",
    observedLive: true,
    payload: {
      steps: [
        { step: "Audit memory", status: "pending" },
        { step: "Bound window", status: "in_progress" },
        { step: "Verify suites", status: "pending" },
      ],
    },
  });
  const tail = longTail();
  const id = thread([
    item("discard-before", MIB),
    plan1,
    item("discard-between", MIB),
    plan2,
    ...tail,
  ]);
  const dockBefore = selectThreadTodoDockState(useAppStore.getState(), id);
  expect(dockBefore).toMatchObject({
    sourceItemId: "plan-2",
    steps: [
      { text: "Audit memory", status: "completed" },
      { text: "Bound window", status: "in_progress" },
      { text: "Verify suites", status: "pending" },
    ],
  });

  bound(id);
  const afterBoundIds = useAppStore.getState().runtimeItemIdsByThread[id]!;
  expect(afterBoundIds.slice(0, 2)).toEqual(["plan-1", "plan-2"]);
  expect(afterBoundIds).not.toContain("discard-before");
  expect(afterBoundIds).not.toContain("discard-between");
  expect(afterBoundIds).not.toContain("tail-0");
  expect(selectThreadTodoDockState(useAppStore.getState(), id)).toEqual(dockBefore);

  // Live in-place plan updates keep mutating the sparse control item.
  useAppStore.getState().applyRuntimeEvent(id, {
    type: "item.updated",
    threadId: id,
    itemId: "plan-2",
    payload: {
      steps: [
        { step: "Audit memory", status: "pending" },
        { step: "Bound window", status: "completed" },
        { step: "Verify suites", status: "in_progress" },
      ],
    },
  });
  expect(selectThreadTodoDockState(useAppStore.getState(), id)?.steps).toEqual([
    { text: "Audit memory", status: "completed" },
    { text: "Bound window", status: "completed" },
    { text: "Verify suites", status: "in_progress" },
  ]);

  // Canonical older paging skips sparse plans as anchors and relocates plan-2 into place.
  const firstRetainedOrdinary = afterBoundIds[2]!;
  bridge.dbGetThreadRuntimeItemsPage.mockResolvedValueOnce({
    items: [item("discard-between", MIB), plan2, item(firstRetainedOrdinary, MIB / 4)],
    nextCursor: 40,
  });
  expect(await loadOlderThreadRuntimeItems(id)).toBe(true);
  const afterPageIds = useAppStore.getState().runtimeItemIdsByThread[id]!;
  expect(afterPageIds.slice(0, 4)).toEqual([
    "plan-1",
    "discard-between",
    "plan-2",
    firstRetainedOrdinary,
  ]);
  expect(selectThreadTodoDockState(useAppStore.getState(), id)?.steps).toEqual([
    { text: "Audit memory", status: "completed" },
    { text: "Bound window", status: "completed" },
    { text: "Verify suites", status: "in_progress" },
  ]);
});

it("does not let hydrated or closed-turn unsettled ordinary items pin >6 MiB of history", () => {
  const hydratedAssistant = item("hydrated-unsettled-assistant", 0, {
    type: "assistant_message",
    state: "updated",
  });
  const hydratedCommand = item("hydrated-unsettled-command", 0, {
    type: "command_execution",
    state: "started",
    payload: { command: "bun test", status: "in_progress" },
  });
  const hydratedTool = item("hydrated-running-tool", 0, {
    type: "tool_call",
    state: "completed",
    payload: { name: "Read", status: "running" },
  });
  const settledLiveAssistant = item("closed-turn-live-assistant", 0, {
    type: "assistant_message",
    state: "started",
    observedLive: true,
  });
  const tail = longTail();
  const id = thread([
    hydratedAssistant,
    hydratedCommand,
    hydratedTool,
    settledLiveAssistant,
    ...tail,
  ]);
  useAppStore.setState((state) => ({
    runtimeCompletedTurnsByThread: {
      ...state.runtimeCompletedTurnsByThread,
      [id]: [{ startedAt: 1, endedAt: 2, anchorItemId: "tail-0" }],
    },
  }));

  bound(id);
  const ids = useAppStore.getState().runtimeItemIdsByThread[id]!;
  expect(ids).not.toContain("hydrated-unsettled-assistant");
  expect(ids).not.toContain("hydrated-unsettled-command");
  expect(ids).not.toContain("hydrated-running-tool");
  expect(ids).not.toContain("closed-turn-live-assistant");
  expect(ids).not.toContain("tail-0");
  expect(ids.at(-1)).toBe("tail-29");
});
