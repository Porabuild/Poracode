import { historyContentOmissions } from "../historyDelivery";
import { noteHistoryDeliveryGap } from "../historyResumeRegistry";
import { isThreadTurnActive, type Thread } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { GitStatePatch } from "@/shared/gitState";
import type { RemoteGitSummaries, RemoteThreadSnapshot } from "@/shared/remote";
import {
  remoteGitStateEventSchema,
  remoteGitSummariesEventSchema,
  remoteUserNotificationEventSchema,
} from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import {
  isThreadFollowUpQueueSnapshotCurrent,
  useThreadFollowUpQueueStore,
  type ThreadFollowUpQueueSnapshotGuard,
} from "@/renderer/state/threadFollowUpQueueStore";
import { applyAgentStatusSupervisorEvent } from "@/renderer/state/agentStatusesStore";
import { preservePendingThreadConfig, retainPendingThreadConfigs } from "../pendingThreadConfig";
import { carryActiveTurnTiming } from "../activeTurnTiming";
import { carryPendingThreadInput } from "../pendingThreadInput";
import { projectPendingCatalogEdit } from "../pendingCatalogEdits";
import { carryVolatileSessionConfigOptions } from "@/renderer/state/volatileSessionConfigOptions";
import { showUserNotification } from "@/renderer/notifications";
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
import { mergeTerminalDelegatedAgentItems } from "./delegatedAgentSnapshot";
import {
  seedOlderThreadRuntimeItemsCursor,
  alignThreadRuntimeHistoryControl,
  hasHydratedThreadRuntimeItems,
} from "../chatRuntimePersister";
import {
  planRuntimeHistorySnapshot,
  mergeMissedOlderSnapshotItems,
  existingTailMonotonicallyCoversSnapshot,
  snapshotMonotonicallyCoversExistingTail,
} from "../runtimeHistorySnapshot";
import { runtimeHistoryBoundary } from "../runtimeHistoryBoundary";
import { clearRuntimeStructuralChangeHint } from "../runtimeStructuralChanges";
import { forgetThreadGalleryCache } from "../threadGalleryCache";
import { forgetThreadPromptIndex, invalidateThreadPromptIndex } from "../threadPromptIndexCache";
import { snapshotOlderThanAppliedSeq } from "./snapshotSeqArbitration";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { cacheBrowserThreadSnapshot } from "@/renderer/browser/offlineThreadCache";
import { projectBrowserThreadWorkspace } from "../remoteServers/workspaceFilings";
import {
  createSupervisorEventReducer,
  type SupervisorEventReducer,
  type SupervisorEventReducerConfig,
  type SupervisorEventSideEffects,
} from "./reducers/supervisorEventReducer";
import {
  createHostHistoryRecovery,
  type HostHistoryRecovery,
} from "./reducers/hostHistoryRecovery";
import { recordRuntimeUsage } from "../usageRecorder";
import { hostRunsOnThisMachine } from "../hostLocality";
import { isHistoryIncorporated } from "../historyBaselines";

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

/**
 * True when `snapshot` was built before a live event this client already
 * applied for the same thread — passed by callers that track it per thread
 * (the desktop-as-client store). Such a snapshot must not overwrite the
 * event's fresher thread row, pending requests, turn boundary, or
 * background-task level. Callers without a live seq (one-shot fetches with
 * no event stream to order against) simply omit the option and accept the
 * race; their next event-driven refresh overwrites the row either way.
 */
function snapshotIsStaleForThread(
  snapshot: RemoteThreadSnapshot,
  lastSeenEventSeq: number | undefined,
): boolean {
  if (lastSeenEventSeq === undefined) return false;
  return snapshotOlderThanAppliedSeq(snapshot.snapshotSeq, lastSeenEventSeq);
}

