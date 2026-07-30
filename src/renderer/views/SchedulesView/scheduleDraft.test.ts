import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEDULE_AUTOMATION, type ScheduledTask } from "@/shared/contracts";
import {
  deviceTimeZone,
  newScheduleDraft,
  scheduleDraftAutomation,
  scheduleDraftAutomationIsValid,
  scheduleDraftInput,
  scheduleDraftIsValid,
  scheduleDraftNextRunAt,
  scheduleDraftNextRunIsDesktopCalculated,
  taskScheduleDraft,
} from "./scheduleDraft";

const baseTask: ScheduledTask = {
  id: "d2ac39e9-14ac-4776-9279-37a1e455a5db",
  name: "Daily brief",
  prompt: "Summarize my priorities.",
  agentKind: "claude:home",
  config: { model: "claude-fable-5", effort: "high" },
  recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
  enabled: true,
  nextRunAt: null,
  lastRunAt: null,
  lastCompletedAt: null,
  lastStatus: "never",
  lastResult: null,
  lastError: null,
  createdAt: "2026-07-10T12:00:00.000Z",
  updatedAt: "2026-07-10T12:00:00.000Z",
};

describe("scheduleDraft projectId", () => {
  it("defaults new drafts to the Home scope (null)", () => {
    expect(newScheduleDraft(undefined).projectId).toBeNull();
    expect(scheduleDraftInput(newScheduleDraft(undefined)).projectId).toBeNull();
  });

  it("round-trips a task's projectId through the draft", () => {
    const projectId = "22222222-2222-4222-8222-222222222222";
    const draft = taskScheduleDraft({ ...baseTask, projectId });
    expect(draft.projectId).toBe(projectId);
    expect(scheduleDraftInput(draft).projectId).toBe(projectId);
  });

  it("treats a task without a projectId as Home", () => {
    const draft = taskScheduleDraft(baseTask);
    expect(draft.projectId).toBeNull();
    expect(scheduleDraftInput(draft).projectId).toBeNull();
  });
});

