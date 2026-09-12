import { useEffect } from "react";
import { create } from "zustand";
import type { ThreadFollowUpQueueState } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

export interface ThreadFollowUpQueueEntry {
  readonly queue: ThreadFollowUpQueueState | null;
}

/**
 * Captured immediately before a history request. A queue event for this
 * thread replaces the entry, invalidating a response that was already in
 * flight; events for other threads leave the guard valid.
 */
export interface ThreadFollowUpQueueSnapshotGuard {
  readonly generation: number;
  readonly entry: ThreadFollowUpQueueEntry | undefined;
}

// Keep an entry even for an empty queue so late snapshots cannot undo a newer event.
export const useThreadFollowUpQueueStore = create<{
  byThread: Record<string, ThreadFollowUpQueueEntry>;
  generation: number;
  setQueue(threadId: string, queue: ThreadFollowUpQueueState | null): void;
  reset(): void;
}>((set) => ({
  byThread: {},
  generation: 0,
  reset: () => set((state) => ({ byThread: {}, generation: state.generation + 1 })),
  setQueue: (threadId, queue) =>
    set((state) => ({ byThread: { ...state.byThread, [threadId]: { queue } } })),
}));

export function captureThreadFollowUpQueueSnapshot(
  threadId: string,
): ThreadFollowUpQueueSnapshotGuard {
  const { byThread, generation } = useThreadFollowUpQueueStore.getState();
  return { generation, entry: byThread[threadId] };
}

export function isThreadFollowUpQueueSnapshotCurrent(
  threadId: string,
  guard: ThreadFollowUpQueueSnapshotGuard,
): boolean {
  const state = useThreadFollowUpQueueStore.getState();
  return state.generation === guard.generation && state.byThread[threadId] === guard.entry;
}

export function useThreadFollowUpQueue(threadId: string, enabled = true) {
  const queue = useThreadFollowUpQueueStore((state) => state.byThread[threadId]?.queue ?? null);
  useEffect(() => {
    if (!enabled) return;
    const bridge = readBridge();
    if (!bridge?.getThreadFollowUpQueue) return;
    let active = true;
    const guard = captureThreadFollowUpQueueSnapshot(threadId);
    void bridge.getThreadFollowUpQueue({ threadId }).then(
      (snapshot) => {
        const store = useThreadFollowUpQueueStore.getState();
        if (active && isThreadFollowUpQueueSnapshotCurrent(threadId, guard)) {
          store.setQueue(threadId, snapshot);
        }
      },
      // Older remote hosts may not expose this optional surface; an actual queue
      // submission still reports its failure through the normal composer path.
      () => {},
    );
    return () => {
      active = false;
    };
  }, [enabled, threadId]);
  return enabled ? queue : undefined;
}
