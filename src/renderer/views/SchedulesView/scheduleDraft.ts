import {
  resolveScheduleAutomation,
  scheduleAutomationSchema,
  scheduleRecurrenceSchema,
  type AgentStatus,
  type ScheduleAutomation,
  type ScheduleCompletionPolicy,
  type ScheduleMisfirePolicy,
  type ScheduleRetryPolicy,
  type ScheduledTask,
  type ScheduledTaskInput,
  type ScheduleRecurrence,
  type Thread,
} from "@/shared/contracts";
import { advanceScheduleRunAt, nextScheduleRunAt } from "@/shared/schedules";
import { HOME_PROJECT_ID } from "@/shared/homeScope";

export type RepeatMode =
  | "hourly"
  | "interval"
  | "daily"
  | "weekdays"
  | "weekly"
  | "custom"
  | "cron"
  | "once";
export type IntervalUnit = "minutes" | "hours" | "days";
export type ScheduleAutomationMode = ScheduleAutomation["mode"]["kind"];
export type ScheduleRetryKind = ScheduleRetryPolicy["kind"];
export type ScheduleCompletionKind = ScheduleCompletionPolicy["kind"];
export const DEVICE_LOCAL_TIME_ZONE = "device-local";

export interface ScheduleDraft {
  id?: string;
  name: string;
  prompt: string;
  agentKind: string;
  model: string;
  effort: string;
  fast: boolean;
  enabled: boolean;
  /** Target project for the run's thread; `null` = the built-in "Home" scope. */
  projectId: string | null;
  repeatMode: RepeatMode;
  days: number[];
  time: string;
  timeZone: string;
  intervalEvery: string;
  intervalUnit: IntervalUnit;
  cronExpression: string;
  runAt: string;
  originalRecurrence: ScheduleRecurrence | null;
  currentNextRunAt: string | null;
  automationMode: ScheduleAutomationMode;
  heartbeatTargetThreadId: string;
  maxRuntimeMinutes: string;
  maxIterations: string;
  stopOnError: boolean;
  misfirePolicy: ScheduleMisfirePolicy;
  retryKind: ScheduleRetryKind;
  retryMaxAttempts: string;
  retryDelaySeconds: string;
  retryInitialDelaySeconds: string;
  retryMaxDelaySeconds: string;
  completionKind: ScheduleCompletionKind;
  stopWhen: string;
  completionConfidencePercent: string;
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function localDateTimeInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Localized short weekday names indexed by JS day-of-week (0 = Sunday). Builds
 * one formatter and reuses it across all seven days; 2026-01-04 is a Sunday, so
 * day 0..6 maps to Sun..Sat.
 */
export function weekdayShortNames(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, day) => formatter.format(new Date(2026, 0, 4 + day)));
}

function automationDraftFields(automation: ScheduleAutomation) {
  return {
    automationMode: automation.mode.kind,
    heartbeatTargetThreadId:
      automation.mode.kind === "heartbeat" ? automation.mode.targetThreadId : "",
    maxRuntimeMinutes: String(automation.maxRuntimeSeconds / 60),
    maxIterations: automation.maxIterations === null ? "" : String(automation.maxIterations),
    stopOnError: automation.stopOnError,
    misfirePolicy: automation.misfirePolicy,
    retryKind: automation.retryPolicy.kind,
    retryMaxAttempts:
      automation.retryPolicy.kind === "none" ? "3" : String(automation.retryPolicy.maxAttempts),
    retryDelaySeconds:
      automation.retryPolicy.kind === "fixed" ? String(automation.retryPolicy.delaySeconds) : "60",
    retryInitialDelaySeconds:
      automation.retryPolicy.kind === "exponential"
        ? String(automation.retryPolicy.initialDelaySeconds)
        : "30",
    retryMaxDelaySeconds:
      automation.retryPolicy.kind === "exponential"
        ? String(automation.retryPolicy.maxDelaySeconds)
        : "300",
    completionKind: automation.completionPolicy.kind,
    stopWhen:
      automation.completionPolicy.kind === "ai-evaluated"
        ? automation.completionPolicy.stopWhen
        : "",
    completionConfidencePercent:
      automation.completionPolicy.kind === "ai-evaluated"
        ? String(automation.completionPolicy.confidenceThreshold * 100)
        : "80",
  };
}

export function newScheduleDraft(agent: AgentStatus | undefined): ScheduleDraft {
  const model = agent?.capabilities.models[0]?.id ?? "";
  const efforts = model
    ? (agent?.capabilities.modelEfforts[model] ?? agent?.capabilities.efforts)
    : [];
  const automation = automationDraftFields(resolveScheduleAutomation(undefined));
  return {
    name: "",
    prompt: "",
    agentKind: agent?.kind ?? "",
    model,
    effort: agent?.capabilities.defaultEffort ?? efforts?.[0] ?? "",
    fast: false,
    enabled: true,
    projectId: null,
    repeatMode: "weekdays",
    days: [1, 2, 3, 4, 5],
    time: "08:00",
    timeZone: deviceTimeZone(),
    intervalEvery: "30",
    intervalUnit: "minutes",
    cronExpression: "0 9 * * 1-5",
    runAt: localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
    originalRecurrence: null,
    currentNextRunAt: null,
    ...automation,
  };
}

