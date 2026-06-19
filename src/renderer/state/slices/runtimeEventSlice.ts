import { msg } from "@lingui/core/macro";
import type {
  CanonicalItemType,
  CanonicalRequestType,
  FileCheckpointRecord,
  FileCheckpointTurn,
  RequestPayload,
  RuntimeContentStreamKind,
  RuntimeEvent,
  ThreadContextUsage,
  ToolCallPayload,
} from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import type { AppStoreState, SliceCreator } from "./shared";

const STALE_SUB_AGENT_ERROR_MESSAGE = msg`Interrupted: agent session ended before completion.`;

type RuntimePersistenceDirtyListener = (threadIds: readonly string[]) => void;

const runtimePersistenceDirtyListeners = new Set<RuntimePersistenceDirtyListener>();

export function subscribeRuntimePersistenceDirtyThreads(
  listener: RuntimePersistenceDirtyListener,
): () => void {
  runtimePersistenceDirtyListeners.add(listener);
  return () => runtimePersistenceDirtyListeners.delete(listener);
}

export function markThreadRuntimeForPersistence(threadId: string): void {
  for (const listener of runtimePersistenceDirtyListeners) {
    listener([threadId]);
  }
}

/**
 * Frozen "Worked for X" record for a turn that has finished. Persisted so the
 * chat can keep prior turn timings visible across reloads. The most recent
 * turn is normally displayed by the live tail loader; this list lets older
 * turns keep their indicator in place.
 *
 * `anchorItemId` is the last canonical item present in the thread at the
 * moment the turn closed — the renderer hangs the inline indicator beneath
 * that row in the timeline.
 */
export interface CompletedTurnRecord {
  startedAt: number;
  endedAt: number;
  anchorItemId: string | null;
}

/** Per-thread record of canonical chat items, derived from RuntimeEvent streams. */
export interface RuntimeChatItem {
  id: string;
  type: CanonicalItemType;
  /** "started" / "updated" land on items that haven't ended yet; "completed" → final. */
  state: "started" | "updated" | "completed";
  /** Last payload object reported via `item.started` or `item.updated`. */
  payload?: unknown;
  /** Streamed content buckets (markdown text, command output, etc.). */
  streams: Partial<Record<RuntimeContentStreamKind, string>>;
  /**
   * Identifier of a parent tool_call row when this item was emitted by a
   * sub-agent (e.g. items inside a Claude `Task` tool use). Set on
   * `item.started` and immutable thereafter. The chat timeline groups children
   * under their parent row instead of listing them as top-level entries.
   */
  parentItemId?: string;
}

export interface OpenRuntimeRequest {
  requestId: string;
  threadId: string;
  requestType: CanonicalRequestType;
  payload: RequestPayload;
  receivedAt: string;
}

