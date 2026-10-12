import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
  retainThreadRuntimeItems,
  releaseThreadRuntimeItems,
} from "./chatRuntimePersister";
import { retainRendererEventInterest } from "./rendererEventInterests";

/** One owner for both a local reader's bounded window and its live stream. */
export function retainRuntimeThreadReader(threadId: string): { release(): void } {
  retainThreadRuntimeItems(threadId);
  const interest = retainRendererEventInterest("runtime", threadId);
  const continuous = interest.continuous;
  let active = true;
  void interest.ready.then(() => {
    if (active) hydrateThreadRuntimeItemsForInterest(threadId, continuous && interest.continuous);
  });
  return {
    release: () => {
      if (!active) return;
      active = false;
      interest.release();
      releaseThreadRuntimeItems(threadId);
    },
  };
}

type RuntimeHistoryRecovery = (threadId: string) => void;
let recoverRuntimeHistory: RuntimeHistoryRecovery | null = null;

/** Bind the window's existing reducer recovery, including its bounded queue
 * and sequence arbitration. A pane must not perform a parallel history reset
 * outside that reducer while newly subscribed deltas are arriving. */
export function installRuntimeHistoryRecovery(recover: RuntimeHistoryRecovery): () => void {
  recoverRuntimeHistory = recover;
  return () => {
    if (recoverRuntimeHistory === recover) recoverRuntimeHistory = null;
  };
}

/** Called only after the pane's live-interest lease is ready. A cached
 * transcript is current only across continuous wire coverage; a reopened
 * pane otherwise needs the same authoritative baseline as queue recovery. */
export function hydrateThreadRuntimeItemsForInterest(threadId: string, continuous: boolean): void {
  if (!continuous && hasHydratedThreadRuntimeItems(threadId) && recoverRuntimeHistory) {
    recoverRuntimeHistory(threadId);
    return;
  }
  void hydrateThreadRuntimeItems(threadId);
}