export function taskScheduleDraft(task: ScheduledTask): ScheduleDraft {
  const automation = automationDraftFields(resolveScheduleAutomation(task.automation));
  const repeatMode =
    task.recurrence.kind === "hourly"
      ? "hourly"
      : task.recurrence.kind === "interval"
        ? "interval"
        : task.recurrence.kind === "cron"
          ? "cron"
          : task.recurrence.kind === "once"
            ? "once"
            : task.recurrence.days.length === 7
              ? "daily"
              : task.recurrence.days.join(",") === "1,2,3,4,5"
                ? "weekdays"
                : task.recurrence.days.length === 1
                  ? "weekly"
                  : "custom";
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    agentKind: task.agentKind,
    model: task.config.model,
    effort: task.config.effort ?? "",
    fast: task.config.fast ?? false,
    enabled: task.enabled,
    projectId: task.projectId ?? null,
    repeatMode,
    days: task.recurrence.kind === "weekly" ? task.recurrence.days : [1, 2, 3, 4, 5],
    time:
      task.recurrence.kind === "weekly"
        ? task.recurrence.time
        : task.recurrence.kind === "hourly"
          ? `00:${String(task.recurrence.minute).padStart(2, "0")}`
          : "08:00",
    timeZone:
      task.recurrence.kind === "weekly" || task.recurrence.kind === "cron"
        ? (task.recurrence.timeZone ?? DEVICE_LOCAL_TIME_ZONE)
        : deviceTimeZone(),
    intervalEvery: task.recurrence.kind === "interval" ? String(task.recurrence.every) : "30",
    intervalUnit: task.recurrence.kind === "interval" ? task.recurrence.unit : "minutes",
    cronExpression: task.recurrence.kind === "cron" ? task.recurrence.expression : "0 9 * * 1-5",
    runAt:
      task.recurrence.kind === "once"
        ? localDateTimeInputValue(new Date(task.recurrence.runAt))
        : localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
    originalRecurrence: task.recurrence,
    currentNextRunAt: task.nextRunAt,
    ...automation,
  };
}

function daysForMode(draft: ScheduleDraft): number[] {
  if (draft.repeatMode === "daily") return [0, 1, 2, 3, 4, 5, 6];
  if (draft.repeatMode === "weekdays") return [1, 2, 3, 4, 5];
  if (draft.repeatMode === "weekly") return [draft.days[0] ?? 1];
  return draft.days;
}

export function scheduleDraftRecurrence(draft: ScheduleDraft): ScheduleRecurrence {
  if (draft.repeatMode === "once") {
    return { kind: "once", runAt: new Date(draft.runAt).toISOString() };
  }
  if (draft.repeatMode === "hourly") {
    return { kind: "hourly", minute: Number(draft.time.slice(3, 5)) };
  }
  if (draft.repeatMode === "interval") {
    return {
      kind: "interval",
      every: Number(draft.intervalEvery),
      unit: draft.intervalUnit,
    };
  }
  if (draft.repeatMode === "cron") {
    return {
      kind: "cron",
      expression: draft.cronExpression.trim(),
      timeZone: draft.timeZone === DEVICE_LOCAL_TIME_ZONE ? deviceTimeZone() : draft.timeZone,
    };
  }
  return {
    kind: "weekly",
    days: daysForMode(draft),
    time: draft.time,
    ...(draft.timeZone === DEVICE_LOCAL_TIME_ZONE ? {} : { timeZone: draft.timeZone }),
  };
}

export function scheduleDraftInput(draft: ScheduleDraft): ScheduledTaskInput {
  return {
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    agentKind: draft.agentKind,
    projectId: draft.projectId,
    config: {
      model: draft.model,
      ...(draft.effort ? { effort: draft.effort } : {}),
      ...(draft.fast ? { fast: true } : {}),
    },
    recurrence: scheduleDraftRecurrence(draft),
    automation: scheduleDraftAutomation(draft),
    enabled: draft.enabled,
  };
}

