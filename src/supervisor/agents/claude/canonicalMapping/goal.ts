import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, TurnState } from "@/shared/contracts";
import { readNonNegativeInteger } from "../../contextUsage";
import { goalPayloadFromProviderState, updateGoalItemEvents } from "../../goalRuntime";
import type { ClaudeMapperState } from "../sdkCanonicalMappingState";
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
  resetActiveGoalTokenAccounting(state);
}

export function completeActiveGoalEvents(
  state: ClaudeMapperState,
  message: Extract<SDKMessage, { type: "result" }>,
  turnState: TurnState,
): RuntimeEvent[] {
  const goalItemId = state.activeGoalItemId;
  const objective = state.activeGoalObjective;
  const startedAtMs = state.activeGoalStartedAtMs;
  if (!goalItemId || !objective || startedAtMs === undefined) return [];

  const nowMs = Date.now();
  const usage = readClaudeResultUsage(message);
  if (usage !== undefined) {
    state.activeGoalCompletedTurnTokensUsed =
      (state.activeGoalCompletedTurnTokensUsed ?? 0) + usage;
  }
  const totalTokensUsed = activeGoalAggregateTokens(state);
  const elapsedSeconds = Math.max(0, Math.round((nowMs - startedAtMs) / 1000));

  if (turnState === "interrupted") {
    const payload = goalPayloadFromProviderState(
      {
        objective,
        status: "active",
        ...(totalTokensUsed !== undefined ? { tokensUsed: totalTokensUsed } : {}),
        timeUsedSeconds: elapsedSeconds,
        updatedAt: nowMs / 1000,
      },
      "updated",
    );
    return [
      {
        type: "item.updated",
        threadId: state.threadId,
        itemId: goalItemId,
        payload,
      },
    ];
  }

  clearActiveGoal(state);

  const payload = goalPayloadFromProviderState(
    {
      objective,
      status: "complete",
      ...(totalTokensUsed !== undefined ? { tokensUsed: totalTokensUsed } : {}),
      timeUsedSeconds: elapsedSeconds,
      updatedAt: nowMs / 1000,
    },
    "updated",
  );
  return updateGoalItemEvents(state.threadId, goalItemId, payload);
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
  const aggregateTokens = activeGoalAggregateTokens(state);
  if (aggregateTokens === undefined) return undefined;
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - state.activeGoalStartedAtMs) / 1000));
  const payload = goalPayloadFromProviderState(
    {
      objective: state.activeGoalObjective,
      status: "active",
      tokensUsed: aggregateTokens,
      timeUsedSeconds: elapsedSeconds,
      updatedAt: Date.now() / 1000,
    },
    "updated",
  );
  return {
    type: "item.updated",
    threadId: state.threadId,
    itemId: state.activeGoalItemId,
    payload,
  };
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
