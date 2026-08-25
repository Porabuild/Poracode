import type { RuntimeEvent, ThreadContextUsage, ToolCallPayload } from "@/shared/contracts";
import { isDelegatedAgentTool } from "@/shared/toolCallClassification";
import type { AppStoreState } from "./shared";
import {
  type CompletedTurnRecord,
  type OpenRuntimeRequest,
  type RuntimeChatItem,
  type RuntimeEventSlice,
} from "./runtimeEventSlice";

type RuntimeEventState = Pick<
  RuntimeEventSlice,
  | "runtimeItemIdsByThread"
  | "runtimeItemsByIdByThread"
  | "runtimeRequestsByThread"
  | "runtimeContextByThread"
  | "runtimeStructuralVersionByThread"
  | "runtimeCompletedTurnsByThread"
  | "runtimeOpenTurnByThread"
> &
  Pick<AppStoreState, "threads">;

export function applyRuntimeEventsToState(
  state: AppStoreState,
  threadId: string,
  events: RuntimeEvent[],
): Partial<RuntimeEventState> {
  return applyRuntimeEventBatchesToState(state, [{ threadId, events }]);
}

/**
 * Apply runtime events for one or more threads in a single reducer pass so the
 * rAF flush can commit concurrent streams with one Zustand `set()` instead of
 * one per thread (each `set` re-runs every subscribed selector).
 */
