import { useAppStore } from "@/renderer/state/appStore";
import { loadOlderThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";

/**
 * Pages older history in until the thread's store holds `itemId`, reusing the
 * canonical fenced paging. Resolves false when history is exhausted first, or
 * when `isCurrent` turns false (the caller moved on); cancelling never changes
 * saved history.
 */
export async function loadRuntimeItemThroughHistory(
  threadId: string,
  itemId: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  const isLoaded = () => !!useAppStore.getState().runtimeItemsByIdByThread[threadId]?.[itemId];
  while (isCurrent() && !isLoaded()) {
    if (!(await loadOlderThreadRuntimeItems(threadId))) break;
  }
  return isCurrent() && isLoaded();
}
