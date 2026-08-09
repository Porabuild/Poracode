import type { CanonicalItemType, ToolCallProgress, ToolCallWorkflow } from "@/shared/contracts";
import type { PlanAggregatorState } from "../planAggregator";
import type { ClaudeUsageScopeTracker } from "./canonicalMapping/usageSpent";

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
  /**
   * Set when a `task_started` bound this tool call to a live sub-agent run even
   * though the tool is not itself a launch tool. `SendMessage` resumes a
   * completed sub-agent from its transcript, and the resumed run reports
   * `task_started` / `task_notification` against the *SendMessage* tool_use id
   * — so that row is an agent row, not a plain tool row. A send that resumes
   * nothing (unreachable name, message to a live teammate) gets no
   * `task_started` and stays unflagged.
   */
  subAgentParent?: boolean;
  /**
   * Display title for a promoted sub-agent parent. Prefers the send's own
   * `summary` — the recap of what THIS message asked for — because the resumed
   * run's `task_started` description is frozen at the agent's original spawn,
   * so every resume of one agent would otherwise carry an identical, stale
   * label.
   */
  subAgentTitle?: string;
  /**
   * Sub-agent type reported by `task_started`, kept because a promoted row's
   * own tool args name the agent, not its type.
   */
  subAgentType?: string;
  /**
   * Structured launch metadata from a `Workflow` tool's `tool_use_result`
   * (SDK `WorkflowOutput`). Kept on the tool state so every later payload —
   * task_progress updates and the closing task_notification — still carries
   * the run's manifest/transcript location after the launch tool_result
   * (which is otherwise swallowed by the subagent keepalive) is gone.
   */
  workflow?: ToolCallWorkflow;
}

export interface ClaudeMapperState {
  threadId: string;
  /**
   * First tool_use id that launched each sub-agent task, kept for the life of
   * the session. A resumed run reports a NEW `tool_use_id` (the `SendMessage`
   * call), but its forwarded children still carry the ORIGINAL launch id in
   * `parent_tool_use_id` — so this is what lets a resume recognize that it
   * supersedes an earlier row. See {@link subAgentParentAliases}.
   */
  subAgentTaskLaunchTools?: Map<string, string>;
  /**
   * Superseded sub-agent parent tool id → the tool id that currently owns the
   * run. Children of a resumed agent name the original launch tool, which was
   * completed and dropped when the first run finished; without this redirect
   * they would nest under that dead row instead of the live resume row.
   */
  subAgentParentAliases?: Map<string, string>;
  /**
   * Per-call usage scope (SDK session id + epoch) for `usage.spent` emission.
   * Owned by the session layer (sdkSession.ts); undefined in tests/terminal
   * mode, where no spend events are emitted.
   */
  usageScope?: ClaudeUsageScopeTracker;
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
  activeGoalIterations?: number;
  activeGoalLastReason?: string;
  /**
   * True once the SDK has emitted any `active_goal` message this session —
   * i.e. the CLI's native /goal Stop-hook evaluator is live. While true, goal
   * completion is driven exclusively by `active_goal` with `value: null` (the
   * evaluator's "met" verdict); a turn `result` no longer completes the goal.
   */
  sawActiveGoalMessage?: boolean;
  /**
   * Legacy (no native `active_goal` frames) only: a clean turn `result`
   * arrived while background subagent tasks were still live, so the goal was
   * held active instead of completed. The goal completes after the last live
   * task drains and the session's resume grace expires — unless a new turn
   * starts first.
   */
  pendingGoalCompletionOnTaskDrain?: boolean;
  /**
   * Exact token spend accumulated while the goal is active: input + output +
   * cache creation + cache read of every assistant API message (main thread
   * and subagent sidechains alike) observed since the goal was armed. This is
   * the same per-call definition the Profile token ledger sums from
   * `usage.spent` events — never derived from the turn `result.usage` (which
   * the CLI reports as a session-cumulative counter, including pre-goal and
   * sidechain spend).
   */
  activeGoalTokensUsed?: number;
  /** Per-call sample ids already folded into {@link activeGoalTokensUsed}. */
  activeGoalUsageSampleIds?: Set<string>;
  planAggregator?: PlanAggregatorState;
  /**
   * Live background subagent tasks, keyed by the SDK `task_id`, mapping to the
   * launching Agent/Task tool_use id. Populated on `task_started` that carries
   * a `subagent_type` (or whose tool maps to a subagent-like tool). Lets a
   * `task_updated` (which carries no `tool_use_id`) find the parent item, and
   * keeps the parent tool_call alive after its launch tool_result arrives until
   * the authoritative `task_notification` closes it.
   */
  activeSubAgentTaskToTool?: Map<string, string>;
  /** Reverse of {@link activeSubAgentTaskToTool}: tool_use id → task_id. */
  activeSubAgentToolToTask?: Map<string, string>;
  /**
   * tool_use ids of tools launched INSIDE a running subagent (forwarded child
   * messages). Tracked so the main turn's `result` close doesn't evict them
   * before their own (also-forwarded) tool_result arrives to complete them —
   * background subagent activity continues after the main turn's result.
   */
  subAgentChildToolItemIds?: Set<string>;
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
