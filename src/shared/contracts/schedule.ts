import { z } from "zod";
import { agentKindSchema, projectLocationSchema } from "./common";

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);
const NUMERIC_CRON_FIELD = /^[\d*,/-]+$/u;
const CRON_FIELD_BOUNDS = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
] as const;

export function normalizeCronExpression(expression: string): string {
  return expression.trim().split(/\s+/u).join(" ");
}

export function isValidScheduleTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function isValidCronField(field: string, min: number, max: number): boolean {
  return field.split(",").every((part) => {
    const [range, step, extra] = part.split("/");
    if (!range || extra !== undefined) return false;
    if (
      step !== undefined &&
      (!/^\d+$/u.test(step) || Number(step) < 1 || Number(step) > max - min + 1)
    ) {
      return false;
    }
    if (range === "*") return true;

    const match = /^(\d+)(?:-(\d+))?$/u.exec(range);
    if (!match) return false;
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    return start >= min && start <= max && end >= start && end <= max;
  });
}

export function isValidFiveFieldCronExpression(expression: string): boolean {
  const fields = normalizeCronExpression(expression).split(" ");
  return (
    fields.length === CRON_FIELD_BOUNDS.length &&
    fields.every((field, index) => {
      const bounds = CRON_FIELD_BOUNDS[index]!;
      return NUMERIC_CRON_FIELD.test(field) && isValidCronField(field, bounds[0], bounds[1]);
    })
  );
}

const scheduleTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(isValidScheduleTimeZone, "Invalid IANA time zone.");

export const scheduleRecurrenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hourly"),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    kind: z.literal("weekly"),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    time: localTimeSchema,
    timeZone: scheduleTimeZoneSchema.optional(),
  }),
  z.object({
    kind: z.literal("once"),
    runAt: z.iso.datetime(),
  }),
  z.object({
    kind: z.literal("interval"),
    every: z.number().int().min(1).max(999),
    unit: z.enum(["minutes", "hours", "days"]),
  }),
  z.object({
    kind: z.literal("cron"),
    expression: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(isValidFiveFieldCronExpression, "Invalid five-field cron expression."),
    timeZone: scheduleTimeZoneSchema,
  }),
]);
export type ScheduleRecurrence = z.infer<typeof scheduleRecurrenceSchema>;

const SCHEDULE_RUN_STATUSES = [
  "running",
  "waiting-for-approval",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "skipped",
] as const;

export const scheduledTaskRunStatusSchema = z.enum(["never", ...SCHEDULE_RUN_STATUSES]);
export type ScheduledTaskRunStatus = z.infer<typeof scheduledTaskRunStatusSchema>;

export const scheduledTaskConfigSchema = z.object({
  model: z.string().min(1),
  effort: z.string().optional(),
  fast: z.boolean().optional(),
});
export type ScheduledTaskConfig = z.infer<typeof scheduledTaskConfigSchema>;

export const scheduleExecutionModeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new-thread") }),
  z.object({ kind: z.literal("heartbeat"), targetThreadId: z.string().min(1) }),
]);
export type ScheduleExecutionMode = z.infer<typeof scheduleExecutionModeSchema>;

export const scheduleRetryPolicySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("fixed"),
    maxAttempts: z.number().int().min(2).max(6),
    delaySeconds: z.number().int().min(1).max(3_600),
  }),
  z.object({
    kind: z.literal("exponential"),
    maxAttempts: z.number().int().min(2).max(6),
    initialDelaySeconds: z.number().int().min(1).max(3_600),
    maxDelaySeconds: z.number().int().min(1).max(3_600),
  }),
]);
export type ScheduleRetryPolicy = z.infer<typeof scheduleRetryPolicySchema>;

export const scheduleMisfirePolicySchema = z.enum(["skip", "coalesce", "run-latest"]);
export type ScheduleMisfirePolicy = z.infer<typeof scheduleMisfirePolicySchema>;

export const scheduleCompletionPolicySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("ai-evaluated"),
    stopWhen: z.string().trim().min(1).max(2_000),
    confidenceThreshold: z.number().min(0).max(1),
  }),
]);
export type ScheduleCompletionPolicy = z.infer<typeof scheduleCompletionPolicySchema>;

export const scheduleAutomationSchema = z
  .object({
    version: z.literal(1),
    mode: scheduleExecutionModeSchema,
    maxRuntimeSeconds: z.number().int().min(60).max(86_400),
    maxIterations: z.number().int().min(1).max(100).nullable(),
    stopOnError: z.boolean(),
    misfirePolicy: scheduleMisfirePolicySchema,
    retryPolicy: scheduleRetryPolicySchema,
    completionPolicy: scheduleCompletionPolicySchema,
  })
  .superRefine((automation, context) => {
    if (automation.mode.kind !== "heartbeat" && automation.completionPolicy.kind !== "none") {
      context.addIssue({
        code: "custom",
        message: "Completion conditions are only supported for heartbeat automations.",
        path: ["completionPolicy"],
      });
    }
    if (
      automation.retryPolicy.kind === "exponential" &&
      automation.retryPolicy.maxDelaySeconds < automation.retryPolicy.initialDelaySeconds
    ) {
      context.addIssue({
        code: "custom",
        message: "Maximum retry delay must be at least the initial delay.",
        path: ["retryPolicy", "maxDelaySeconds"],
      });
    }
  });
