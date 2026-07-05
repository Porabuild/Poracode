import type { RuntimeEvent } from "@/shared/contracts";
import { closePlanAggregator } from "../../planAggregator";
import type { ClaudeMapperState, TextItemState } from "../sdkCanonicalMappingState";
import { newItemId } from "./helpers";
import { isLiveSubAgentScopedTool } from "./toolItems";
import { toolPayload } from "./toolPayload";

export function ensureTextItem(
  state: ClaudeMapperState,
  map: Map<number, TextItemState>,
  index: number,
  itemType: "assistant_message" | "reasoning",
  events: RuntimeEvent[],
): TextItemState | undefined {
  const existing = map.get(index);
  if (existing) {
    // Same-index slot already filled. If still streaming, reuse it. If
    // already completed, this is a duplicate event for the same logical
    // block within the current message frame — skip silently rather than
    // creating a second item with the same content. New messages clear
    // the map on `message_start`, so a fresh frame will see no `existing`.
    return existing.completed ? undefined : existing;
  }
  const item: TextItemState = {
    itemId: newItemId(itemType === "assistant_message" ? "asst" : "reason"),
    emittedText: false,
    fallbackText: "",
    completed: false,
    ...(itemType === "assistant_message" && state.currentAssistantMessageId
      ? { messageId: state.currentAssistantMessageId }
      : {}),
  };
  map.set(index, item);
  events.push({ type: "item.started", threadId: state.threadId, itemId: item.itemId, itemType });
  return item;
}

export function completeTextItem(
  state: ClaudeMapperState,
  item: TextItemState,
  stream: "assistant_text" | "reasoning_text",
  events: RuntimeEvent[],
): void {
  if (item.completed) return;
  if (stream === "assistant_text" && item.messageId && (item.emittedText || item.fallbackText)) {
    state.streamedAssistantMessageIds.add(item.messageId);
  }
  if (!item.emittedText && item.fallbackText.length > 0) {
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId: item.itemId,
      stream,
      delta: item.fallbackText,
    });
  }
  item.completed = true;
  events.push({ type: "item.completed", threadId: state.threadId, itemId: item.itemId });
}

export function closeClaudeOpenItems(
  state: ClaudeMapperState,
  options?: { closePlan?: boolean },
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const item of state.assistantTextItems.values()) {
    completeTextItem(state, item, "assistant_text", events);
  }
  for (const item of state.reasoningItems.values()) {
    completeTextItem(state, item, "reasoning_text", events);
  }
  // Background subagents run past the main turn's `result`; their parent tool
  // and any in-flight child tools must survive this close so a later
  // `task_notification` / child tool_result can complete them. Once no subagent
  // is live, nothing more is coming, so any dangling child rows are flushed.
  for (const [index, tool] of [...state.toolItemsByIndex]) {
    if (isLiveSubAgentScopedTool(state, tool)) continue;
    // Plan-aggregated tools never emitted item.started; their lifecycle is
    // owned by the aggregator's plan item, which persists across turns.
    if (!tool.planAggregatorRole) {
      events.push({
        type: "item.completed",
        threadId: state.threadId,
        itemId: tool.itemId,
        payload: toolPayload(tool, "success"),
      });
    }
    state.toolItemsByIndex.delete(index);
  }
  for (const [id, tool] of [...state.toolItemsById]) {
    if (isLiveSubAgentScopedTool(state, tool)) continue;
    // A dangling sub-agent child whose subagent already closed will never get
    // its tool_result; flush it with a completion (like the open main-thread
    // tools above) so it doesn't stay "running" in the overlay forever. Tools
    // completed by the index loop above are never in the child set, so this
    // cannot double-complete.
    if (!tool.planAggregatorRole && state.subAgentChildToolItemIds?.has(id)) {
      events.push({
        type: "item.completed",
        threadId: state.threadId,
        itemId: tool.itemId,
        payload: toolPayload(tool, "success"),
      });
    }
    state.toolItemsById.delete(id);
    state.subAgentChildToolItemIds?.delete(id);
  }
  state.assistantTextItems.clear();
  state.reasoningItems.clear();
  if (options?.closePlan && state.planAggregator) {
    events.push(...closePlanAggregator(state.planAggregator));
  }
  return events;
}
