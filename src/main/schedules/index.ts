import { dbDeleteSchedule, dbGetSchedule, dbGetSchedules, dbUpsertSchedule } from "../db";
import type { ScheduledTask } from "@/shared/contracts";
import { ScheduleService } from "./ScheduleService";
import type { ScheduleRunContext, ScheduleTaskRunner } from "./types";

export interface DeviceScheduleServiceOptions {
  /** Executes one due/manual run and resolves with its quick-glance summary. */
  runTask: ScheduleTaskRunner;
  cancelRun?: (runId: string) => boolean;
  recordSkipped?: (task: ScheduledTask, context: ScheduleRunContext) => void;
  onRetryingRun?: (runId: string) => void;
  /** Marks a schedule's dangling run rows interrupted after a restart. */
  onStartupInterrupted?: (scheduleId: string) => void;
}

export function createDeviceScheduleService(
  options: DeviceScheduleServiceOptions,
): ScheduleService {
  return new ScheduleService({
    store: {
      list: dbGetSchedules,
      get: dbGetSchedule,
      upsert: dbUpsertSchedule,
      delete: dbDeleteSchedule,
    },
    runTask: options.runTask,
    ...(options.cancelRun ? { cancelRun: options.cancelRun } : {}),
    ...(options.recordSkipped ? { recordSkipped: options.recordSkipped } : {}),
    ...(options.onRetryingRun ? { onRetryingRun: options.onRetryingRun } : {}),
    ...(options.onStartupInterrupted ? { onStartupInterrupted: options.onStartupInterrupted } : {}),
  });
}

export { ScheduleService, type ScheduleStore } from "./ScheduleService";
export { ScheduleRunCoordinator, type ScheduleRunCoordinatorDeps } from "./ScheduleRunCoordinator";
export type { ScheduleRunContext, ScheduleTaskExecutionOutcome, ScheduleTaskRunner } from "./types";
export { ensureHomeProjectRow, homeScopeLocation } from "./homeProject";
