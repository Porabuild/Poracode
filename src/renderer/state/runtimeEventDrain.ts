import { RuntimeEventQueue, type RuntimeEventQueueBatch } from "./runtimeEventQueue";

export interface RuntimeDrainStats {
  drainedThreads: number;
  drainedEvents: number;
}

/** The scheduling budget includes reduction, subscribers and post-apply work. */
export function drainRuntimeEventQueue(
  queue: RuntimeEventQueue,
  shouldFlush: (threadId: string) => boolean,
  apply: (batches: RuntimeEventQueueBatch[], stats: RuntimeDrainStats) => void,
  budgetMs: number,
  now: () => number = () => performance.now(),
): RuntimeDrainStats & { hasMore: boolean } {
  const startedAt = now();
  const budgeted = Number.isFinite(budgetMs);
  const drainedThreads = new Set<string>();
  let drainedEvents = 0;
  let hasMore: boolean;
  do {
    const remainingMs = budgeted
      ? Math.max(0, budgetMs - (now() - startedAt))
      : Number.POSITIVE_INFINITY;
    const slice = queue.drainBudgeted(shouldFlush, remainingMs, now);
    hasMore = slice.hasMore;
    if (slice.batches.length === 0) break;
    const sliceEvents = slice.batches.reduce((total, batch) => total + batch.events.length, 0);
    apply(slice.batches, { drainedThreads: slice.batches.length, drainedEvents: sliceEvents });
    for (const batch of slice.batches) drainedThreads.add(batch.threadId);
    drainedEvents += sliceEvents;
    if (!budgeted) break;
  } while (hasMore && now() - startedAt < budgetMs);
  return { drainedThreads: drainedThreads.size, drainedEvents, hasMore };
}
