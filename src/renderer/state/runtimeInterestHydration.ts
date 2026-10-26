import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
  retainThreadRuntimeItems,
  releaseThreadRuntimeItems,
} from "./chatRuntimePersister";
import { retainRendererEventInterest } from "./rendererEventInterests";
import { useAppStore } from "./appStore";

interface RuntimeThreadReader {
  readonly ready: Promise<void>;
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

/** One owner for both a local reader's bounded window and its live stream. */
export function retainRuntimeThreadReader(threadId: string): RuntimeThreadReader {
  retainThreadRuntimeItems(threadId);
  const interest = retainRendererEventInterest("runtime", threadId);
  const continuous = interest.continuous;
  let active = true;
  const ready = interest.ready.then(() => {
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

/** Bind the window's existing reducer recovery, including its bounded queue
 * and sequence arbitration. A pane must not perform a parallel history reset
 * outside that reducer while newly subscribed deltas are arriving. */
export function installRuntimeHistoryRecovery(recover: RuntimeHistoryRecovery): () => void {
  recoverRuntimeHistory = recover;
  return () => {
    if (recoverRuntimeHistory === recover) recoverRuntimeHistory = null;
  };
}

/** A failed recovery still owns its blocked deltas; retry through that owner. */
export function retryThreadRuntimeItems(threadId: string): Promise<void> | void {
  if (recoverRuntimeHistory) return recoverRuntimeHistory(threadId);
  return hydrateThreadRuntimeItems(threadId);
}

/** Called only after the pane's live-interest lease is ready. A cached
 * transcript is current only across continuous wire coverage; a reopened
 * pane otherwise needs the same authoritative baseline as queue recovery. */
export function hydrateThreadRuntimeItemsForInterest(
  threadId: string,
  continuous: boolean,
): Promise<void> | void {
  if (
    recoverRuntimeHistory &&
    (useAppStore.getState().runtimeHydrationStatus[threadId] === "failed" ||
      (!continuous && hasHydratedThreadRuntimeItems(threadId)))
  ) {
    recoverRuntimeHistory(threadId);
    return;
  }
  return hydrateThreadRuntimeItems(threadId);
}
