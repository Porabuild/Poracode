import { isThreadTurnActive, type RuntimeEvent, type Thread } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { GitStatePatch } from "@/shared/gitState";
import type { RemoteGitSummaries, RemoteThreadSnapshot } from "@/shared/remote";
import {
  remoteGitStateEventSchema,
  remoteGitSummariesEventSchema,
  remoteUserNotificationEventSchema,
} from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { normalizeRuntimeSnapshotLaunchConfig } from "@/renderer/state/slices/threadSlice";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { showUserNotification } from "@/renderer/notifications";
import {
  toRuntimeChatItem,
  type CompletedTurnRecord,
  type OpenRuntimeRequest,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import {
  collectRuntimeEventsFromSupervisoryMessage,
  requestsFromRuntimeItems,
} from "./runtimeRequests";
import { shouldReplaceRuntimeItemsFromSnapshot } from "./guards";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { cacheBrowserThreadSnapshot } from "@/renderer/browser/offlineThreadCache";
import { evictOversizedInactiveThreadRuntimeItems } from "../chatRuntimePersister";

/**
 * Feeds remote snapshots and live WebSocket events into the same Zustand
 * stores the desktop renderer uses, so reused components (ChatPane,
 * ThreadComposerSection, ThreadDraftView, sidebar selectors) work unchanged.
 * This module is the canonical remote-store sync used by the browser bridge
 * and Electron's remote-servers store. Both hydrate the shared, threadId-keyed
 * runtime store from remote snapshots and live event streams.
 *
 * Mobile-only side effects (Live Activity push, terminal feed fan-out, mobile
 * git-summaries store) are NOT triggered here — callers attach them via the
 * {@link RemoteDispatchHooks} options on {@link dispatchRemoteSupervisorEvent}.
 */

type AppView = ReturnType<typeof useAppStore.getState>["view"];

/**
 * True when `threadId` is one of the panes currently shown in the thread view.
 * A visible thread has already been acknowledged on this client, so an
 * authoritative snapshot must not resurrect its `finished` unread badge.
 */
export function isThreadVisible(view: AppView, threadId: string): boolean {
  return view.kind === "thread" && view.panes.includes(threadId);
}

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
  if (isBrowserClientRuntime()) void cacheBrowserThreadSnapshot(snapshot);
  const threadId = snapshot.thread.id;
  // A delta can already be in the JS event queue when the foreground recovery
  // snapshot resolves. Apply it before comparing/replacing the transcript so
  // the decision observes every event received up to this point.
  if (pendingRuntimeEvents.has(threadId)) {
    flushPendingRuntimeEventsSync(threadId);
  }
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
  const snapshotItems = snapshot.runtimeItems.map(toRuntimeChatItem);
  const threadActive = isThreadTurnActive(snapshot.thread.status);
  const shouldReplaceItems =
    (threadActive &&
      options.fromServer &&
      snapshotMonotonicallyCoversExistingTail(existingIds, existingItems, snapshotItems)) ||
    shouldReplaceRuntimeItemsFromSnapshot({
      existingCount: existingIds.length,
      existingHasObservedLiveItems,
      snapshotItemCount: snapshot.runtimeItems.length,
      threadActive,
      fromServer: options.fromServer,
    });
  if (shouldReplaceItems) {
    const firstSnapshotItemId = snapshotItems[0]?.id;
    const overlapIndex = firstSnapshotItemId ? existingIds.indexOf(firstSnapshotItemId) : -1;
    const preservedOlderItems =
      snapshot.runtimeNextCursor !== undefined && overlapIndex > 0
        ? existingIds
            .slice(0, overlapIndex)
            .flatMap((itemId) => (existingItems?.[itemId] ? [existingItems[itemId]] : []))
        : [];
    // Keep the session-local liveness marker for rows that were originally
    // observed on this client. It is intentionally not persisted by the
    // server, but replacing a catch-up snapshot should not erase it either.
    const reconciledSnapshotItems = snapshotItems.map((item) =>
      existingItems?.[item.id]?.observedLive ? { ...item, observedLive: true } : item,
    );
    const items = [...preservedOlderItems, ...reconciledSnapshotItems];
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
    // Active remote threads legitimately have running delegated-agent rows;
    // terminating them paints a false "session ended" error while the host is
    // still working. Inactive threads keep the reconcile (orphaned rows).
    if (!threadActive) {
      state.reconcileStaleSubAgents(threadId);
    }
  } else if (options.fromServer) {
    mergeMissedOlderSnapshotItems(threadId, snapshotItems);
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

/**
 * Live-first path: streamed items win over a same-or-shorter active snapshot,
 * but a fresh server history can still know about items emitted BEFORE this
 * client learned the thread existed. The launch race is the canonical case: a
 * remote thread's initial user_message broadcasts while its id is still absent
 * from the client's mirrored thread list, so the live event filter drops it;
 * every later event applies, and once the streamed transcript catches up in
 * length the snapshot is rejected wholesale — the prompt would stay missing
 * for the entire first turn. Splice the snapshot's missed prefix (items
 * ordered before the first locally-known item) in front of the live
 * transcript without touching the fresher streamed tail.
 */
function mergeMissedOlderSnapshotItems(
  threadId: string,
  snapshotItems: readonly RuntimeChatItem[],
): void {
  useAppStore.setState((current) => {
    const existingIds = current.runtimeItemIdsByThread[threadId] ?? [];
    const firstExistingId = existingIds[0];
    if (firstExistingId === undefined) return {};
    // Anchor on the earliest locally-known item; without it in the snapshot
    // (stale or paged-out window) there is no safe alignment, so do nothing.
    const overlapIndex = snapshotItems.findIndex((item) => item.id === firstExistingId);
    if (overlapIndex <= 0) return {};
    const existingItems = current.runtimeItemsByIdByThread[threadId];
    const missedPrefix = snapshotItems
      .slice(0, overlapIndex)
      .filter((item) => existingItems?.[item.id] === undefined);
    if (missedPrefix.length === 0) return {};
    return {
      runtimeItemIdsByThread: {
        ...current.runtimeItemIdsByThread,
        [threadId]: [...missedPrefix.map((item) => item.id), ...existingIds],
      },
      runtimeItemsByIdByThread: {
        ...current.runtimeItemsByIdByThread,
        [threadId]: {
          ...Object.fromEntries(missedPrefix.map((item) => [item.id, item])),
          ...existingItems,
        },
      },
      runtimeStructuralVersionByThread: {
        ...current.runtimeStructuralVersionByThread,
        [threadId]: (current.runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
      },
    };
  });
}

const RUNTIME_ITEM_STATE_RANK: Record<RuntimeChatItem["state"], number> = {
  started: 0,
  updated: 1,
  completed: 2,
};

/**
 * A fresh active-thread snapshot may safely replace the current tail when it
 * contains every locally-known tail item in the same order and every streamed
 * text bucket is equal to, or an append-only extension of, what is visible.
 *
 * This is the foreground catch-up case Safari needs: a long assistant response
 * usually grows one existing item, so item-count-only freshness checks cannot
 * distinguish a stale snapshot from one containing all output emitted while
 * the page was suspended.
 */
function snapshotMonotonicallyCoversExistingTail(
  existingIds: readonly string[],
  existingItems: Record<string, RuntimeChatItem> | undefined,
  snapshotItems: readonly RuntimeChatItem[],
): boolean {
  const firstSnapshotId = snapshotItems[0]?.id;
  if (!firstSnapshotId || existingIds.length === 0 || !existingItems) return false;
  const overlapIndex = existingIds.indexOf(firstSnapshotId);
  if (overlapIndex < 0) return false;
  const existingTailIds = existingIds.slice(overlapIndex);
  if (existingTailIds.length > snapshotItems.length) return false;

  return existingTailIds.every((itemId, index) => {
    const existing = existingItems[itemId];
    const incoming = snapshotItems[index];
    if (!existing || !incoming || incoming.id !== itemId) return false;
    if (incoming.type !== existing.type || incoming.parentItemId !== existing.parentItemId) {
      return false;
    }
    if (RUNTIME_ITEM_STATE_RANK[incoming.state] < RUNTIME_ITEM_STATE_RANK[existing.state]) {
      return false;
    }
    if (!snapshotValueMonotonicallyCovers(existing.payload, incoming.payload)) return false;
    return Object.entries(existing.streams).every(([stream, text]) => {
      const incomingText = incoming.streams[stream as keyof RuntimeChatItem["streams"]] ?? "";
      return incomingText.startsWith(text ?? "");
    });
  });
}

function snapshotValueMonotonicallyCovers(existing: unknown, incoming: unknown): boolean {
  if (Object.is(existing, incoming) || existing === undefined) return true;
  if (Array.isArray(existing)) {
    return (
      Array.isArray(incoming) &&
      existing.length === incoming.length &&
      existing.every((value, index) => snapshotValueMonotonicallyCovers(value, incoming[index]))
    );
  }
  if (!existing || typeof existing !== "object" || !incoming || typeof incoming !== "object") {
    return false;
  }
  if (Array.isArray(incoming)) return false;
  const incomingRecord = incoming as Record<string, unknown>;
  return Object.entries(existing as Record<string, unknown>).every(
    ([key, value]) =>
      Object.hasOwn(incomingRecord, key) &&
      snapshotValueMonotonicallyCovers(value, incomingRecord[key]),
  );
}

function syncThreadMetadataFromSnapshot(
  snapshot: RemoteThreadSnapshot,
  options: { readonly fromServer: boolean },
): void {
  if (!options.fromServer) return;
  useAppStore.setState((current) => {
    const isVisible = isThreadVisible(current.view, snapshot.thread.id);
    let changed = false;
    const threads = current.threads.map((thread) => {
      if (thread.id !== snapshot.thread.id) return thread;
      changed = true;
      // `finished` is the unread-completion badge, not the settled runtime
      // state of a thread the user is currently watching. openThread clears
      // it optimistically, but a slower authoritative history response can
      // otherwise paint the same stale badge back onto the open thread.
      return isVisible && snapshot.thread.status === "finished"
        ? { ...snapshot.thread, status: "idle" as const }
        : snapshot.thread;
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
 * Live requests are ephemeral renderer state, so after a reload rebuild them
 * from their still-open persisted `*_request` runtime items. Seed the store
 * only while the thread is blocked on the user, and clear stale requests once
 * the thread moves on.
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
// visible runtime events are coalesced per animation frame so streaming text
// cannot re-render faster than the display refreshes. Background threads flush
// four times per second so several concurrent streams do not saturate the UI.

const BACKGROUND_RUNTIME_EVENT_BATCH_MS = 250;
const pendingRuntimeEvents = new Map<string, RuntimeEvent[]>();
let runtimeFlushHandle: number | null = null;
let backgroundRuntimeFlushHandle: ReturnType<typeof setTimeout> | null = null;
let removeRuntimeSchedulingListeners: (() => void) | null = null;

function isForegroundRuntimeThread(threadId: string): boolean {
  if (document.visibilityState === "hidden") return false;
  return isThreadVisible(useAppStore.getState().view, threadId);
}

function flushPendingRuntimeEvents(shouldFlush: (threadId: string) => boolean): void {
  const store = useAppStore.getState();
  const batches: { threadId: string; events: RuntimeEvent[] }[] = [];
  for (const [threadId, events] of pendingRuntimeEvents) {
    if (!shouldFlush(threadId)) continue;
    batches.push({ threadId, events });
    pendingRuntimeEvents.delete(threadId);
  }
  if (batches.length === 0) return;
  store.applyRuntimeEventBatches(batches);
  evictOversizedInactiveThreadRuntimeItems(batches.map((batch) => batch.threadId));
}

function schedulePendingRuntimeEvents(): void {
  let hasForeground = false;
  let hasBackground = false;
  for (const threadId of pendingRuntimeEvents.keys()) {
    if (isForegroundRuntimeThread(threadId)) hasForeground = true;
    else hasBackground = true;
    if (hasForeground && hasBackground) break;
  }

  if (hasForeground && runtimeFlushHandle === null) {
    runtimeFlushHandle = requestAnimationFrame(() => {
      runtimeFlushHandle = null;
      flushPendingRuntimeEvents(isForegroundRuntimeThread);
      schedulePendingRuntimeEvents();
    });
  } else if (!hasForeground && runtimeFlushHandle !== null) {
    cancelAnimationFrame(runtimeFlushHandle);
    runtimeFlushHandle = null;
  }

  if (hasBackground && backgroundRuntimeFlushHandle === null) {
    backgroundRuntimeFlushHandle = setTimeout(() => {
      backgroundRuntimeFlushHandle = null;
      flushPendingRuntimeEvents((threadId) => !isForegroundRuntimeThread(threadId));
      schedulePendingRuntimeEvents();
    }, BACKGROUND_RUNTIME_EVENT_BATCH_MS);
  } else if (!hasBackground && backgroundRuntimeFlushHandle !== null) {
    clearTimeout(backgroundRuntimeFlushHandle);
    backgroundRuntimeFlushHandle = null;
  }
}

function installRuntimeSchedulingListeners(): void {
  if (removeRuntimeSchedulingListeners) return;
  const unsubscribe = useAppStore.subscribe((state) => state.view, schedulePendingRuntimeEvents);
  document.addEventListener("visibilitychange", schedulePendingRuntimeEvents);
  removeRuntimeSchedulingListeners = () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", schedulePendingRuntimeEvents);
  };
}

function enqueueRuntimeEvents(threadId: string, events: readonly RuntimeEvent[]): void {
  if (events.length === 0) return;
  const existing = pendingRuntimeEvents.get(threadId);
  if (existing) {
    existing.push(...events);
  } else {
    pendingRuntimeEvents.set(threadId, [...events]);
  }
  installRuntimeSchedulingListeners();
  schedulePendingRuntimeEvents();
}

function flushPendingRuntimeEventsSync(threadId: string): void {
  flushPendingRuntimeEvents((pendingThreadId) => pendingThreadId === threadId);
  schedulePendingRuntimeEvents();
}

/** Drop every queued runtime delta and cancel the pending flush, if any. Used
 * when switching or removing a remote host so stale batches cannot cross the
 * session boundary. */
export function clearPendingRuntimeEvents(): void {
  if (runtimeFlushHandle !== null) {
    cancelAnimationFrame(runtimeFlushHandle);
    runtimeFlushHandle = null;
  }
  if (backgroundRuntimeFlushHandle !== null) {
    clearTimeout(backgroundRuntimeFlushHandle);
    backgroundRuntimeFlushHandle = null;
  }
  removeRuntimeSchedulingListeners?.();
  removeRuntimeSchedulingListeners = null;
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
  /** Applies the host-owned normalized Git/PR read model on remote clients. */
  readonly onGitState?: (patch: GitStatePatch) => void;
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
  const gitState = remoteGitStateEventSchema.safeParse(value);
  if (gitState.success) {
    hooks?.onGitState?.(gitState.data.patch);
    return;
  }
  const userNotification = remoteUserNotificationEventSchema.safeParse(value);
  if (userNotification.success) {
    const { type: _type, ...notification } = userNotification.data;
    showUserNotification(notification);
    return;
  }

  const event = asSupervisorEvent(value);
  if (!event) return;

  // Non-runtime events observe the same ordering as the IPC stream.
  if ("threadId" in event && pendingRuntimeEvents.has(event.threadId)) {
    flushPendingRuntimeEventsSync(event.threadId);
  }

  switch (event.type) {
    case "thread-state": {
      const oldThread = useAppStore.getState().threads.find((t) => t.id === event.threadId);
      useAppStore
        .getState()
        .updateThreadRuntime(event.threadId, normalizeRuntimeSnapshotLaunchConfig(event));
      if (event.status === "inactive" || event.status === "error") {
        useAppStore.getState().reconcileStaleSubAgents(event.threadId);
      }
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
