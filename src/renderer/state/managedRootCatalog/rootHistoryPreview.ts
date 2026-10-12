import { cacheRecentHistory, readRecentHistory } from "@/renderer/browser/recentHistoryCache";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { getManagedParentAuthorityState } from "../remoteServers/managedLoopbackOwner";
import { installProvisionalHistory } from "../provisionalHistory";
import { useAppStore } from "../appStore";
import type { HistoryRuntimeItem } from "@/shared/remote/historyPresentation";
import { holdRuntimeHistoryRead } from "../runtimeHistoryReadBarrier";

/** Stable verified host identity owns disk rows; the live activation owns their admission. */
export function beginManagedRootHistoryPreview(threadId: string, signal: AbortSignal) {
  const activation = readManagedLoopbackActivation();
  const parent = getManagedParentAuthorityState();
  const authority =
    activation && parent.status === "ready" && parent.authority.client === activation.client
      ? `managed:${parent.authority.ref.hostDesktopId}`
      : null;
  let closed = false;
  let removePreview = () => {};
  const empty = !useAppStore.getState().runtimeItemIdsByThread[threadId]?.length;
  const releaseBarrier = empty ? holdRuntimeHistoryRead(threadId) : () => {};
  const isCurrent = () =>
    !signal.aborted &&
    readManagedLoopbackActivation() === activation &&
    useAppStore.getState().threads.some((thread) => thread.id === threadId);
  const retire = () => {
    closed = true;
    removePreview();
    signal.removeEventListener("abort", cancel);
  };
  const cancel = () => {
    retire();
    releaseBarrier();
  };
  signal.addEventListener("abort", cancel, { once: true });
  if (authority && empty) {
    const initialRows = useAppStore.getState().runtimeItemsByIdByThread[threadId];
    void readRecentHistory(authority, threadId).then((items) => {
      if (
        !items ||
        closed ||
        !isCurrent() ||
        useAppStore.getState().runtimeItemsByIdByThread[threadId] !== initialRows
      )
        return;
      removePreview = installProvisionalHistory(threadId, items);
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
      if (authority) void cacheRecentHistory(authority, threadId, items, isCurrent);
    },
  };
}
