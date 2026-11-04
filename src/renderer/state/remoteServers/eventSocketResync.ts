import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { recoverRuntimeHistory } from "@/renderer/state/remote/sync";
import { currentRemoteServerThreadItemInterests } from "./eventSocketRegistry";
import { remoteConnectionKey } from "./types";
import type { EventSocketConnectionContext } from "./eventSocketContext";

/**
 * Re-baselines a connection's threads after a gap its host cannot replay (a
 * restart, an expired replay window, a client-detected loss), or only the
 * given ones. Each thread recovers through the live reducer that owns its
 * queue, exactly as the desktop host's connection rebuilds its threads: it
 * resumes from its recorded cursor or re-reads its tail on its host, while its
 * runtime queue stays held and is arbitrated behind the new baseline. A failed
 * thread retries on the reducer's bounded schedule and then shows its own
 * load failure; it never fails the connection.
 */
export function recoverInterestedThreads(
  ctx: EventSocketConnectionContext,
  onlyThreadIds?: ReadonlySet<string>,
): Promise<boolean> {
  // The socket/registry/projection key is the record's connection key, never
  // the host identity: an environment record's `desktopId` is the child host.
  const connectionKey = remoteConnectionKey(ctx.server);
  const threadIds = new Set<string>(onlyThreadIds);
  if (!onlyThreadIds) {
    const open = ctx.get().openThread;
    if (open?.desktopId === connectionKey) threadIds.add(open.threadId);
    for (const interest of currentRemoteServerThreadItemInterests(connectionKey))
      threadIds.add(interest);
  }
  for (const threadId of threadIds) recoverRuntimeHistory(remoteThreadId(connectionKey, threadId));
  return Promise.resolve(true);
}

export function bindEventSocketResync(ctx: EventSocketConnectionContext): void {
  ctx.recoverInterestedThreads = (onlyThreadIds) => recoverInterestedThreads(ctx, onlyThreadIds);
  ctx.entry.recoverInterestedThreads = ctx.recoverInterestedThreads;
}