export interface RuntimeEventSlice {
  /** Append-only ordered item ids per thread (newest at the end). */
  runtimeItemIdsByThread: Record<string, readonly string[]>;
  /** O(1) item lookup by id for each thread. */
  runtimeItemsByIdByThread: Record<string, Record<string, RuntimeChatItem>>;
  /** Open approval / user-input requests per thread. */
  runtimeRequestsByThread: Record<string, OpenRuntimeRequest[]>;
  /** Latest provider-reported context usage per GUI thread. */
  runtimeContextByThread: Record<string, ThreadContextUsage>;
  /**
   * Per-thread monotonic counter that bumps only on grouping-affecting changes
   * (item add/remove/payload mutation). Excludes `content.delta` so that
   * streaming text does not invalidate cached timeline groupings. Selectors
   * (e.g. `selectVisibleThreadTimelineEntries`) use this for O(1) cache
   * validation instead of recomputing a per-item fingerprint on every read.
   */
  runtimeStructuralVersionByThread: Record<string, number>;
  /** Frozen per-turn timing windows accumulated during the session. */
  runtimeCompletedTurnsByThread: Record<string, ReadonlyArray<CompletedTurnRecord>>;
  /**
   * Tracks whether the runtime event stream's current turn is open per thread:
   * `true` after `turn.started`, `false` after `turn.completed`. Gates
   * `reopenGuiTurnForLiveRuntimeActivity` so trailing runtime events that land
   * AFTER a turn's `turn.completed` (and its `idle` status) cannot flip a
   * settled GUI thread back to "working". Absent (`undefined`) means we have no
   * turn-boundary evidence yet, so reopen stays permitted (premature-idle
   * safety net). See reopenGuiTurnForLiveRuntimeActivity.
   */
  runtimeOpenTurnByThread: Record<string, boolean>;
  /** File-backed checkpoint snapshots keyed by checkpoint item id. */
  fileCheckpointsByThread: Record<string, Record<string, FileCheckpointRecord>>;
  /** Completed turn file diffs keyed by the turn anchor/checkpoint item id. */
  fileCheckpointTurnsByThread: Record<string, Record<string, FileCheckpointTurn>>;
  applyRuntimeEvent(threadId: string, event: RuntimeEvent): void;
  applyRuntimeEvents(threadId: string, events: RuntimeEvent[]): void;
  clearThreadRuntimeEvents(threadId: string): void;
  /**
   * Force-terminate any still-running sub-agent tool_call items in a thread.
   * Used when a thread has no live agent attached (after DB hydration, or when
   * a structured session exits / is about to be replaced on resume) — without
   * this, parents that never completed (denied permissions, crashes, abrupt
   * exits) keep appearing in the active sub-agent dock forever.
   */
  reconcileStaleSubAgents(threadId: string): void;
  /**
   * Revert the visible chat transcript to a checkpoint item, preserving that
   * item and everything before it. Used by GUI chat checkpoints.
   */
  truncateThreadRuntimeAfter(threadId: string, checkpointItemId: string): void;
  /** Replace the persisted item list for a thread (used during DB hydration). */
  hydrateThreadRuntimeItems(threadId: string, items: RuntimeChatItem[]): void;
  /** Replace the persisted completed-turn list (used during DB hydration). */
  hydrateThreadCompletedTurns(threadId: string, turns: ReadonlyArray<CompletedTurnRecord>): void;
  /**
   * Seed the latest persisted context-window usage for a thread. Skipped if a
   * fresher value already exists in the live store (the active provider stream
   * is the source of truth once it's flowing).
   */
  hydrateThreadContextUsage(threadId: string, usage: ThreadContextUsage): void;
  hydrateThreadFileCheckpoints(
    threadId: string,
    checkpoints: readonly FileCheckpointRecord[],
    turns: readonly FileCheckpointTurn[],
  ): void;
  upsertThreadFileCheckpoint(threadId: string, checkpoint: FileCheckpointRecord): void;
  upsertThreadFileCheckpointTurn(threadId: string, checkpoint: FileCheckpointTurn): void;
}

/**
 * Typed accessor for a runtime item's payload. Returns `undefined` when the
 * item is the wrong canonical type, so chat-part components can treat the
 * cast as validated rather than blind.
 */
export function getRuntimeItemPayload<T>(
  item: RuntimeChatItem,
  expectedType: CanonicalItemType,
): T | undefined {
  return item.type === expectedType ? (item.payload as T | undefined) : undefined;
}

