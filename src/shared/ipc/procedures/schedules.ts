import {
  getScheduleRunsPayloadSchema,
  scheduledTaskIdPayloadSchema,
  scheduledTaskInputSchema,
  updateScheduledTaskPayloadSchema,
  type GetScheduleRunsPayload,
  type GetScheduleRunsResult,
  type ScheduledTaskIdPayload,
  type ScheduledTaskInput,
  type ScheduledTask,
  type UpdateScheduledTaskPayload,
} from "../../contracts";
import { defineNoArgProcedure, definePayloadProcedure } from "../core";

export const scheduleProcedures = {
  getSchedules: defineNoArgProcedure<ScheduledTask[], "main-local">("getSchedules", "main-local"),
  createSchedule: definePayloadProcedure<ScheduledTaskInput, ScheduledTask, "main-local">(
    "createSchedule",
    "main-local",
    scheduledTaskInputSchema,
  ),
  updateSchedule: definePayloadProcedure<UpdateScheduledTaskPayload, ScheduledTask, "main-local">(
    "updateSchedule",
    "main-local",
    updateScheduledTaskPayloadSchema,
  ),
  deleteSchedule: definePayloadProcedure<ScheduledTaskIdPayload, void, "main-local">(
    "deleteSchedule",
    "main-local",
    scheduledTaskIdPayloadSchema,
  ),
  runScheduleNow: definePayloadProcedure<ScheduledTaskIdPayload, ScheduledTask, "main-local">(
    "runScheduleNow",
    "main-local",
    scheduledTaskIdPayloadSchema,
  ),
  getScheduleRuns: definePayloadProcedure<
    GetScheduleRunsPayload,
    GetScheduleRunsResult,
    "main-local"
  >("getScheduleRuns", "main-local", getScheduleRunsPayloadSchema),
} as const;
