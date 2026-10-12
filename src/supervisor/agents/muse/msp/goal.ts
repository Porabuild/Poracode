import type { GoalControlAction, GoalStatus } from "@/shared/contracts";

/**
 * Live-observed Goal `status` vocabulary is `active | paused | complete`
 * (1.3.0, including the runtime's auto-complete at `percentComplete: 100`);
 * the schema carries it verbatim as a free string, so anything else is
 * normalized defensively below. Actions mirror the TUI's `/goal` verbs:
 * an active goal pauses, a paused one resumes, and `budget_limited` keeps
 * resume so the user can retry once limits reset. Terminal goals expose no
 * actions — the dock dismisses locally and a fresh `/goal <objective>`
 * replaces them (verified: `goal/set` overwrites in place).
 */
const MUSE_GOAL_ACTIONS: Record<GoalStatus, GoalControlAction[]> = {
  active: ["edit", "pause", "clear"],
  paused: ["edit", "resume", "clear"],
  budget_limited: ["edit", "resume", "clear"],
  complete: [],
  failed: [],
  cancelled: [],
};

export function mapMuseGoalMetadata(rawStatus: string | undefined): {
  status: GoalStatus;
  availableActions: GoalControlAction[];
} {
  const normalized = (rawStatus ?? "active").toLowerCase();
  let status: GoalStatus = "active";
  if (
    normalized === "paused" ||
    normalized === "parked" ||
    normalized === "blocked" ||
    normalized === "waiting"
  ) {
    status = "paused";
  } else if (
    normalized === "budget_limited" ||
    normalized === "budgetlimited" ||
    normalized === "usagelimited" ||
    normalized === "usage_limited"
  ) {
    status = "budget_limited";
  } else if (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "success"
  ) {
    status = "complete";
  } else if (normalized === "failed" || normalized === "error") {
    status = "failed";
  } else if (normalized === "cancelled" || normalized === "canceled" || normalized === "cleared") {
    status = "cancelled";
  }
  return {
    status,
    availableActions: [...MUSE_GOAL_ACTIONS[status]],
  };
}