export const createRuntimeEventSlice: SliceCreator<RuntimeEventSlice> = (set) => ({
  runtimeItemIdsByThread: {},
  runtimeItemsByIdByThread: {},
  runtimeRequestsByThread: {},
  runtimeContextByThread: {},
  runtimeStructuralVersionByThread: {},
  runtimeCompletedTurnsByThread: {},
  runtimeOpenTurnByThread: {},
  fileCheckpointsByThread: {},
  fileCheckpointTurnsByThread: {},

  applyRuntimeEvent: (threadId, event) =>
    set((state) => applyRuntimeEventsToState(state, threadId, [event])),

  applyRuntimeEvents: (threadId, events) =>
    set((state) => applyRuntimeEventsToState(state, threadId, events)),

  clearThreadRuntimeEvents: (threadId) =>
    set((state) => {
      if (
        !(threadId in state.runtimeItemIdsByThread) &&
        !(threadId in state.runtimeItemsByIdByThread) &&
        !(threadId in state.runtimeRequestsByThread) &&
        !(threadId in state.runtimeContextByThread) &&
        !(threadId in state.runtimeStructuralVersionByThread) &&
        !(threadId in state.runtimeCompletedTurnsByThread) &&
        !(threadId in state.runtimeOpenTurnByThread)
      ) {
        return {};
      }
      markThreadRuntimeForPersistence(threadId);
      const { [threadId]: _droppedItemIds, ...runtimeItemIdsByThread } =
        state.runtimeItemIdsByThread;
      const { [threadId]: _droppedItems, ...runtimeItemsByIdByThread } =
        state.runtimeItemsByIdByThread;
      const { [threadId]: _droppedReqs, ...runtimeRequestsByThread } =
        state.runtimeRequestsByThread;
      const { [threadId]: _droppedContext, ...runtimeContextByThread } =
        state.runtimeContextByThread;
      const { [threadId]: _droppedVersion, ...runtimeStructuralVersionByThread } =
        state.runtimeStructuralVersionByThread;
      const { [threadId]: _droppedTurns, ...runtimeCompletedTurnsByThread } =
        state.runtimeCompletedTurnsByThread;
      const { [threadId]: _droppedOpenTurn, ...runtimeOpenTurnByThread } =
        state.runtimeOpenTurnByThread;
      return {
        runtimeItemIdsByThread,
        runtimeItemsByIdByThread,
        runtimeRequestsByThread,
        runtimeContextByThread,
        runtimeStructuralVersionByThread,
        runtimeCompletedTurnsByThread,
        runtimeOpenTurnByThread,
      };
    }),

  reconcileStaleSubAgents: (threadId) =>
    set((state) => {
      const items = state.runtimeItemsByIdByThread[threadId];
      if (!items) return {};
      let nextItems: Record<string, RuntimeChatItem> | undefined;
      for (const [id, item] of Object.entries(items)) {
        if (!isStaleSubAgentItem(item)) continue;
        nextItems ??= { ...items };
        nextItems[id] = terminateSubAgentItem(item);
      }
      if (!nextItems) return {};
      markThreadRuntimeForPersistence(threadId);
      return {
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: nextItems,
        },
        runtimeStructuralVersionByThread: {
          ...state.runtimeStructuralVersionByThread,
          [threadId]: (state.runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
        },
      };
    }),

  truncateThreadRuntimeAfter: (threadId, checkpointItemId) =>
    set((state) => {
      const itemIds = state.runtimeItemIdsByThread[threadId];
      const items = state.runtimeItemsByIdByThread[threadId];
      if (!itemIds?.length || !items) return {};

      const checkpointIndex = itemIds.indexOf(checkpointItemId);
      if (checkpointIndex < 0 || checkpointIndex === itemIds.length - 1) return {};

      const keptIds = itemIds.slice(0, checkpointIndex + 1);
      const keptIdSet = new Set(keptIds);
      const keptItems: Record<string, RuntimeChatItem> = {};
      for (const id of keptIds) {
        const item = items[id];
        if (item) keptItems[id] = item;
      }

      const completedTurns = state.runtimeCompletedTurnsByThread[threadId] ?? [];
      const keptCompletedTurns = completedTurns.filter(
        (turn) => turn.anchorItemId === null || keptIdSet.has(turn.anchorItemId),
      );
      markThreadRuntimeForPersistence(threadId);

      return {
        runtimeItemIdsByThread: {
          ...state.runtimeItemIdsByThread,
          [threadId]: keptIds,
        },
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: keptItems,
        },
        runtimeRequestsByThread: {
          ...state.runtimeRequestsByThread,
          [threadId]: [],
        },
        runtimeStructuralVersionByThread: {
          ...state.runtimeStructuralVersionByThread,
          [threadId]: (state.runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
        },
        runtimeCompletedTurnsByThread: {
          ...state.runtimeCompletedTurnsByThread,
          [threadId]: keptCompletedTurns,
        },
      };
    }),

  hydrateThreadRuntimeItems: (threadId, items) =>
    set((state) => {
      // Don't clobber items that already streamed in for an active thread —
      // the live stream is the source of truth, the DB is only the seed.
      if ((state.runtimeItemIdsByThread[threadId]?.length ?? 0) > 0) return {};
      const itemIds = items.map((item) => item.id);
      const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));
      return {
        runtimeItemIdsByThread: {
          ...state.runtimeItemIdsByThread,
          [threadId]: itemIds,
        },
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: itemsById,
        },
        runtimeStructuralVersionByThread: {
          ...state.runtimeStructuralVersionByThread,
          [threadId]: (state.runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
        },
      };
    }),

  hydrateThreadCompletedTurns: (threadId, turns) =>
    set((state) => {
      if (turns.length === 0) return {};
      const existing = state.runtimeCompletedTurnsByThread[threadId] ?? [];
      const merged = mergeCompletedTurns(existing, turns);
      if (merged === existing) return {};
      return {
        runtimeCompletedTurnsByThread: {
          ...state.runtimeCompletedTurnsByThread,
          [threadId]: merged,
        },
      };
    }),

  hydrateThreadContextUsage: (threadId, usage) =>
    set((state) => {
      if (state.runtimeContextByThread[threadId]) return {};
      return {
        runtimeContextByThread: {
          ...state.runtimeContextByThread,
          [threadId]: usage,
        },
      };
    }),

  hydrateThreadFileCheckpoints: (threadId, checkpoints, turns) =>
    set((state) => {
      const existingCheckpoints = state.fileCheckpointsByThread[threadId] ?? {};
      const existingTurns = state.fileCheckpointTurnsByThread[threadId] ?? {};
      const nextCheckpoints = { ...existingCheckpoints };
      const nextTurns = { ...existingTurns };
      let changed = false;
      for (const checkpoint of checkpoints) {
        if (existingCheckpoints[checkpoint.checkpointItemId]?.commit === checkpoint.commit) {
          continue;
        }
        nextCheckpoints[checkpoint.checkpointItemId] = checkpoint;
        changed = true;
      }
      for (const turn of turns) {
        if (existingTurns[turn.checkpointItemId]?.commit === turn.commit) continue;
        nextTurns[turn.checkpointItemId] = turn;
        nextCheckpoints[turn.checkpointItemId] = turn;
        changed = true;
      }
      if (!changed) return {};
      return {
        fileCheckpointsByThread: {
          ...state.fileCheckpointsByThread,
          [threadId]: nextCheckpoints,
        },
        fileCheckpointTurnsByThread: {
          ...state.fileCheckpointTurnsByThread,
          [threadId]: nextTurns,
        },
      };
    }),

  upsertThreadFileCheckpoint: (threadId, checkpoint) =>
    set((state) => {
      const existing = state.fileCheckpointsByThread[threadId] ?? {};
      if (existing[checkpoint.checkpointItemId]?.commit === checkpoint.commit) return {};
      return {
        fileCheckpointsByThread: {
          ...state.fileCheckpointsByThread,
          [threadId]: {
            ...existing,
            [checkpoint.checkpointItemId]: checkpoint,
          },
        },
      };
    }),

  upsertThreadFileCheckpointTurn: (threadId, checkpoint) =>
    set((state) => {
      const existingCheckpoints = state.fileCheckpointsByThread[threadId] ?? {};
      const existingTurns = state.fileCheckpointTurnsByThread[threadId] ?? {};
      if (existingTurns[checkpoint.checkpointItemId]?.commit === checkpoint.commit) return {};
      return {
        fileCheckpointsByThread: {
          ...state.fileCheckpointsByThread,
          [threadId]: {
            ...existingCheckpoints,
            [checkpoint.checkpointItemId]: checkpoint,
          },
        },
        fileCheckpointTurnsByThread: {
          ...state.fileCheckpointTurnsByThread,
          [threadId]: {
            ...existingTurns,
            [checkpoint.checkpointItemId]: checkpoint,
          },
        },
      };
    }),
});

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

