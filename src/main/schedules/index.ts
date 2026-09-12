import {
  dbDeleteSchedule,
  dbGetSchedule,
  dbGetSchedules,
  dbListScheduleRuns,
  dbUpsertSchedule,
} from "../db";
import type { ScheduledTask } from "@/shared/contracts";
import { ScheduleService } from "./ScheduleService";

export interface DeviceScheduleServiceOptions {
  /** Executes one due/manual run and resolves with its quick-glance summary. */
  runTask: (task: ScheduledTask) => Promise<string>;
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
    listRuns: dbListScheduleRuns,
    ...(options.onStartupInterrupted ? { onStartupInterrupted: options.onStartupInterrupted } : {}),
  });
}

export { ScheduleService, type ScheduleStore } from "./ScheduleService";
export { ScheduleRunCoordinator, type ScheduleRunCoordinatorDeps } from "./ScheduleRunCoordinator";
export { ensureHomeProjectRow } from "./homeProject";
export { homeScopeLocation } from "@/shared/homeScopeLocation";