export interface ApplyThreadSnapshotResult {
  /** True only when the snapshot authoritatively replaced the transcript.
   * Stale snapshots and additive missing-older-history splices return false
   * so callers never record a truncation-suppression baseline from them. */
  readonly installedAuthoritativeHistory: boolean;
  /** Declined because the resident transcript is already newer than the
   * snapshot: the snapshot is older than the applied sequence, or the thread
   * is streaming and its live tail runs past the host's (debounced) snapshot.
   * Nothing is missing that a fresher read could add yet. */
  readonly declinedForNewerLiveTail?: boolean;
}

/**
 * Explicit authority for differently clipped projections of the same stream.
 * Only a successfully negotiated boundedThreadHistory read (bounded-v1 echo)
 * currently proves that the canonical intake prefix was committed and read
 * behind the captured sequence fence. A protocol version, cached response or
 * fromServer alone is not this proof. Bind it to the projected thread, exact
 * snapshot and accepted connection generation; recheck that generation and
 * its per-thread applied watermark after flushing pending renderer events.
 * This is an ephemeral installer option, never persisted or sent on the wire.
 */
interface CommittedHistoryPrefix {
  readonly threadId: string;
  readonly snapshotSeq: number;
  readonly isCurrent: () => boolean;
  readonly lastSeenEventSeq: () => number | undefined;
}

