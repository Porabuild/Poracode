import type { SupervisorEvent } from "@/shared/ipc";
import { useAppStore } from "@/renderer/state/appStore";
import { rehydrateThreadRuntimeItemsAfterReset } from "@/renderer/state/chatRuntimePersister";
import { clearRuntimeItemStoreSelectorCacheForThread } from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import type {
  RuntimeEventRecoveryStrategy,
  RuntimeQueueArbitration,
} from "./supervisorEventReducer";

/**
 * The Electron (desktop-managed) recovery strategy: authoritative state is the
 * LOCAL snapshot. The backend persists runtime events before broadcasting
 * them, so after a queue overflow or a `thread-reset` the renderer re-reads
 * the authoritative local history and the reducer resumes live deltas only
 * once that re-read has landed (V5 plan 2.3: injected recovery strategy —
 * local snapshot | HTTP snapshot).
 */
export interface LocalSnapshotRecovery {
  readonly strategy: RuntimeEventRecoveryStrategy;
  /** Records the transport sequence of every sequenced event, per thread. */
  readonly noteSequencedSupervisorEvent: (event: SupervisorEvent, rendererSequence: number) => void;
  /** A new backend renderer-stream generation invalidates prior reads. */
  readonly onTransportGenerationChanged: () => void;
  readonly clearSequenceTracking: () => void;
}

export function createLocalSnapshotRecovery(deps: {
  readonly getArbitration: () => RuntimeQueueArbitration;
}): LocalSnapshotRecovery {
  let rendererTransportGeneration = 0;
  const latestRendererSequenceByThread = new Map<string, number>();

  /**
   * A local DB snapshot has no event cursor of its own. Repeat the read when
   * the renderer observed new sequenced events during it; the next read then
   * includes those persisted rows. A sustained stream eventually becomes an
   * explicit failed/retryable state instead of an unbounded recovery loop.
   */
  async function recoverRuntimeThread(threadId: string): Promise<boolean> {
    const generation = rendererTransportGeneration;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = latestRendererSequenceByThread.get(threadId) ?? 0;
      useAppStore.getState().clearThreadRuntimeEvents(threadId);
      clearRuntimeItemStoreSelectorCacheForThread(threadId);
      const recovered = await rehydrateThreadRuntimeItemsAfterReset(threadId);
      if (!recovered) return false;
      if (rendererTransportGeneration !== generation) return false;
      const after = latestRendererSequenceByThread.get(threadId) ?? before;
      if (after !== before) continue;
      const arbitration = deps.getArbitration();
      if (arbitration.hasUnsequenced(threadId)) return false;
      arbitration.discardThroughSequence(threadId, after);
      return true;
    }
    return false;
  }

  const strategy: RuntimeEventRecoveryStrategy = {
    recoverFromQueueOverflow: (threadIds) => {
      if (threadIds.length === 1) {
        const [threadId] = threadIds;
        return recoverRuntimeThread(threadId!);
      }
      return Promise.all(threadIds.map((threadId) => recoverRuntimeThread(threadId))).then(
        (results) => results.every(Boolean),
      );
    },
    recoverFromThreadReset: (threadId) => recoverRuntimeThread(threadId),
  };

  return {
    strategy,
    noteSequencedSupervisorEvent: (event, rendererSequence) => {
      if (event.type === "thread-runtime-events-multi") {
        for (const batch of event.batches) {
          latestRendererSequenceByThread.set(
            batch.threadId,
            Math.max(latestRendererSequenceByThread.get(batch.threadId) ?? 0, rendererSequence),
          );
        }
      } else if ("threadId" in event) {
        latestRendererSequenceByThread.set(
          event.threadId,
          Math.max(latestRendererSequenceByThread.get(event.threadId) ?? 0, rendererSequence),
        );
      }
    },
    onTransportGenerationChanged: () => {
      rendererTransportGeneration += 1;
      latestRendererSequenceByThread.clear();
    },
    clearSequenceTracking: () => {
      latestRendererSequenceByThread.clear();
    },
  };
}
