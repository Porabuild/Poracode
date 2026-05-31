import type { CanonicalItemType, ToolCallProgress } from "@/shared/contracts";
import type { PlanAggregatorState } from "../planAggregator";

export interface TextItemState {
  itemId: string;
  emittedText: boolean;
  fallbackText: string;
  completed: boolean;
  messageId?: string;
}

export type PlanAggregatorRole = "TodoWrite" | "TaskCreate" | "TaskUpdate" | "TaskStop";

export interface ToolItemState {
  itemId: string;
  itemType: CanonicalItemType;
  toolName: string;
  input: Record<string, unknown>;
  partialInputJson: string;
  lastInputFingerprint?: string;
  progress?: ToolCallProgress;
  /**
   * Tool calls handled by the plan aggregator are tracked in `toolItemsById`
   * for tool_result correlation, but their `item.started`/`item.updated`/
   * `item.completed` events are suppressed — the aggregator emits the
   * canonical `plan` item events instead.
   */
  planAggregatorRole?: PlanAggregatorRole;
}

export interface ClaudeMapperState {
  threadId: string;
  currentTurnId?: string;
  assistantTextItems: Map<number, TextItemState>;
  reasoningItems: Map<number, TextItemState>;
  toolItemsByIndex: Map<number, ToolItemState>;
  toolItemsById: Map<string, ToolItemState>;
  currentAssistantMessageId?: string;
  streamedAssistantMessageIds: Set<string>;
  currentCompactionItemId?: string;
  activeGoalItemId?: string;
  activeGoalObjective?: string;
  activeGoalStartedAtMs?: number;
  activeGoalTokensUsed?: number;
  activeGoalResultTokensUsed?: number;
  planAggregator?: PlanAggregatorState;
}

export function createClaudeMapperState(threadId: string): ClaudeMapperState {
  return {
    threadId,
    assistantTextItems: new Map(),
    reasoningItems: new Map(),
    toolItemsByIndex: new Map(),
    toolItemsById: new Map(),
    streamedAssistantMessageIds: new Set(),
  };
}
