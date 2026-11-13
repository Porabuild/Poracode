import { useAppStore } from "./appStore";
import { holdRuntimeHistoryRead } from "./runtimeHistoryReadBarrier";

/**
 * The cold-read hold for one thread on whichever host owns it. While the
 * host's history read is in flight, an empty pane keeps live deltas behind
 * the read barrier; no cached rows are painted, so the first transcript a
 * cold open shows is the authoritative baseline. The host's connection owns
 * the hold's admission: a reconnect drops it.
 */
export function beginHostHistoryPreview(viewThreadId: string, signal: AbortSignal | undefined) {
  const empty = !useAppStore.getState().runtimeItemIdsByThread[viewThreadId]?.length;
  const releaseBarrier = empty ? holdRuntimeHistoryRead(viewThreadId) : () => {};
  const detach = () => signal?.removeEventListener("abort", cancel);
  const cancel = () => {
    detach();
    releaseBarrier();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  return {
    retire() {
      detach();
    },
    cancel,
    complete(snapshotSeq: number) {
      detach();
      releaseBarrier(snapshotSeq);
    },
  };
}
