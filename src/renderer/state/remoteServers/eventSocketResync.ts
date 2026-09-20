import { msg as sharedMsg } from "@/shared/messages";
import {
  applyThreadSnapshot,
  collectRuntimeEventsFromSupervisoryMessage,
  type ApplyThreadSnapshotResult,
} from "@/renderer/state/remote";
import { captureThreadFollowUpQueueSnapshot } from "@/renderer/state/threadFollowUpQueueStore";
import { projectRemoteThreadSnapshot, remoteThreadId } from "@/renderer/state/remoteProjection";
import { recordAuthoritativeHistoryInstall } from "@/renderer/state/remote/truncateRecovery";
import {
  bumpRemoteServerSnapshotSeq,
  currentRemoteServerThreadItemInterests,
  hasRemoteServerCursorSyncV2,
  remoteThreadAppliedSeq,
  supervisorEventThreadIds,
} from "./eventSocketRegistry";
import type { EventSocketConnectionContext } from "./eventSocketContext";

export function resyncOpenThread(
  ctx: EventSocketConnectionContext,
  beforeReplay?: () => void,
): Promise<boolean> {
  const { server, entry, socket, client, get, set, buildOpenThread, isCurrent, recovery } = ctx;
  // Dedupe only within the SAME connection: a stale recovery from a
  // dead socket must not be handed to the replacement connection.
  if (ctx.resyncSlots.promise && ctx.resyncSlots.socket === socket) return ctx.resyncSlots.promise;
  const open = get().openThread;
  const interests = currentRemoteServerThreadItemInterests(server.desktopId);
  const threadIds = new Set<string>();
  if (open?.desktopId === server.desktopId) threadIds.add(open.threadId);
  for (const interest of interests) threadIds.add(interest);
  if (threadIds.size === 0) return Promise.resolve(true);
  recovery.threadIds = new Set(threadIds);
  recovery.queuedEvents = [];
  recovery.queuedBytes = 0;
  recovery.overflowed = false;
  recovery.baselineSeqByThread = new Map<string, number>();
  const promise = (async (): Promise<boolean> => {
    let restored = true;
    try {
      // Fetch all interested threads concurrently (N−1 RTTs saved on
      // server-restart resync), then apply in the original order so
      // per-thread state transitions stay deterministic.
      const omitScrollback = hasRemoteServerCursorSyncV2(server.desktopId);
      const fetched = await Promise.all(
        [...threadIds].map(async (threadId) => {
          try {
            return {
              threadId,
              followUpQueueSnapshotGuard: captureThreadFollowUpQueueSnapshot(
                remoteThreadId(server.desktopId, threadId),
              ),
              snapshot: await client.threadHistory(
                threadId,
                ...(omitScrollback ? [{ omitScrollback: true }] : []),
              ),
            };
          } catch {
            return null;
          }
        }),
      );
      for (const result of fetched) {
        if (!result) {
          restored = false;
          continue;
        }
        const { threadId, snapshot: nextSnapshot, followUpQueueSnapshotGuard } = result;
        if (!isCurrent() || entry.socket !== socket) {
          restored = false;
          break;
        }
        const applied: ApplyThreadSnapshotResult = applyThreadSnapshot(
          projectRemoteThreadSnapshot(server.desktopId, nextSnapshot),
          {
            fromServer: true,
            followUpQueueSnapshotGuard,
            lastSeenEventSeq: remoteThreadAppliedSeq(server.desktopId, threadId),
          },
        );
        if (applied.installedAuthoritativeHistory) {
          recovery.baselineSeqByThread.set(threadId, nextSnapshot.snapshotSeq);
          recordAuthoritativeHistoryInstall(server.desktopId, threadId, nextSnapshot.snapshotSeq);
        } else {
          restored = false;
        }
        bumpRemoteServerSnapshotSeq(server.desktopId, nextSnapshot.snapshotSeq);
        const currentOpen = get().openThread;
        if (currentOpen?.desktopId === server.desktopId && currentOpen.threadId === threadId) {
          set({
            openThread: buildOpenThread(server.desktopId, nextSnapshot),
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
        const queuedEvents = [...recovery.queuedEvents].sort((left, right) => left.seq - right.seq);
        for (const queued of queuedEvents) {
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
                    (threadId) =>
                      queued.seq > (recovery.baselineSeqByThread.get(threadId) ?? -Infinity),
                  )
                ? queued.event
                : null;
          if (replay !== null) {
            ctx.dispatchForwardEvent(replay, queued.seq, true);
            // Replay is the moment a recovery-queued frame is finally
            // APPLIED: only here may the resume cursor pass its seq.
            bumpRemoteServerSnapshotSeq(server.desktopId, queued.seq);
          }
        }
      }
    } catch {
      restored = false;
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
    ctx.server.desktopId,
    "offline",
    sharedMsg("remote.server.unreachable"),
  );
  return false;
}

export function bindEventSocketResync(ctx: EventSocketConnectionContext): void {
  ctx.recoverInterestedThreads = (beforeReplay) => recoverInterestedThreads(ctx, beforeReplay);
}
