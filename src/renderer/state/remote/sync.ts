import { isThreadTurnActive, type RuntimeEvent, type Thread } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RemoteGitSummaries, RemoteThreadSnapshot } from "@/shared/remote";
import { remoteGitSummariesEventSchema } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { handleThreadStateNotification } from "@/renderer/notifications";
import {
  toRuntimeChatItem,
  type CompletedTurnRecord,
  type OpenRuntimeRequest,
} from "@/renderer/state/slices/runtimeEventSlice";
import {
  collectRuntimeEventsFromSupervisoryMessage,
  requestsFromRuntimeItems,
} from "./runtimeRequests";
import { shouldReplaceRuntimeItemsFromSnapshot } from "./guards";

/**
 * Feeds remote snapshots and live WebSocket events into the same Zustand
 * stores the desktop renderer uses, so reused components (ChatPane,
 * ThreadComposerSection, ThreadDraftView, sidebar selectors) work unchanged.
 * This module is the shared core of the mobile PWA's store sync
 * (`src/mobile/storeSync.ts`) and the desktop-as-client remote-servers store
 * (`src/renderer/state/remoteServersStore.ts`); both hydrate the shared,
 * threadId-keyed runtime store from remote snapshots and live event streams.
 *
 * Mobile-only side effects (Live Activity push, terminal feed fan-out, mobile
 * git-summaries store) are NOT triggered here — callers attach them via the
 * {@link RemoteDispatchHooks} options on {@link dispatchRemoteSupervisorEvent}.
 */

function toCompletedTurnRecords(
  turns: RemoteThreadSnapshot["completedTurns"],
): CompletedTurnRecord[] {
  return turns.flatMap((turn) => {
    const startedAt = new Date(turn.startedAt).getTime();
    const endedAt = new Date(turn.endedAt).getTime();
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return [];
    return [{ startedAt, endedAt, anchorItemId: turn.anchorItemId }];
  });
}

