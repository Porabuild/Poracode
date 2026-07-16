import type { SDKActiveGoalMessage, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, TurnState } from "@/shared/contracts";
import { readNonNegativeInteger } from "../../contextUsage";
import {
  goalPayloadFromProviderState,
  startGoalItemEvents,
  updateGoalItemEvents,
  type ProviderGoalState,
} from "../../goalRuntime";
import type { ClaudeMapperState } from "../sdkCanonicalMappingState";
import { newItemId } from "./helpers";
import { readClaudeResultUsage } from "./result";

type ActiveGoalState = ClaudeMapperState & {
  activeGoalItemId: string;
  activeGoalObjective: string;
  activeGoalStartedAtMs: number;
};

function hasActiveGoal(state: ClaudeMapperState): state is ActiveGoalState {
  return (
    state.activeGoalItemId !== undefined &&
    state.activeGoalObjective !== undefined &&
    state.activeGoalStartedAtMs !== undefined
  );
}

export function resetActiveGoalTokenAccounting(state: ClaudeMapperState): void {
  delete state.activeGoalCompletedTurnTokensUsed;
  delete state.activeGoalLiveApiTokensUsed;
  delete state.activeGoalTaskTokensByKey;
}

export function clearActiveGoal(state: ClaudeMapperState): void {
  delete state.activeGoalItemId;
  delete state.activeGoalObjective;
  delete state.activeGoalStartedAtMs;
  delete state.activeGoalIterations;
  delete state.activeGoalLastReason;
  delete state.pendingGoalCompletionOnTaskDrain;
  resetActiveGoalTokenAccounting(state);
}

/**
 * The SDK yields `active_goal` frames alongside `SDKMessage`s, but the
 * published union does not include them — detect by shape.
 */
export function isActiveGoalMessage(message: unknown): message is SDKActiveGoalMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "active_goal"
  );
}

/**
 * Apply the CLI's native /goal evaluation stream. `/goal` is a wrapper around
 * a prompt-based Stop hook: after each turn a small fast model judges the
 * condition and the SDK reports the verdict as an `active_goal` message —
 * non-null `value` means "not yet met" (with bumped `iterations` and the
 * evaluator's `last_reason`), `value: null` means the goal was met and
 * cleared. That verdict — not the turn `result` — is the authoritative
 * completion signal for the goal item.
 */
export function applyActiveGoalMessage(
  state: ClaudeMapperState,
  message: SDKActiveGoalMessage,
): RuntimeEvent[] {
  state.sawActiveGoalMessage = true;
  // The native evaluator owns completion from here on; drop any legacy
  // complete-on-task-drain that was pending.
  delete state.pendingGoalCompletionOnTaskDrain;
  const value = message.value;
  if (value === null) return completeGoalFromEvaluatorVerdict(state);

  const objective = value.condition.trim();
  if (!objective) return [];
  state.activeGoalIterations = value.iterations;
  if (typeof value.last_reason === "string" && value.last_reason.trim().length > 0) {
    state.activeGoalLastReason = value.last_reason.trim();
  }

  if (!hasActiveGoal(state)) {
    // A goal can be armed natively without a local `/goal` turn — most
    // commonly a still-active goal restored by resuming the session. Create
    // the goal item so the dock reflects it.
    const itemId = newItemId("goal");
    state.activeGoalItemId = itemId;
    state.activeGoalObjective = objective;
    state.activeGoalStartedAtMs = epochSecondsToMs(value.set_at) ?? Date.now();
    resetActiveGoalTokenAccounting(state);
    if (!hasActiveGoal(state)) return []; // unreachable; re-narrows after mutation
    return startGoalItemEvents(
      state.threadId,
      itemId,
      goalPayloadFromProviderState({ ...activeGoalProviderState(state), status: "active" }, "set"),
    );
  }

  // A new `/goal` replacing the old one mid-session also lands here.
  state.activeGoalObjective = objective;
  return [activeGoalUpdatedEvent(state)];
}

/** The evaluator reported the condition met: complete and clear the goal. */
function completeGoalFromEvaluatorVerdict(state: ClaudeMapperState): RuntimeEvent[] {
  // A null verdict also follows our own `/goal clear` (handled eagerly in
  // startClaudeTurn, which already cleared local state) — nothing to do then.
  if (!hasActiveGoal(state)) return [];
  return completeActiveGoalNow(state);
}

export function completeActiveGoalEvents(
  state: ClaudeMapperState,
  message: Extract<SDKMessage, { type: "result" }>,
  turnState: TurnState,
): RuntimeEvent[] {
  if (!hasActiveGoal(state)) return [];

  const usage = readClaudeResultUsage(message);
  if (usage !== undefined) {
    state.activeGoalCompletedTurnTokensUsed =
      (state.activeGoalCompletedTurnTokensUsed ?? 0) + usage;
  }

  // While the native Stop-hook evaluator is live, a turn `result` is not a
  // goal outcome — the evaluator keeps starting turns until the condition is
  // met and reports that via `active_goal: null`. Only roll the usage/time
  // counters forward here. Without native goal frames (older CLI), fall back
  // to treating a clean turn end as completion so the dock never sticks.
  if (turnState === "interrupted" || state.sawActiveGoalMessage) {
    return [activeGoalUpdatedEvent(state)];
  }

  // Legacy fallback with background subagents still running: the turn end is
  // not the end of the goal's work. Hold the goal active and complete it when
  // the last live task drains (completeActiveGoalOnTaskDrainEvents).
  if (hasLiveSubAgentTaskEntries(state)) {
    state.pendingGoalCompletionOnTaskDrain = true;
    return [activeGoalUpdatedEvent(state)];
  }

  return completeActiveGoalNow(state);
}

