interface ReadBarrier {
  readonly owners: Set<object>;
  coveredSeq?: number;
}
const barriers = new Map<string, ReadBarrier>();
const listeners = new Set<(threadId: string, coveredSeq: number | undefined) => void>();

/** Cold reads paint a preview, but canonical deltas wait for a real baseline. */
export function holdRuntimeHistoryRead(threadId: string): (coveredSeq?: number) => void {
  const owner = {};
  const barrier = barriers.get(threadId) ?? { owners: new Set<object>() };
  barriers.set(threadId, barrier);
  barrier.owners.add(owner);
  return (coveredSeq) => {
    if (!barrier.owners.delete(owner)) return;
    if (coveredSeq !== undefined)
      barrier.coveredSeq = Math.max(barrier.coveredSeq ?? 0, coveredSeq);
    if (barrier.owners.size > 0) return;
    barriers.delete(threadId);
    for (const listener of listeners) listener(threadId, barrier.coveredSeq);
  };
}
export function isRuntimeHistoryReadHeld(threadId: string): boolean {
  return barriers.has(threadId);
}
export function subscribeRuntimeHistoryReadCompletion(
  listener: (threadId: string, coveredSeq: number | undefined) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