export function applyRuntimeEventBatchesToState(
  state: AppStoreState,
  batches: ReadonlyArray<{ threadId: string; events: RuntimeEvent[] }>,
): Partial<RuntimeEventState> {
  if (batches.length === 0) return {};

  let nextState: RuntimeEventState = {
    runtimeItemIdsByThread: state.runtimeItemIdsByThread,
    runtimeItemsByIdByThread: state.runtimeItemsByIdByThread,
    runtimeRequestsByThread: state.runtimeRequestsByThread,
    runtimeContextByThread: state.runtimeContextByThread,
    runtimeStructuralVersionByThread: state.runtimeStructuralVersionByThread,
    runtimeCompletedTurnsByThread: state.runtimeCompletedTurnsByThread ?? {},
    runtimeOpenTurnByThread: state.runtimeOpenTurnByThread ?? {},
    threads: state.threads ?? [],
  };
  let changed = false;
  const structuralBumpThreadIds = new Set<string>();

  for (const batch of batches) {
    if (batch.events.length === 0) continue;
    const { threadId, events } = batch;
    const coalescedEvents = coalesceRuntimeEvents(events);
    let batchChanged = false;
    for (let eventIndex = 0; eventIndex < coalescedEvents.length;) {
      const event = coalescedEvents[eventIndex]!;
      if (isRuntimeItemEvent(event)) {
        let itemRunEnd = eventIndex + 1;
        while (
          itemRunEnd < coalescedEvents.length &&
          isRuntimeItemEvent(coalescedEvents[itemRunEnd]!)
        ) {
          itemRunEnd += 1;
        }
        if (itemRunEnd - eventIndex > 1) {
          const itemBatch = applyRuntimeItemEvents(
            nextState,
            threadId,
            coalescedEvents.slice(eventIndex, itemRunEnd),
            true,
          );
          if (itemBatch) {
            nextState = itemBatch.state;
            batchChanged = true;
            if (itemBatch.structuralChanged) structuralBumpThreadIds.add(threadId);
          }
          eventIndex = itemRunEnd;
          continue;
        }
      }
      const patch = applyRuntimeEventToRuntimeState(nextState, threadId, event);
      eventIndex += 1;
      if (Object.keys(patch).length === 0) continue;
      nextState = { ...nextState, ...patch };
      const reopenPatch = reopenGuiTurnForLiveRuntimeActivity(nextState, threadId, event);
      if (Object.keys(reopenPatch).length > 0) {
        nextState = { ...nextState, ...reopenPatch };
      }
      batchChanged = true;
      if (eventAffectsStructuralVersion(event)) structuralBumpThreadIds.add(threadId);
    }
    if (batchChanged) {
      changed = true;
    }
  }

  if (!changed) return {};
  if (structuralBumpThreadIds.size > 0) {
    let runtimeStructuralVersionByThread = nextState.runtimeStructuralVersionByThread;
    for (const threadId of structuralBumpThreadIds) {
      runtimeStructuralVersionByThread = {
        ...runtimeStructuralVersionByThread,
        [threadId]: (runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
      };
    }
    nextState = { ...nextState, runtimeStructuralVersionByThread };
  }
  return {
    ...nextState,
  };
}

/**
 * Buffered sub-agent history is delivered as one batch containing hundreds of
 * item lifecycle events. Clone the thread collections once for that replay;
 * cloning the growing id array and item map for every event makes hydration
 * quadratic and blocks the panel's first paint.
 */
function applyRuntimeItemEvents(
  state: RuntimeEventState,
  threadId: string,
  events: RuntimeEvent[],
  applyReopen: boolean,
): { state: RuntimeEventState; structuralChanged: boolean } | null {
  if (!events.every(isRuntimeItemEvent)) return null;

  const existingIds = state.runtimeItemIdsByThread[threadId] ?? [];
  const existingItems = state.runtimeItemsByIdByThread[threadId] ?? {};
  const preserveItemsMap = events.length === 1 && events[0]?.type === "content.delta";
  const draft: RuntimeItemDraft = {
    itemIds: existingIds,
    itemIdsChanged: false,
    items: preserveItemsMap ? existingItems : { ...existingItems },
  };
  let nextState: RuntimeEventState = {
    ...state,
    runtimeItemsByIdByThread: {
      ...state.runtimeItemsByIdByThread,
      [threadId]: draft.items,
    },
  };
  let changed = false;
  let structuralChanged = false;

  for (const event of events) {
    const itemIdsChangedBefore = draft.itemIdsChanged;
    const eventChanged = applyRuntimeItemEvent(draft, event);
    if (!eventChanged) continue;
    changed = true;
    if (eventAffectsStructuralVersion(event)) structuralChanged = true;
    if (!itemIdsChangedBefore && draft.itemIdsChanged) {
      nextState = {
        ...nextState,
        runtimeItemIdsByThread: {
          ...nextState.runtimeItemIdsByThread,
          [threadId]: draft.itemIds,
        },
      };
    }
    if (applyReopen) {
      const reopenPatch = reopenGuiTurnForLiveRuntimeActivity(nextState, threadId, event);
      if (Object.keys(reopenPatch).length > 0) {
        nextState = { ...nextState, ...reopenPatch };
      }
    }
  }

  return changed ? { state: nextState, structuralChanged } : null;
}

interface RuntimeItemDraft {
  itemIds: readonly string[];
  itemIdsChanged: boolean;
  items: Record<string, RuntimeChatItem>;
}

function mutableRuntimeItemIds(draft: RuntimeItemDraft): string[] {
  if (!draft.itemIdsChanged) {
    draft.itemIds = [...draft.itemIds];
    draft.itemIdsChanged = true;
  }
  return draft.itemIds as string[];
}

function applyRuntimeItemEvent(
  draft: RuntimeItemDraft,
  event: Extract<
    RuntimeEvent,
    { type: "item.started" | "item.updated" | "item.completed" | "content.delta" }
  >,
): boolean {
  switch (event.type) {
    case "item.started": {
      if (draft.items[event.itemId]) return false;
      const item: RuntimeChatItem = {
        id: event.itemId,
        type: event.itemType,
        state: "started",
        ...(isDelegatedAgentTool(event.payload as ToolCallPayload | undefined)
          ? { startedAt: Date.now() }
          : {}),
        payload: event.payload,
        streams: {},
        observedLive: true,
        ...(event.parentItemId ? { parentItemId: event.parentItemId } : {}),
      };
      mutableRuntimeItemIds(draft).push(event.itemId);
      draft.items[event.itemId] = item;
      return true;
    }
    case "item.updated": {
      const prev = draft.items[event.itemId];
      if (!prev) return false;
      const payload = mergePayload(prev.payload, event.payload);
      draft.items[event.itemId] = {
        ...prev,
        state: prev.state === "completed" ? "completed" : "updated",
        ...(prev.startedAt === undefined &&
        isDelegatedAgentTool(payload as ToolCallPayload | undefined)
          ? { startedAt: Date.now() }
          : {}),
        payload,
      };
      return true;
    }
    case "item.completed": {
      const prev = draft.items[event.itemId];
      if (!prev) return false;
      const next: RuntimeChatItem = {
        ...prev,
        state: "completed",
        ...(prev.startedAt !== undefined ? { completedAt: Date.now() } : {}),
        payload:
          event.payload !== undefined ? mergePayload(prev.payload, event.payload) : prev.payload,
      };
      if (next.type === "reasoning" && !(next.streams.reasoning_text ?? "").trim()) {
        const itemIds = mutableRuntimeItemIds(draft);
        itemIds.splice(itemIds.indexOf(event.itemId), 1);
        delete draft.items[event.itemId];
      } else {
        draft.items[event.itemId] = next;
      }
      return true;
    }
    case "content.delta": {
      const prev = draft.items[event.itemId];
      if (!prev) return false;
      draft.items[event.itemId] = {
        ...prev,
        state: prev.state === "completed" ? "completed" : "updated",
        streams: {
          ...prev.streams,
          [event.stream]: (prev.streams[event.stream] ?? "") + event.delta,
        },
      };
      return true;
    }
  }
}

function isRuntimeItemEvent(
  event: RuntimeEvent,
): event is Extract<
  RuntimeEvent,
  { type: "item.started" | "item.updated" | "item.completed" | "content.delta" }
> {
  return (
    event.type === "item.started" ||
    event.type === "item.updated" ||
    event.type === "item.completed" ||
    event.type === "content.delta"
  );
}

function reopenGuiTurnForLiveRuntimeActivity(
  state: RuntimeEventState,
  threadId: string,
  event: RuntimeEvent,
): Partial<RuntimeEventState> {
  // Once a turn has completed (`turn.completed` -> open === false), trailing
  // runtime events for that turn can legitimately arrive after its `idle`
  // status on the single FIFO IPC wire. Those must not flip the settled GUI
  // thread back to "working". A genuinely premature idle (no `turn.completed`
  // yet -> open !== false) still reopens, preserving the safety net.
  if (state.runtimeOpenTurnByThread[threadId] === false) return {};
  if (!isLiveAssistantActivity(state, threadId, event)) return {};

  // Fast path: already working (or not a reopen candidate). Streaming deltas
  // hit this on every frame — avoid mapping the full threads array.
  const threadIndex = state.threads.findIndex((thread) => thread.id === threadId);
  if (threadIndex < 0) return {};
  const thread = state.threads[threadIndex]!;
  if (
    thread.presentationMode !== "gui" ||
    (thread.status !== "idle" && thread.status !== "finished")
  ) {
    return {};
  }

  const nowIso = new Date().toISOString();
  const activeTurnStartedAt = thread.lastTurnStartedAt ?? thread.updatedAt ?? nowIso;
  const startedAt = parseTurnMs(thread.lastTurnStartedAt);
  const endedAt = parseTurnMs(thread.lastTurnEndedAt);
  let nextCompletedTurns = state.runtimeCompletedTurnsByThread;
  if (startedAt !== null && endedAt !== null) {
    nextCompletedTurns = removeCompletedTurnWindow(
      nextCompletedTurns,
      threadId,
      startedAt,
      endedAt,
    );
  }

  const threads = state.threads.slice();
  threads[threadIndex] = {
    ...thread,
    status: "working" as const,
    attention: "working" as const,
    activeTurnStartedAt,
    lastTurnEndedAt: undefined,
  };
  return {
    threads,
    ...(nextCompletedTurns !== state.runtimeCompletedTurnsByThread
      ? { runtimeCompletedTurnsByThread: nextCompletedTurns }
      : {}),
  };
}

function isLiveAssistantActivity(
  state: RuntimeEventState,
  threadId: string,
  event: RuntimeEvent,
): boolean {
  if (event.type === "item.started") {
    return (
      event.itemType !== "user_message" &&
      event.itemType !== "error" &&
      event.itemType !== "plan" &&
      event.itemType !== "goal"
    );
  }
  if (event.type !== "item.updated" && event.type !== "content.delta") return false;
  const item = state.runtimeItemsByIdByThread[threadId]?.[event.itemId];
  return (
    item !== undefined &&
    item.state !== "completed" &&
    item.type !== "user_message" &&
    item.type !== "plan" &&
    item.type !== "goal"
  );
}

function parseTurnMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function removeCompletedTurnWindow(
  turnsByThread: RuntimeEventSlice["runtimeCompletedTurnsByThread"],
  threadId: string,
  startedAt: number,
  endedAt: number,
): RuntimeEventSlice["runtimeCompletedTurnsByThread"] {
  const turns = turnsByThread[threadId];
  if (!turns?.length) return turnsByThread;
  const filtered = turns.filter((turn) => turn.startedAt !== startedAt || turn.endedAt !== endedAt);
  if (filtered.length === turns.length) return turnsByThread;
  if (filtered.length > 0) {
    return { ...turnsByThread, [threadId]: filtered };
  }
  const { [threadId]: _removed, ...rest } = turnsByThread;
  return rest;
}

/**
 * Grouping decisions in the timeline depend on item identity, type, and
 * (for tool calls) `payload.name`. None of those change during `content.delta`
 * or request events, so the timeline cache stays valid through pure streaming.
 * Everything else conservatively bumps the version.
 */
function eventAffectsStructuralVersion(event: RuntimeEvent): boolean {
  switch (event.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
    case "turn.completed":
    case "error":
      return true;
    default:
      return false;
  }
}

function applyRuntimeEventToRuntimeState(
  state: RuntimeEventState,
  threadId: string,
  event: RuntimeEvent,
): Partial<RuntimeEventState> {
  if (isRuntimeItemEvent(event)) {
    return applyRuntimeItemEvents(state, threadId, [event], false)?.state ?? {};
  }

  switch (event.type) {
    case "session.started":
    case "session.exited":
    case "warning":
      // No item state to mutate. Status flows through the existing thread-state channel.
      return {};

    case "usage.spent":
      // Token consumption is persisted by the main-process usage ledger; the
      // renderer keeps no token state (the dock reads context.updated only).
      return {};

    case "turn.started":
      // Mark the runtime turn open so live activity may (re)open the GUI turn.
      // No item state to mutate; status flows through the thread-state channel.
      if (state.runtimeOpenTurnByThread[threadId] === true) return {};
      return {
        runtimeOpenTurnByThread: { ...state.runtimeOpenTurnByThread, [threadId]: true },
      };

    case "turn.completed": {
      // Mark the runtime turn closed. Trailing live events that land after this
      // (e.g. on the persistent plan item, after the turn's `idle` status) must
      // NOT reopen the settled GUI turn — that left a stale "working" until the
      // next thread-switch snapshot reconcile.
      const closeTurnPatch =
        state.runtimeOpenTurnByThread[threadId] === false
          ? {}
          : { runtimeOpenTurnByThread: { ...state.runtimeOpenTurnByThread, [threadId]: false } };
      if (event.state !== "interrupted" && event.state !== "cancelled") return closeTurnPatch;
      return { ...closeTurnPatch, ...pruneTrailingInterruptedReasoningItems(state, threadId) };
    }

    case "context.updated": {
      const prev = state.runtimeContextByThread[threadId];
      const next = mergeContextUsage(prev, event.usage);
      if (areContextUsagesEqual(prev, next)) return {};
      return {
        runtimeContextByThread: {
          ...state.runtimeContextByThread,
          [threadId]: next,
        },
      };
    }

    case "request.opened": {
      const existing = state.runtimeRequestsByThread[threadId] ?? [];
      const filtered = existing.filter((r) => r.requestId !== event.requestId);
      const open: OpenRuntimeRequest = {
        requestId: event.requestId,
        threadId,
        requestType: event.requestType,
        payload: event.payload,
        receivedAt: new Date().toISOString(),
      };
      return {
        runtimeRequestsByThread: {
          ...state.runtimeRequestsByThread,
          [threadId]: [...filtered, open],
        },
      };
    }

    case "request.resolved": {
      const list = state.runtimeRequestsByThread[threadId];
      if (!list) return {};
      const next = list.filter((r) => r.requestId !== event.requestId);
      if (next.length === list.length) return {};
      return {
        runtimeRequestsByThread: {
          ...state.runtimeRequestsByThread,
          [threadId]: next,
        },
      };
    }

    case "error": {
      const existingIds = state.runtimeItemIdsByThread[threadId] ?? [];
      const existingItems = state.runtimeItemsByIdByThread[threadId] ?? {};
      const item: RuntimeChatItem = {
        id: `err-${crypto.randomUUID()}`,
        type: "error",
        state: "completed",
        payload: { message: event.message },
        streams: {},
      };
      return {
        runtimeItemIdsByThread: {
          ...state.runtimeItemIdsByThread,
          [threadId]: [...existingIds, item.id],
        },
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: { ...existingItems, [item.id]: item },
        },
      };
    }

    default:
      return {};
  }
}

