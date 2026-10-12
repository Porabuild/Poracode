import { msg as sharedMsg } from "@/shared/messages";
import {
  applyThreadSnapshot,
  collectRuntimeEventsFromSupervisoryMessage,
  type ApplyThreadSnapshotResult,
} from "@/renderer/state/remote";
import { captureThreadFollowUpQueueSnapshot } from "@/renderer/state/threadFollowUpQueueStore";
import {
  projectRemoteThreadSnapshot,
  projectRemoteThread,
  projectRemoteThreadEvent,
  remoteThreadId,
} from "@/renderer/state/remoteProjection";
import {
  beginHistorySnapshotRead,
  readHistoryResume,
} from "@/renderer/state/historyResumeRegistry";
import { remoteHistoryResumeAuthority } from "@/renderer/state/historyResumeApplied";
import { installHistoryResume } from "@/renderer/state/historyResumeInstall";
import {
  canResumeQueuedRuntimeHistory,
  discardPendingRuntimeEventsThroughSequence,
} from "@/renderer/state/remote/sync";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeEvent } from "@/shared/contracts";
import { recordAuthoritativeHistoryInstall } from "@/renderer/state/remote/truncateRecovery";
import {
  bumpRemoteServerSnapshotSeq,
  currentRemoteServerThreadItemInterests,
  hasRemoteServerCursorSyncV2,
  remoteThreadAppliedSeq,
  supervisorEventThreadIds,
} from "./eventSocketRegistry";
import {
  recordBoundedHistoryTail,
  forgetBoundedHistoryThread,
} from "./catalog/boundedHistoryRegistry";
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

