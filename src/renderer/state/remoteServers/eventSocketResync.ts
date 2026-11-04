import {
  readHostThreadHistory,
  resumeHostThreadHistory,
  type HostHistoryQueueArbitration,
} from "@/renderer/state/hostThreadHistory";
import { msg as sharedMsg } from "@/shared/messages";
import { collectRuntimeEventsFromSupervisoryMessage } from "@/renderer/state/remote";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import {
  canResumeQueuedRuntimeHistory,
  discardPendingRuntimeEventsThroughSequence,
  noteRuntimeHistoryBaselines,
} from "@/renderer/state/remote/sync";
import {
  bumpRemoteServerSnapshotSeq,
  currentRemoteServerThreadItemInterests,
  remoteServerResumeFence,
  supervisorEventThreadIds,
} from "./eventSocketRegistry";
import { remoteConnectionKey } from "./types";
import type { EventSocketConnectionContext } from "./eventSocketContext";

/** A3: replay is budgeted in safe ordered units. One queued frame (including a
 * `runtime.truncated` frame and its own payload) is the unit; the loop yields
 * to the event loop between units once the budget is spent, so a large recovery
 * tail cannot monopolize a task. Per-thread order and the baseline-cursor
 * ordering stay exactly as they were in the single synchronous loop. */
const RECOVERY_REPLAY_BUDGET_MS = 4;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function replayRecoveryQueue(
  ctx: EventSocketConnectionContext,
  resumeFence: number,
): Promise<void> {
  const { server, recovery } = ctx;
  const connectionKey = remoteConnectionKey(server);
  const queuedEvents = [...recovery.queuedEvents].sort((left, right) => left.seq - right.seq);
  let budgetStartedAt = performance.now();
  for (const queued of queuedEvents) {
    if (
      !ctx.isCurrent() ||
      ctx.entry.socket !== ctx.socket ||
      remoteServerResumeFence(connectionKey) !== resumeFence
    )
      return;
    const batches = collectRuntimeEventsFromSupervisoryMessage(queued.event);
    const keptBatches = batches.filter(
      (batch) => queued.seq > (recovery.baselineSeqByThread.get(batch.threadId) ?? -Infinity),
    );
    const replay =
      batches.length > 0
        ? keptBatches.length > 0
          ? { type: "thread-runtime-events-multi", batches: keptBatches }
          : null
        : supervisorEventThreadIds(queued.event).some(
              (threadId) => queued.seq > (recovery.baselineSeqByThread.get(threadId) ?? -Infinity),
            )
          ? queued.event
          : null;
    if (replay !== null) {
      ctx.dispatchForwardEvent(replay, queued.seq, true, queued.omittedRuntimeThreadIds);
      // Replay is the moment a recovery-queued frame is finally APPLIED:
      // only here may the resume cursor pass its seq.
      bumpRemoteServerSnapshotSeq(connectionKey, queued.seq);
    }
    if (performance.now() - budgetStartedAt >= RECOVERY_REPLAY_BUDGET_MS) {
      await yieldToEventLoop();
      budgetStartedAt = performance.now();
    }
  }
}

