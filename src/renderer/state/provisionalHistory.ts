import { useAppStore } from "./appStore";
import { clearRuntimeItemStoreSelectorCacheForThread } from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import { toRuntimeChatItem, type RuntimeChatItem } from "./slices/runtimeEventSlice";
import type { HistoryRuntimeItem } from "@/shared/remote/historyPresentation";

/** A preview owns only its exact row objects. Live replacements survive its retirement. */
export function installProvisionalHistory(
  threadId: string,
  items: readonly HistoryRuntimeItem[],
): () => void {
  const state = useAppStore.getState();
  if ((state.runtimeItemIdsByThread[threadId]?.length ?? 0) > 0) return () => {};
  const preview = items.map(toRuntimeChatItem);
  state.hydrateThreadRuntimeItems(threadId, preview);
  const installed = useAppStore.getState().runtimeItemsByIdByThread[threadId];
  const owned = new Map<string, RuntimeChatItem>(
    preview.map((item) => [item.id, installed![item.id]!]),
  );
  return () => {
    useAppStore.setState((current) => {
      const rows = current.runtimeItemsByIdByThread[threadId];
      if (!rows) return {};
      const ids = current.runtimeItemIdsByThread[threadId] ?? [];
      const keep = ids.filter((id) => rows[id] !== owned.get(id));
      if (keep.length === ids.length) return {};
      const kept = Object.fromEntries(keep.map((id) => [id, rows[id]!]));
      return {
        runtimeItemIdsByThread: { ...current.runtimeItemIdsByThread, [threadId]: keep },
        runtimeItemsByIdByThread: { ...current.runtimeItemsByIdByThread, [threadId]: kept },
        runtimeStructuralVersionByThread: {
          ...current.runtimeStructuralVersionByThread,
          [threadId]: (current.runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
        },
      };
    });
    clearRuntimeItemStoreSelectorCacheForThread(threadId);
  };
}