async function replayRecoveryQueue(ctx: EventSocketConnectionContext): Promise<void> {
  const { server, recovery } = ctx;
  const connectionKey = remoteConnectionKey(server);
  const queuedEvents = [...recovery.queuedEvents].sort((left, right) => left.seq - right.seq);
  let budgetStartedAt = performance.now();
  for (const queued of queuedEvents) {
    if (!ctx.isCurrent() || ctx.entry.socket !== ctx.socket) return;
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
): Promise<boolean> {
  const { server, entry, socket, client, get, set, buildOpenThread, isCurrent, recovery } = ctx;
  // The socket/registry/projection key is the record's connection key, never
  // the host identity: an environment record's `desktopId` is the child host.
  const connectionKey = remoteConnectionKey(server);
  // Dedupe only within the SAME connection: a stale recovery from a
  // dead socket must not be handed to the replacement connection.
  if (ctx.resyncSlots.promise && ctx.resyncSlots.socket === socket) return ctx.resyncSlots.promise;
  const open = get().openThread;
  const interests = currentRemoteServerThreadItemInterests(connectionKey);
  const threadIds = new Set<string>();
  if (open?.desktopId === connectionKey) threadIds.add(open.threadId);
  for (const interest of interests) threadIds.add(interest);
  if (threadIds.size === 0) return Promise.resolve(true);
  recovery.threadIds = new Set(threadIds);
  recovery.queuedEvents = [];
  recovery.queuedBytes = 0;
  recovery.overflowed = false;
  recovery.baselineSeqByThread = new Map<string, number>();
  const promise = (async (): Promise<boolean> => {
    let restored = true;
    const snapshotReads: ReturnType<typeof beginHistorySnapshotRead>[] = [];
    try {
      // Fetch all interested threads concurrently (N−1 RTTs saved on
      // server-restart resync), then apply in the original order so
      // per-thread state transitions stay deterministic.
      const omitScrollback = hasRemoteServerCursorSyncV2(connectionKey);
      const fetched = await Promise.all(
        [...threadIds].map(async (threadId) => {
          const viewId = remoteThreadId(connectionKey, threadId);
          const authority = remoteHistoryResumeAuthority(connectionKey);
          const captured = readHistoryResume(viewId, authority);
          const followUpQueueSnapshotGuard = captureThreadFollowUpQueueSnapshot(viewId);
          const resumeRead = beginHistorySnapshotRead(viewId, authority);
          snapshotReads.push(resumeRead);
          try {
            if (
              captured &&
              canResumeQueuedRuntimeHistory(viewId) &&
              useAppStore.getState().runtimeItemIdsByThread[viewId] !== undefined
            ) {
              const response = await client.resumeThreadHistory(threadId, captured.cursor, {
                afterSeq: captured.appliedSeq,
              });
              if (response.kind === "events") {
                resumeRead.cancel();
                return {
                  threadId,
                  followUpQueueSnapshotGuard,
                  resume: { captured, response, authority },
                  resumeRead,
                };
              }
              return {
                threadId,
                followUpQueueSnapshotGuard,
                history: { negotiation: "bounded", page: response.snapshot } as const,
                resumeRead,
              };
            }
            return {
              threadId,
              followUpQueueSnapshotGuard,
              resumeRead,
              history: await client.boundedThreadHistory(threadId, {
                compactDetails: true,
                ...(omitScrollback ? { omitScrollback: true } : {}),
              }),
            };
          } catch {
            resumeRead.cancel();
            return null;
          }
        }),
      );
      for (const result of fetched) {
        if (!result) {
          restored = false;
          continue;
        }
        const { threadId, followUpQueueSnapshotGuard } = result;
        if (!isCurrent() || entry.socket !== socket) {
          result.resumeRead.cancel();
          restored = false;
          break;
        }
        if (result.resume) {
          const viewId = remoteThreadId(connectionKey, threadId);
          const { captured, response, authority } = result.resume;
          if (
            !canResumeQueuedRuntimeHistory(viewId) ||
            !installHistoryResume({
              threadId: viewId,
              authority,
              noticeAuthority: connectionKey,
              captured,
              ...(remoteThreadAppliedSeq(connectionKey, threadId) !== undefined
                ? { lastSeenEventSeq: remoteThreadAppliedSeq(connectionKey, threadId)! }
                : {}),
              response: {
                ...response,
                thread: projectRemoteThread(connectionKey, response.thread),
              },
              discardThrough: (seq) => discardPendingRuntimeEventsThroughSequence(viewId, seq),
              followUpQueueSnapshotGuard,
              projectEvents: (events) =>
                (
                  projectRemoteThreadEvent(connectionKey, {
                    type: "thread-runtime-events",
                    threadId,
                    events,
                  }) as { events: RuntimeEvent[] }
                ).events,
            })
          ) {
            restored = false;
            continue;
          }
          recovery.baselineSeqByThread.set(threadId, response.snapshotSeq);
          recordAuthoritativeHistoryInstall(connectionKey, threadId, response.snapshotSeq);
          bumpRemoteServerSnapshotSeq(connectionKey, response.snapshotSeq);
          continue;
        }
        const history = result.history!;
        const nextSnapshot = history.page;
        const applied: ApplyThreadSnapshotResult = applyThreadSnapshot(
          projectRemoteThreadSnapshot(connectionKey, nextSnapshot),
          {
            fromServer: true,
            followUpQueueSnapshotGuard,
            lastSeenEventSeq: remoteThreadAppliedSeq(connectionKey, threadId),
            ...(history.negotiation === "bounded"
              ? {
                  committedPrefix: {
                    threadId: remoteThreadId(connectionKey, threadId),
                    snapshotSeq: nextSnapshot.snapshotSeq,
                    isCurrent: () => isCurrent() && entry.socket === socket,
                    lastSeenEventSeq: () => remoteThreadAppliedSeq(connectionKey, threadId),
                  },
                }
              : {}),
          },
        );
        if (applied.installedAuthoritativeHistory) {
          result.resumeRead.finish(nextSnapshot.runtimeResumeCursor, nextSnapshot.snapshotSeq);
          recovery.baselineSeqByThread.set(threadId, nextSnapshot.snapshotSeq);
          recordAuthoritativeHistoryInstall(connectionKey, threadId, nextSnapshot.snapshotSeq);
          // The baseline may postdate a truncation that renumbered completed
          // turns while this client was disconnected; any recorded `ct1.`
          // continuation proof is stale and must not append to the rebuild.
          if (history.negotiation === "bounded")
            recordBoundedHistoryTail({ desktopId: connectionKey, threadId, page: history.page });
          else forgetBoundedHistoryThread(connectionKey, threadId);
        } else {
          result.resumeRead.cancel();
          restored = false;
        }
        bumpRemoteServerSnapshotSeq(connectionKey, nextSnapshot.snapshotSeq);
        const currentOpen = get().openThread;
        if (currentOpen?.desktopId === connectionKey && currentOpen.threadId === threadId) {
          set({
            openThread: buildOpenThread(connectionKey, nextSnapshot),
          });
        }
      }
      if (recovery.overflowed) restored = false;
      if (restored) {
        // The runtime queue may be holding a bounded tail that
        // arrived after the snapshots were read. Resume it before
        // replaying the transport recovery buffer so those
        // sequenced events cannot be discarded by the UI gate.
        beforeReplay?.();
        await replayRecoveryQueue(ctx);
      }
    } catch {
      restored = false;
    } finally {
      for (const read of snapshotReads) read.cancel();
    }
    return restored;
  })();
  ctx.resyncSlots.socket = socket;
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
  });
  return ctx.resyncSlots.promise;
}

export async function recoverInterestedThreads(
  ctx: EventSocketConnectionContext,
  beforeReplay?: () => void,
): Promise<boolean> {
  if (await resyncOpenThread(ctx, beforeReplay)) return true;
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
  ctx.recoverInterestedThreads = (beforeReplay) => recoverInterestedThreads(ctx, beforeReplay);
}