describe("scheduleDraft recurrence", () => {
  it("adds the current time zone to new wall-clock schedules", () => {
    const draft = newScheduleDraft(undefined);
    expect(draft.timeZone).toBe(deviceTimeZone());
    expect(scheduleDraftInput(draft).recurrence).toEqual({
      kind: "weekly",
      days: [1, 2, 3, 4, 5],
      time: "08:00",
      timeZone: deviceTimeZone(),
    });
  });

  it("preserves legacy desktop-local weekly schedules", () => {
    const draft = taskScheduleDraft({
      ...baseTask,
      nextRunAt: "2026-07-13T15:00:00.000Z",
    });

    expect(draft).toMatchObject({
      timeZone: "device-local",
    });
    expect(scheduleDraftInput(draft).recurrence).toEqual(baseTask.recurrence);
    expect(scheduleDraftNextRunAt(draft, Date.parse("2026-07-10T12:00:00.000Z"))).toBe(
      "2026-07-13T15:00:00.000Z",
    );
    expect(
      scheduleDraftNextRunAt({ ...draft, time: "09:00" }, Date.parse("2026-07-10T12:00:00.000Z")),
    ).toBeNull();
    expect(scheduleDraftNextRunIsDesktopCalculated({ ...draft, time: "09:00" })).toBe(true);
    expect(scheduleDraftInput({ ...draft, repeatMode: "cron" }).recurrence).toEqual({
      kind: "cron",
      expression: "0 9 * * 1-5",
      timeZone: deviceTimeZone(),
    });
    expect(scheduleDraftInput({ ...draft, repeatMode: "weekdays" }).recurrence).toEqual(
      baseTask.recurrence,
    );
    expect(
      scheduleDraftNextRunAt(
        { ...draft, repeatMode: "interval", intervalEvery: "30" },
        Date.parse("2026-07-10T12:00:00.000Z"),
      ),
    ).toBe("2026-07-10T12:30:00.000Z");
    expect(
      scheduleDraftNextRunIsDesktopCalculated({ ...draft, repeatMode: "once", runAt: "" }),
    ).toBe(false);
    expect(
      scheduleDraftInput({
        ...draft,
        timeZone: "UTC",
      }).recurrence,
    ).toEqual({ ...baseTask.recurrence, timeZone: "UTC" });
  });

  it("round-trips interval schedules", () => {
    const draft = taskScheduleDraft({
      ...baseTask,
      recurrence: { kind: "interval", every: 6, unit: "hours" },
    });

    expect(draft).toMatchObject({
      repeatMode: "interval",
      intervalEvery: "6",
      intervalUnit: "hours",
    });
    expect(scheduleDraftInput(draft).recurrence).toEqual({
      kind: "interval",
      every: 6,
      unit: "hours",
    });
  });

  it("previews an existing interval from its stored cadence", () => {
    const draft = taskScheduleDraft({
      ...baseTask,
      recurrence: { kind: "interval", every: 30, unit: "minutes" },
      nextRunAt: "2026-07-10T12:30:00.000Z",
    });

    expect(scheduleDraftNextRunAt(draft, Date.parse("2026-07-10T12:10:00.000Z"))).toBe(
      "2026-07-10T12:30:00.000Z",
    );
    expect(scheduleDraftNextRunAt(draft, Date.parse("2026-07-10T12:47:00.000Z"))).toBe(
      "2026-07-10T13:00:00.000Z",
    );
  });

  it("round-trips cron schedules with their time zone", () => {
    const draft = taskScheduleDraft({
      ...baseTask,
      recurrence: {
        kind: "cron",
        expression: "0 9 * * 1-5",
        timeZone: "America/New_York",
      },
    });

    expect(draft).toMatchObject({
      repeatMode: "cron",
      cronExpression: "0 9 * * 1-5",
      timeZone: "America/New_York",
    });
    expect(scheduleDraftInput(draft).recurrence).toEqual({
      kind: "cron",
      expression: "0 9 * * 1-5",
      timeZone: "America/New_York",
    });
  });

  it("rejects invalid interval and cron values", () => {
    const draft = {
      ...taskScheduleDraft(baseTask),
      repeatMode: "interval" as const,
      intervalEvery: "0",
    };
    expect(scheduleDraftIsValid(draft)).toBe(false);
    expect(
      scheduleDraftIsValid({
        ...draft,
        repeatMode: "cron",
        cronExpression: "not a cron expression",
      }),
    ).toBe(false);

    const longCron = `${Array.from({ length: 60 }, (_, minute) => minute).join(",")} * * * *`;
    expect(scheduleDraftIsValid({ ...draft, repeatMode: "cron", cronExpression: longCron })).toBe(
      false,
    );
    expect(
      scheduleDraftIsValid({
        ...newScheduleDraft(undefined),
        name: "Daily brief",
        prompt: "Summarize priorities",
        agentKind: "codex",
        model: "gpt-5.6",
        cronExpression: longCron,
      }),
    ).toBe(true);
  });
});

