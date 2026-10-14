import { useAppStore } from "../appStore";
import { invalidateThreadRuntimeHydration } from "../chatRuntimePersister";

/** Drop only a remote projection whose history is about to be rebuilt. */
export function resetRemoteThreadProjection(threadId: string): void {
  invalidateThreadRuntimeHydration(threadId);
  useAppStore.getState().clearThreadRuntimeEvents(threadId);
}
