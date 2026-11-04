import { cacheRecentHistory, readRecentHistory } from "@/renderer/browser/recentHistoryCache";
import type { HistoryRuntimeItem } from "@/shared/remote/historyPresentation";
import type { EntityHost } from "./entityHost";
import { installProvisionalHistory } from "./provisionalHistory";
import { useAppStore } from "./appStore";
import { holdRuntimeHistoryRead } from "./runtimeHistoryReadBarrier";

/**
 * The cold-read preview of one thread on whichever host owns it. While the
 * host's history read is in flight, an empty pane paints the thread's last
 * accepted tail from the on-device cache (keyed by the host's verified
 * identity), and live deltas wait for the real baseline. The host's
 * connection owns the preview's admission: a reconnect drops it.
 */
export function beginHostHistoryPreview(
  host: EntityHost,
  viewThreadId: string,
  signal: AbortSignal | undefined,
) {
  const authority = host.recentHistoryKey;
  let closed = false;
  let removePreview = () => {};
  const empty = !useAppStore.getState().runtimeItemIdsByThread[viewThreadId]?.length;
  const releaseBarrier = empty ? holdRuntimeHistoryRead(viewThreadId) : () => {};
  const isCurrent = () =>
    signal?.aborted !== true &&
    host.isCurrent() &&
    useAppStore.getState().threads.some((thread) => thread.id === viewThreadId);
  const retire = () => {
    closed = true;
    removePreview();
    signal?.removeEventListener("abort", cancel);
  };
  const cancel = () => {
    retire();
    releaseBarrier();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  if (authority && empty) {
    const initialRows = useAppStore.getState().runtimeItemsByIdByThread[viewThreadId];
    void readRecentHistory(authority, viewThreadId).then((items) => {
      if (
        !items ||
        closed ||
        !isCurrent() ||
        useAppStore.getState().runtimeItemsByIdByThread[viewThreadId] !== initialRows
      )
        return;
      removePreview = installProvisionalHistory(viewThreadId, items);
    });
  }
  return {
    retire,
    cancel,
    complete(snapshotSeq: number) {
      retire();
      releaseBarrier(snapshotSeq);
    },
    cacheAccepted(items: readonly HistoryRuntimeItem[]) {
      if (authority) void cacheRecentHistory(authority, viewThreadId, items, isCurrent);
    },
  };
}
