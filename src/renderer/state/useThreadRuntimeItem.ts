import { useSyncExternalStore } from "react";
import { useAppStore } from "./appStore";
import { createThreadRuntimeItemSubscriptions } from "./threadRuntimeItemSubscriptions";

const subscribe = createThreadRuntimeItemSubscriptions(useAppStore);

/** Item selectors for other threads never run on a live delta for this thread. */
export function useThreadRuntimeItem(threadId: string, itemId: string) {
  return useSyncExternalStore(
    (notify) => subscribe(threadId, notify),
    () => useAppStore.getState().runtimeItemsByIdByThread[threadId]?.[itemId],
    () => useAppStore.getInitialState().runtimeItemsByIdByThread[threadId]?.[itemId],
  );
}
