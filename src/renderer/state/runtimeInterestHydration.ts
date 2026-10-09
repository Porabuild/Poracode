import { hasHydratedThreadRuntimeItems, hydrateThreadRuntimeItems } from "./chatRuntimePersister";

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
