import type {
  ScheduleCompletionPolicy,
  ScheduleRunResult,
  ScheduleRunStatus,
  ScheduleRunTrigger,
  ScheduledTask,
} from "@/shared/contracts";

export interface ScheduleRunContext {
  signal?: AbortSignal;
  scheduledFor: string;
  trigger: ScheduleRunTrigger;
  attempt: number;
  iteration: number;
}

export interface ScheduleTaskExecutionOutcome {
  runId: string;
  status: Exclude<ScheduleRunStatus, "running">;
  summary: string | null;
  error: string | null;
  result: ScheduleRunResult;
  stopMatched: boolean;
  completionPolicySnapshot: ScheduleCompletionPolicy;
}

/** The work may have completed; retrying a failed ledger write could replay it. */
export class ScheduleRunPersistenceError extends Error {}

export type ScheduleTaskRunner = (
  task: ScheduledTask,
  context: ScheduleRunContext,
) => Promise<ScheduleTaskExecutionOutcome | string>;