/**
 * Legacy fallback continuation: a clean turn end deferred goal completion
 * because background subagent tasks were still live. Called after each task
 * unregisters; completes the goal once the registry is empty.
 */
export function completeActiveGoalOnTaskDrainEvents(state: ClaudeMapperState): RuntimeEvent[] {
  if (!state.pendingGoalCompletionOnTaskDrain) return [];
  if (hasLiveSubAgentTaskEntries(state)) return [];
  delete state.pendingGoalCompletionOnTaskDrain;
  if (!hasActiveGoal(state)) return [];
  return completeActiveGoalNow(state);
}

function completeActiveGoalNow(state: ActiveGoalState): RuntimeEvent[] {
  const { threadId } = state;
  const itemId = state.activeGoalItemId;
  const payload = goalPayloadFromProviderState(
    { ...activeGoalProviderState(state), status: "complete" },
    "updated",
  );
  clearActiveGoal(state);
  return updateGoalItemEvents(threadId, itemId, payload);
}

function hasLiveSubAgentTaskEntries(state: ClaudeMapperState): boolean {
  return (state.activeSubAgentTaskToTool?.size ?? 0) > 0;
}

/**
 * Snapshot of the active goal's payload fields (objective, aggregate token
 * spend, elapsed time, evaluator iterations/reason). Every goal emission
 * builds from this so partial updates never wipe fields off the dock.
 */
function activeGoalProviderState(state: ActiveGoalState): ProviderGoalState {
  const nowMs = Date.now();
  const tokensUsed = activeGoalAggregateTokens(state);
  return {
    objective: state.activeGoalObjective,
    ...(tokensUsed !== undefined ? { tokensUsed } : {}),
    timeUsedSeconds: Math.max(0, Math.round((nowMs - state.activeGoalStartedAtMs) / 1000)),
    ...(state.activeGoalIterations !== undefined ? { iterations: state.activeGoalIterations } : {}),
    ...(state.activeGoalLastReason ? { lastReason: state.activeGoalLastReason } : {}),
    updatedAt: nowMs / 1000,
  };
}

function activeGoalUpdatedEvent(state: ActiveGoalState): RuntimeEvent {
  return {
    type: "item.updated",
    threadId: state.threadId,
    itemId: state.activeGoalItemId,
    payload: goalPayloadFromProviderState(
      { ...activeGoalProviderState(state), status: "active" },
      "updated",
    ),
  };
}

export function emitActiveGoalTokenUpdate(
  state: ClaudeMapperState,
  tokensUsed: number,
): RuntimeEvent | undefined {
  if (!hasActiveGoal(state)) return undefined;
  state.activeGoalLiveApiTokensUsed = Math.max(state.activeGoalLiveApiTokensUsed ?? 0, tokensUsed);
  return emitActiveGoalAggregateTokenUpdate(state);
}

function emitActiveGoalAggregateTokenUpdate(state: ClaudeMapperState): RuntimeEvent | undefined {
  if (!hasActiveGoal(state)) return undefined;
  if (activeGoalAggregateTokens(state) === undefined) return undefined;
  return activeGoalUpdatedEvent(state);
}

function activeGoalAggregateTokens(state: ClaudeMapperState): number | undefined {
  const baseTokens = Math.max(
    state.activeGoalCompletedTurnTokensUsed ?? 0,
    state.activeGoalLiveApiTokensUsed ?? 0,
  );
  const taskTokens = sumActiveGoalTaskTokens(state);
  const totalTokens = baseTokens + taskTokens;
  return totalTokens > 0 ? totalTokens : undefined;
}

function sumActiveGoalTaskTokens(state: ClaudeMapperState): number {
  let total = 0;
  for (const tokens of state.activeGoalTaskTokensByKey?.values() ?? []) total += tokens;
  return total;
}

function epochSecondsToMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  // Guard against the field ever arriving in milliseconds.
  return value > 1_000_000_000_000 ? value : value * 1000;
}

export function emitActiveGoalTaskUsageUpdate(
  state: ClaudeMapperState,
  message: { task_id?: unknown; tool_use_id?: unknown },
  usage: { total_tokens?: number; tool_uses?: number; duration_ms?: number } | undefined,
): RuntimeEvent | undefined {
  if (!hasActiveGoal(state)) return undefined;
  const totalTokens = readNonNegativeInteger(usage?.total_tokens);
  if (totalTokens === undefined || totalTokens <= 0) return undefined;

  const key = activeGoalTaskUsageKey(message);
  if (!key) return undefined;

  const taskTokens = (state.activeGoalTaskTokensByKey ??= new Map<string, number>());
  const previous = taskTokens.get(key) ?? 0;
  if (totalTokens <= previous) return undefined;
  taskTokens.set(key, totalTokens);
  return emitActiveGoalAggregateTokenUpdate(state);
}

function activeGoalTaskUsageKey(message: {
  task_id?: unknown;
  tool_use_id?: unknown;
}): string | undefined {
  const taskId = typeof message.task_id === "string" ? message.task_id : undefined;
  const toolUseId = typeof message.tool_use_id === "string" ? message.tool_use_id : undefined;
  return taskId ?? toolUseId;
}
