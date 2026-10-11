import { randomUUID } from "node:crypto";
import {
  scheduledTaskInputSchema,
  type ScheduleRecurrence,
  type ScheduledTask,
  type ScheduledTaskInput,
  type ScheduledTaskRun,
} from "@/shared/contracts";
import type { ScheduleRuntimePatch } from "@/host/db/schedules";
import { nextScheduleRunAt } from "@/shared/schedules";

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
  runTask(task: ScheduledTask): Promise<string>;
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
  listRuns?(scheduleId: string): ScheduledTaskRun[];
  now?: () => number;
  tickIntervalMs?: number;
}

export class ScheduleService {
  private readonly runningIds = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(private readonly options: ScheduleServiceOptions) {}

  start(): void {
    if (this.timer || this.disposed) return;
    this.normalizeAfterStartup();
    this.timer = setInterval(() => this.tick(), this.options.tickIntervalMs ?? 15_000);
    this.timer.unref?.();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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

  create(input: ScheduledTaskInput): ScheduledTask {
    this.assertOpen();
    const parsed = this.normalizeInput(input);
    const now = this.now();
    const { enabled, nextRunAt } = this.resolveEnablement(parsed.recurrence, parsed.enabled, now);
    const task: ScheduledTask = {
      id: randomUUID(),
      ...parsed,
      enabled,
      nextRunAt,
      lastRunAt: null,
      lastCompletedAt: null,
      lastStatus: "never",
      lastResult: null,
      lastError: null,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    this.options.store.upsert(task);
    return task;
  }

  update(id: string, input: ScheduledTaskInput): ScheduledTask {
    const current = this.requireTask(id);
    const parsed = this.normalizeInput(input);
    const now = this.now();
    const { enabled, nextRunAt } = this.resolveEnablement(parsed.recurrence, parsed.enabled, now);
    const task: ScheduledTask = {
      ...current,
      ...parsed,
      enabled,
      nextRunAt,
      updatedAt: new Date(now).toISOString(),
    };
    this.options.store.upsert(task);
    return task;
  }

  delete(id: string): void {
    this.assertOpen();
    this.options.store.delete(id);
  }

  runNow(id: string): ScheduledTask {
    const task = this.requireTask(id);
    return this.startRun(task, false);
  }

  tick(): void {
    if (this.disposed) return;
    const now = this.now();
    for (const task of this.options.store.list()) {
      if (!task.enabled || !task.nextRunAt || Date.parse(task.nextRunAt) > now) continue;
      try {
        this.startRun(task, true);
      } catch (error) {
        // Isolated per task: a refused save for one due task (for example a
        // protected sibling the full save guard rejects) must not starve the
        // remaining due tasks.
        this.report(task.id, error);
      }
    }
  }

  private startRun(task: ScheduledTask, advanceSchedule: boolean): ScheduledTask {
    if (this.runningIds.has(task.id)) return this.requireTask(task.id);

    const now = this.now();
    const nextRunAt = advanceSchedule ? nextScheduleRunAt(task.recurrence, now) : task.nextRunAt;
    const running: ScheduledTask = {
      ...task,
      ...(advanceSchedule ? { enabled: task.enabled && nextRunAt !== null, nextRunAt } : {}),
      lastRunAt: new Date(now).toISOString(),
      lastCompletedAt: null,
      lastStatus: "running",
      lastResult: null,
      lastError: null,
      updatedAt: new Date(now).toISOString(),
    };
    this.options.store.upsert(running);
    this.runningIds.add(task.id);

    // runTask is invoked synchronously; a synchronous throw must not strand
    // the just-added running ID, so it is caught into a failed settlement.
    // The two-argument handlers keep a failed settlement write from being
    // re-caught into a second, recursive failed settlement.
    try {
      void Promise.resolve(this.options.runTask(running)).then(
        (output) => this.settle(task.id, "succeeded", output, null),
        (error: unknown) =>
          this.settle(
            task.id,
            "failed",
            null,
            error instanceof Error ? error.message : String(error),
          ),
      );
    } catch (error) {
      this.settle(task.id, "failed", null, error instanceof Error ? error.message : String(error));
    }
    return running;
  }

  private settle(
    id: string,
    status: "succeeded" | "failed",
    result: string | null,
    error: string | null,
  ): void {
    this.runningIds.delete(id);
    if (this.disposed) return;
    try {
      // Narrow patch: settlement must not reserialize stored config bytes or
      // resurrect a task deleted while its run was in flight. A persistence
      // failure is reported exactly once — it is never re-thrown into the
      // run's failure handler, which would convert it into another failed
      // settlement.
      const now = this.now();
      this.options.store.patchRuntime(id, {
        lastCompletedAt: new Date(now).toISOString(),
        lastStatus: status,
        lastResult: result,
        lastError: error,
        updatedAt: new Date(now).toISOString(),
      });
    } catch (failure) {
      this.report(id, failure);
    }
  }

  private normalizeAfterStartup(): void {
    const now = this.now();
    const updatedAt = new Date(now).toISOString();
    for (const task of this.options.store.list()) {
      try {
        const { enabled, nextRunAt } = this.resolveEnablement(task.recurrence, task.enabled, now);
        const wasRunning = task.lastStatus === "running";
        if (wasRunning) this.options.onStartupInterrupted?.(task.id);
        // Narrow patch: startup normalization must leave stored config bytes
        // — including unsupported raw metadata the full-save guard retains —
        // exact, and must not resurrect a concurrently deleted row.
        this.options.store.patchRuntime(task.id, {
          enabled,
          nextRunAt,
          ...(wasRunning
            ? {
                lastCompletedAt: new Date(now).toISOString(),
                lastStatus: "failed" as const,
                lastError: null,
              }
            : {}),
          updatedAt,
        });
      } catch (error) {
        this.report(task.id, error);
      }
    }
  }

  /** One report per failure; a throwing reporter must not starve the rest. */
  private report(id: string, error: unknown): void {
    try {
      this.options.onError?.(id, error);
    } catch {
      // Swallowed deliberately: the caller's own failure handling already
      // isolated this task from its siblings.
    }
  }

  private normalizeInput(input: ScheduledTaskInput): ScheduledTaskInput {
    const parsed = scheduledTaskInputSchema.parse(input);
    if (parsed.recurrence.kind !== "weekly") return parsed;
    return {
      ...parsed,
      recurrence: {
        ...parsed.recurrence,
        days: [...new Set(parsed.recurrence.days)].sort((left, right) => left - right),
      },
    };
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
}
