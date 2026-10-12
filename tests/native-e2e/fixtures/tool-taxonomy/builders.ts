import type { CanonicalItemType, ToolCallPayload } from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { GroupCategory } from "@/renderer/components/thread/ChatPane/parts/items/toolCallCategorization";
import type { Payloads, TaxonomyCase, TaxonomyExpectation } from "./types";

export function itemCase<T extends CanonicalItemType>(
  id: string,
  type: T,
  payload: Payloads[T],
  category: GroupCategory,
  options: Partial<Omit<TaxonomyExpectation, "category">> = {},
  itemOptions: Partial<
    Pick<RuntimeChatItem, "state" | "streams" | "parentItemId" | "observedLive">
  > = {},
  inventoryIds: readonly string[] = [],
): TaxonomyCase {
  return {
    id,
    inventoryIds,
    item: { id, type, state: "completed", streams: {}, payload, ...itemOptions },
    expected: { category, visible: true, groupEligible: true, ...options },
  };
}
export function toolCase(
  id: string,
  payload: ToolCallPayload,
  category: GroupCategory,
  options: Partial<TaxonomyExpectation> = {},
  inventoryIds: readonly string[] = [],
): TaxonomyCase {
  return itemCase(
    id,
    "tool_call",
    payload,
    category,
    options,
    payload.status === "running" ? { state: "started" } : {},
    inventoryIds,
  );
}
