import {
  noteRendererEventInterestWireCoverage,
  snapshotRendererEventInterests,
  subscribeRendererEventInterests,
} from "@/renderer/state/rendererEventInterests";
import { remoteThreadId, unprojectRemoteThreadId } from "@/renderer/state/remoteProjection";
import { boundManagedItemInterests, createItemInterestTracker } from "./desktopLoopbackInterests";
import { useLiveStreamCapacityStore } from "@/renderer/state/liveStreamCapacityStore";
import { recoverRuntimeHistory } from "@/renderer/state/remote/sync";
import { setRemoteServerThreadItemInterests } from "./eventSocketRegistry";

/**
 * Paired hosts as wire consumers of the one live-interest registry.
 *
 * A pane retains live content for its thread the same way whichever host owns
 * it ({@link retainRendererEventInterest}). Each paired connection's socket
 * carries the retained threads its host owns, most recently retained first and
 * within the host's interest bound, and reports that coverage so a lease knows
 * whether its stream stayed continuous.
 */

function wireFor(connectionKey: string): string {
  return `paired:${connectionKey}`;
}

/** The host thread ids one paired connection's socket must carry. */
export function pairedItemInterests(connectionKey: string): string[] {
  const hostIds = snapshotRendererEventInterests().runtimeThreadIds.flatMap(
    (threadId) => unprojectRemoteThreadId(connectionKey, threadId) ?? [],
  );
  return boundManagedItemInterests(hostIds).threadIds;
}

/** Sends one connection its current interests (a no-op when unchanged). */
export function syncPairedItemInterests(connectionKey: string): void {
  setRemoteServerThreadItemInterests(connectionKey, pairedItemInterests(connectionKey));
}

const trackers = new Map<string, ReturnType<typeof createItemInterestTracker>>();

/**
 * Reconciles one live connection's selection against its previous one, as
 * the desktop host's connection does: the overflow the bound excludes is
 * reported (the thread surface shows the overload), and a retained thread the
 * bound re-admits re-baselines, since its view missed content while excluded.
 */
function reconcilePairedSelection(connectionKey: string): void {
  let tracker = trackers.get(connectionKey);
  if (!tracker) {
    tracker = createItemInterestTracker();
    trackers.set(connectionKey, tracker);
  }
  const hostIds = snapshotRendererEventInterests().runtimeThreadIds.flatMap(
    (threadId) => unprojectRemoteThreadId(connectionKey, threadId) ?? [],
  );
  const selection = tracker.select(hostIds);
  useLiveStreamCapacityStore
    .getState()
    .setDroppedRuntimeThreadCount(selection.droppedCount, wireFor(connectionKey));
  for (const threadId of selection.restoredThreadIds)
    recoverRuntimeHistory(remoteThreadId(connectionKey, threadId));
}

/**
 * Records what a paired socket carries: its interests while it is live, and
 * nothing once it is down. A thread that loses coverage is marked as a
 * delivery gap, so its next reader takes a fresh baseline.
 */
export function notePairedItemInterestCoverage(connectionKey: string, live: boolean): void {
  if (live) reconcilePairedSelection(connectionKey);
  else {
    // A re-open re-reads every retained thread anyway: infer no restoration across it.
    trackers.get(connectionKey)?.reset();
    useLiveStreamCapacityStore.getState().setDroppedRuntimeThreadCount(0, wireFor(connectionKey));
  }
  noteRendererEventInterestWireCoverage(
    live
      ? pairedItemInterests(connectionKey).map((threadId) =>
          remoteThreadId(connectionKey, threadId),
        )
      : null,
    wireFor(connectionKey),
  );
}

/** Keeps every paired connection's interests in step with the registry. */
export function installPairedItemInterests(
  connectionKeys: () => readonly string[],
  isLive: (connectionKey: string) => boolean,
): () => void {
  return subscribeRendererEventInterests(() => {
    for (const connectionKey of connectionKeys()) {
      syncPairedItemInterests(connectionKey);
      if (isLive(connectionKey)) notePairedItemInterestCoverage(connectionKey, true);
    }
  });
}
