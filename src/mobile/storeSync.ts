import { isThreadTurnActive, type RuntimeEvent } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import type { SupervisorEvent } from "@/shared/ipc";
import type {
  RemoteAgentStatuses,
  RemoteShellSnapshot,
  RemoteThreadSnapshot,
} from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { handleThreadStateNotification } from "@/renderer/notifications";
import { remoteGitSummariesEventSchema } from "@/shared/remote";
import { useGitSummariesStore } from "./gitSummaries";
import { emitTerminalExited, emitTerminalReset } from "./terminalFeed";
import type {
  CompletedTurnRecord,
  OpenRuntimeRequest,
  RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import {
  collectRuntimeEventsFromSupervisoryMessage,
  requestsFromRuntimeItems,
} from "./runtimeRequests";

/**
 * Feeds remote snapshots and live WebSocket events into the same Zustand
 * stores the desktop renderer uses, so reused components (ChatPane,
 * ThreadComposerSection, ThreadDraftView, sidebar selectors) work unchanged.
 * This module is the mobile counterpart of the renderer's IPC listeners in
 * `src/renderer/app.tsx` and the DB hydration in `chatRuntimePersister`.
 */

export function applyShellSnapshot(snapshot: RemoteShellSnapshot): void {
  useAppStore.setState({ projects: snapshot.projects, threads: snapshot.threads });
  if (snapshot.gitSummariesByThread) {
    useGitSummariesStore.getState().setAll(snapshot.gitSummariesByThread);
  }
}

/** Drop everything tied to the previous desktop when switching/unpairing. */
export function resetRemoteStores(): void {
  pendingRuntimeEvents.clear();
  useGitSummariesStore.getState().reset();
  useAppStore.setState({
    projects: [],
    threads: [],
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeRequestsByThread: {},
    runtimeContextByThread: {},
    runtimeStructuralVersionByThread: {},
    runtimeCompletedTurnsByThread: {},
    pendingSteerByThreadId: {},
  });
}

export function applyAgentStatuses(statuses: RemoteAgentStatuses): void {
  const store = useAgentStatusesStore.getState();
  store.setAgentStatuses(statuses.windows);
  store.setWslAgentStatuses(statuses.wsl);
}

export function shouldReplaceRuntimeItemsFromSnapshot(input: {
  readonly existingCount: number;
  readonly snapshotItemCount: number;
  readonly threadActive: boolean;
}): boolean {
  if (input.existingCount === 0) return true;
  if (input.snapshotItemCount > input.existingCount) return true;
  return !input.threadActive && input.snapshotItemCount >= input.existingCount;
}

function toRuntimeChatItem(item: PersistedRuntimeItem): RuntimeChatItem {
  return {
    id: item.id,
    type: item.type as RuntimeChatItem["type"],
    state: item.state,
    payload: item.payload,
    streams: item.streams as RuntimeChatItem["streams"],
    ...(item.parentItemId ? { parentItemId: item.parentItemId } : {}),
  };
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

export function applyThreadSnapshot(snapshot: RemoteThreadSnapshot): void {
  const threadId = snapshot.thread.id;
  const state = useAppStore.getState();

  // While a turn is streaming, live WebSocket events are fresher than the
  // desktop's debounced DB snapshot. Still accept a snapshot that has more
  // items than the cache; otherwise opening an active thread from stale
  // offline data can miss everything emitted before the socket resumed.
  const existingCount = state.runtimeItemIdsByThread[threadId]?.length ?? 0;
  const shouldReplaceItems = shouldReplaceRuntimeItemsFromSnapshot({
    existingCount,
    snapshotItemCount: snapshot.runtimeItems.length,
    threadActive: isThreadTurnActive(snapshot.thread.status),
  });
  if (shouldReplaceItems) {
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
  if (snapshot.contextUsage) {
    const contextUsage = snapshot.contextUsage;
    useAppStore.setState((current) => ({
      runtimeContextByThread: { ...current.runtimeContextByThread, [threadId]: contextUsage },
    }));
  }

  syncRuntimeRequestsFromSnapshot(snapshot);
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
  for (const [threadId, events] of pendingRuntimeEvents) {
    store.applyRuntimeEvents(threadId, events);
  }
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

function asSupervisorEvent(value: unknown): SupervisorEvent | null {
  if (!value || typeof value !== "object") return null;
  if (typeof (value as { type?: unknown }).type !== "string") return null;
  return value as SupervisorEvent;
}

export function dispatchRemoteSupervisorEvent(value: unknown): void {
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
    useGitSummariesStore.getState().setAll(gitSummaries.data.summaries);
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
      // PWA notifications: same transition logic and settings keys as the
      // desktop, but against this device's notification preferences.
      const oldThread = useAppStore.getState().threads.find((t) => t.id === event.threadId);
      useAppStore.getState().updateThreadRuntime(event.threadId, event);
      if (event.status === "inactive" || event.status === "error") {
        useAppStore.getState().reconcileStaleSubAgents(event.threadId);
      }
      handleThreadStateNotification(event, oldThread);
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
      // channel; reset/exit ride the event stream, so fan them out here.
      emitTerminalReset(event.threadId);
      return;
    }
    case "thread-exited": {
      useAppStore.getState().markThreadExited(event.threadId);
      useAppStore.getState().clearAllPendingSteer(event.threadId);
      emitTerminalExited(event.threadId, event.exitCode);
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
