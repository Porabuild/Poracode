import type { GoalItemPayload, RuntimeEvent } from "@/shared/contracts";
import { startGoalItemEvents, updateGoalItemEvents } from "../../goalRuntime";
import type { AcpMapperState } from "./state";
import { newItemId } from "./state";

export const ACP_CANONICAL_GOAL_INPUT_KEY = "_poracodeCanonicalGoal";

export interface AcpCanonicalGoalUpdate {
  action: "updated";
  status: NonNullable<GoalItemPayload["status"]>;
}

export function readAcpCanonicalGoalUpdate(rawInput: unknown): AcpCanonicalGoalUpdate | undefined {
  if (!isRecord(rawInput)) return undefined;
  const marker = rawInput[ACP_CANONICAL_GOAL_INPUT_KEY];
  if (!isRecord(marker) || marker.action !== "updated") return undefined;
  if (!isGoalStatus(marker.status)) return undefined;
  return { action: "updated", status: marker.status };
}

export function mapAcpCanonicalGoalUpdate(
  state: AcpMapperState,
  update: AcpCanonicalGoalUpdate,
): RuntimeEvent[] {
  const payload: GoalItemPayload = {
    action: update.action,
    status: update.status,
    ...(state.activeGoalObjective ? { objective: state.activeGoalObjective } : {}),
  };
  state.activeGoalStatus = update.status;
  if (!state.activeGoalItemId) {
    state.activeGoalItemId = newItemId("goal");
    return startGoalItemEvents(state.threadId, state.activeGoalItemId, payload);
  }
  return updateGoalItemEvents(state.threadId, state.activeGoalItemId, payload);
}

export function mapAcpGoalSlashCommand(prompt: string, state: AcpMapperState): RuntimeEvent[] {
  const match = /^\/goal(?:\s+([\s\S]*))?$/iu.exec(prompt.trim());
  if (!match) return [];
  const args = match[1]?.trim() ?? "";
  const setMatch = /^set(?:\s+([\s\S]+))?$/iu.exec(args);

  if (setMatch) {
    const objective = setMatch[1]?.trim();
    if (!objective) return [];
    state.activeGoalItemId = newItemId("goal");
    state.activeGoalObjective = objective;
    state.activeGoalStatus = "active";
    return startGoalItemEvents(state.threadId, state.activeGoalItemId, {
      action: "set",
      objective,
      status: "active",
    });
  }

  if (args.toLowerCase() === "clear") {
    const itemId = state.activeGoalItemId ?? newItemId("goal");
    const events = state.activeGoalItemId
      ? updateGoalItemEvents(state.threadId, itemId, { action: "cleared" })
      : startGoalItemEvents(state.threadId, itemId, { action: "cleared" });
    delete state.activeGoalItemId;
    delete state.activeGoalObjective;
    delete state.activeGoalStatus;
    return events;
  }

  const status = args.toLowerCase();
  if (status !== "pause" && status !== "resume" && status !== "status" && args !== "") return [];
  if (!state.activeGoalItemId || !state.activeGoalObjective) return [];
  const nextStatus =
    status === "pause"
      ? "paused"
      : status === "resume"
        ? "active"
        : (state.activeGoalStatus ?? "active");
  state.activeGoalStatus = nextStatus;
  return updateGoalItemEvents(state.threadId, state.activeGoalItemId, {
    action: status === "status" || args === "" ? "viewed" : "updated",
    objective: state.activeGoalObjective,
    status: nextStatus,
  });
}

function isGoalStatus(value: unknown): value is NonNullable<GoalItemPayload["status"]> {
  return (
    value === "active" || value === "paused" || value === "budget_limited" || value === "complete"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
