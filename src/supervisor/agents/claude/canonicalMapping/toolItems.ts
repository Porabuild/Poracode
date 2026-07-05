import type { RuntimeEvent } from "@/shared/contracts";
import type { ClaudeMapperState, ToolItemState } from "../sdkCanonicalMappingState";
import { readStringField } from "./helpers";
import { applyPlanAggregatorInput } from "./planMapping";
import { isSubAgentToolName } from "./toolClassification";
import { toolPayload } from "./toolPayload";

/**
 * Whether a tool item belongs to a still-running background subagent — either
 * the launching Agent/Task parent itself or a forwarded child tool inside it.
 * Such items must survive turn-boundary map resets (`closeClaudeOpenItems`,
 * `startClaudeTurn`) so the eventual `task_notification` / forwarded
 * tool_result can complete them.
 */
export function isLiveSubAgentScopedTool(state: ClaudeMapperState, tool: ToolItemState): boolean {
  const liveParents = state.activeSubAgentToolToTask;
  if (!liveParents || liveParents.size === 0) return false;
  return liveParents.has(tool.itemId) || state.subAgentChildToolItemIds?.has(tool.itemId) === true;
}

export function startToolItem(
  state: ClaudeMapperState,
  tool: ToolItemState,
  index: number | undefined,
  events: RuntimeEvent[],
): void {
  // Same tool_use id means the SDK is replaying a block we already opened.
  // Keep the live ToolItemState intact so the later tool_result can complete it.
  if (state.toolItemsById.has(tool.itemId)) return;
  if (index !== undefined) state.toolItemsByIndex.set(index, tool);
  state.toolItemsById.set(tool.itemId, tool);
  syncSubAgentModelProgress(tool);
  if (tool.planAggregatorRole) {
    // Suppress the underlying tool row — the aggregator's plan item is the
    // visible surface for TodoWrite / Task* calls. Forward any input that's
    // already populated at start time; streamed inputs flow through the
    // `input_json_delta` path below.
    if (Object.keys(tool.input).length > 0) {
      events.push(...applyPlanAggregatorInput(state, tool));
    }
    return;
  }
  events.push({
    type: "item.started",
    threadId: state.threadId,
    itemId: tool.itemId,
    itemType: tool.itemType,
    payload: toolPayload(tool, "running"),
  });
}

export function syncSubAgentModelProgress(tool: ToolItemState): void {
  if (!isSubAgentToolName(tool.toolName)) return;
  const model = readStringField(tool.input, "model");
  if (!model) return;
  tool.progress = { ...tool.progress, model };
}
