import type { GoalItemPayload, RuntimeEvent } from "@/shared/contracts";

export interface ProviderGoalState {
  providerThreadId?: string;
  objective?: string;
  status?: GoalItemPayload["status"];
  tokenBudget?: number | null;
  tokensUsed?: number;
  timeUsedSeconds?: number;
  iterations?: number;
  lastReason?: string;
  createdAt?: number;
  updatedAt?: number;
}

export function parseGoalSlashCommand(prompt: string): GoalItemPayload | undefined {
  const trimmed = prompt.trim();
  const match = /^\/goal(?:\s+([\s\S]*))?$/u.exec(trimmed);
  if (!match) return undefined;

  const rawArgs = match[1]?.trim() ?? "";
  if (rawArgs.length === 0) return { action: "viewed" };
  if (/^(clear|stop|off|reset|none|cancel)$/iu.test(rawArgs)) return { action: "cleared" };
  return {
    action: "set",
    objective: rawArgs,
    status: "active",
  };
}

export function goalPayloadFromProviderState(
  goal: ProviderGoalState,
  action: GoalItemPayload["action"] = "updated",
): GoalItemPayload {
  return {
    action,
    ...(goal.objective ? { objective: goal.objective } : {}),
    ...(goal.status ? { status: goal.status } : {}),
    ...(goal.tokenBudget !== undefined ? { tokenBudget: goal.tokenBudget } : {}),
    ...(goal.tokensUsed !== undefined ? { tokensUsed: goal.tokensUsed } : {}),
    ...(goal.timeUsedSeconds !== undefined ? { timeUsedSeconds: goal.timeUsedSeconds } : {}),
    ...(goal.iterations !== undefined ? { iterations: goal.iterations } : {}),
    ...(goal.lastReason ? { lastReason: goal.lastReason } : {}),
    ...(goal.providerThreadId ? { providerThreadId: goal.providerThreadId } : {}),
    ...(goal.updatedAt !== undefined ? { updatedAt: goal.updatedAt } : {}),
  };
}

export function startGoalItemEvents(
  threadId: string,
  itemId: string,
  payload: GoalItemPayload,
): RuntimeEvent[] {
  const startedPayload = withActiveGoalStartTiming(payload);
  return [
    {
      type: "item.started",
      threadId,
      itemId,
      itemType: "goal",
      payload: startedPayload,
    },
    { type: "item.completed", threadId, itemId },
  ];
}

export function updateGoalItemEvents(
  threadId: string,
  itemId: string,
  payload: GoalItemPayload,
): RuntimeEvent[] {
  const updatedPayload = withActiveGoalUpdateTiming(payload);
  return [
    {
      type: "item.updated",
      threadId,
      itemId,
      payload: updatedPayload,
    },
    { type: "item.completed", threadId, itemId },
  ];
}

function withActiveGoalStartTiming(payload: GoalItemPayload): GoalItemPayload {
  if (payload.status !== "active") return payload;
  if (payload.updatedAt !== undefined && payload.timeUsedSeconds !== undefined) return payload;
  return {
    ...payload,
    timeUsedSeconds: payload.timeUsedSeconds ?? 0,
    updatedAt: payload.updatedAt ?? Date.now() / 1000,
  };
}

function withActiveGoalUpdateTiming(payload: GoalItemPayload): GoalItemPayload {
  if (payload.status !== "active" || payload.updatedAt !== undefined) return payload;
  return {
    ...payload,
    updatedAt: Date.now() / 1000,
  };
}
