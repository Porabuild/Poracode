import { msg } from "@lingui/core/macro";
import type {
  BackgroundTask,
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
import type { PersistedRuntimeItem } from "@/shared/ipc";
import { isDelegatedAgentTool } from "@/shared/toolCallClassification";
import { i18n } from "@/renderer/i18n/i18n";
import type { SliceCreator } from "./shared";
import { clearRuntimeStructuralChangeHint } from "../runtimeStructuralChanges";
import {
  applyRuntimeEventsToState,
  applyRuntimeEventBatchesToState,
  mergeCompletedTurns,
} from "./runtimeEventReducer";

const STALE_SUB_AGENT_ERROR_MESSAGE = msg`Interrupted: agent session ended before completion.`;

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
  /** Local wall-clock timing for delegated-agent parents. Not persisted; provider duration is the reload fallback. */
  startedAt?: number;
  completedAt?: number;
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
  /**
   * True when this item was first seen via the LIVE event stream in the current
   * app session (`item.started`), as opposed to being seeded from the DB on
   * thread open (`hydrateThreadRuntimeItems`). Scopes background-workflow
   * liveness: a detached workflow only keeps running if THIS session launched
   * it, so a row replayed from a prior session's transcript must never light
   * the working spinner (manifest status can't tell - a crashed run stays
   * pinned "running" on disk). Never persisted; absent on DB-hydrated items.
   */
  observedLive?: boolean;
}

