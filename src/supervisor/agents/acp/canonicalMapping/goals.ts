/**
 * Provider-neutral goal metadata carried through ACP's `_meta` extension
 * point. Provider transforms translate their native goal lifecycle into this
 * shape before the shared canonical mapper sees it.
 */

import {
  goalControlActionSchema,
  type GoalItemPayload,
  type RuntimeEvent,
} from "@/shared/contracts";
import { startGoalItemEvents, updateGoalItemEvents } from "../../goalRuntime";
import type { AcpMapperState } from "./state";
import { newItemId } from "./state";

export const PORACODE_ACP_GOAL_META_KEY = "poracodeGoal";

export type AcpCanonicalGoalUpdate = GoalItemPayload;

export function mapAcpCanonicalGoalUpdate(update: unknown, state: AcpMapperState): RuntimeEvent[] {
  const payload = readAcpCanonicalGoalUpdate(update);
  if (!payload) return [];

  const existingItemId = state.goalItemId;
  const startsNewGoal = payload.action === "set" || !existingItemId;
  const itemId = startsNewGoal ? newItemId("goal") : existingItemId;
  const events = startsNewGoal
    ? startGoalItemEvents(state.threadId, itemId, payload)
    : updateGoalItemEvents(state.threadId, itemId, payload);

  if (payload.action === "cleared" || isTerminalGoalStatus(payload.status)) {
    delete state.goalItemId;
  } else {
    state.goalItemId = itemId;
  }
  return events;
}

function readAcpCanonicalGoalUpdate(update: unknown): AcpCanonicalGoalUpdate | undefined {
  const updateRecord = plainRecord(update);
  const meta = plainRecord(updateRecord._meta);
  const raw = plainRecord(meta[PORACODE_ACP_GOAL_META_KEY]);
  if (Object.keys(raw).length === 0) return undefined;

  const action = readEnum(raw.action, ["set", "updated", "cleared", "viewed"] as const);
  const status = readEnum(raw.status, [
    "active",
    "paused",
    "budget_limited",
    "complete",
    "failed",
    "cancelled",
  ] as const);
  const objective = readString(raw.objective);
  const availableActionsResult = goalControlActionSchema.array().safeParse(raw.availableActions);
  const availableActions = availableActionsResult.success ? availableActionsResult.data : undefined;
  if (!action && !status && !objective) return undefined;

  return {
    ...(action ? { action } : {}),
    ...(objective ? { objective } : {}),
    ...(status ? { status } : {}),
    ...(readNullableNonNegativeNumber(raw.tokenBudget) !== undefined
      ? { tokenBudget: readNullableNonNegativeNumber(raw.tokenBudget) }
      : {}),
    ...(readNonNegativeNumber(raw.tokensUsed) !== undefined
      ? { tokensUsed: readNonNegativeNumber(raw.tokensUsed)! }
      : {}),
    ...(readNonNegativeNumber(raw.timeUsedSeconds) !== undefined
      ? { timeUsedSeconds: readNonNegativeNumber(raw.timeUsedSeconds)! }
      : {}),
    ...(readNonNegativeInteger(raw.iterations) !== undefined
      ? { iterations: readNonNegativeInteger(raw.iterations)! }
      : {}),
    ...(readString(raw.lastReason) ? { lastReason: readString(raw.lastReason)! } : {}),
    ...(readString(raw.providerThreadId)
      ? { providerThreadId: readString(raw.providerThreadId)! }
      : {}),
    ...(availableActions ? { availableActions } : {}),
    ...(readFiniteNumber(raw.updatedAt) !== undefined
      ? { updatedAt: readFiniteNumber(raw.updatedAt)! }
      : {}),
  };
}

function isTerminalGoalStatus(status: GoalItemPayload["status"]): boolean {
  return status === "complete" || status === "failed" || status === "cancelled";
}

function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readEnum<const T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] | undefined {
  return typeof value === "string" && values.includes(value) ? (value as T[number]) : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  const number = readFiniteNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function readNullableNonNegativeNumber(value: unknown): number | null | undefined {
  return value === null ? null : readNonNegativeNumber(value);
}

function readNonNegativeInteger(value: unknown): number | undefined {
  const number = readNonNegativeNumber(value);
  return number !== undefined && Number.isInteger(number) ? number : undefined;
}
