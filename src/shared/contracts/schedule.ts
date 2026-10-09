import { z } from "zod";
import { modelSelectionSchema } from "../selectionBinding.schemas.ts";
import { agentKindSchema } from "./common";

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);

export const scheduleRecurrenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hourly"),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    kind: z.literal("weekly"),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    time: localTimeSchema,
  }),
  z.object({
    kind: z.literal("once"),
    runAt: z.iso.datetime(),
  }),
]);
export type ScheduleRecurrence = z.infer<typeof scheduleRecurrenceSchema>;

export const scheduledTaskRunStatusSchema = z.enum(["never", "running", "succeeded", "failed"]);
export type ScheduledTaskRunStatus = z.infer<typeof scheduledTaskRunStatusSchema>;

/**
 * A schedule's (and a PR watch's helper-agent) model configuration: the
 * canonical complete utility selection with the schedule's existing nonempty
 * `model` rule. Replaces the previous separate model/effort/fast object — the
 * remaining carriers (`thinking`/`contextSize`) and a recognized selection
 * binding now survive into schedules and PR watches instead of being stripped,
 * and falsy carriers (`effort: ""`, `fast: false`) stay exact. Inherited by
 * `prWatchInputSchema`/`prWatchAgentSyncSchema` (see `./prWatch`).
 */
export const scheduledTaskConfigSchema = modelSelectionSchema.extend({
  model: z.string().min(1),
});
export type ScheduledTaskConfig = z.infer<typeof scheduledTaskConfigSchema>;

export const scheduledTaskInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(50_000),
  agentKind: agentKindSchema,
  config: scheduledTaskConfigSchema,
  recurrence: scheduleRecurrenceSchema,
  enabled: z.boolean(),
  /**
   * Project the run's GUI thread is created in. `null`/omitted means the
   * built-in "Home" scope (see `HOME_PROJECT_ID`); a value must reference an
   * existing project row at run time or the run fails.
   */
  projectId: z.string().nullable().optional(),
});
export type ScheduledTaskInput = z.infer<typeof scheduledTaskInputSchema>;

export const scheduledTaskSchema = scheduledTaskInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  nextRunAt: z.iso.datetime().nullable(),
  lastRunAt: z.iso.datetime().nullable(),
  lastCompletedAt: z.iso.datetime().nullable(),
  lastStatus: scheduledTaskRunStatusSchema,
  lastResult: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type ScheduledTask = z.infer<typeof scheduledTaskSchema>;

export const updateScheduledTaskPayloadSchema = z.object({
  id: z.string().uuid(),
  task: scheduledTaskInputSchema,
});
export type UpdateScheduledTaskPayload = z.infer<typeof updateScheduledTaskPayloadSchema>;

export const scheduledTaskIdPayloadSchema = z.object({ id: z.string().uuid() });
export type ScheduledTaskIdPayload = z.infer<typeof scheduledTaskIdPayloadSchema>;

/**
 * Lifecycle of a single scheduled run, tracked per {@link scheduledTaskRunSchema}.
 * Distinct from {@link scheduledTaskRunStatusSchema} (the schedule's quick-glance
 * summary), which additionally has a "never" sentinel and no "interrupted".
 */
export const scheduleRunStatusSchema = z.enum(["running", "succeeded", "failed", "interrupted"]);
export type ScheduleRunStatus = z.infer<typeof scheduleRunStatusSchema>;

/**
 * One execution of a scheduled task, linked to the real GUI thread it created.
 * A schedule keeps a bounded history of these (newest first) alongside its
 * quick-glance `lastStatus`/`lastResult` summary.
 */
export const scheduledTaskRunSchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid(),
  threadId: z.string().uuid(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  status: scheduleRunStatusSchema,
  summary: z.string().nullable(),
  error: z.string().nullable(),
});
export type ScheduledTaskRun = z.infer<typeof scheduledTaskRunSchema>;

export const getScheduleRunsPayloadSchema = z.object({ id: z.string().uuid() });
export type GetScheduleRunsPayload = z.infer<typeof getScheduleRunsPayloadSchema>;

/** Run history for one schedule, newest first (capped). */
export type GetScheduleRunsResult = ScheduledTaskRun[];
