import type { ExtractContextResult, Thread } from "@/shared/contracts";
import { buildHandoffTranscriptContext } from "@/shared/handoffTranscript";
import { useAppStore } from "@/renderer/state/appStore";

export { formatTranscriptItems, handoffTranscriptBudget } from "@/shared/handoffTranscript";

export function buildTranscriptContext(
  thread: Thread,
  sourceLabel: string,
  maxChars?: number,
): ExtractContextResult | null {
  const state = useAppStore.getState();
  const itemIds = state.runtimeItemIdsByThread[thread.id] ?? [];
  const itemsById = state.runtimeItemsByIdByThread[thread.id];
  if (!itemsById || itemIds.length === 0) return null;
  const items = itemIds.flatMap((itemId) => {
    const item = itemsById[itemId];
    return item && !item.parentItemId ? [item] : [];
  });
  return buildHandoffTranscriptContext(thread, sourceLabel, items, maxChars);
}