describe("scheduleDraft automation", () => {
  it("adds safe single-pass defaults to new and legacy schedules", () => {
    const fresh = newScheduleDraft(undefined);
    expect(fresh).toMatchObject({
      automationMode: "new-thread",
      maxRuntimeMinutes: "60",
      misfirePolicy: "coalesce",
      retryKind: "none",
      completionKind: "none",
    });
    expect(scheduleDraftAutomation(fresh)).toEqual(DEFAULT_SCHEDULE_AUTOMATION);

    const legacy = taskScheduleDraft(baseTask);
    expect(scheduleDraftInput(legacy).automation).toEqual(DEFAULT_SCHEDULE_AUTOMATION);
  });

  it("round-trips heartbeat guardrails, retries, and an AI stop condition", () => {
    const automation = {
      version: 1 as const,
      mode: { kind: "heartbeat" as const, targetThreadId: "thread-1" },
      maxRuntimeSeconds: 2_700,
      maxIterations: 12,
      stopOnError: true,
      misfirePolicy: "run-latest" as const,
      retryPolicy: {
        kind: "exponential" as const,
        maxAttempts: 4,
        initialDelaySeconds: 15,
        maxDelaySeconds: 240,
      },
      completionPolicy: {
        kind: "ai-evaluated" as const,
        stopWhen: "The release is ready to ship.",
        confidenceThreshold: 0.85,
      },
    };
    const draft = taskScheduleDraft({ ...baseTask, automation });

    expect(draft).toMatchObject({
      automationMode: "heartbeat",
      heartbeatTargetThreadId: "thread-1",
      maxRuntimeMinutes: "45",
      maxIterations: "12",
      stopOnError: true,
      misfirePolicy: "run-latest",
      retryKind: "exponential",
      retryMaxAttempts: "4",
      retryInitialDelaySeconds: "15",
      retryMaxDelaySeconds: "240",
      completionKind: "ai-evaluated",
      stopWhen: "The release is ready to ship.",
      completionConfidencePercent: "85",
    });
    expect(scheduleDraftInput(draft).automation).toEqual(automation);
    expect(scheduleDraftAutomationIsValid(draft)).toBe(true);
  });

  it("preserves an unlimited heartbeat iteration count", () => {
    const automation = {
      ...DEFAULT_SCHEDULE_AUTOMATION,
      mode: { kind: "heartbeat" as const, targetThreadId: "thread-1" },
    };
    const draft = taskScheduleDraft({ ...baseTask, automation });

    expect(draft.maxIterations).toBe("");
    expect(scheduleDraftAutomation(draft).maxIterations).toBeNull();
  });

  it("preserves common limits while removing heartbeat-only completion in single-pass mode", () => {
    const draft = {
      ...taskScheduleDraft(baseTask),
      automationMode: "new-thread" as const,
      maxRuntimeMinutes: "1.5",
      maxIterations: "25",
      retryKind: "fixed" as const,
      retryMaxAttempts: "3",
      retryDelaySeconds: "20",
      completionKind: "ai-evaluated" as const,
      stopWhen: "Done",
    };

    expect(scheduleDraftAutomation(draft)).toEqual({
      version: 1,
      mode: { kind: "new-thread" },
      maxRuntimeSeconds: 90,
      maxIterations: 25,
      stopOnError: false,
      misfirePolicy: "coalesce",
      retryPolicy: { kind: "fixed", maxAttempts: 3, delaySeconds: 20 },
      completionPolicy: { kind: "none" },
    });
  });

  it("rejects invalid heartbeat targets, limits, retries, and completion policies", () => {
    const heartbeat = {
      ...taskScheduleDraft(baseTask),
      automationMode: "heartbeat" as const,
      heartbeatTargetThreadId: "thread-1",
      maxIterations: "10",
    };

    expect(scheduleDraftAutomationIsValid({ ...heartbeat, heartbeatTargetThreadId: "" })).toBe(
      false,
    );
    expect(scheduleDraftAutomationIsValid({ ...heartbeat, maxRuntimeMinutes: "0" })).toBe(false);
    expect(scheduleDraftAutomationIsValid({ ...heartbeat, maxIterations: "101" })).toBe(false);
    expect(
      scheduleDraftAutomationIsValid({
        ...heartbeat,
        retryKind: "fixed",
        retryMaxAttempts: "1",
      }),
    ).toBe(false);
    expect(
      scheduleDraftAutomationIsValid({
        ...heartbeat,
        retryKind: "exponential",
        retryMaxAttempts: "3",
        retryInitialDelaySeconds: "60",
        retryMaxDelaySeconds: "30",
      }),
    ).toBe(false);
    expect(
      scheduleDraftAutomationIsValid({
        ...heartbeat,
        completionKind: "ai-evaluated",
        stopWhen: "",
      }),
    ).toBe(false);
    expect(
      scheduleDraftAutomationIsValid({
        ...heartbeat,
        completionKind: "ai-evaluated",
        stopWhen: "Done",
        completionConfidencePercent: "101",
      }),
    ).toBe(false);
  });
});
