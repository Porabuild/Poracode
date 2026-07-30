import type {
  ScheduleCompletionPolicy,
  ScheduleRunResult,
  ScheduleRunStatus,
  ScheduleRunTrigger,
  ScheduledTask,
} from "@/shared/contracts";

export interface ScheduleRunContext {
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

export type ScheduleTaskRunner = (
  task: ScheduledTask,
  context: ScheduleRunContext,
) => Promise<ScheduleTaskExecutionOutcome | string>;