export function scheduleDraftAutomation(draft: ScheduleDraft): ScheduleAutomation {
  const retryPolicy: ScheduleRetryPolicy =
    draft.retryKind === "fixed"
      ? {
          kind: "fixed",
          maxAttempts: Number(draft.retryMaxAttempts),
          delaySeconds: Number(draft.retryDelaySeconds),
        }
      : draft.retryKind === "exponential"
        ? {
            kind: "exponential",
            maxAttempts: Number(draft.retryMaxAttempts),
            initialDelaySeconds: Number(draft.retryInitialDelaySeconds),
            maxDelaySeconds: Number(draft.retryMaxDelaySeconds),
          }
        : { kind: "none" };
  const heartbeat = draft.automationMode === "heartbeat";

  return {
    version: 1,
    mode: heartbeat
      ? { kind: "heartbeat", targetThreadId: draft.heartbeatTargetThreadId }
      : { kind: "new-thread" },
    maxRuntimeSeconds: Number(draft.maxRuntimeMinutes) * 60,
    maxIterations: draft.maxIterations !== "" ? Number(draft.maxIterations) : null,
    stopOnError: draft.stopOnError,
    misfirePolicy: draft.misfirePolicy,
    retryPolicy,
    completionPolicy:
      heartbeat && draft.completionKind === "ai-evaluated"
        ? {
            kind: "ai-evaluated",
            stopWhen: draft.stopWhen.trim(),
            confidenceThreshold: Number(draft.completionConfidencePercent) / 100,
          }
        : { kind: "none" },
  };
}

export function scheduleDraftAutomationIsValid(draft: ScheduleDraft): boolean {
  return scheduleAutomationSchema.safeParse(scheduleDraftAutomation(draft)).success;
}

export function scheduleDraftRecurrenceIsValid(draft: ScheduleDraft): boolean {
  return scheduleDraftPreview(draft).recurrenceIsValid;
}

/** A thread is a valid heartbeat target when it lives in the draft's project as
 * an active GUI conversation for the same agent. */
export function isHeartbeatTargetThread(thread: Thread, draft: ScheduleDraft): boolean {
  return (
    thread.projectId === (draft.projectId ?? HOME_PROJECT_ID) &&
    thread.agentKind === draft.agentKind &&
    thread.presentationMode === "gui" &&
    !thread.archived
  );
}

export function scheduleDraftNextRunAt(draft: ScheduleDraft, afterMs = Date.now()): string | null {
  return scheduleDraftPreview(draft, afterMs).nextRunAt;
}

export function scheduleDraftNextRunIsDesktopCalculated(draft: ScheduleDraft): boolean {
  return scheduleDraftPreview(draft).nextRunIsDesktopCalculated;
}

export function scheduleDraftPreview(draft: ScheduleDraft, afterMs = Date.now()) {
  const invalid = {
    recurrenceIsValid: false,
    nextRunAt: null,
    nextRunIsDesktopCalculated: false,
  } as const;
  if (draft.repeatMode === "cron" && draft.cronExpression.length > 120) return invalid;

  try {
    const recurrence = scheduleDraftRecurrence(draft);
    if (!scheduleRecurrenceSchema.safeParse(recurrence).success) return invalid;

    if (
      draft.timeZone === DEVICE_LOCAL_TIME_ZONE &&
      draft.originalRecurrence?.kind === "weekly" &&
      recurrence.kind === "weekly"
    ) {
      const unchanged = legacyWeeklyRecurrenceIsUnchanged(draft, recurrence);
      return {
        recurrenceIsValid: true,
        nextRunAt: unchanged ? draft.currentNextRunAt : null,
        nextRunIsDesktopCalculated: !unchanged,
      } as const;
    }

    if (
      recurrence.kind === "interval" &&
      draft.originalRecurrence?.kind === "interval" &&
      recurrence.every === draft.originalRecurrence.every &&
      recurrence.unit === draft.originalRecurrence.unit &&
      draft.currentNextRunAt
    ) {
      const scheduledAt = Date.parse(draft.currentNextRunAt);
      return {
        recurrenceIsValid: true,
        nextRunAt:
          scheduledAt > afterMs
            ? draft.currentNextRunAt
            : advanceScheduleRunAt(recurrence, scheduledAt, afterMs),
        nextRunIsDesktopCalculated: false,
      } as const;
    }

    return {
      recurrenceIsValid: true,
      nextRunAt: nextScheduleRunAt(recurrence, afterMs),
      nextRunIsDesktopCalculated: false,
    } as const;
  } catch {
    return invalid;
  }
}

function legacyWeeklyRecurrenceIsUnchanged(
  draft: ScheduleDraft,
  recurrence: Extract<ScheduleRecurrence, { kind: "weekly" }>,
): boolean {
  const original = draft.originalRecurrence;
  return (
    original?.kind === "weekly" &&
    recurrence.time === original.time &&
    recurrence.days.length === original.days.length &&
    recurrence.days.every((day, index) => day === original.days[index])
  );
}

export function scheduleDraftIsValid(
  draft: ScheduleDraft,
  recurrenceIsValid = scheduleDraftRecurrenceIsValid(draft),
): boolean {
  return Boolean(
    draft.name.trim() &&
    draft.prompt.trim() &&
    draft.agentKind &&
    draft.model &&
    recurrenceIsValid &&
    scheduleDraftAutomationIsValid(draft),
  );
}

export function schedulePresetDraft(
  agent: AgentStatus | undefined,
  input: Pick<ScheduleDraft, "name" | "prompt" | "repeatMode" | "days" | "time">,
): ScheduleDraft {
  return { ...newScheduleDraft(agent), ...input };
}
