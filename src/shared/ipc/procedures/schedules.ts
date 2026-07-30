import {
  getScheduleRunsPayloadSchema,
  scheduleRunIdPayloadSchema,
  scheduleRunInboxQuerySchema,
  scheduleCompletionEvaluationInputSchema,
  scheduledTaskIdPayloadSchema,
  scheduledTaskInputSchema,
  updateScheduledTaskPayloadSchema,
  updateScheduleRunStatePayloadSchema,
  type GetScheduleRunsPayload,
  type GetScheduleRunsResult,
  type GetScheduleRunInboxResult,
  type AutomationsSnapshot,
  type ScheduleRunIdPayload,
  type ScheduleRunInboxQuery,
  type ScheduleCompletionEvaluationInput,
  type ScheduleCompletionEvaluationResult,
  type ScheduledTaskIdPayload,
  type ScheduledTaskInput,
  type ScheduledTask,
  type ScheduledTaskRun,
  type UpdateScheduleRunStatePayload,
  type UpdateScheduledTaskPayload,
} from "../../contracts";
import { defineNoArgProcedure, definePayloadProcedure } from "../core";

export const scheduleProcedures = {
  evaluateScheduleCompletion: definePayloadProcedure<
    ScheduleCompletionEvaluationInput,
    ScheduleCompletionEvaluationResult,
    "supervisor"
  >("evaluateScheduleCompletion", "supervisor", scheduleCompletionEvaluationInputSchema),
  getSchedules: defineNoArgProcedure<ScheduledTask[], "main-local">("getSchedules", "main-local"),
  getAutomationsSnapshot: definePayloadProcedure<
    ScheduleRunInboxQuery,
    AutomationsSnapshot,
    "main-local"
  >("getAutomationsSnapshot", "main-local", scheduleRunInboxQuerySchema),
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
  getScheduleRunInbox: definePayloadProcedure<
    ScheduleRunInboxQuery,
    GetScheduleRunInboxResult,
    "main-local"
  >("getScheduleRunInbox", "main-local", scheduleRunInboxQuerySchema),
  updateScheduleRunState: definePayloadProcedure<
    UpdateScheduleRunStatePayload,
    ScheduledTaskRun | null,
    "main-local"
  >("updateScheduleRunState", "main-local", updateScheduleRunStatePayloadSchema),
  cancelScheduleRun: definePayloadProcedure<ScheduleRunIdPayload, boolean, "main-local">(
    "cancelScheduleRun",
    "main-local",
    scheduleRunIdPayloadSchema,
  ),
} as const;
