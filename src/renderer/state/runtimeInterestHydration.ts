import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
  retainThreadRuntimeItems,
  releaseThreadRuntimeItems,
} from "./chatRuntimePersister";
import { retainRendererEventInterest } from "./rendererEventInterests";
import { useAppStore } from "./appStore";
import { recoverRuntimeHistory as recoverOnLiveReducer } from "./remote/sync";

interface RuntimeThreadReader {
  readonly ready: Promise<boolean | void>;
  release(): void;
}

const preparedReaders = new Map<
  string,
  { readonly reader: RuntimeThreadReader; readonly onAdopted: () => void }
>();

/** A navigation owns this reader until the pane adopts it or navigation cancels. */
export function prepareRuntimeThreadReader(
  threadId: string,
  onAdopted: () => void = () => {},
): RuntimeThreadReader {
  const reader = retainRuntimeThreadReader(threadId);
  const prepared = { reader, onAdopted };
  preparedReaders.set(threadId, prepared);
  return {
    ready: reader.ready,
    release: () => {
      if (preparedReaders.get(threadId) !== prepared) return;
      preparedReaders.delete(threadId);
      reader.release();
    },
  };
}

/** Only the destination pane adopts a navigation's reader; background owners retain independently. */
export function adoptRuntimeThreadReader(threadId: string): RuntimeThreadReader {
  const prepared = preparedReaders.get(threadId);
  if (prepared) {
    preparedReaders.delete(threadId);
    prepared.onAdopted();
    return prepared.reader;
  }
  return retainRuntimeThreadReader(threadId);
}

/** One owner for a thread's bounded window and its host's live stream, whichever
 * host owns the thread. */
export function retainRuntimeThreadReader(threadId: string): RuntimeThreadReader {
  retainThreadRuntimeItems(threadId);
  const interest = retainRendererEventInterest("runtime", threadId);
  const continuous = interest.continuous;
  let active = true;
  // Resolves false only when this reader's own history read failed.
  const ready: Promise<boolean | void> = interest.ready.then(async () => {
    if (active)
      return hydrateThreadRuntimeItemsForInterest(threadId, continuous && interest.continuous);
  });
  return {
    ready,
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

/** Replaces the live reducer's recovery (a test drives its own reducer). A pane
 * must not perform a parallel history reset outside the reducer that owns the
 * thread's queue while newly subscribed deltas are arriving. */
export function installRuntimeHistoryRecovery(recover: RuntimeHistoryRecovery): () => void {
  recoverRuntimeHistory = recover;
  return () => {
    if (recoverRuntimeHistory === recover) recoverRuntimeHistory = null;
  };
}

/**
 * Re-reads a thread's history through the reducer that owns its live queue,
 * whichever host the thread is on, so its bounded queue and sequence
 * arbitration stay authoritative.
 */
function recoverThreadRuntimeHistory(threadId: string): boolean {
  (recoverRuntimeHistory ?? recoverOnLiveReducer)(threadId);
  return true;
}

/** A failed recovery still owns its blocked deltas; retry through that owner. */
export function retryThreadRuntimeItems(threadId: string): Promise<boolean> | void {
  if (!recoverThreadRuntimeHistory(threadId)) return hydrateThreadRuntimeItems(threadId);
}

/** Called only after the pane's live-interest lease is ready. A cached
 * transcript is current only across continuous wire coverage; a reopened
 * pane otherwise needs the same authoritative baseline as queue recovery. */
export function hydrateThreadRuntimeItemsForInterest(
  threadId: string,
  continuous: boolean,
): Promise<boolean> | void {
  if (
    (useAppStore.getState().runtimeHydrationStatus[threadId] === "failed" ||
      (!continuous && hasHydratedThreadRuntimeItems(threadId))) &&
    recoverThreadRuntimeHistory(threadId)
  )
    return;
  return hydrateThreadRuntimeItems(threadId);
}