export function applyThreadSnapshot(
  snapshot: RemoteThreadSnapshot,
  options: {
    readonly fromServer: boolean;
    /** A cursor-covered replay updates metadata while retaining its resident window. */
    readonly preserveRuntimeHistory?: boolean;
    readonly lastSeenEventSeq?: number | undefined;
    readonly committedPrefix?: CommittedHistoryPrefix;
    /** Guard captured immediately before this thread's history request. */
    readonly followUpQueueSnapshotGuard?: ThreadFollowUpQueueSnapshotGuard;
    /**
     * The snapshot comes from a host on this machine, which settles its own
     * orphaned Crossagent rows: keep them whole instead of terminating them.
     */
    readonly preserveCrossagentRows?: boolean;
    /** The pending pane hydration performing this install (it is not superseded by it). */
    readonly installingSignal?: AbortSignal;
    /**
     * The thread's live runtime frames are held in the reducer queue behind
     * this read (a recovery, or a cold read): their sequences were recorded on
     * receipt but none reached the transcript, so they cannot make the
     * snapshot's transcript stale. Thread metadata is still arbitrated by them.
     */
    readonly runtimeFramesHeld?: boolean;
    /**
     * Requests open when this snapshot's read began. A request opened live
     * after that is newer than the snapshot, which cannot settle it.
     */
    readonly openRequestIdsAtReadStart?: ReadonlySet<string>;
  } = {
    fromServer: true,
  },
): ApplyThreadSnapshotResult {
  const threadId = snapshot.thread.id;
  const proof = options.committedPrefix;
  if (
    proof &&
    (!options.fromServer ||
      proof.threadId !== threadId ||
      proof.snapshotSeq !== snapshot.snapshotSeq ||
      !proof.isCurrent())
  ) {
    return { installedAuthoritativeHistory: false };
  }
  // A delta can already be in the JS event queue when the foreground recovery
  // snapshot resolves. Apply it before comparing/replacing the transcript so
  // the decision observes every event received up to this point.
  if (!options.preserveRuntimeHistory) liveReducer().flushSync(threadId);
  if (proof) {
    if (!proof.isCurrent()) return { installedAuthoritativeHistory: false };
    options = {
      ...options,
      lastSeenEventSeq: Math.max(
        options.lastSeenEventSeq ?? -Infinity,
        proof.lastSeenEventSeq() ?? -Infinity,
      ),
    };
  }
  // Arbitrate after the flush, before any snapshot write (including metadata
  // and offline caching). A flush can synchronously advance the applied seq.
  // Only the additive missing-older-history splice is safe for stale reads.
  const metadataStale = snapshotIsStaleForThread(snapshot, options.lastSeenEventSeq);
  // Held runtime frames are not applied to the transcript yet, so only an
  // applied (not merely received) sequence can make the transcript stale.
  const snapshotStale = options.runtimeFramesHeld ? false : metadataStale;
  if (isBrowserClientRuntime() && !snapshotStale && !options.preserveRuntimeHistory)
    void cacheBrowserThreadSnapshot(snapshot);
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
  // threadActive reads the snapshot's own status, so a stale inactive-looking
  // snapshot must never reach the replacement guards (they would treat its
  // shorter history as an authoritative truncate over the live tail).
  const threadActive = isThreadTurnActive(snapshot.thread.status);
  const shouldReplaceItems =
    !options.preserveRuntimeHistory &&
    !snapshotStale &&
    ((threadActive &&
      options.fromServer &&
      snapshotMonotonicallyCoversExistingTail(existingIds, existingItems, snapshotItems, {
        streamsFromCommittedPrefix: proof !== undefined,
      })) ||
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: existingIds.length,
        existingHasObservedLiveItems,
        snapshotItemCount: snapshot.runtimeItems.length,
        threadActive,
        fromServer: options.fromServer,
      }));
  if (shouldReplaceItems) {
    // Keep the session-local liveness marker for rows that were originally
    // observed on this client. It is intentionally not persisted by the
    // server, but replacing a catch-up snapshot should not erase it either.
    const reconciledSnapshotItems = snapshotItems.map((item) =>
      existingItems?.[item.id]?.observedLive ? { ...item, observedLive: true } : item,
    );
    const installation = planRuntimeHistorySnapshot(
      threadId,
      existingIds,
      existingItems ?? {},
      reconciledSnapshotItems,
      snapshot.runtimeNextCursor,
    );
    const { items } = installation;
    const retainedIds = new Set(items.map((item) => item.id));
    if (existingIds.some((id) => !retainedIds.has(id))) {
      if (snapshot.runtimeNextCursor != null) invalidateThreadPromptIndex(threadId);
      else forgetThreadPromptIndex(threadId);
    }
    // Cursor and items share the actual installation proof. A stale snapshot
    // never reaches this point, and every replacement fences awaited pages.
    seedOlderThreadRuntimeItemsCursor(threadId, snapshot.runtimeNextCursor ?? null, {
      ...installation,
      ...(options.installingSignal ? { installingSignal: options.installingSignal } : {}),
    });
    clearRuntimeStructuralChangeHint(threadId);
    forgetThreadGalleryCache(threadId);
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
    if (installation.unlocatedControl) void alignThreadRuntimeHistoryControl(threadId);
    // Active remote threads legitimately have running delegated-agent rows;
    // terminating them paints a false "session ended" error while the host is
    // still working. Inactive threads keep the reconcile (orphaned rows).
    // Known residual: a background Crossagent run of a turn-inactive thread
    // is live-observed only by clients that saw it stream; a fresh client's
    // reconcile can flash it failed until the run's next progress frame
    // re-marks and self-heals it. Closing that needs a host-declared
    // capability ("I settle orphaned Crossagent rows"), which is a wire
    // change; until then only hydration from the local backend is exempt
    // (chatRuntimePersister's preserveCrossagent).
    if (!threadActive) {
      state.reconcileStaleSubAgents(
        threadId,
        options.preserveCrossagentRows
          ? { preserveObservedLive: true, preserveCrossagent: true }
          : undefined,
      );
    }
  } else if (options.fromServer && !options.preserveRuntimeHistory) {
    if (!snapshotStale) mergeTerminalDelegatedAgentItems(threadId, snapshotItems);
    mergeMissedOlderSnapshotItems(threadId, snapshotItems);
    if (!snapshotStale && !hasHydratedThreadRuntimeItems(threadId)) {
      // Live items can beat the first snapshot to the pane. Rejecting its
      // older payload must not leave pagination uninitialized (or let the
      // browser's empty initial DB response mark it exhausted). Its cursor
      // alone does not prove the live projection's oldest boundary: rebase.
      const boundary = runtimeHistoryBoundary(threadId);
      seedOlderThreadRuntimeItemsCursor(threadId, snapshot.runtimeNextCursor ?? null, {
        preserveExistingCursor: true,
        sparseControlIds: boundary.sparseControlIds,
        ...(options.installingSignal ? { installingSignal: options.installingSignal } : {}),
      });
      boundary.needsRebase = true;
    }
  }

  const turns = toCompletedTurnRecords(snapshot.completedTurns);
  if (options.fromServer && !snapshotStale) {
    // The server returns the full turn list even when runtime items are paged.
    // Replace the level so reconnect can remove reverted turns; filtering by
    // loaded item anchors would also discard valid turns outside the page.
    useAppStore.setState((current) => {
      const existing = current.runtimeCompletedTurnsByThread[threadId] ?? [];
      if (
        existing.length === turns.length &&
        existing.every((turn, index) => {
          const incoming = turns[index];
          return (
            incoming !== undefined &&
            turn.startedAt === incoming.startedAt &&
            turn.endedAt === incoming.endedAt &&
            turn.anchorItemId === incoming.anchorItemId
          );
        })
      )
        return {};
      return {
        runtimeCompletedTurnsByThread: {
          ...current.runtimeCompletedTurnsByThread,
          [threadId]: turns,
        },
      };
    });
  } else if (!options.fromServer && turns.length > 0) {
    state.hydrateThreadCompletedTurns(threadId, turns);
  }
  syncRuntimeTurnBoundaryFromSnapshot(snapshot, options);
  if (options.fromServer) {
    applyBackgroundTasksFromSnapshot(snapshot, options.lastSeenEventSeq);
    // snapshotSeq is host-global: an event for another thread must not make
    // this thread's queue response look stale. Callers that captured the
    // per-thread guard use it instead; legacy callers retain the sequence
    // fallback so an old snapshot still cannot undo a live cancellation.
    const queueSnapshotIsStale = options.followUpQueueSnapshotGuard
      ? !isThreadFollowUpQueueSnapshotCurrent(threadId, options.followUpQueueSnapshotGuard)
      : snapshotIsStaleForThread(snapshot, options.lastSeenEventSeq);
    if (snapshot.followUpQueue !== undefined && !queueSnapshotIsStale) {
      useThreadFollowUpQueueStore.getState().setQueue(threadId, snapshot.followUpQueue);
    }
  }
  if (snapshot.contextUsage && !snapshotStale) {
    const contextUsage = snapshot.contextUsage;
    useAppStore.setState((current) => ({
      runtimeContextByThread: { ...current.runtimeContextByThread, [threadId]: contextUsage },
    }));
  }

  if (!options.preserveRuntimeHistory)
    syncRuntimeRequestsFromSnapshot(
      snapshot,
      options.lastSeenEventSeq,
      options.openRequestIdsAtReadStart,
    );
  return {
    installedAuthoritativeHistory: shouldReplaceItems,
    ...(!shouldReplaceItems &&
    !options.preserveRuntimeHistory &&
    options.fromServer &&
    (snapshotStale ||
      existingTailMonotonicallyCoversSnapshot(existingIds, existingItems, snapshotItems))
      ? { declinedForNewerLiveTail: true }
      : {}),
  };
}

