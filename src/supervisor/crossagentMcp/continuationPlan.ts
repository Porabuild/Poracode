import type { SessionRef } from "@/shared/contracts";
import { SubagentSpawnError } from "./errors";
import { prepareSubagentRun, type PreparedSubagentRun } from "./spawnPlan";
import type { SubagentRunStatus } from "./types";

export interface ContinuableRun {
  status: SubagentRunStatus;
  plan: PreparedSubagentRun;
  attemptIndex: number;
  sessionRef?: SessionRef;
  cancelRequested: boolean;
  resuming?: { background: boolean; cancelled: boolean };
  continuedBy?: string;
}

function hasCompletedSession(run: ContinuableRun): boolean {
  return (
    run.status === "completed" &&
    !run.cancelRequested &&
    !!run.sessionRef &&
    run.plan.attempts[run.attemptIndex]?.supportsResume === true
  );
}

export function canContinueRun(run: ContinuableRun): boolean {
  return hasCompletedSession(run) && !run.resuming && !run.continuedBy;
}

/** Validate current provider settings but retain the winning session's selection and scope. */
export function prepareContinuation(
  deps: Parameters<typeof prepareSubagentRun>[0],
  parent: Parameters<typeof prepareSubagentRun>[1],
  run: ContinuableRun,
  prompt: string,
  background: boolean,
): PreparedSubagentRun {
  if (run.continuedBy) {
    throw new SubagentSpawnError(
      `This worker already continued as run_id ${run.continuedBy}; use that run_id`,
    );
  }
  if (!hasCompletedSession(run)) {
    throw new SubagentSpawnError("This run has no completed, resumable worker session");
  }
  const attempt = run.plan.attempts[run.attemptIndex]!;
  const plan = prepareSubagentRun(deps, parent, {
    agent: attempt.provider,
    model: attempt.model,
    ...(attempt.config.effort ? { effort: attempt.config.effort } : {}),
    ...(attempt.config.fast === true ? { fast: true } : {}),
    ...(run.plan.resultMode ? { resultMode: run.plan.resultMode } : {}),
    prompt,
    background,
  });
  const next = plan.attempts[0]!;
  if (!next.supportsResume)
    throw new SubagentSpawnError("This provider no longer supports session resume");
  // A follow-up belongs to the original worker, even if parent settings changed.
  next.config = attempt.config;
  next.label = attempt.label;
  plan.projectLocation = run.plan.projectLocation;
  return plan;
}