export type ScheduleAutomation = z.infer<typeof scheduleAutomationSchema>;

export const DEFAULT_SCHEDULE_AUTOMATION: ScheduleAutomation = {
  version: 1,
  mode: { kind: "new-thread" },
  maxRuntimeSeconds: 3_600,
  maxIterations: null,
  stopOnError: false,
  misfirePolicy: "coalesce",
  retryPolicy: { kind: "none" },
  completionPolicy: { kind: "none" },
};

export function resolveScheduleAutomation(
  automation: ScheduleAutomation | undefined,
): ScheduleAutomation {
  return automation ?? DEFAULT_SCHEDULE_AUTOMATION;
}

export const scheduledTaskInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(50_000),
  agentKind: agentKindSchema,
  config: scheduledTaskConfigSchema,
  recurrence: scheduleRecurrenceSchema,
  enabled: z.boolean(),
  automation: scheduleAutomationSchema.optional(),
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
  iterationCount: z.number().int().nonnegative().optional(),
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
 * summary), which additionally has a "never" sentinel.
 */
export const scheduleRunStatusSchema = z.enum(SCHEDULE_RUN_STATUSES);
export type ScheduleRunStatus = z.infer<typeof scheduleRunStatusSchema>;

export const scheduleRunOutcomeSchema = z.enum([
  "findings",
  "no-findings",
  "changed-files",
  "needs-attention",
  "unknown",
]);
export type ScheduleRunOutcome = z.infer<typeof scheduleRunOutcomeSchema>;

export const scheduleCompletionEvaluationResultSchema = z.object({
  stopMatched: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(1_000),
});
export type ScheduleCompletionEvaluationResult = z.infer<
  typeof scheduleCompletionEvaluationResultSchema
>;

export const scheduleCompletionEvaluationSchema = scheduleCompletionEvaluationResultSchema.extend({
  condition: z.string().trim().min(1).max(2_000),
  evaluatedAt: z.iso.datetime(),
});
export type ScheduleCompletionEvaluation = z.infer<typeof scheduleCompletionEvaluationSchema>;

export const scheduleRunResultSchema = z.object({
  outcome: scheduleRunOutcomeSchema,
  summary: z.string().max(2_000).nullable(),
  severity: z.enum(["info", "warning", "error"]),
  unread: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  changedFiles: z.array(z.string()).max(100),
  stopReason: z.string().max(1_000).nullable(),
  completionEvaluation: scheduleCompletionEvaluationSchema.optional(),
});
export type ScheduleRunResult = z.infer<typeof scheduleRunResultSchema>;

export const scheduleRunTriggerSchema = z.enum(["manual", "scheduled", "retry"]);
export type ScheduleRunTrigger = z.infer<typeof scheduleRunTriggerSchema>;

/**
 * One execution of a scheduled task, linked to the real GUI thread it created.
 * A schedule keeps a bounded history of these (newest first) alongside its
 * quick-glance `lastStatus`/`lastResult` summary.
 */
export const scheduledTaskRunSchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid(),
  threadId: z.string().min(1),
  scheduledFor: z.iso.datetime(),
  trigger: scheduleRunTriggerSchema,
  attempt: z.number().int().positive(),
  iteration: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  status: scheduleRunStatusSchema,
  summary: z.string().nullable(),
  error: z.string().nullable(),
  result: scheduleRunResultSchema.nullable(),
  automationSnapshot: scheduleAutomationSchema,
});
export type ScheduledTaskRun = z.infer<typeof scheduledTaskRunSchema>;

export const getScheduleRunsPayloadSchema = z.object({ id: z.string().uuid() });
export type GetScheduleRunsPayload = z.infer<typeof getScheduleRunsPayloadSchema>;

/** Run history for one schedule, newest first (capped). */
export type GetScheduleRunsResult = ScheduledTaskRun[];

export const scheduleRunInboxQuerySchema = z.object({
  filter: z.enum(["unread", "all", "archived"]),
  limit: z.number().int().min(1).max(100).optional(),
});
export type ScheduleRunInboxQuery = z.infer<typeof scheduleRunInboxQuerySchema>;
export type GetScheduleRunInboxResult = ScheduledTaskRun[];

export interface AutomationsSnapshot {
  schedules: ScheduledTask[];
  runs: ScheduledTaskRun[];
  unreadCount: number;
}

export const updateScheduleRunStatePayloadSchema = z
  .object({
    id: z.string().uuid(),
    unread: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((payload) => payload.unread !== undefined || payload.archived !== undefined, {
    message: "At least one run state field is required.",
  });
export type UpdateScheduleRunStatePayload = z.infer<typeof updateScheduleRunStatePayloadSchema>;

export const scheduleRunIdPayloadSchema = z.object({ id: z.string().uuid() });
export type ScheduleRunIdPayload = z.infer<typeof scheduleRunIdPayloadSchema>;

export const scheduleCompletionEvaluationInputSchema = z.object({
  projectLocation: projectLocationSchema,
  agentKind: agentKindSchema,
  config: scheduledTaskConfigSchema,
  condition: z.string().trim().min(1).max(2_000),
  summary: z.string().max(2_000).nullable(),
  changedFiles: z.array(z.string()).max(100),
});
export type ScheduleCompletionEvaluationInput = z.infer<
  typeof scheduleCompletionEvaluationInputSchema
>;
