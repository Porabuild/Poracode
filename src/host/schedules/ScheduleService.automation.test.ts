import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SCHEDULE_AUTOMATION,
  type ScheduledTask,
  type ScheduledTaskInput,
} from "@/shared/contracts";
import {
  ScheduleService,
  type ScheduleServiceOptions,
  type ScheduleStore,
} from "./ScheduleService";
import { ScheduleRunPersistenceError, type ScheduleTaskExecutionOutcome } from "./types";

function memoryStore(): ScheduleStore {
  const tasks = new Map<string, ScheduledTask>();
  return {
    list: () => [...tasks.values()],
    get: (id) => tasks.get(id) ?? null,
    upsert: (task) => tasks.set(task.id, task),
    patchRuntime: (id, patch) => {
      const task = tasks.get(id);
      if (task) tasks.set(id, { ...task, ...patch });
    },
    delete: (id) => {
      tasks.delete(id);
    },
  };
}

const input: ScheduledTaskInput = {
  name: "Daily brief",
  prompt: "Summarize today's priorities.",
  agentKind: "claude:home",
  config: { model: "claude-fable-5", effort: "high" },
  recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
  enabled: true,
};

function executionOutcome(
  overrides: Partial<ScheduleTaskExecutionOutcome> = {},
): ScheduleTaskExecutionOutcome {
  return {
    runId: "run-1",
    status: "succeeded",
    summary: "Done",
    error: null,
    stopMatched: false,
    completionPolicySnapshot: { kind: "none" },
    result: {
      outcome: "findings",
      summary: "Done",
      severity: "info",
      unread: true,
      archivedAt: null,
      changedFiles: [],
      stopReason: null,
    },
    ...overrides,
  };
}