function applyRuntimeEventsToState(
  state: AppStoreState,
  threadId: string,
  events: RuntimeEvent[],
): Partial<RuntimeEventState> {
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
  let bumpStructural = false;

  for (const event of coalesceRuntimeEvents(events)) {
    const patch = applyRuntimeEventToRuntimeState(nextState, threadId, event);
    if (Object.keys(patch).length === 0) continue;
    nextState = { ...nextState, ...patch };
    const reopenPatch = reopenGuiTurnForLiveRuntimeActivity(nextState, threadId, event);
    if (Object.keys(reopenPatch).length > 0) {
      nextState = { ...nextState, ...reopenPatch };
    }
    changed = true;
    if (eventAffectsStructuralVersion(event)) bumpStructural = true;
  }

  if (!changed) return {};
  if (bumpStructural) {
    nextState = {
      ...nextState,
      runtimeStructuralVersionByThread: {
        ...nextState.runtimeStructuralVersionByThread,
        [threadId]: (nextState.runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
      },
    };
  }
  markThreadRuntimeForPersistence(threadId);
  return {
    ...nextState,
  };
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
  let changed = false;
  let nextCompletedTurns = state.runtimeCompletedTurnsByThread;
  const nowIso = new Date().toISOString();
  const threads = state.threads.map((thread) => {
    if (
      thread.id !== threadId ||
      thread.presentationMode !== "gui" ||
      (thread.status !== "idle" && thread.status !== "finished")
    ) {
      return thread;
    }

    changed = true;
    const activeTurnStartedAt = thread.lastTurnStartedAt ?? thread.updatedAt ?? nowIso;
    const startedAt = parseTurnMs(thread.lastTurnStartedAt);
    const endedAt = parseTurnMs(thread.lastTurnEndedAt);
    if (startedAt !== null && endedAt !== null) {
      nextCompletedTurns = removeCompletedTurnWindow(
        nextCompletedTurns,
        threadId,
        startedAt,
        endedAt,
      );
    }
    return {
      ...thread,
      status: "working" as const,
      attention: "working" as const,
      activeTurnStartedAt,
      lastTurnEndedAt: undefined,
    };
  });
  if (!changed) return {};
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
    return event.itemType !== "user_message" && event.itemType !== "error";
  }
  if (event.type !== "item.updated" && event.type !== "content.delta") return false;
  const item = state.runtimeItemsByIdByThread[threadId]?.[event.itemId];
  return item !== undefined && item.state !== "completed" && item.type !== "user_message";
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
  switch (event.type) {
    case "session.started":
    case "session.exited":
    case "warning":
      // No item state to mutate. Status flows through the existing thread-state channel.
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

    case "item.started": {
      const existingIds = state.runtimeItemIdsByThread[threadId] ?? [];
      const existingItems = state.runtimeItemsByIdByThread[threadId] ?? {};
      if (existingItems[event.itemId]) return {};
      const item: RuntimeChatItem = {
        id: event.itemId,
        type: event.itemType,
        state: "started",
        payload: event.payload,
        streams: {},
        ...(event.parentItemId ? { parentItemId: event.parentItemId } : {}),
      };
      return {
        runtimeItemIdsByThread: {
          ...state.runtimeItemIdsByThread,
          [threadId]: [...existingIds, event.itemId],
        },
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: { ...existingItems, [event.itemId]: item },
        },
      };
    }

    case "item.updated": {
      const items = state.runtimeItemsByIdByThread[threadId];
      const prev = items?.[event.itemId];
      if (!prev || !items) return {};
      const next: RuntimeChatItem = {
        ...prev,
        state: prev.state === "completed" ? "completed" : "updated",
        payload: mergePayload(prev.payload, event.payload),
      };
      return {
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: { ...items, [event.itemId]: next },
        },
      };
    }

    case "item.completed": {
      const items = state.runtimeItemsByIdByThread[threadId];
      const prev = items?.[event.itemId];
      if (!prev || !items) return {};
      const next: RuntimeChatItem = {
        ...prev,
        state: "completed",
        payload:
          event.payload !== undefined ? mergePayload(prev.payload, event.payload) : prev.payload,
      };
      // A reasoning item that completes with no streamed text is a bracket
      // some agents emit before producing nothing — keeping it in the
      // timeline would split otherwise-adjacent tool calls into separate
      // groups. Drop it from the data so grouping naturally fuses them.
      if (next.type === "reasoning" && !(next.streams.reasoning_text ?? "").trim()) {
        const ids = state.runtimeItemIdsByThread[threadId];
        if (!ids) return {};
        const { [event.itemId]: _dropped, ...remaining } = items;
        return {
          runtimeItemIdsByThread: {
            ...state.runtimeItemIdsByThread,
            [threadId]: ids.filter((id) => id !== event.itemId),
          },
          runtimeItemsByIdByThread: {
            ...state.runtimeItemsByIdByThread,
            [threadId]: remaining,
          },
        };
      }
      return {
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: { ...items, [event.itemId]: next },
        },
      };
    }

    case "content.delta": {
      const items = state.runtimeItemsByIdByThread[threadId];
      const prev = items?.[event.itemId];
      if (!prev || !items) return {};
      const prevStream = prev.streams[event.stream] ?? "";
      const next: RuntimeChatItem = {
        ...prev,
        state: prev.state === "completed" ? "completed" : "updated",
        streams: { ...prev.streams, [event.stream]: prevStream + event.delta },
      };
      items[event.itemId] = next;
      return {
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: items,
        },
      };
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

function mergeCompletedTurns(
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

function isStaleSubAgentItem(item: RuntimeChatItem): boolean {
  if (item.type !== "tool_call") return false;
  const payload = item.payload as ToolCallPayload | undefined;
  if (payload?.isSubAgent !== true && payload?.name !== "Workflow") return false;
  return item.state !== "completed" || payload?.status === "running";
}

function terminateSubAgentItem(item: RuntimeChatItem): RuntimeChatItem {
  const payload: ToolCallPayload = (item.payload as ToolCallPayload | undefined) ?? {
    name: "Task",
    status: "error",
  };
  const nextPayload: ToolCallPayload = {
    ...payload,
    status: "error",
    ...(payload.result === undefined
      ? { result: { error: i18n._(STALE_SUB_AGENT_ERROR_MESSAGE) } }
      : {}),
  };
  return {
    ...item,
    state: "completed",
    payload: nextPayload,
  };
}

/** Shallow-merge two payloads so item.updated layers on top of started. */
function mergePayload(prev: unknown, next: unknown): unknown {
  if (!prev || typeof prev !== "object") return next;
  if (!next || typeof next !== "object") return next;
  return { ...(prev as Record<string, unknown>), ...(next as Record<string, unknown>) };
}
