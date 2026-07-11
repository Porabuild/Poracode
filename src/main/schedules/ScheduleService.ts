import { randomUUID } from "node:crypto";
import {
  scheduledTaskInputSchema,
  type ScheduleRecurrence,
  type ScheduledTask,
  type ScheduledTaskInput,
} from "@/shared/contracts";
import { nextScheduleRunAt } from "@/shared/schedules";

export interface ScheduleStore {
  list(): ScheduledTask[];
  get(id: string): ScheduledTask | null;
  upsert(task: ScheduledTask): void;
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
    return this.options.store.list();
  }

  get(id: string): ScheduledTask | null {
    return this.options.store.get(id);
  }

  create(input: ScheduledTaskInput): ScheduledTask {
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
      this.startRun(task, true);
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
    this.runningIds.add(task.id);
    this.options.store.upsert(running);

    void this.options
      .runTask(running)
      .then((output) => this.settle(task.id, "succeeded", output, null))
      .catch((error: unknown) =>
        this.settle(
          task.id,
          "failed",
          null,
          error instanceof Error ? error.message : String(error),
        ),
      );
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
    const current = this.options.store.get(id);
    if (!current) return;
    const now = this.now();
    this.options.store.upsert({
      ...current,
      lastCompletedAt: new Date(now).toISOString(),
      lastStatus: status,
      lastResult: result,
      lastError: error,
      updatedAt: new Date(now).toISOString(),
    });
  }

  private normalizeAfterStartup(): void {
    const now = this.now();
    for (const task of this.options.store.list()) {
      const { enabled, nextRunAt } = this.resolveEnablement(task.recurrence, task.enabled, now);
      const wasRunning = task.lastStatus === "running";
      if (wasRunning) this.options.onStartupInterrupted?.(task.id);
      this.options.store.upsert({
        ...task,
        enabled,
        nextRunAt,
        ...(wasRunning
          ? {
              lastCompletedAt: new Date(now).toISOString(),
              lastStatus: "failed" as const,
              lastError: null,
            }
          : {}),
        updatedAt: new Date(now).toISOString(),
      });
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
    const task = this.options.store.get(id);
    if (!task) throw new Error("Scheduled task not found.");
    return task;
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}
