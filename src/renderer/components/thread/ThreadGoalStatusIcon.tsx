import { CircleCheckBig, CircleStop, CircleX, Target } from "lucide-react";
import type { GoalStatus } from "@/shared/contracts";

export function ThreadGoalStatusIcon({ status }: { status: GoalStatus }) {
  if (status === "active") {
    return (
      <span className="poracode-goal-active-icon shrink-0" aria-hidden="true">
        <span className="poracode-goal-active-icon__ring" />
        <Target className="size-3.5 text-white" />
      </span>
    );
  }

  const Icon =
    status === "complete"
      ? CircleCheckBig
      : status === "failed"
        ? CircleX
        : status === "cancelled"
          ? CircleStop
          : Target;
  const color =
    status === "complete"
      ? "text-success"
      : status === "failed"
        ? "text-danger"
        : "text-foreground-muted";

  return <Icon className={`size-3.5 shrink-0 ${color}`} aria-hidden="true" />;
}