function mergeContextUsage(
  prev: ThreadContextUsage | undefined,
  usage: ThreadContextUsage,
): ThreadContextUsage {
  return {
    ...(prev ?? {}),
    ...usage,
    ...(usage.breakdown ? { breakdown: usage.breakdown } : {}),
  };
}

function areContextUsagesEqual(
  left: ThreadContextUsage | undefined,
  right: ThreadContextUsage,
): boolean {
  if (!left) return false;
  if (left.usedTokens !== right.usedTokens || left.maxTokens !== right.maxTokens) return false;
  const leftBreakdown = left.breakdown ?? [];
  const rightBreakdown = right.breakdown ?? [];
  if (leftBreakdown.length !== rightBreakdown.length) return false;
  return leftBreakdown.every((entry, index) => {
    const other = rightBreakdown[index];
    return other?.id === entry.id && other.label === entry.label && other.tokens === entry.tokens;
  });
}

function coalesceRuntimeEvents(events: RuntimeEvent[]): RuntimeEvent[] {
  const coalesced: RuntimeEvent[] = [];
  let pendingDelta: Extract<RuntimeEvent, { type: "content.delta" }> | undefined;

  const flushPendingDelta = () => {
    if (!pendingDelta) return;
    coalesced.push(pendingDelta);
    pendingDelta = undefined;
  };

  for (const event of events) {
    if (event.type !== "content.delta") {
      flushPendingDelta();
      coalesced.push(event);
      continue;
    }
    if (
      pendingDelta &&
      pendingDelta.itemId === event.itemId &&
      pendingDelta.stream === event.stream
    ) {
      pendingDelta = {
        ...pendingDelta,
        delta: pendingDelta.delta + event.delta,
      };
      continue;
    }
    flushPendingDelta();
    pendingDelta = event;
  }

  flushPendingDelta();
  return coalesced;
}

