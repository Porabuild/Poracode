import {
  dbDeleteSchedule,
  dbGetSchedule,
  dbGetSchedules,
  dbListScheduleRuns,
  dbGetScheduleRun,
  dbListScheduleRunInbox,
  dbGetUnreadScheduleRunCount,
  dbUpdateScheduleRunState,
  dbPatchScheduleRuntime,
  dbUpsertSchedule,
} from "@/host/db";
import type { ScheduleRunContext, ScheduleTaskRunner } from "./types";
import type { ScheduledTask } from "@/shared/contracts";
import { ScheduleService } from "./ScheduleService";

export interface DeviceScheduleServiceOptions {
  /** Executes one due/manual run and resolves with its quick-glance summary. */
  runTask: ScheduleTaskRunner;
  cancelRun?: (runId: string) => boolean;
  recordSkipped?: (task: ScheduledTask, context: ScheduleRunContext) => void;
  onRetryingRun?: (runId: string) => void;
  onRetryWaitFinished?: (runId: string, continuing: boolean) => void;
  /** Marks a schedule's dangling run rows interrupted after a restart. */
  onStartupInterrupted?: (scheduleId: string) => void;
  /** Report one failed background task without stopping healthy siblings. */
  onError?: (scheduleId: string, error: unknown) => void;
}

export function createDeviceScheduleService(
  options: DeviceScheduleServiceOptions,
): ScheduleService {
  return new ScheduleService({
    store: {
      list: dbGetSchedules,
      get: dbGetSchedule,
      upsert: dbUpsertSchedule,
      patchRuntime: dbPatchScheduleRuntime,
      delete: dbDeleteSchedule,
    },
    runTask: options.runTask,
    listRuns: dbListScheduleRuns,
    getRun: dbGetScheduleRun,
    listInbox: dbListScheduleRunInbox,
    unreadCount: dbGetUnreadScheduleRunCount,
    updateRunState: dbUpdateScheduleRunState,
    ...(options.cancelRun ? { cancelRun: options.cancelRun } : {}),
    ...(options.recordSkipped ? { recordSkipped: options.recordSkipped } : {}),
    ...(options.onRetryingRun ? { onRetryingRun: options.onRetryingRun } : {}),
    ...(options.onRetryWaitFinished ? { onRetryWaitFinished: options.onRetryWaitFinished } : {}),
    ...(options.onStartupInterrupted ? { onStartupInterrupted: options.onStartupInterrupted } : {}),
    ...(options.onError ? { onError: options.onError } : {}),
  });
}

export { ScheduleService, type ScheduleStore } from "./ScheduleService";
export { ScheduleRunCoordinator, type ScheduleRunCoordinatorDeps } from "./ScheduleRunCoordinator";
export { ensureHomeProjectRow } from "./homeProject";
export { homeScopeLocation } from "@/shared/homeScopeLocation";

export type { ScheduleRunContext, ScheduleTaskExecutionOutcome, ScheduleTaskRunner } from "./types";
