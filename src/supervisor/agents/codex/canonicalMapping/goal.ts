/**
 * Codex `thread/goal/*` → provider goal-state readers and identity tracking.
 */

import type { ProviderGoalState } from "../../goalRuntime";
import type { CodexMapperState } from "../canonicalMappingState";
import type { ThreadGoalStatus } from "../protocol";

const CODEX_GOAL_STATUS_MAP = {
  active: "active",
  paused: "paused",
  blocked: "paused",
  usageLimited: "budget_limited",
  budgetLimited: "budget_limited",
  complete: "complete",
} as const satisfies Record<ThreadGoalStatus, NonNullable<ProviderGoalState["status"]>>;

export function readCodexGoal(
  params: Record<string, unknown> | undefined,
): ProviderGoalState | undefined {
  const goal = params?.goal;
  if (!goal || typeof goal !== "object") return undefined;
  const record = goal as Record<string, unknown>;
  const objective = typeof record.objective === "string" ? record.objective.trim() : "";
  const status = readCodexGoalStatus(record.status);
  return {
    ...(typeof record.threadId === "string" ? { providerThreadId: record.threadId } : {}),
    ...(objective.length > 0 ? { objective } : {}),
    ...(status ? { status } : {}),
    ...(typeof record.tokenBudget === "number" || record.tokenBudget === null
      ? { tokenBudget: record.tokenBudget }
      : {}),
    ...(typeof record.tokensUsed === "number" ? { tokensUsed: record.tokensUsed } : {}),
    ...(typeof record.timeUsedSeconds === "number"
      ? { timeUsedSeconds: record.timeUsedSeconds }
      : {}),
    ...(typeof record.createdAt === "number" ? { createdAt: record.createdAt } : {}),
    ...(typeof record.updatedAt === "number" ? { updatedAt: record.updatedAt } : {}),
  };
}

export function readCodexGoalStatus(status: unknown): ProviderGoalState["status"] | undefined {
  return typeof status === "string" && status in CODEX_GOAL_STATUS_MAP
    ? CODEX_GOAL_STATUS_MAP[status as ThreadGoalStatus]
    : undefined;
}

export function isNewCodexGoal(goal: ProviderGoalState, state: CodexMapperState): boolean {
  if (goal.createdAt !== undefined && state.goalCreatedAt !== undefined) {
    return goal.createdAt !== state.goalCreatedAt;
  }
  return (
    goal.objective !== undefined &&
    state.goalObjective !== undefined &&
    goal.objective !== state.goalObjective
  );
}

export function updateCodexGoalIdentity(goal: ProviderGoalState, state: CodexMapperState): void {
  if (goal.createdAt !== undefined) state.goalCreatedAt = goal.createdAt;
  if (goal.objective !== undefined) state.goalObjective = goal.objective;
}