/**
 * Authoritative snapshot write of the background-task level, following the
 * reducer's own convention: REPLACE, and an empty level drops the key. A
 * snapshot built before a live `background_tasks.changed` the client already
 * applied (the history request was in flight when the event landed) must not
 * resurrect the stale level — REPLACE has no undo, and on a now-idle thread no
 * later event or refresh would correct it.
 */
function applyBackgroundTasksFromSnapshot(
  snapshot: RemoteThreadSnapshot,
  lastSeenEventSeq: number | undefined,
): void {
  if (snapshotIsStaleForThread(snapshot, lastSeenEventSeq)) return;
  const threadId = snapshot.thread.id;
  const tasks = snapshot.backgroundTasks ?? [];
  useAppStore.setState((current) => {
    if (tasks.length === 0) {
      if (!(threadId in current.runtimeBackgroundTasksByThread)) return {};
      const { [threadId]: _dropped, ...rest } = current.runtimeBackgroundTasksByThread;
      return { runtimeBackgroundTasksByThread: rest };
    }
    return {
      runtimeBackgroundTasksByThread: {
        ...current.runtimeBackgroundTasksByThread,
        [threadId]: tasks,
      },
    };
  });
}

function syncThreadMetadataFromSnapshot(
  snapshot: RemoteThreadSnapshot,
  options: { readonly fromServer: boolean; readonly lastSeenEventSeq?: number | undefined },
): void {
  if (!options.fromServer) return;
  // A snapshot built before a live `thread-state` the client already applied
  // must not replace the mirrored row with its older status.
  if (snapshotIsStaleForThread(snapshot, options.lastSeenEventSeq)) return;
  useAppStore.setState((current) => {
    const isVisible = isThreadVisible(current.view, snapshot.thread.id);
    let changed = false;
    const threads = current.threads.map((thread) => {
      if (thread.id !== snapshot.thread.id) return thread;
      // `finished` is the unread-completion badge, not the settled runtime
      // state of a thread the user is currently watching. openThread clears
      // it optimistically, but a slower authoritative history response can
      // otherwise paint the same stale badge back onto the open thread.
      const replacement =
        isVisible && snapshot.thread.status === "finished"
          ? { ...snapshot.thread, status: "idle" as const }
          : snapshot.thread;
      // The snapshot is inventory-aware (the host overlays its live
      // `sessionConfigInventory` entry onto the served row), so an explicit
      // value is authoritative; a host with no entry serves the key absent,
      // and that absence retains the live inventory the event stream already
      // applied — same owner/session only.
      const next = preservePendingThreadConfig(
        carryVolatileSessionConfigOptions(
          thread,
          carryActiveTurnTiming(
            thread,
            carryPendingThreadInput(
              thread,
              projectBrowserThreadWorkspace(
                projectPendingCatalogEdit("thread", replacement),
                thread,
              ),
              snapshot,
            ),
          ),
        ),
        current.pendingThreadConfigByThreadId[thread.id],
      );
      if (JSON.stringify(next) === JSON.stringify(thread)) return thread;
      changed = true;
      return next;
    });
    const pendingThreadConfigByThreadId = retainPendingThreadConfigs(
      current.pendingThreadConfigByThreadId,
      threads,
    );
    return changed || pendingThreadConfigByThreadId !== current.pendingThreadConfigByThreadId
      ? {
          ...(changed ? { threads } : {}),
          pendingThreadConfigByThreadId,
        }
      : {};
  });
}

