import type { AgentStatus, ScheduledTask, ScheduledTaskInput } from "@/shared/contracts";

export type RepeatMode = "hourly" | "daily" | "weekdays" | "weekly" | "custom" | "once";

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
  runAt: string;
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

export function newScheduleDraft(agent: AgentStatus | undefined): ScheduleDraft {
  const model = agent?.capabilities.models[0]?.id ?? "";
  const efforts = model
    ? (agent?.capabilities.modelEfforts[model] ?? agent?.capabilities.efforts)
    : [];
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
    runAt: localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
  };
}

export function taskScheduleDraft(task: ScheduledTask): ScheduleDraft {
  const repeatMode =
    task.recurrence.kind === "hourly"
      ? "hourly"
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
    runAt:
      task.recurrence.kind === "once"
        ? localDateTimeInputValue(new Date(task.recurrence.runAt))
        : localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
  };
}

function daysForMode(draft: ScheduleDraft): number[] {
  if (draft.repeatMode === "daily") return [0, 1, 2, 3, 4, 5, 6];
  if (draft.repeatMode === "weekdays") return [1, 2, 3, 4, 5];
  if (draft.repeatMode === "weekly") return [draft.days[0] ?? 1];
  return draft.days;
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
    recurrence:
      draft.repeatMode === "once"
        ? { kind: "once", runAt: new Date(draft.runAt).toISOString() }
        : draft.repeatMode === "hourly"
          ? { kind: "hourly", minute: Number(draft.time.slice(3, 5)) }
          : { kind: "weekly", days: daysForMode(draft), time: draft.time },
    enabled: draft.enabled,
  };
}

export function scheduleDraftIsValid(draft: ScheduleDraft): boolean {
  return Boolean(
    draft.name.trim() &&
    draft.prompt.trim() &&
    draft.agentKind &&
    draft.model &&
    (draft.repeatMode === "once"
      ? Number.isFinite(new Date(draft.runAt).getTime())
      : draft.repeatMode === "custom" || draft.repeatMode === "weekly"
        ? draft.days.length > 0 && draft.time
        : draft.time),
  );
}

export function schedulePresetDraft(
  agent: AgentStatus | undefined,
  input: Pick<ScheduleDraft, "name" | "prompt" | "repeatMode" | "days" | "time">,
): ScheduleDraft {
  return { ...newScheduleDraft(agent), ...input };
}