export function applyThreadSnapshot(
  snapshot: RemoteThreadSnapshot,
  options: { readonly fromServer: boolean } = { fromServer: true },
): void {
  const threadId = snapshot.thread.id;
  const state = useAppStore.getState();
  syncThreadMetadataFromSnapshot(snapshot, options);

  // While a turn is streaming, live WebSocket events are fresher than the
  // desktop's debounced DB snapshot. Still accept a snapshot that has more
  // items than the cache; otherwise opening an active thread from stale
  // offline data can miss everything emitted before the socket resumed.
  const existingIds = state.runtimeItemIdsByThread[threadId] ?? [];
  const existingItems = state.runtimeItemsByIdByThread[threadId];
  const existingHasObservedLiveItems = existingIds.some(
    (itemId) => existingItems?.[itemId]?.observedLive === true,
  );
  const shouldReplaceItems = shouldReplaceRuntimeItemsFromSnapshot({
    existingCount: existingIds.length,
    existingHasObservedLiveItems,
    snapshotItemCount: snapshot.runtimeItems.length,
    threadActive: isThreadTurnActive(snapshot.thread.status),
    fromServer: options.fromServer,
  });
  if (shouldReplaceItems) {
    // A runtime delta enqueued just before this snapshot resolved would
    // otherwise apply AFTER the replace below and re-append text already in the
    // snapshot (visible duplication). Flush (or drop) this thread's queued
    // events first — mirrors dispatchRemoteSupervisorEvent's ordering guard.
    if (pendingRuntimeEvents.has(threadId)) {
      flushPendingRuntimeEventsSync();
    }
    const items = snapshot.runtimeItems.map(toRuntimeChatItem);
    useAppStore.setState((current) => ({
      runtimeItemIdsByThread: {
        ...current.runtimeItemIdsByThread,
        [threadId]: items.map((item) => item.id),
      },
      runtimeItemsByIdByThread: {
        ...current.runtimeItemsByIdByThread,
        [threadId]: Object.fromEntries(items.map((item) => [item.id, item])),
      },
      runtimeStructuralVersionByThread: {
        ...current.runtimeStructuralVersionByThread,
        [threadId]: (current.runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
      },
    }));
    state.reconcileStaleSubAgents(threadId);
  }

  const turns = toCompletedTurnRecords(snapshot.completedTurns);
  if (turns.length > 0) {
    state.hydrateThreadCompletedTurns(threadId, turns);
  }
  syncRuntimeTurnBoundaryFromSnapshot(snapshot, options);
  if (snapshot.contextUsage) {
    const contextUsage = snapshot.contextUsage;
    useAppStore.setState((current) => ({
      runtimeContextByThread: { ...current.runtimeContextByThread, [threadId]: contextUsage },
    }));
  }

  syncRuntimeRequestsFromSnapshot(snapshot);
}

function syncThreadMetadataFromSnapshot(
  snapshot: RemoteThreadSnapshot,
  options: { readonly fromServer: boolean },
): void {
  if (!options.fromServer) return;
  useAppStore.setState((current) => {
    let changed = false;
    const threads = current.threads.map((thread) => {
      if (thread.id !== snapshot.thread.id) return thread;
      changed = true;
      return snapshot.thread;
    });
    return changed ? { threads } : {};
  });
}

function syncRuntimeTurnBoundaryFromSnapshot(
  snapshot: RemoteThreadSnapshot,
  options: { readonly fromServer: boolean },
): void {
  if (!options.fromServer) return;
  if (snapshot.thread.presentationMode !== "gui") return;
  if (isThreadTurnActive(snapshot.thread.status)) return;
  const threadId = snapshot.thread.id;
  useAppStore.setState((current) => {
    if (current.runtimeOpenTurnByThread[threadId] === false) return {};
    return {
      runtimeOpenTurnByThread: {
        ...current.runtimeOpenTurnByThread,
        [threadId]: false,
      },
    };
  });
}

/**
 * Requests are ephemeral (never persisted), so after a reload the only trace
 * of a pending approval is its still-open `*_request` runtime item. Seed the
 * store from those when the thread is blocked on the user; clear stale ones
 * once the thread moves on.
 */
function syncRuntimeRequestsFromSnapshot(snapshot: RemoteThreadSnapshot): void {
  const threadId = snapshot.thread.id;
  const awaitingUser =
    snapshot.thread.status === "needs_approval" || snapshot.thread.status === "needs_reply";
  useAppStore.setState((current) => {
    const open = current.runtimeRequestsByThread[threadId] ?? [];
    if (!awaitingUser) {
      if (open.length === 0) return {};
      return {
        runtimeRequestsByThread: { ...current.runtimeRequestsByThread, [threadId]: [] },
      };
    }
    if (open.length > 0) return {};
    const fallback: OpenRuntimeRequest[] = requestsFromRuntimeItems(snapshot.runtimeItems).map(
      (preview) => ({
        requestId: preview.requestId,
        threadId,
        requestType: preview.requestType,
        payload: preview.payload,
        receivedAt: preview.receivedAt,
      }),
    );
    if (fallback.length === 0) return {};
    return {
      runtimeRequestsByThread: { ...current.runtimeRequestsByThread, [threadId]: fallback },
    };
  });
}

// ── Live supervisor event dispatch ──────────────────────────────
// Mirrors the renderer's module-level IPC listener (src/renderer/app.tsx):
// runtime events are coalesced per animation frame so streaming text cannot
// re-render faster than the display refreshes.

const pendingRuntimeEvents = new Map<string, RuntimeEvent[]>();
let runtimeFlushHandle: number | null = null;

function flushPendingRuntimeEvents(): void {
  runtimeFlushHandle = null;
  if (pendingRuntimeEvents.size === 0) return;
  const store = useAppStore.getState();
  const batches = [...pendingRuntimeEvents.entries()].map(([threadId, events]) => ({
    threadId,
    events,
  }));
  store.applyRuntimeEventBatches(batches);
  pendingRuntimeEvents.clear();
}

function enqueueRuntimeEvents(threadId: string, events: readonly RuntimeEvent[]): void {
  if (events.length === 0) return;
  const existing = pendingRuntimeEvents.get(threadId);
  if (existing) {
    existing.push(...events);
  } else {
    pendingRuntimeEvents.set(threadId, [...events]);
  }
  if (runtimeFlushHandle === null) {
    runtimeFlushHandle = requestAnimationFrame(flushPendingRuntimeEvents);
  }
}

function flushPendingRuntimeEventsSync(): void {
  if (runtimeFlushHandle !== null) {
    cancelAnimationFrame(runtimeFlushHandle);
    runtimeFlushHandle = null;
  }
  if (pendingRuntimeEvents.size > 0) flushPendingRuntimeEvents();
}

/** Drop every queued runtime delta and cancel the pending flush, if any. Exposed
 * so the mobile PWA's `resetRemoteStores` (which wipes session state on
 * desktop switch/unpair) can clear the same coalescing buffer the core owns. */
export function clearPendingRuntimeEvents(): void {
  if (runtimeFlushHandle !== null) {
    cancelAnimationFrame(runtimeFlushHandle);
    runtimeFlushHandle = null;
  }
  pendingRuntimeEvents.clear();
}

function asSupervisorEvent(value: unknown): SupervisorEvent | null {
  if (!value || typeof value !== "object") return null;
  if (typeof (value as { type?: unknown }).type !== "string") return null;
  return value as SupervisorEvent;
}

/**
 * Optional mobile-only side effects that ride supervisor events on the PWA.
 * Desktop callers (remoteServersStore) pass no hooks — those fan-outs are
 * either inert on desktop (no native Live Activity controller, no mobile
 * terminal feed listeners) or were filtered out before dispatch.
 */
export interface RemoteDispatchHooks {
  /**
   * Fired after a `thread-state` event's core mutation. Mobile uses this to
   * drive the foreground Live Activity notification. Resolves the thread/project
   * from the store when the caller did not supply a known thread.
   */
  readonly onThreadState?: (input: {
    readonly threadId: string;
    readonly status: string;
    readonly oldThread: Thread | undefined;
  }) => void;
  /**
   * Fired after a `thread-reset` event's core mutation. Mobile uses this so a
   * live terminal surface watching the thread can clear on restart (the PTY
   * output itself rides a separate channel).
   */
  readonly onThreadReset?: (threadId: string) => void;
  /**
   * Fired after a `thread-exited` event's core mutation. Mobile uses this so a
   * live terminal surface can mark the thread's PTY as exited with the code.
   */
  readonly onThreadExited?: (input: {
    readonly threadId: string;
    readonly exitCode: number | null;
  }) => void;
  /**
   * Fired when an out-of-band `remote-git-summaries` event lands on the stream.
   * Mobile hydrates its per-thread git-summaries store from it; desktop filters
   * these events out before dispatch and so supplies no hook.
   */
  readonly onGitSummaries?: (summaries: RemoteGitSummaries) => void;
}

export function dispatchRemoteSupervisorEvent(value: unknown, hooks?: RemoteDispatchHooks): void {
  const runtimeBatches = collectRuntimeEventsFromSupervisoryMessage(value);
  if (runtimeBatches.length > 0) {
    for (const batch of runtimeBatches) {
      enqueueRuntimeEvents(batch.threadId, batch.events);
    }
    return;
  }

  // Out-of-band desktop events ride the same stream as supervisor events.
  const gitSummaries = remoteGitSummariesEventSchema.safeParse(value);
  if (gitSummaries.success) {
    // No core mutation — the per-thread git summaries live in a separate store
    // the core does not own. Mobile attaches its hydration hook here; desktop
    // never reaches this branch (its event filter drops desktop-global events).
    hooks?.onGitSummaries?.(gitSummaries.data.summaries);
    return;
  }

  const event = asSupervisorEvent(value);
  if (!event) return;

  // Non-runtime events observe the same ordering as the IPC stream.
  if ("threadId" in event && pendingRuntimeEvents.has(event.threadId)) {
    flushPendingRuntimeEventsSync();
  }

  switch (event.type) {
    case "thread-state": {
      const oldThread = useAppStore.getState().threads.find((t) => t.id === event.threadId);
      useAppStore.getState().updateThreadRuntime(event.threadId, event);
      if (event.status === "inactive" || event.status === "error") {
        useAppStore.getState().reconcileStaleSubAgents(event.threadId);
      }
      handleThreadStateNotification(event, oldThread);
      hooks?.onThreadState?.({
        threadId: event.threadId,
        status: event.status,
        oldThread,
      });
      return;
    }
    case "thread-pending-steer": {
      useAppStore.getState().setPendingSteer(event.threadId, event.pending);
      return;
    }
    case "thread-reset": {
      pendingRuntimeEvents.delete(event.threadId);
      useAppStore.getState().clearThreadRuntimeEvents(event.threadId);
      useAppStore.getState().clearAllPendingSteer(event.threadId);
      // The id may be a dev shell (no thread); a live terminal surface watching
      // it clears on restart. Output itself rides the separate terminal-output
      // channel; reset/exit ride the event stream, so fan them out via the hook.
      hooks?.onThreadReset?.(event.threadId);
      return;
    }
    case "thread-exited": {
      useAppStore.getState().markThreadExited(event.threadId);
      useAppStore.getState().clearAllPendingSteer(event.threadId);
      hooks?.onThreadExited?.({ threadId: event.threadId, exitCode: event.exitCode });
      return;
    }
    case "agent-status-updated": {
      useAgentStatusesStore.getState().mergeAgentStatus(event.status);
      return;
    }
    case "windows-agent-statuses": {
      useAgentStatusesStore.getState().setAgentStatuses(event.statuses);
      return;
    }
    case "wsl-agent-statuses": {
      useAgentStatusesStore.getState().setWslAgentStatuses(event.statuses);
      return;
    }
    default:
      return;
  }
}