export function toRuntimeChatItem(item: PersistedRuntimeItem): RuntimeChatItem {
  return {
    id: item.id,
    type: item.type as RuntimeChatItem["type"],
    state: item.state,
    payload: item.payload,
    streams: item.streams as RuntimeChatItem["streams"],
    ...(item.parentItemId ? { parentItemId: item.parentItemId } : {}),
  };
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
   * Live provider-reported background tasks per thread (REPLACE semantics from
   * `background_tasks.changed`). Session-scoped only: never hydrated from the
   * DB, and dropped when the session exits, because the work dies with the
   * agent process.
   */
  runtimeBackgroundTasksByThread: Record<string, readonly BackgroundTask[]>;
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
  /**
   * Apply runtime events for multiple threads in one Zustand `set()`. Used by
   * the rAF flush when several chats stream concurrently.
   */
  applyRuntimeEventBatches(
    batches: ReadonlyArray<{ threadId: string; events: RuntimeEvent[] }>,
  ): void;
  clearThreadRuntimeEvents(threadId: string): void;
  /**
   * Force-terminate any still-running sub-agent tool_call items in a thread.
   * Used when a thread has no live agent attached (after DB hydration, or when
   * a structured session exits / is about to be replaced on resume) — without
   * this, parents that never completed (denied permissions, crashes, abrupt
   * exits) keep appearing in the active sub-agent dock forever.
   */
  reconcileStaleSubAgents(
    threadId: string,
    options?: { readonly preserveObservedLive?: boolean },
  ): void;
  /**
   * Revert the visible chat transcript to a checkpoint item, preserving that
   * item and everything before it. Used by GUI chat checkpoints.
   */
  truncateThreadRuntimeAfter(threadId: string, checkpointItemId: string): void;
  /** Replace the persisted item list for a thread (used during DB hydration). */
  hydrateThreadRuntimeItems(threadId: string, items: RuntimeChatItem[]): void;
  /** Prepend an older persisted page while preserving newer live items. */
  prependThreadRuntimeItems(threadId: string, items: RuntimeChatItem[]): void;
  /** Drop an inactive transcript projection without deleting its SQLite rows. */
  evictThreadRuntimeItems(threadId: string): void;
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

/**
 * Fresh per-thread runtime maps. Extracted so a full reset (e.g. the mobile
 * client switching desktops) can restore EVERY runtime map by spreading this,
 * instead of a hand-maintained list that silently drifts when a new map is
 * added here. The slice creator below spreads it too, so a newly-added map is
 * a type error until it lands in this factory.
 */
export function createInitialRuntimeEventState(): Pick<
  RuntimeEventSlice,
  | "runtimeItemIdsByThread"
  | "runtimeItemsByIdByThread"
  | "runtimeRequestsByThread"
  | "runtimeContextByThread"
  | "runtimeBackgroundTasksByThread"
  | "runtimeStructuralVersionByThread"
  | "runtimeCompletedTurnsByThread"
  | "runtimeOpenTurnByThread"
  | "fileCheckpointsByThread"
  | "fileCheckpointTurnsByThread"
> {
  return {
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeRequestsByThread: {},
    runtimeContextByThread: {},
    runtimeBackgroundTasksByThread: {},
    runtimeStructuralVersionByThread: {},
    runtimeCompletedTurnsByThread: {},
    runtimeOpenTurnByThread: {},
    fileCheckpointsByThread: {},
    fileCheckpointTurnsByThread: {},
  };
}

export const createRuntimeEventSlice: SliceCreator<RuntimeEventSlice> = (set) => ({
  ...createInitialRuntimeEventState(),

  applyRuntimeEvent: (threadId, event) =>
    set((state) => applyRuntimeEventsToState(state, threadId, [event])),

  applyRuntimeEvents: (threadId, events) =>
    set((state) => applyRuntimeEventsToState(state, threadId, events)),

  applyRuntimeEventBatches: (batches) =>
    set((state) => applyRuntimeEventBatchesToState(state, batches)),

  clearThreadRuntimeEvents: (threadId) =>
    set((state) => {
      clearRuntimeStructuralChangeHint(threadId);
      if (
        !(threadId in state.runtimeItemIdsByThread) &&
        !(threadId in state.runtimeItemsByIdByThread) &&
        !(threadId in state.runtimeRequestsByThread) &&
        !(threadId in state.runtimeContextByThread) &&
        !(threadId in state.runtimeBackgroundTasksByThread) &&
        !(threadId in state.runtimeStructuralVersionByThread) &&
        !(threadId in state.runtimeCompletedTurnsByThread) &&
        !(threadId in state.runtimeOpenTurnByThread)
      ) {
        return {};
      }
      const { [threadId]: _droppedItemIds, ...runtimeItemIdsByThread } =
        state.runtimeItemIdsByThread;
      const { [threadId]: _droppedItems, ...runtimeItemsByIdByThread } =
        state.runtimeItemsByIdByThread;
      const { [threadId]: _droppedReqs, ...runtimeRequestsByThread } =
        state.runtimeRequestsByThread;
      const { [threadId]: _droppedContext, ...runtimeContextByThread } =
        state.runtimeContextByThread;
      const { [threadId]: _droppedBackgroundTasks, ...runtimeBackgroundTasksByThread } =
        state.runtimeBackgroundTasksByThread;
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
        runtimeBackgroundTasksByThread,
        runtimeStructuralVersionByThread,
        runtimeCompletedTurnsByThread,
        runtimeOpenTurnByThread,
      };
    }),

  reconcileStaleSubAgents: (threadId, options) =>
    set((state) => {
      const items = state.runtimeItemsByIdByThread[threadId];
      if (!items) return {};
      let nextItems: Record<string, RuntimeChatItem> | undefined;
      for (const [id, item] of Object.entries(items)) {
        if (options?.preserveObservedLive === true && item.observedLive === true) continue;
        if (!isStaleSubAgentItem(item)) continue;
        nextItems ??= { ...items };
        nextItems[id] = terminateSubAgentItem(item);
      }
      if (!nextItems) return {};
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

  prependThreadRuntimeItems: (threadId, items) =>
    set((state) => {
      if (items.length === 0) return {};
      const existingIds = state.runtimeItemIdsByThread[threadId] ?? [];
      const existingItems = state.runtimeItemsByIdByThread[threadId] ?? {};
      const incoming = items.filter((item) => !existingItems[item.id]);
      if (incoming.length === 0) return {};
      return {
        runtimeItemIdsByThread: {
          ...state.runtimeItemIdsByThread,
          [threadId]: [...incoming.map((item) => item.id), ...existingIds],
        },
        runtimeItemsByIdByThread: {
          ...state.runtimeItemsByIdByThread,
          [threadId]: {
            ...Object.fromEntries(incoming.map((item) => [item.id, item])),
            ...existingItems,
          },
        },
        runtimeStructuralVersionByThread: {
          ...state.runtimeStructuralVersionByThread,
          [threadId]: (state.runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
        },
      };
    }),

  evictThreadRuntimeItems: (threadId) =>
    set((state) => {
      clearRuntimeStructuralChangeHint(threadId);
      if (!(threadId in state.runtimeItemIdsByThread)) return {};
      const { [threadId]: _itemIds, ...runtimeItemIdsByThread } = state.runtimeItemIdsByThread;
      const { [threadId]: _items, ...runtimeItemsByIdByThread } = state.runtimeItemsByIdByThread;
      const { [threadId]: _context, ...runtimeContextByThread } = state.runtimeContextByThread;
      const { [threadId]: _backgroundTasks, ...runtimeBackgroundTasksByThread } =
        state.runtimeBackgroundTasksByThread;
      const { [threadId]: _version, ...runtimeStructuralVersionByThread } =
        state.runtimeStructuralVersionByThread;
      const { [threadId]: _turns, ...runtimeCompletedTurnsByThread } =
        state.runtimeCompletedTurnsByThread;
      const { [threadId]: _openTurn, ...runtimeOpenTurnByThread } = state.runtimeOpenTurnByThread;
      return {
        runtimeItemIdsByThread,
        runtimeItemsByIdByThread,
        runtimeContextByThread,
        runtimeBackgroundTasksByThread,
        runtimeStructuralVersionByThread,
        runtimeCompletedTurnsByThread,
        runtimeOpenTurnByThread,
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

function isStaleSubAgentItem(item: RuntimeChatItem): boolean {
  if (item.type !== "tool_call") return false;
  const payload = item.payload as ToolCallPayload | undefined;
  if (!isDelegatedAgentTool(payload)) return false;
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
    ...(payload.isCrossagent &&
    (payload.crossagentStatus === undefined || payload.crossagentStatus === "running")
      ? { crossagentStatus: "failed" as const }
      : {}),
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
