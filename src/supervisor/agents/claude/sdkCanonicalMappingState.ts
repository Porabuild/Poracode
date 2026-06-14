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

/**
 * Structured per-file diff metadata built from the SDK's
 * `tool_use_result.structuredPatch` (Edit/MultiEdit/Write output). Mirrors the
 * `metadata.changes[]` shape that Codex/OpenCode emit so the renderer's
 * existing structured-changes passthrough can render real hunk line numbers.
 */
export interface FileChangeMetadata {
  changes: Array<{
    path?: string;
    kind: { type: string; move_path: string | null };
    diff: string;
  }>;
}

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
  /**
   * Real-line-number diff derived from the tool result's `structuredPatch`,
   * attached to the `file_change` payload so InlineDiffView shows true file
   * line numbers instead of a synthetic `@@ -1 +1 @@` header.
   */
  fileChangeMetadata?: FileChangeMetadata;
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
  activeGoalCompletedTurnTokensUsed?: number;
  activeGoalLiveApiTokensUsed?: number;
  activeGoalTaskTokensByKey?: Map<string, number>;
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