export function resyncOpenThread(
  ctx: EventSocketConnectionContext,
  beforeReplay?: () => void,
  /** Re-baseline only these host threads; otherwise every interested one. */
  onlyThreadIds?: ReadonlySet<string>,
): Promise<boolean> {
  const { server, entry, socket, client, get, set, buildOpenThread, isCurrent, recovery } = ctx;
  // The socket/registry/projection key is the record's connection key, never
  // the host identity: an environment record's `desktopId` is the child host.
  const connectionKey = remoteConnectionKey(server);
  const resumeFence = remoteServerResumeFence(connectionKey);
  // Dedupe only within the SAME connection: a stale recovery from a
  // dead socket must not be handed to the replacement connection.
  if (ctx.resyncSlots.promise && ctx.resyncSlots.socket === socket) {
    if (ctx.resyncSlots.resumeFence === resumeFence && !onlyThreadIds)
      return ctx.resyncSlots.promise;
    return ctx.resyncSlots.promise.then(() => resyncOpenThread(ctx, beforeReplay, onlyThreadIds));
  }
  const threadIds = new Set<string>(onlyThreadIds);
  if (!onlyThreadIds) {
    const open = get().openThread;
    if (open?.desktopId === connectionKey) threadIds.add(open.threadId);
    for (const interest of currentRemoteServerThreadItemInterests(connectionKey))
      threadIds.add(interest);
  }
  if (threadIds.size === 0) return Promise.resolve(true);
  recovery.threadIds = new Set(threadIds);
  recovery.queuedEvents = [];
  recovery.queuedBytes = 0;
  recovery.overflowed = false;
  recovery.baselineSeqByThread = new Map<string, number>();
  // A recovery that started under an earlier epoch binding (for example a
  // reconnect recovery issued before this socket's `ready`) must not raise the
  // new epoch's resume cursor with what may be the previous instance's reads.
  const promise = (async (): Promise<boolean> => {
    let restored = true;
    let failedReads = 0;
    const isRecoveryCurrent = () =>
      isCurrent() &&
      entry.socket === socket &&
      remoteServerResumeFence(connectionKey) === resumeFence;
    try {
      // Every interested thread re-baselines concurrently (N−1 RTTs saved on
      // server-restart resync) through the same host history steps as any
      // reader: resume from the recorded cursor, else re-read the tail.
      const outcomes = await Promise.all(
        [...threadIds].map(async (threadId) => {
          const entity = {
            id: remoteThreadId(connectionKey, threadId),
            remoteServerId: connectionKey,
            remoteId: threadId,
          };
          try {
            // Only an in-flight resume defers the read: without a cursor the
            // tail read starts in this same turn.
            const pendingResume = resumeHostThreadHistory(entity, {
              arbitration: pairedQueueArbitration,
              isCurrent: isRecoveryCurrent,
              client,
            });
            const resume = pendingResume ? await pendingResume : null;
            if (resume?.kind === "stale") return { threadId, kind: "stale" } as const;
            if (resume?.kind === "applied")
              return resume.applied
                ? ({ threadId, kind: "baseline", seq: resume.snapshotSeq } as const)
                : ({ threadId, kind: "unrestored" } as const);
            const read = await readHostThreadHistory(entity, {
              client,
              isCurrent: isRecoveryCurrent,
              ...(resume?.kind === "snapshot" ? { page: resume.page } : {}),
            });
            if (read.kind === "stale") return { threadId, kind: "stale" } as const;
            if (read.kind !== "installed") return null;
            return {
              threadId,
              kind: read.authoritative
                ? "baseline"
                : // A streaming thread's live tail usually runs past the host's
                  // debounced snapshot, so the installer rightly declines it.
                  // That is not a failed recovery: reconnecting cannot produce a
                  // fresher snapshot.
                  read.declinedForNewerLiveTail
                  ? "declined"
                  : "unrestored",
              seq: read.hostSnapshot.snapshotSeq,
              snapshot: read.hostSnapshot,
            } as const;
          } catch {
            return null;
          }
        }),
      );
      for (const outcome of outcomes) {
        if (!outcome) {
          failedReads += 1;
          continue;
        }
        if (outcome.kind === "stale" || !isRecoveryCurrent()) {
          restored = false;
          break;
        }
        if (outcome.kind === "unrestored") restored = false;
        if (outcome.kind === "baseline")
          recovery.baselineSeqByThread.set(outcome.threadId, outcome.seq);
        const currentOpen = get().openThread;
        if (
          "snapshot" in outcome &&
          currentOpen?.desktopId === connectionKey &&
          currentOpen.threadId === outcome.threadId
        )
          set({ openThread: buildOpenThread(connectionKey, outcome.snapshot) });
      }
      if (recovery.overflowed) restored = false;
      // A per-thread read failure (a deleted or persistently erroring thread)
      // is quarantined: it must not force-close a healthy socket into a
      // reconnect loop. Only a recovery where EVERY read failed is
      // connection-level trouble (a transient outage) and keeps the reconnect
      // path; the empty-interest case returned early above.
      if (failedReads >= threadIds.size) restored = false;
      if (restored) {
        // The runtime queue may be holding a bounded tail that
        // arrived after the snapshots were read. Resume it before
        // replaying the transport recovery buffer so those
        // sequenced events cannot be discarded by the UI gate. A
        // reconnect resync also supersedes an earlier failed recovery.
        noteRuntimeHistoryBaselines(
          [...recovery.baselineSeqByThread.keys()].map((threadId) =>
            remoteThreadId(connectionKey, threadId),
          ),
        );
        beforeReplay?.();
        await replayRecoveryQueue(ctx, resumeFence);
      }
    } catch {
      restored = false;
    }
    return restored;
  })();
  ctx.resyncSlots.socket = socket;
  ctx.resyncSlots.resumeFence = resumeFence;
  ctx.resyncSlots.promise = promise.finally(() => {
    // A newer connection's recovery may already own the buffers; the
    // stale finally must not wipe them.
    if (ctx.resyncSlots.socket !== socket) return;
    recovery.threadIds = new Set<string>();
    recovery.queuedEvents = [];
    recovery.queuedBytes = 0;
    recovery.overflowed = false;
    recovery.baselineSeqByThread = new Map<string, number>();
    ctx.resyncSlots.promise = null;
    ctx.resyncSlots.socket = null;
    ctx.resyncSlots.resumeFence = null;
  });
  return ctx.resyncSlots.promise;
}

/** The paired intake's live queue, as its reducer arbitrates it. */
const pairedQueueArbitration: HostHistoryQueueArbitration = {
  hasUnsequenced: (viewThreadId) => !canResumeQueuedRuntimeHistory(viewThreadId),
  discardThroughSequence: (viewThreadId, sequence) =>
    discardPendingRuntimeEventsThroughSequence(viewThreadId, sequence),
};

export async function recoverInterestedThreads(
  ctx: EventSocketConnectionContext,
  beforeReplay?: () => void,
  onlyThreadIds?: ReadonlySet<string>,
): Promise<boolean> {
  const connectionKey = remoteConnectionKey(ctx.server);
  const resumeFence = remoteServerResumeFence(connectionKey);
  const restored = await resyncOpenThread(ctx, beforeReplay, onlyThreadIds);
  if (remoteServerResumeFence(connectionKey) !== resumeFence) {
    if (!ctx.isCurrent() || ctx.entry.socket !== ctx.socket) return false;
    return recoverInterestedThreads(ctx, beforeReplay, onlyThreadIds);
  }
  // One thread's failed re-read is that thread's failure, not the
  // connection's: only a connection-wide resync reconnects.
  if (restored || onlyThreadIds) return restored;
  if (!ctx.isCurrent() || ctx.entry.socket !== ctx.socket) return false;
  ctx.forceReconnect(ctx.socket);
  ctx.setRemoteServerFailure(
    remoteConnectionKey(ctx.server),
    "offline",
    sharedMsg("remote.server.unreachable"),
  );
  return false;
}

export function bindEventSocketResync(ctx: EventSocketConnectionContext): void {
  ctx.recoverInterestedThreads = (beforeReplay, onlyThreadIds) =>
    recoverInterestedThreads(ctx, beforeReplay, onlyThreadIds);
  ctx.entry.recoverInterestedThreads = ctx.recoverInterestedThreads;
}