function syncRuntimeTurnBoundaryFromSnapshot(
  snapshot: RemoteThreadSnapshot,
  options: { readonly fromServer: boolean; readonly lastSeenEventSeq?: number | undefined },
): void {
  if (!options.fromServer) return;
  if (snapshot.thread.presentationMode !== "gui") return;
  // A stale snapshot must not close a turn that live events still have open.
  if (snapshotIsStaleForThread(snapshot, options.lastSeenEventSeq)) return;
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
 * the thread moves on. A snapshot built before a live `request.opened` /
 * `request.resolved` the client already applied must do neither — clearing
 * would drop a prompt the agent is blocked on, and re-seeding would resurrect
 * a resolved one — so both halves are skipped for a stale snapshot.
 */
function syncRuntimeRequestsFromSnapshot(
  snapshot: RemoteThreadSnapshot,
  lastSeenEventSeq: number | undefined,
  openRequestIdsAtReadStart: ReadonlySet<string> | undefined,
): void {
  if (snapshotIsStaleForThread(snapshot, lastSeenEventSeq)) return;
  const threadId = snapshot.thread.id;
  const awaitingUser =
    snapshot.thread.status === "needs_approval" || snapshot.thread.status === "needs_reply";
  useAppStore.setState((current) => {
    const open = current.runtimeRequestsByThread[threadId] ?? [];
    if (!awaitingUser) {
      const newer = openRequestIdsAtReadStart
        ? open.filter((request) => !openRequestIdsAtReadStart.has(request.requestId))
        : [];
      if (newer.length === open.length) return {};
      return {
        runtimeRequestsByThread: { ...current.runtimeRequestsByThread, [threadId]: newer },
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
// The remote flavor of THE shared SupervisorEvent reducer
// (./reducers/supervisorEventReducer.ts), formerly a diverging copy of the
// desktop listener in src/renderer/app.tsx. Runtime deltas are coalesced per
// animation frame so streaming text cannot re-render faster than the display
// refreshes; background threads flush four times per second so several
// concurrent streams do not saturate the UI.

/**
 * Optional mobile-only side effects that ride supervisor events on the PWA.
 * Desktop callers (remoteServersStore) pass no hooks — those fan-outs are
 * either inert on desktop (no native Live Activity controller, no mobile
 * terminal feed listeners) or were filtered out before dispatch.
 */
export interface RemoteDispatchHooks {
  readonly runtimeSequence?: number;
  /** Recovery replay is already ordered behind an authoritative snapshot. */
  readonly deliverRuntimeEventsImmediately?: boolean;
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

/**
 * The client's ONE live-event reducer: every host's events, the desktop's own
 * host and each paired host alike, reduce through it. Recovery is host
 * generic: an overflowed or reset thread resumes from its recorded cursor on
 * its own host, else re-reads that host's tail, while the transcript stays
 * visible and the queue resumes only behind the new baseline.
 */
let hostHistoryRecoveryInstance: HostHistoryRecovery | null = null;
// Created on first use: this module is part of the recovery's own import graph.
const hostHistoryRecovery = (): HostHistoryRecovery =>
  (hostHistoryRecoveryInstance ??= createHostHistoryRecovery({
    getArbitration: () => liveReducer().arbitration,
  }));

/**
 * Fan-outs only an intake that receives these events supplies: the desktop's
 * own host is the only one that sends desktop-internal frames (terminal
 * output, dev shells, provider usage) and the renderer perf diagnostics run
 * in the desktop window. Absent hooks leave those events to the core.
 */
export type SupervisorIntakeHooks = Pick<
  SupervisorEventReducerConfig,
  | "routeShellEvent"
  | "onThreadOutput"
  | "onThreadOutputCleared"
  | "onProviderUsage"
  | "onProviderUsageAll"
  | "wrapFlush"
  | "wrapApply"
>;

let intakeHooks: SupervisorIntakeHooks = {};

/** Installs the desktop intake's fan-outs; returns the uninstall. */
export function installSupervisorIntakeHooks(hooks: SupervisorIntakeHooks): () => void {
  intakeHooks = hooks;
  return () => {
    if (intakeHooks === hooks) intakeHooks = {};
  };
}

let supervisorReducerInstance: SupervisorEventReducer | null = null;
// Created on first use: this module is part of the reducer's own import graph.
function liveReducer(): SupervisorEventReducer {
  return (supervisorReducerInstance ??= createSupervisorEventReducer({
    recovery: {
      preservesOpenRequests: true,
      preservesTranscript: true,
      recoverFromQueueOverflow: (threadIds, resume) =>
        hostHistoryRecovery().strategy.recoverFromQueueOverflow(threadIds, resume),
      recoverFromThreadReset: (threadId, resume) =>
        hostHistoryRecovery().strategy.recoverFromThreadReset(threadId, resume),
    },
    onSequencedEvent: (event, rendererSequence, space) =>
      hostHistoryRecovery().noteSequencedSupervisorEvent(event, rendererSequence, space),
    get routeShellEvent() {
      return intakeHooks.routeShellEvent;
    },
    get onThreadOutput() {
      return intakeHooks.onThreadOutput;
    },
    get onThreadOutputCleared() {
      return intakeHooks.onThreadOutputCleared;
    },
    get onProviderUsage() {
      return intakeHooks.onProviderUsage;
    },
    get onProviderUsageAll() {
      return intakeHooks.onProviderUsageAll;
    },
    get wrapFlush() {
      return intakeHooks.wrapFlush;
    },
    get wrapApply() {
      return intakeHooks.wrapApply;
    },
    // A first-launch bulk discovery result is deferred so the UI paints first.
    onAgentStatusEvent: (event) =>
      applyAgentStatusSupervisorEvent(event, { deferFirstLaunchBulk: true }),
    isHistoryIncorporated,
    afterApply: (batches, { threadMetadata }) => {
      for (const { threadId, events } of batches) {
        // Usage is captured on the machine whose provider accounts run the
        // thread; a host on another machine records its own.
        if (hostRunsOnThisMachine(threadMetadata.find((thread) => thread.id === threadId)))
          recordRuntimeUsage(threadId, events, threadMetadata);
      }
    },
  }));
}

/** The client's one live-event reducer. */
export function supervisorEventReducer(): SupervisorEventReducer {
  return liveReducer();
}

/** A host's event stream restarted: reads begun on the previous one are not trusted. */
export function noteSupervisorTransportGenerationChanged(): void {
  hostHistoryRecovery().onTransportGenerationChanged();
  liveReducer().invalidateInFlightRecoveries();
}

export function clearSupervisorSequenceTracking(): void {
  hostHistoryRecovery().clearSequenceTracking();
}

/** Drop every queued runtime delta and cancel the pending flush, if any. Used
 * when switching or removing a remote host so stale batches cannot cross the
 * session boundary. */
export function clearPendingRuntimeEvents(): void {
  liveReducer().clear();
}

/** Drops a thread's queued deltas from a host instance that restarted. */
export function discardQueuedRuntimeEvents(threadId: string): void {
  liveReducer().discardQueued(threadId);
}

/** Re-reads a thread's history through the reducer that owns its queue. */
export function recoverRuntimeHistory(threadId: string): void {
  liveReducer().recoverRuntimeHistory(threadId);
}

export function noteRuntimeHistoryBaselines(threadIds: readonly string[]): void {
  liveReducer().noteAuthoritativeBaselines(threadIds);
}

function asSupervisorEvent(value: unknown): SupervisorEvent | null {
  if (!value || typeof value !== "object") return null;
  if (typeof (value as { type?: unknown }).type !== "string") return null;
  return value as SupervisorEvent;
}

export function dispatchRemoteSupervisorEvent(value: unknown, hooks?: RemoteDispatchHooks): void {
  const omissions = value && typeof value === "object" ? historyContentOmissions(value) : undefined;
  for (const threadId of omissions ?? []) noteHistoryDeliveryGap(threadId);
  const deliveryOptions = omissions ? { omittedRuntimeThreadIds: omissions } : {};
  const runtimeBatches = collectRuntimeEventsFromSupervisoryMessage(value);
  if (runtimeBatches.length > 0) {
    if (hooks?.deliverRuntimeEventsImmediately) {
      liveReducer().enqueueRuntimeBatches(runtimeBatches, {
        deliverRuntimeEventsImmediately: true,
        ...deliveryOptions,
        ...(hooks.runtimeSequence !== undefined
          ? { rendererSequence: hooks.runtimeSequence, sequenceSpace: "loopback" }
          : {}),
      });
      return;
    }
    liveReducer().enqueueRuntimeBatches(runtimeBatches, {
      ...deliveryOptions,
      ...(hooks?.runtimeSequence !== undefined
        ? { rendererSequence: hooks.runtimeSequence, sequenceSpace: "loopback" as const }
        : {}),
    });
    liveReducer().installScheduling();
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
  const sideEffects: SupervisorEventSideEffects = {
    ...(hooks?.onThreadState ? { onThreadState: hooks.onThreadState } : {}),
    ...(hooks?.onThreadReset ? { onThreadReset: hooks.onThreadReset } : {}),
    ...(hooks?.onThreadExited ? { onThreadExited: hooks.onThreadExited } : {}),
  };
  liveReducer().dispatch(event, undefined, { sideEffects });
}
