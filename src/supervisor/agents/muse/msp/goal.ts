import type { GoalControlAction, GoalStatus } from "@/shared/contracts";

export function mapMuseGoalMetadata(rawStatus: string | undefined): {
  status: GoalStatus;
  availableActions: GoalControlAction[];
} {
  const normalized = (rawStatus ?? "active").toLowerCase();
  if (
    normalized === "active" ||
    normalized === "running" ||
    normalized === "inprogress" ||
    normalized === "in_progress"
  ) {
    return {
      status: "active",
      availableActions: [],
    };
  }
  if (
    normalized === "paused" ||
    normalized === "parked" ||
    normalized === "blocked" ||
    normalized === "waiting"
  ) {
    return {
      status: "paused",
      availableActions: [],
    };
  }
  if (
    normalized === "budget_limited" ||
    normalized === "budgetlimited" ||
    normalized === "usagelimited" ||
    normalized === "usage_limited"
  ) {
    return {
      status: "budget_limited",
      availableActions: [],
    };
  }
  if (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "success"
  ) {
    return {
      status: "complete",
      availableActions: [],
    };
  }
  if (normalized === "failed" || normalized === "error") {
    return {
      status: "failed",
      availableActions: [],
    };
  }
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "cleared") {
    return {
      status: "cancelled",
      availableActions: [],
    };
  }
  return {
    status: "active",
    availableActions: [],
  };
}