describe("ScheduleService", () => {
  it("backs off refused starts without delaying siblings, and clears the delay after an edit", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.parse("2026-07-10T12:00:00.000Z"));
      const store = memoryStore();
      const onError = vi.fn<NonNullable<ScheduleServiceOptions["onError"]>>();
      const runTask = vi.fn<ScheduleServiceOptions["runTask"]>().mockResolvedValue("Done");
      const service = new ScheduleService({ store, runTask, onError });
      service.start();
      const blocked = service.create({
        ...input,
        recurrence: { kind: "once", runAt: new Date(Date.now() + 100).toISOString() },
      });
      const healthy = service.create({
        ...input,
        recurrence: { kind: "once", runAt: new Date(Date.now() + 200).toISOString() },
      });
      const upsert = store.upsert.bind(store);
      let refuse = true;
      vi.spyOn(store, "upsert").mockImplementation((task) => {
        if (refuse && task.id === blocked.id && task.lastStatus === "running")
          throw new Error("Protected selection");
        upsert(task);
      });
      await vi.advanceTimersByTimeAsync(100);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(runTask).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(runTask).toHaveBeenCalledWith(
        expect.objectContaining({ id: healthy.id }),
        expect.anything(),
      );
      await vi.advanceTimersByTimeAsync(2_000);
      expect(onError).toHaveBeenCalledTimes(1);
      refuse = false;
      service.update(blocked.id, {
        ...input,
        recurrence: { kind: "once", runAt: new Date(Date.now() + 100).toISOString() },
      });
      await vi.advanceTimersByTimeAsync(100);
      expect(runTask).toHaveBeenCalledTimes(2);
      expect(store.get(blocked.id)?.lastStatus).toBe("succeeded");
      service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["match", "evaluation-error", "turn-error", "throw"] as const)(
    "does not stop an edited heartbeat after its previous run returns %s",
    async (ending) => {
      const store = memoryStore();
      const pending = Promise.withResolvers<ScheduleTaskExecutionOutcome>();
      const service = new ScheduleService({ store, runTask: () => pending.promise });
      const automation = {
        ...DEFAULT_SCHEDULE_AUTOMATION,
        mode: { kind: "heartbeat" as const, targetThreadId: "A" },
        stopOnError: true,
        completionPolicy: {
          kind: "ai-evaluated" as const,
          stopWhen: "Done",
          confidenceThreshold: 0.9,
        },
      };
      const task = service.create({ ...input, automation });
      service.runNow(task.id);
      service.update(task.id, {
        ...input,
        prompt: "Inspect B",
        automation: { ...automation, mode: { kind: "heartbeat", targetThreadId: "B" } },
      });
      if (ending === "throw") pending.reject(new Error("Old turn failed"));
      else
        pending.resolve(
          executionOutcome({
            status: ending === "match" ? "succeeded" : "failed",
            stopMatched: ending === "match",
            completionPolicySnapshot: automation.completionPolicy,
            result: {
              ...executionOutcome().result,
              stopReason: ending === "evaluation-error" ? "completion-evaluation-error" : null,
            },
          }),
        );
      await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).not.toBe("running"));
      expect(store.get(task.id)).toMatchObject({
        enabled: true,
        prompt: "Inspect B",
        iterationCount: 0,
      });
      expect(store.get(task.id)?.nextRunAt).not.toBeNull();
      service.dispose();
    },
  );

  it("preserves re-enablement while an earlier run completes", async () => {
    const store = memoryStore();
    const pending = Promise.withResolvers<ScheduleTaskExecutionOutcome>();
    const service = new ScheduleService({ store, runTask: () => pending.promise });
    const automation = { ...DEFAULT_SCHEDULE_AUTOMATION, maxIterations: 1, stopOnError: true };
    const task = service.create({ ...input, automation });
    service.runNow(task.id);
    service.update(task.id, { ...input, automation, enabled: false });
    service.update(task.id, { ...input, automation, enabled: true });
    pending.resolve(executionOutcome({ status: "failed", error: "Old turn failed" }));
    await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("failed"));
    expect(store.get(task.id)).toMatchObject({ enabled: true, iterationCount: 0 });
    service.dispose();
  });

  it.each(["match", "evaluation-error", "delete"])(
    "keeps the saved stop policy after a rejected %s mutation",
    async (ending) => {
      const store = memoryStore();
      const pending = Promise.withResolvers<ScheduleTaskExecutionOutcome>();
      const service = new ScheduleService({ store, runTask: () => pending.promise });
      const automation = {
        ...DEFAULT_SCHEDULE_AUTOMATION,
        mode: { kind: "heartbeat" as const, targetThreadId: "A" },
        completionPolicy: {
          kind: "ai-evaluated" as const,
          stopWhen: "Done",
          confidenceThreshold: 0.9,
        },
      };
      const task = service.create({ ...input, automation });
      service.runNow(task.id);
      let mutate: () => void;
      if (ending === "delete") {
        vi.spyOn(store, "delete").mockImplementationOnce(() => {
          throw new Error("Mutation refused");
        });
        mutate = () => service.delete(task.id);
      } else {
        vi.spyOn(store, "upsert").mockImplementationOnce(() => {
          throw new Error("Mutation refused");
        });
        mutate = () =>
          service.update(task.id, {
            ...input,
            prompt: "Inspect B",
            automation: { ...automation, mode: { kind: "heartbeat", targetThreadId: "B" } },
          });
      }
      expect(mutate).toThrow("Mutation refused");
      pending.resolve(
        executionOutcome({
          status: ending === "evaluation-error" ? "failed" : "succeeded",
          stopMatched: ending !== "evaluation-error",
          completionPolicySnapshot: automation.completionPolicy,
          result: {
            ...executionOutcome().result,
            stopReason:
              ending === "evaluation-error"
                ? "completion-evaluation-error"
                : "completion-condition",
          },
        }),
      );
      await vi.waitFor(() => expect(store.get(task.id)?.enabled).toBe(false));
      expect(store.get(task.id)?.prompt).toBe(input.prompt);
      expect(store.get(task.id)?.nextRunAt).toBeNull();
      service.dispose();
    },
  );
  it("creates device schedules with a future next run and no project fields", () => {
    const now = new Date(2026, 6, 6, 7, 0).getTime();
    const service = new ScheduleService({
      store: memoryStore(),
      runTask: vi.fn<() => Promise<string>>(),
      now: () => now,
    });
    const task = service.create(input);

    expect(task.nextRunAt).toBe(new Date(2026, 6, 6, 8, 0).toISOString());
    expect(task).not.toHaveProperty("projectId");
    expect(task.lastStatus).toBe("never");
  });

  it("coalesces overlapping due runs and advances to the next occurrence", async () => {
    const store = memoryStore();
    let now = new Date(2026, 6, 6, 7, 0).getTime();
    let resolveRun!: (output: string) => void;
    const runTask = vi.fn<() => Promise<string>>(
      () => new Promise<string>((resolve) => (resolveRun = resolve)),
    );
    const service = new ScheduleService({ store, runTask, now: () => now });
    const task = service.create(input);

    now = new Date(2026, 6, 6, 8, 0).getTime();
    service.tick();
    service.tick();
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(store.get(task.id)?.lastStatus).toBe("running");
    expect(store.get(task.id)?.nextRunAt).toBe(new Date(2026, 6, 7, 8, 0).toISOString());

    now += 1_000;
    resolveRun("Done");
    await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("succeeded"));
    expect(store.get(task.id)?.lastResult).toBe("Done");
  });

  it("coalesces overlapping interval runs and advances from the due tick", async () => {
    const store = memoryStore();
    let now = Date.parse("2026-07-10T12:00:00.000Z");
    let resolveRun!: (output: string) => void;
    const runTask = vi.fn<() => Promise<string>>(
      () => new Promise<string>((resolve) => (resolveRun = resolve)),
    );
    const service = new ScheduleService({ store, runTask, now: () => now });
    const task = service.create({
      ...input,
      recurrence: { kind: "interval", every: 30, unit: "minutes" },
    });

    expect(task.nextRunAt).toBe("2026-07-10T12:30:00.000Z");
    now = Date.parse("2026-07-10T12:30:00.000Z");
    service.tick();
    service.tick();
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(store.get(task.id)?.nextRunAt).toBe("2026-07-10T13:00:00.000Z");

    resolveRun("Done");
    await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("succeeded"));
  });

  it("keeps an interval anchored when a due tick is late", () => {
    const store = memoryStore();
    let now = Date.parse("2026-07-10T12:00:00.000Z");
    const service = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>().mockResolvedValue("Done"),
      now: () => now,
    });
    const task = service.create({
      ...input,
      recurrence: { kind: "interval", every: 30, unit: "minutes" },
    });

    now = Date.parse("2026-07-10T12:47:00.000Z");
    service.tick();

    expect(store.get(task.id)?.nextRunAt).toBe("2026-07-10T13:00:00.000Z");
  });

  it("coalesces a missed interval once after restart", () => {
    const store = memoryStore();
    let now = Date.parse("2026-07-10T12:00:00.000Z");
    const seed = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      now: () => now,
    });
    const task = seed.create({
      ...input,
      recurrence: { kind: "interval", every: 30, unit: "minutes" },
    });

    now = Date.parse("2026-07-10T12:10:00.000Z");
    const beforeDue = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      now: () => now,
    });
    beforeDue.start();
    expect(store.get(task.id)?.nextRunAt).toBe("2026-07-10T12:30:00.000Z");
    beforeDue.dispose();

    now = Date.parse("2026-07-10T13:05:00.000Z");
    const afterMissedRuns = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      now: () => now,
    });
    afterMissedRuns.start();
    expect(store.get(task.id)?.nextRunAt).toBe("2026-07-10T12:30:00.000Z");
    afterMissedRuns.dispose();
  });

  it("keeps an interval anchored when unrelated fields are updated", () => {
    const store = memoryStore();
    let now = Date.parse("2026-07-10T12:00:00.000Z");
    const service = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      now: () => now,
    });
    const task = service.create({
      ...input,
      recurrence: { kind: "interval", every: 30, unit: "minutes" },
    });

    now = Date.parse("2026-07-10T12:10:00.000Z");
    const updated = service.update(task.id, {
      ...input,
      name: "Renamed brief",
      recurrence: { kind: "interval", every: 30, unit: "minutes" },
    });

    expect(updated.nextRunAt).toBe("2026-07-10T12:30:00.000Z");
  });

  it("normalizes weekly days and cron whitespace", () => {
    const service = new ScheduleService({
      store: memoryStore(),
      runTask: vi.fn<() => Promise<string>>(),
      now: () => Date.parse("2026-07-10T12:00:00.000Z"),
    });
    const weekly = service.create({
      ...input,
      recurrence: {
        kind: "weekly",
        days: [5, 1, 5],
        time: "09:00",
        timeZone: " America/New_York ",
      },
    });
    const cron = service.create({
      ...input,
      recurrence: {
        kind: "cron",
        expression: "  0   9  * * 1-5  ",
        timeZone: " Europe/London ",
      },
    });

    expect(weekly.recurrence).toEqual({
      kind: "weekly",
      days: [1, 5],
      time: "09:00",
      timeZone: "America/New_York",
    });
    expect(cron.recurrence).toEqual({
      kind: "cron",
      expression: "0 9 * * 1-5",
      timeZone: "Europe/London",
    });
  });

  it("adapts and reschedules its timer after schedule mutations", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.parse("2026-07-10T12:00:00.000Z");
      vi.setSystemTime(now);
      const store = memoryStore();
      const runTask = vi.fn<() => Promise<string>>().mockResolvedValue("Done");
      const service = new ScheduleService({ store, runTask, tickIntervalMs: 300_000 });
      service.start();

      const task = service.create({
        ...input,
        recurrence: { kind: "once", runAt: new Date(now + 10_000).toISOString() },
      });
      service.update(task.id, {
        ...input,
        recurrence: { kind: "once", runAt: new Date(now + 1_000).toISOString() },
      });
      const deleted = service.create({
        ...input,
        recurrence: { kind: "once", runAt: new Date(now + 500).toISOString() },
      });
      service.delete(deleted.id);

      await vi.advanceTimersByTimeAsync(999);
      expect(runTask).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(runTask).toHaveBeenCalledTimes(1);
      service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not busy-loop while an overlapping manual run is active", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.parse("2026-07-10T12:00:00.000Z");
      vi.setSystemTime(now);
      const store = memoryStore();
      const list = vi.spyOn(store, "list");
      let resolveManual!: (output: string) => void;
      const runTask = vi
        .fn<() => Promise<string>>()
        .mockImplementationOnce(() => new Promise<string>((resolve) => (resolveManual = resolve)))
        .mockResolvedValue("Automatic run");
      const service = new ScheduleService({ store, runTask, tickIntervalMs: 300_000 });
      service.start();
      const task = service.create({
        ...input,
        recurrence: { kind: "interval", every: 1, unit: "minutes" },
      });

      service.runNow(task.id);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(runTask).toHaveBeenCalledTimes(1);
      const listCallsWhileDue = list.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(list).toHaveBeenCalledTimes(listCallsWhileDue);

      resolveManual("Manual run");
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(49);
      expect(runTask).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(runTask).toHaveBeenCalledTimes(2);
      service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks dangling runs interrupted for tasks left running on startup", () => {
    const store = memoryStore();
    const now = new Date(2026, 6, 6, 9, 0).getTime();
    const service = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      now: () => now,
    });
    const task = service.create(input);
    // Simulate a prior process that died mid-run.
    store.upsert({ ...service.list()[0]!, lastStatus: "running" });

    const onStartupInterrupted = vi.fn<(scheduleId: string) => void>();
    const restarted = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      onStartupInterrupted,
      now: () => now,
    });
    restarted.start();

    expect(onStartupInterrupted).toHaveBeenCalledWith(task.id);
    expect(store.get(task.id)?.lastStatus).toBe("interrupted");
    restarted.dispose();
  });

  it("sweeps orphan run rows even when the latest task was not running", () => {
    const store = memoryStore();
    const now = new Date(2026, 6, 6, 9, 0).getTime();
    const seed = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      now: () => now,
    });
    seed.create(input);

    const onStartupInterrupted = vi.fn<(scheduleId: string) => void>();
    const service = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      onStartupInterrupted,
      now: () => now,
    });
    service.start();

    expect(onStartupInterrupted).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it("does not resurrect a task deleted while its run is in flight", async () => {
    const store = memoryStore();
    let resolveRun!: (output: string) => void;
    const service = new ScheduleService({
      store,
      runTask: () => new Promise<string>((resolve) => (resolveRun = resolve)),
      now: () => new Date(2026, 6, 6, 7, 0).getTime(),
    });
    const task = service.create(input);
    service.runNow(task.id);
    service.delete(task.id);
    resolveRun("Late result");
    await Promise.resolve();
    expect(store.get(task.id)).toBeNull();
  });

  it("retries failed runs with the configured fixed delay", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.parse("2026-07-10T12:00:00.000Z");
      vi.setSystemTime(now);
      const store = memoryStore();
      const runTask = vi
        .fn<ScheduleServiceOptions["runTask"]>()
        .mockResolvedValueOnce(
          executionOutcome({
            status: "failed",
            error: "Temporary failure",
            result: {
              ...executionOutcome().result,
              outcome: "needs-attention",
              severity: "error",
              stopReason: "runtime-error",
            },
          }),
        )
        .mockResolvedValueOnce(executionOutcome({ runId: "run-2" }));
      const onRetryingRun = vi.fn<NonNullable<ScheduleServiceOptions["onRetryingRun"]>>();
      const service = new ScheduleService({ store, runTask, onRetryingRun });
      const task = service.create({
        ...input,
        automation: {
          ...DEFAULT_SCHEDULE_AUTOMATION,
          retryPolicy: { kind: "fixed", maxAttempts: 2, delaySeconds: 10 },
        },
      });

      service.runNow(task.id);
      await Promise.resolve();
      expect(runTask).toHaveBeenCalledTimes(1);
      expect(onRetryingRun).toHaveBeenCalledWith("run-1");
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("succeeded"));
      expect(runTask).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({ trigger: "retry", attempt: 2, iteration: 1 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending retry by its failed run id", async () => {
    vi.useFakeTimers();
    try {
      const store = memoryStore();
      const runTask = vi
        .fn<ScheduleServiceOptions["runTask"]>()
        .mockResolvedValueOnce(
          executionOutcome({
            status: "failed",
            error: "Temporary failure",
            result: {
              ...executionOutcome().result,
              outcome: "needs-attention",
              severity: "error",
              stopReason: "runtime-error",
            },
          }),
        )
        .mockResolvedValueOnce(executionOutcome({ runId: "run-2" }));
      const service = new ScheduleService({ store, runTask });
      const task = service.create({
        ...input,
        automation: {
          ...DEFAULT_SCHEDULE_AUTOMATION,
          retryPolicy: { kind: "fixed", maxAttempts: 2, delaySeconds: 10 },
        },
      });

      service.runNow(task.id);
      await Promise.resolve();
      await Promise.resolve();
      expect(service.cancelRun("run-1")).toBe(true);
      await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("cancelled"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(runTask).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending retry when the schedule is paused", async () => {
    vi.useFakeTimers();
    try {
      const store = memoryStore();
      const automation = {
        ...DEFAULT_SCHEDULE_AUTOMATION,
        retryPolicy: { kind: "fixed" as const, maxAttempts: 2, delaySeconds: 10 },
      };
      const runTask = vi.fn<ScheduleServiceOptions["runTask"]>().mockResolvedValue(
        executionOutcome({
          status: "failed",
          error: "Temporary failure",
          result: {
            ...executionOutcome().result,
            outcome: "needs-attention",
            severity: "error",
            stopReason: "runtime-error",
          },
        }),
      );
      const service = new ScheduleService({ store, runTask });
      const task = service.create({ ...input, automation });

      service.runNow(task.id);
      await Promise.resolve();
      await Promise.resolve();
      service.update(task.id, { ...input, enabled: false, automation });

      await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("cancelled"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(runTask).toHaveBeenCalledTimes(1);
      expect(store.get(task.id)?.enabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops after the configured maximum heartbeat iterations", async () => {
    const store = memoryStore();
    const service = new ScheduleService({
      store,
      runTask: vi.fn<ScheduleServiceOptions["runTask"]>().mockResolvedValue(executionOutcome()),
      now: () => Date.parse("2026-07-10T12:00:00.000Z"),
    });
    const task = service.create({
      ...input,
      automation: {
        ...DEFAULT_SCHEDULE_AUTOMATION,
        mode: { kind: "heartbeat", targetThreadId: "thread-1" },
        maxIterations: 1,
      },
    });

    service.runNow(task.id);
    await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("succeeded"));
    expect(store.get(task.id)).toMatchObject({
      enabled: false,
      nextRunAt: null,
      iterationCount: 1,
    });
  });

  it("stops a heartbeat only when the evaluated completion policy is still current", async () => {
    const store = memoryStore();
    let resolveRun!: (outcome: ScheduleTaskExecutionOutcome) => void;
    const service = new ScheduleService({
      store,
      runTask: () =>
        new Promise<ScheduleTaskExecutionOutcome>((resolve) => {
          resolveRun = resolve;
        }),
      now: () => Date.parse("2026-07-10T12:00:00.000Z"),
    });
    const automation = {
      ...DEFAULT_SCHEDULE_AUTOMATION,
      mode: { kind: "heartbeat" as const, targetThreadId: "thread-1" },
      completionPolicy: {
        kind: "ai-evaluated" as const,
        stopWhen: "Condition A",
        confidenceThreshold: 0.9,
      },
    };
    const task = service.create({ ...input, automation });
    service.runNow(task.id);
    service.update(task.id, {
      ...input,
      automation: {
        ...automation,
        completionPolicy: {
          kind: "ai-evaluated",
          stopWhen: "Condition A",
          confidenceThreshold: 1,
        },
      },
    });
    resolveRun(
      executionOutcome({
        stopMatched: true,
        completionPolicySnapshot: automation.completionPolicy,
        result: {
          ...executionOutcome().result,
          stopReason: "completion-condition",
          completionEvaluation: {
            stopMatched: true,
            confidence: 0.99,
            reason: "Matched",
            condition: "Condition A",
            evaluatedAt: "2026-07-10T12:00:01.000Z",
          },
        },
      }),
    );

    await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("succeeded"));
    expect(store.get(task.id)?.enabled).toBe(true);
  });

  it("fails closed when completion evaluation cannot run", async () => {
    const store = memoryStore();
    const service = new ScheduleService({
      store,
      runTask: vi.fn<ScheduleServiceOptions["runTask"]>().mockResolvedValue(
        executionOutcome({
          completionPolicySnapshot: {
            kind: "ai-evaluated",
            stopWhen: "Done",
            confidenceThreshold: 0.9,
          },
          status: "failed",
          error: "Completion evaluation failed",
          result: {
            ...executionOutcome().result,
            outcome: "needs-attention",
            severity: "error",
            stopReason: "completion-evaluation-error",
          },
        }),
      ),
      now: () => Date.parse("2026-07-10T12:00:00.000Z"),
    });
    const task = service.create({
      ...input,
      automation: {
        ...DEFAULT_SCHEDULE_AUTOMATION,
        mode: { kind: "heartbeat", targetThreadId: "thread-1" },
        completionPolicy: {
          kind: "ai-evaluated",
          stopWhen: "Done",
          confidenceThreshold: 0.9,
        },
      },
    });

    service.runNow(task.id);
    await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("failed"));
    expect(store.get(task.id)?.enabled).toBe(false);
  });

  it.each(["completion-evaluation-error", "result-unavailable"])(
    "does not replay completed work after %s",
    async (stopReason) => {
      vi.useFakeTimers();
      try {
        const store = memoryStore();
        const runTask = vi.fn<ScheduleServiceOptions["runTask"]>().mockResolvedValue(
          executionOutcome({
            status: "failed",
            error: "Completion evaluation failed",
            result: {
              ...executionOutcome().result,
              outcome: "needs-attention",
              severity: "error",
              stopReason,
            },
          }),
        );
        const service = new ScheduleService({ store, runTask });
        const task = service.create({
          ...input,
          automation: {
            ...DEFAULT_SCHEDULE_AUTOMATION,
            retryPolicy: { kind: "fixed", maxAttempts: 3, delaySeconds: 1 },
          },
        });

        service.runNow(task.id);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(store.get(task.id)?.lastStatus).toBe("failed");
        expect(runTask).toHaveBeenCalledTimes(1);
        expect(store.get(task.id)?.enabled).toBe(stopReason !== "completion-evaluation-error");
        service.dispose();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("does not replay work when its final run record cannot be saved", async () => {
    vi.useFakeTimers();
    try {
      const store = memoryStore();
      const runTask = vi
        .fn<ScheduleServiceOptions["runTask"]>()
        .mockRejectedValue(new ScheduleRunPersistenceError("Final result could not be saved"));
      const service = new ScheduleService({ store, runTask });
      const task = service.create({
        ...input,
        automation: {
          ...DEFAULT_SCHEDULE_AUTOMATION,
          retryPolicy: { kind: "fixed", maxAttempts: 3, delaySeconds: 1 },
        },
      });
      service.runNow(task.id);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(runTask).toHaveBeenCalledTimes(1);
      expect(store.get(task.id)?.lastStatus).toBe("failed");
      expect(store.get(task.id)?.lastError).toBe("Final result could not be saved");
      service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not treat user cancellation as a stop-on-error failure", async () => {
    const store = memoryStore();
    const service = new ScheduleService({
      store,
      runTask: vi.fn<ScheduleServiceOptions["runTask"]>().mockResolvedValue(
        executionOutcome({
          status: "cancelled",
          result: {
            ...executionOutcome().result,
            outcome: "no-findings",
            unread: false,
            archivedAt: "2026-07-10T12:00:00.000Z",
            stopReason: "cancelled",
          },
        }),
      ),
    });
    const task = service.create({
      ...input,
      automation: { ...DEFAULT_SCHEDULE_AUTOMATION, stopOnError: true },
    });

    service.runNow(task.id);
    await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("cancelled"));
    expect(store.get(task.id)?.enabled).toBe(true);
  });

  it("skips a missed run at startup when configured", () => {
    const store = memoryStore();
    let now = Date.parse("2026-07-10T12:00:00.000Z");
    const seed = new ScheduleService({
      store,
      runTask: vi.fn<ScheduleServiceOptions["runTask"]>(),
      now: () => now,
    });
    const task = seed.create({
      ...input,
      recurrence: { kind: "interval", every: 30, unit: "minutes" },
      automation: { ...DEFAULT_SCHEDULE_AUTOMATION, misfirePolicy: "skip" },
    });
    now = Date.parse("2026-07-10T13:05:00.000Z");
    const recordSkipped = vi.fn<NonNullable<ScheduleServiceOptions["recordSkipped"]>>();
    const restarted = new ScheduleService({
      store,
      runTask: vi.fn<ScheduleServiceOptions["runTask"]>(),
      recordSkipped,
      now: () => now,
    });

    restarted.start();
    expect(store.get(task.id)).toMatchObject({
      lastStatus: "skipped",
      nextRunAt: "2026-07-10T13:35:00.000Z",
    });
    expect(recordSkipped).toHaveBeenCalledWith(
      expect.objectContaining({ id: task.id }),
      expect.objectContaining({
        scheduledFor: "2026-07-10T12:30:00.000Z",
        trigger: "scheduled",
      }),
    );
    restarted.dispose();
  });

  it("reanchors a late interval with the run-latest misfire policy", () => {
    const store = memoryStore();
    let now = Date.parse("2026-07-10T12:00:00.000Z");
    const service = new ScheduleService({
      store,
      runTask: vi.fn<ScheduleServiceOptions["runTask"]>().mockResolvedValue("Done"),
      now: () => now,
    });
    const task = service.create({
      ...input,
      recurrence: { kind: "interval", every: 30, unit: "minutes" },
      automation: { ...DEFAULT_SCHEDULE_AUTOMATION, misfirePolicy: "run-latest" },
    });
    now = Date.parse("2026-07-10T12:47:00.000Z");

    service.tick();
    expect(store.get(task.id)?.nextRunAt).toBe("2026-07-10T13:17:00.000Z");
  });
});
