import type { AppStoreState } from "./slices/shared";
import { estimateCacheValueBytes } from "./browserMetadataCacheProjection";

// Admission estimates of retained UTF-16 content/objects, not private heap or
// native allocations. Active readers are exempt; canonical history stays on the host.
// Pending authorization requests are not evicted and are outside this budget.
const MAX_CACHED_THREAD_TRANSCRIPTS = 10;
export const MAX_INACTIVE_THREAD_ESTIMATED_BYTES = 16 * 1024 * 1024;
export const MAX_INACTIVE_RUNTIME_ESTIMATED_BYTES = 64 * 1024 * 1024;

/** Reuse weak, immutable-subtree estimates instead of serializing large outputs.
 * New reducer objects invalidate their estimate; unchanged items are measured once. */
export function estimateInactiveThreadRuntimeBytes(state: AppStoreState, threadId: string): number {
  return (
    estimateCacheValueBytes(state.runtimeItemIdsByThread[threadId]) +
    estimateCacheValueBytes(state.runtimeItemsByIdByThread[threadId]) +
    estimateCacheValueBytes(state.runtimeCompletedTurnsByThread[threadId]) +
    estimateCacheValueBytes(state.runtimeContextByThread[threadId]) +
    estimateCacheValueBytes(state.runtimeBackgroundTasksByThread[threadId]) +
    estimateCacheValueBytes(state.runtimeOpenTurnByThread[threadId])
  );
}

/** Oldest inactive windows leave first; current readers never enter this list. */
export function selectInactiveRuntimeEvictions(
  state: AppStoreState,
  inactiveThreadIds: ReadonlySet<string>,
): string[] {
  const sizes = new Map<string, number>();
  let estimatedBytes = 0;
  for (const threadId of inactiveThreadIds) {
    const bytes = estimateInactiveThreadRuntimeBytes(state, threadId);
    sizes.set(threadId, bytes);
    estimatedBytes += bytes;
  }
  const removed: string[] = [];
  let remaining = inactiveThreadIds.size;
  for (const threadId of inactiveThreadIds) {
    if (
      remaining <= MAX_CACHED_THREAD_TRANSCRIPTS &&
      estimatedBytes <= MAX_INACTIVE_RUNTIME_ESTIMATED_BYTES
    )
      break;
    estimatedBytes -= sizes.get(threadId) ?? 0;
    remaining -= 1;
    removed.push(threadId);
  }
  return removed;
}
