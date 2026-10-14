import { canonicalScheduleTimeZone } from "@/shared/scheduleTimeZones";
import { ScheduleRunPersistenceError } from "./types";
import { randomUUID } from "node:crypto";
import {
  resolveScheduleAutomation,
  scheduledTaskInputSchema,
  type ScheduleAutomation,
  type ScheduleRecurrence,
  type ScheduledTaskRunStatus,
  type ScheduledTask,
  type ScheduledTaskInput,
  type ScheduledTaskRun,
  type ScheduleRunInboxQuery,
  type AutomationsSnapshot,
  type UpdateScheduleRunStatePayload,
} from "@/shared/contracts";
import type { ScheduleRuntimePatch } from "@/host/db/schedules";
import { normalizeCronExpression } from "@/shared/contracts/schedule";
import { advanceScheduleRunAt, nextScheduleRunAt } from "@/shared/schedules";
import { toErrorMessage } from "@/shared/errorMessage";
import { msg } from "@/shared/messages";
import type { ScheduleRunContext, ScheduleTaskExecutionOutcome, ScheduleTaskRunner } from "./types";

const MIN_TICK_DELAY_MS = 50;
const MISFIRE_GRACE_MS = 1_000;

class ScheduleRetryCancelledError extends Error {}

export interface ScheduleStore {
  list(): ScheduledTask[];
  get(id: string): ScheduledTask | null;
  upsert(task: ScheduledTask): void;
  /**
   * Narrow runtime-bookkeeping write (enablement, next-run, interruption, and
   * settle fields). Unlike {@link ScheduleStore.upsert} it must never replace
   * the stored config bytes and never resurrect a deleted row — a missing id
   * is a no-op.
   */
  patchRuntime(id: string, patch: ScheduleRuntimePatch): void;
  delete(id: string): void;
}

export interface ScheduleServiceOptions {
  store: ScheduleStore;
  runTask: ScheduleTaskRunner;
  cancelRun?(runId: string): boolean;
  recordSkipped?(task: ScheduledTask, context: ScheduleRunContext): void;
  onRetryingRun?(runId: string): void;
  onRetryWaitFinished?(runId: string, continuing: boolean): void;
  /**
   * Called during post-startup normalization for each task that was left in a
   * `running` state by a previous process. Lets the run-history layer mark its
   * dangling run rows as "interrupted". Optional so existing callers/tests keep
   * working unchanged.
   */
  onStartupInterrupted?(scheduleId: string): void;
  /**
   * Reports per-task failures that must not abort the loop: a refused running
   * save for one due task, a failed settlement write, or a failing startup
   * normalization. Timer processing continues with the remaining tasks either
   * way. Optional so existing callers/tests keep working unchanged.
   */
  onError?(scheduleId: string, error: unknown): void;
  getRun?(id: string): ScheduledTaskRun | null;
  listRuns?(scheduleId: string): ScheduledTaskRun[];
  listInbox?(query: ScheduleRunInboxQuery): ScheduledTaskRun[];
  unreadCount?(): number;
  updateRunState?(payload: UpdateScheduleRunStatePayload): ScheduledTaskRun | null;
  now?: () => number;
  tickIntervalMs?: number;
}

export class ScheduleService {
  private readonly runningIds = new Set<string>();
  private readonly preparationControllers = new Map<string, AbortController>();
  private readonly retryGenerations = new Map<string, number>();
  private readonly startFailureUntil = new Map<string, number>();
  private readonly retryWaiters = new Map<
    string,
    {
      timer: ReturnType<typeof setTimeout>;
      resolve: (continueRetrying: boolean) => void;
      runId: string | null;
    }
  >();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private disposed = false;