function pruneTrailingInterruptedReasoningItems(
  state: RuntimeEventState,
  threadId: string,
): Partial<RuntimeEventState> {
  const ids = state.runtimeItemIdsByThread[threadId];
  const items = state.runtimeItemsByIdByThread[threadId];
  if (!ids?.length || !items) return {};

  const dropIds = new Set<string>();
  for (let idx = ids.length - 1; idx >= 0; idx -= 1) {
    const id = ids[idx]!;
    const item = items[id];
    if (!item) break;
    if (item.type === "plan" || item.type === "error" || item.parentItemId) continue;
    if (item.type !== "reasoning") break;
    dropIds.add(id);
  }
  if (dropIds.size === 0) return {};

  const remainingItems: Record<string, RuntimeChatItem> = {};
  for (const [id, item] of Object.entries(items)) {
    if (!dropIds.has(id)) remainingItems[id] = item;
  }
  return {
    runtimeItemIdsByThread: {
      ...state.runtimeItemIdsByThread,
      [threadId]: ids.filter((id) => !dropIds.has(id)),
    },
    runtimeItemsByIdByThread: {
      ...state.runtimeItemsByIdByThread,
      [threadId]: remainingItems,
    },
  };
}

export function mergeCompletedTurns(
  existing: ReadonlyArray<CompletedTurnRecord>,
  incoming: ReadonlyArray<CompletedTurnRecord>,
): ReadonlyArray<CompletedTurnRecord> {
  if (incoming.length === 0) return existing;
  const byWindow = new Map<string, CompletedTurnRecord>();
  for (const turn of existing) {
    byWindow.set(completedTurnKey(turn), turn);
  }
  let changed = false;
  for (const turn of incoming) {
    const key = completedTurnKey(turn);
    if (byWindow.has(key)) continue;
    byWindow.set(key, turn);
    changed = true;
  }
  if (!changed) return existing;
  return [...byWindow.values()].sort((a, b) => a.startedAt - b.startedAt || a.endedAt - b.endedAt);
}

function completedTurnKey(turn: CompletedTurnRecord): string {
  return `${turn.startedAt}:${turn.endedAt}:${turn.anchorItemId ?? ""}`;
}

/** Shallow-merge two payloads so item.updated layers on top of started. */
function mergePayload(prev: unknown, next: unknown): unknown {
  if (!prev || typeof prev !== "object") return next;
  if (!next || typeof next !== "object") return next;
  return { ...(prev as Record<string, unknown>), ...(next as Record<string, unknown>) };
}