  constructor(private readonly options: ScheduleServiceOptions) {}

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.normalizeAfterStartup();
    this.rescheduleTimer();
  }

  dispose(): void {
    this.disposed = true;
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const waiter of this.retryWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve(false);
    }
    this.retryWaiters.clear();
    this.startFailureUntil.clear();
  }

  list(): ScheduledTask[] {
    this.assertOpen();
    return this.options.store.list();
  }

  get(id: string): ScheduledTask | null {
    this.assertOpen();
    return this.options.store.get(id);
  }

  runs(id: string): ScheduledTaskRun[] {
    this.requireTask(id);
    return this.options.listRuns?.(id) ?? [];
  }

  getRun(id: string): ScheduledTaskRun | null {
    this.assertOpen();
    return this.options.getRun?.(id) ?? null;
  }

  inbox(query: ScheduleRunInboxQuery): ScheduledTaskRun[] {
    this.assertOpen();
    return this.options.listInbox?.(query) ?? [];
  }

  snapshot(query: ScheduleRunInboxQuery): AutomationsSnapshot {
    this.assertOpen();
    return {
      schedules: this.list(),
      runs: this.inbox(query),
      unreadCount: this.options.unreadCount?.() ?? 0,
    };
  }

  updateRunState(payload: UpdateScheduleRunStatePayload): ScheduledTaskRun | null {
    this.assertOpen();
    return this.options.updateRunState?.(payload) ?? null;
  }

  create(input: ScheduledTaskInput): ScheduledTask {
    this.assertOpen();
    const parsed = this.normalizeInput(input);
    const now = this.now();
    const { enabled, nextRunAt } = this.resolveEnablement(parsed.recurrence, parsed.enabled, now);
    const task: ScheduledTask = {
      id: randomUUID(),
      ...parsed,
      automation: resolveScheduleAutomation(parsed.automation),
      enabled,
      nextRunAt,
      lastRunAt: null,
      lastCompletedAt: null,
      lastStatus: "never",
      lastResult: null,
      lastError: null,
      iterationCount: 0,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    this.options.store.upsert(task);
    this.rescheduleTimer();
    return task;
  }

  update(id: string, input: ScheduledTaskInput): ScheduledTask {
    const current = this.requireTask(id);
    const parsed = this.normalizeInput(input);
    const now = this.now();
    const schedule =
      current.enabled &&
      parsed.enabled &&
      current.nextRunAt &&
      current.recurrence.kind === "interval" &&
      parsed.recurrence.kind === "interval" &&
      current.recurrence.every === parsed.recurrence.every &&
      current.recurrence.unit === parsed.recurrence.unit
        ? this.resolveExistingInterval(parsed.recurrence, current.nextRunAt, now)
        : this.resolveEnablement(parsed.recurrence, parsed.enabled, now);
    const automation = resolveScheduleAutomation(parsed.automation ?? current.automation);
    const resetIterations =
      (!current.enabled && schedule.enabled) ||
      JSON.stringify(resolveScheduleAutomation(current.automation)) !== JSON.stringify(automation);
    const task: ScheduledTask = {
      ...current,
      ...parsed,
      automation,
      enabled: schedule.enabled,
      nextRunAt: schedule.nextRunAt,
      ...(resetIterations ? { iterationCount: 0 } : {}),
      updatedAt: new Date(now).toISOString(),
    };
    this.options.store.upsert(task);
    this.retryGenerations.set(id, (this.retryGenerations.get(id) ?? 0) + 1);
    this.cancelRetryWaiter(id);
    this.preparationControllers.get(id)?.abort();
    this.startFailureUntil.delete(id);
    this.rescheduleTimer();
    return task;
  }

  delete(id: string): void {
    this.assertOpen();
    this.options.store.delete(id);
    this.cancelRetryWaiter(id);
    this.retryGenerations.set(id, (this.retryGenerations.get(id) ?? 0) + 1);
    this.preparationControllers.get(id)?.abort();

    this.startFailureUntil.delete(id);
    this.rescheduleTimer();
  }

  runNow(id: string): ScheduledTask {
    let task = this.requireTask(id);
    const automation = resolveScheduleAutomation(task.automation);
    if (
      automation.maxIterations !== null &&
      (task.iterationCount ?? 0) >= automation.maxIterations
    ) {
      task = { ...task, iterationCount: 0 };
      this.options.store.patchRuntime(task.id, {
        iterationCount: 0,
        updatedAt: new Date(this.now()).toISOString(),
      });
    }
    const running = this.startRun(task, false, "manual");
    this.rescheduleTimer();
    return running;
  }

  cancelRun(runId: string): boolean {
    this.assertOpen();
    if (this.options.cancelRun?.(runId)) return true;
    for (const [scheduleId, waiter] of this.retryWaiters) {
      if (waiter.runId === runId) return this.cancelRetryWaiter(scheduleId);
    }
    return false;
  }

  tick(): void {
    if (this.disposed) return;
    const now = this.now();
    for (const task of this.options.store.list()) {
      if (
        this.runningIds.has(task.id) ||
        !task.enabled ||
        !task.nextRunAt ||
        Date.parse(task.nextRunAt) > now ||
        (this.startFailureUntil.get(task.id) ?? 0) > now
      ) {
        continue;
      }
      try {
        const automation = resolveScheduleAutomation(task.automation);
        if (
          automation.misfirePolicy === "skip" &&
          now - Date.parse(task.nextRunAt) > MISFIRE_GRACE_MS
        ) {
          this.skipDueRun(task, now);
          continue;
        }
        this.startRun(task, true, "scheduled");
      } catch (error) {
        this.startFailureUntil.set(
          task.id,
          now + Math.max(MIN_TICK_DELAY_MS, this.options.tickIntervalMs ?? 15_000),
        );
        this.report(task.id, error);
      }
    }
    this.rescheduleTimer();
  }

  private startRun(
    task: ScheduledTask,
    advanceSchedule: boolean,
    trigger: ScheduleRunContext["trigger"],
  ): ScheduledTask {
    if (this.runningIds.has(task.id)) return this.requireTask(task.id);

    const now = this.now();
    const scheduledFor = advanceSchedule ? task.nextRunAt! : new Date(now).toISOString();
    const automation = resolveScheduleAutomation(task.automation);
    const nextRunAt = advanceSchedule
      ? automation.misfirePolicy === "run-latest" &&
        now - Date.parse(scheduledFor) > MISFIRE_GRACE_MS
        ? nextScheduleRunAt(task.recurrence, now)
        : advanceScheduleRunAt(task.recurrence, Date.parse(scheduledFor), now)
      : task.nextRunAt;
    const iteration = (task.iterationCount ?? 0) + 1;
    const running: ScheduledTask = {
      ...task,
      ...(advanceSchedule ? { enabled: task.enabled && nextRunAt !== null, nextRunAt } : {}),
      lastRunAt: new Date(now).toISOString(),
      lastCompletedAt: null,
      lastStatus: "running",
      lastResult: null,
      lastError: null,
      iterationCount: iteration,
      updatedAt: new Date(now).toISOString(),
    };
    this.options.store.upsert(running);
    this.startFailureUntil.delete(task.id);
    this.runningIds.add(task.id);

    const generation = this.retryGenerations.get(task.id) ?? 0;
    const controller = new AbortController();
    this.preparationControllers.set(task.id, controller);
    const context: ScheduleRunContext = {
      signal: controller.signal,
      scheduledFor,
      trigger,
      attempt: 1,
      iteration,
    };
    void this.runWithRetries(running, context).then(
      (outcome) => this.settleOutcome(task.id, outcome, generation),
      (error: unknown) => {
        if (error instanceof ScheduleRetryCancelledError) {
          this.settle(task.id, "cancelled", null, null, false, false, generation);
          return;
        }
        this.settle(task.id, "failed", null, toErrorMessage(error), false, false, generation);
      },
    );
    return running;
  }

  private skipDueRun(task: ScheduledTask, now: number): void {
    const scheduledFor = task.nextRunAt!;
    const nextRunAt = advanceScheduleRunAt(task.recurrence, Date.parse(scheduledFor), now);
    this.options.recordSkipped?.(task, {
      scheduledFor,
      trigger: "scheduled",
      attempt: 1,
      iteration: (task.iterationCount ?? 0) + 1,
    });
    this.options.store.patchRuntime(task.id, {
      enabled: task.enabled && nextRunAt !== null,
      nextRunAt,
      lastRunAt: new Date(now).toISOString(),
      lastCompletedAt: new Date(now).toISOString(),
      lastStatus: "skipped",
      lastResult: null,
      lastError: null,
      updatedAt: new Date(now).toISOString(),
    });
    this.startFailureUntil.delete(task.id);
  }

  private async runWithRetries(
    task: ScheduledTask,
    initialContext: ScheduleRunContext,
  ): Promise<ScheduleTaskExecutionOutcome | string> {
    const retryPolicy = resolveScheduleAutomation(task.automation).retryPolicy;
    const maxAttempts = retryPolicy.kind === "none" ? 1 : retryPolicy.maxAttempts;
    const generation = this.retryGenerations.get(task.id) ?? 0;
    const retryIsCurrent = () =>
      !this.disposed && (this.retryGenerations.get(task.id) ?? 0) === generation;
    let context = initialContext;
    let failedRunId: string | null = null;

    while (true) {
      this.assertOpen();
      try {
        const outcome = await this.options.runTask(task, context);
        if (
          typeof outcome === "string" ||
          outcome.status !== "failed" ||
          ["completion-evaluation-error", "result-unavailable"].includes(
            outcome.result.stopReason ?? "",
          ) ||
          !retryIsCurrent() ||
          context.attempt >= maxAttempts
        ) {
          return outcome;
        }
        failedRunId = outcome.runId;
        this.options.onRetryingRun?.(outcome.runId);
      } catch (error) {
        if (
          error instanceof ScheduleRunPersistenceError ||
          !retryIsCurrent() ||
          context.attempt >= maxAttempts
        )
          throw error;
        failedRunId = null;
      }

      const delaySeconds = this.retryDelaySeconds(retryPolicy, context.attempt);
      const continuing =
        (await this.waitForRetry(task.id, delaySeconds * 1_000, failedRunId)) && retryIsCurrent();
      if (failedRunId) this.options.onRetryWaitFinished?.(failedRunId, continuing);
      if (!continuing) throw new ScheduleRetryCancelledError(msg("automation.retry.cancelled"));
      if (!this.options.store.get(task.id)) {
        throw new Error(msg("automation.retry.taskDeleted"));
      }
      context = {
        ...context,
        trigger: "retry",
        attempt: context.attempt + 1,
      };
    }
  }

  private retryDelaySeconds(
    policy: ScheduleAutomation["retryPolicy"],
    failedAttempt: number,
  ): number {
    if (policy.kind === "fixed") return policy.delaySeconds;
    if (policy.kind === "exponential") {
      return Math.min(
        policy.maxDelaySeconds,
        policy.initialDelaySeconds * 2 ** (failedAttempt - 1),
      );
    }
    return 0;
  }

  private waitForRetry(
    scheduleId: string,
    delayMs: number,
    runId: string | null,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.retryWaiters.delete(scheduleId);
        resolve(true);
      }, delayMs);
      timer.unref?.();
      this.retryWaiters.set(scheduleId, { timer, resolve, runId });
    });
  }

  private cancelRetryWaiter(scheduleId: string): boolean {
    const waiter = this.retryWaiters.get(scheduleId);
    if (!waiter) return false;
    clearTimeout(waiter.timer);
    this.retryWaiters.delete(scheduleId);
    waiter.resolve(false);
    return true;
  }

  private settleOutcome(
    id: string,
    outcome: ScheduleTaskExecutionOutcome | string,
    generation: number,
  ): void {
    if (typeof outcome === "string") {
      this.settle(id, "succeeded", outcome, null, false, false, generation);
      return;
    }
    if (this.disposed) {
      this.runningIds.delete(id);
      return;
    }
    const currentPolicy = resolveScheduleAutomation(
      this.options.store.get(id)?.automation,
    ).completionPolicy;
    const policyIsCurrent =
      JSON.stringify(currentPolicy) === JSON.stringify(outcome.completionPolicySnapshot);
    const stopMatched = outcome.stopMatched && policyIsCurrent;
    this.settle(
      id,
      outcome.status,
      outcome.summary,
      outcome.error,
      stopMatched,
      policyIsCurrent && outcome.result.stopReason === "completion-evaluation-error",
      generation,
    );
  }

  private settle(
    id: string,
    status: Exclude<ScheduledTaskRunStatus, "never" | "running">,
    result: string | null,
    error: string | null,
    stopMatched = false,
    policyFailure = false,
    generation = this.retryGenerations.get(id) ?? 0,
  ): void {
    this.runningIds.delete(id);
    this.preparationControllers.delete(id);
    this.cancelRetryWaiter(id);
    if (this.disposed) return;
    try {
      const current = this.options.store.get(id);
      if (!current) {
        this.rescheduleTimer();
        return;
      }
      const now = this.now();
      const automation = resolveScheduleAutomation(current.automation);
      const reachedIterationLimit =
        automation.maxIterations !== null &&
        (current.iterationCount ?? 0) >= automation.maxIterations;
      const stoppedOnError = automation.stopOnError && status === "failed";
      const shouldDisable =
        (this.retryGenerations.get(id) ?? 0) === generation &&
        (stopMatched || policyFailure || reachedIterationLimit || stoppedOnError);
      this.options.store.patchRuntime(id, {
        ...(shouldDisable ? { enabled: false, nextRunAt: null } : {}),
        lastCompletedAt: new Date(now).toISOString(),
        lastStatus: status,
        lastResult: result,
        lastError: error,
        updatedAt: new Date(now).toISOString(),
      });
    } catch (failure) {
      this.report(id, failure);
    }
    this.rescheduleTimer();
  }

  private normalizeAfterStartup(): void {
    const now = this.now();
    for (const task of this.options.store.list()) {
      try {
        const automation = resolveScheduleAutomation(task.automation);
        const isMissed =
          task.enabled && task.nextRunAt !== null && Date.parse(task.nextRunAt) <= now;
        const skipped = isMissed && automation.misfirePolicy === "skip";
        const { enabled, nextRunAt } = skipped
          ? this.resolveEnablement(task.recurrence, task.enabled, now)
          : isMissed
            ? { enabled: task.enabled, nextRunAt: task.nextRunAt }
            : this.resolveStartupEnablement(task, now);
        const wasRunning =
          task.lastStatus === "running" || task.lastStatus === "waiting-for-approval";
        // Sweep orphan active attempts even when the latest task status was changed.
        this.options.onStartupInterrupted?.(task.id);
        if (skipped && task.nextRunAt) {
          this.options.recordSkipped?.(task, {
            scheduledFor: task.nextRunAt,
            trigger: "scheduled",
            attempt: 1,
            iteration: (task.iterationCount ?? 0) + 1,
          });
        }
        this.options.store.patchRuntime(task.id, {
          enabled,
          nextRunAt,
          ...(wasRunning
            ? {
                lastCompletedAt: new Date(now).toISOString(),
                lastStatus: "interrupted" as const,
                lastError: null,
              }
            : skipped
              ? {
                  lastCompletedAt: new Date(now).toISOString(),
                  lastStatus: "skipped" as const,
                  lastResult: null,
                  lastError: null,
                }
              : {}),
          updatedAt: new Date(now).toISOString(),
        });
      } catch (error) {
        this.report(task.id, error);
      }
    }
  }

  private report(id: string, error: unknown): void {
    try {
      this.options.onError?.(id, error);
    } catch {
      /* Background failures stay isolated. */
    }
  }

  private normalizeInput(input: ScheduledTaskInput): ScheduledTaskInput {
    const parsed = scheduledTaskInputSchema.parse(input);
    if (parsed.recurrence.kind === "weekly") {
      const { timeZone, ...recurrence } = parsed.recurrence;
      return {
        ...parsed,
        recurrence: {
          ...recurrence,
          days: [...new Set(recurrence.days)].sort((left, right) => left - right),
          ...(timeZone ? { timeZone: canonicalScheduleTimeZone(timeZone) } : {}),
        },
      };
    }
    if (parsed.recurrence.kind === "cron") {
      return {
        ...parsed,
        recurrence: {
          ...parsed.recurrence,
          expression: normalizeCronExpression(parsed.recurrence.expression),
          timeZone: canonicalScheduleTimeZone(parsed.recurrence.timeZone),
        },
      };
    }
    return parsed;
  }

  /**
   * A schedule is only truly enabled when it also has a future run to fire, so
   * enablement and `nextRunAt` are always resolved together (a disabled task,
   * or one whose recurrence has no upcoming occurrence, settles to paused).
   */
  private resolveEnablement(
    recurrence: ScheduleRecurrence,
    enabled: boolean,
    now: number,
  ): { enabled: boolean; nextRunAt: string | null } {
    const nextRunAt = enabled ? nextScheduleRunAt(recurrence, now) : null;
    return { enabled: enabled && nextRunAt !== null, nextRunAt };
  }

  private resolveStartupEnablement(
    task: ScheduledTask,
    now: number,
  ): { enabled: boolean; nextRunAt: string | null } {
    if (task.enabled && task.recurrence.kind === "interval" && task.nextRunAt) {
      return this.resolveExistingInterval(task.recurrence, task.nextRunAt, now);
    }
    return this.resolveEnablement(task.recurrence, task.enabled, now);
  }

  private resolveExistingInterval(
    recurrence: Extract<ScheduleRecurrence, { kind: "interval" }>,
    nextRunAt: string,
    now: number,
  ): { enabled: true; nextRunAt: string } {
    const scheduledAt = Date.parse(nextRunAt);
    return {
      enabled: true,
      nextRunAt:
        scheduledAt > now ? nextRunAt : advanceScheduleRunAt(recurrence, scheduledAt, now)!,
    };
  }

  private requireTask(id: string): ScheduledTask {
    this.assertOpen();
    const task = this.options.store.get(id);
    if (!task) throw new Error("Scheduled task not found.");
    return task;
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error("Schedule service is shutting down.");
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private rescheduleTimer(): void {
    if (!this.started || this.disposed) return;
    if (this.timer) clearTimeout(this.timer);

    const now = this.now();
    let delay = this.options.tickIntervalMs ?? 15_000;
    for (const task of this.options.store.list()) {
      if (this.runningIds.has(task.id) || !task.enabled || !task.nextRunAt) continue;
      const dueAt = Math.max(Date.parse(task.nextRunAt), this.startFailureUntil.get(task.id) ?? 0);
      delay = Math.min(delay, Math.max(0, dueAt - now));
    }
    delay = Math.max(MIN_TICK_DELAY_MS, delay);

    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, delay);
    this.timer.unref?.();
  }
}
