import { describe, expect, it, vi } from "vitest";
import type { ScheduledTask, ScheduledTaskInput } from "@/shared/contracts";
import { ScheduleService, type ScheduleStore } from "./ScheduleService";

function memoryStore(): ScheduleStore {
  const tasks = new Map<string, ScheduledTask>();
  return {
    list: () => [...tasks.values()],
    get: (id) => tasks.get(id) ?? null,
    upsert: (task) => tasks.set(task.id, task),
    patchRuntime: (id, patch) => {
      // Mirrors the SQL patch: runtime columns only, no missing-row insert.
      const current = tasks.get(id);
      if (!current) return;
      tasks.set(id, { ...current, ...patch });
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

describe("ScheduleService", () => {
  it("does not retain a running ID or launch after a rejected save", async () => {
    const store = memoryStore();
    const runTask = vi.fn<() => Promise<string>>().mockResolvedValue("Done");
    const service = new ScheduleService({ store, runTask });
    const task = service.create(input);
    vi.spyOn(store, "upsert").mockImplementationOnce(() => {
      throw new Error("Stored selection is unsupported");
    });

    expect(() => service.runNow(task.id)).toThrow("Stored selection is unsupported");
    expect(runTask).not.toHaveBeenCalled();
    expect(store.get(task.id)?.lastStatus).toBe("never");
    expect(service.runNow(task.id).lastStatus).toBe("running");
    expect(runTask).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("succeeded"));
    service.dispose();
  });

  it("refuses database access and manual launches after admission closes", () => {
    const store = memoryStore();
    const runTask = vi.fn<() => Promise<string>>(async () => "fixture");
    const service = new ScheduleService({ store, runTask });
    const task = service.create(input);
    service.dispose();
    const list = vi.spyOn(store, "list");
    const get = vi.spyOn(store, "get");
    const upsert = vi.spyOn(store, "upsert");
    const remove = vi.spyOn(store, "delete");
    for (const operation of [
      () => service.list(),
      () => service.get(task.id),
      () => service.create(input),
      () => service.update(task.id, input),
      () => service.delete(task.id),
      () => service.runNow(task.id),
    ])
      expect(operation).toThrow("shutting down");
    expect(list).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(runTask).not.toHaveBeenCalled();
  });

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
    expect(store.get(task.id)?.lastStatus).toBe("failed");
    restarted.dispose();
  });

  it("does not invoke the interrupted hook for tasks that were not running", () => {
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

    expect(onStartupInterrupted).not.toHaveBeenCalled();
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

  it("a refused sibling save does not starve healthy due tasks", async () => {
    const store = memoryStore();
    const onError = vi.fn<(scheduleId: string, error: unknown) => void>();
    const service = new ScheduleService({ store, runTask: async () => "Done", onError });
    const blocked = service.create({ ...input, name: "Blocked" });
    const healthy = service.create({ ...input, name: "Healthy" });
    const due = new Date(Date.now() - 1_000).toISOString();
    store.upsert({ ...store.get(blocked.id)!, nextRunAt: due });
    store.upsert({ ...store.get(healthy.id)!, nextRunAt: due });

    const realUpsert = store.upsert.bind(store);
    vi.spyOn(store, "upsert").mockImplementation((task) => {
      if (task.id === blocked.id) throw new Error("Stored selection is unsupported");
      realUpsert(task);
    });

    service.tick();

    expect(onError).toHaveBeenCalledTimes(1);
    const [reportedId, reportedError] = onError.mock.calls[0]!;
    expect(reportedId).toBe(blocked.id);
    expect((reportedError as Error).message).toBe("Stored selection is unsupported");
    expect(store.get(blocked.id)?.lastStatus).toBe("never");
    expect(store.get(healthy.id)?.lastStatus).toBe("running");
    await vi.waitFor(() => expect(store.get(healthy.id)?.lastStatus).toBe("succeeded"));
    service.dispose();
  });

  it("reports a failed settlement write once instead of settling again", async () => {
    const store = memoryStore();
    const onError = vi.fn<(scheduleId: string, error: unknown) => void>();
    const service = new ScheduleService({ store, runTask: async () => "Done", onError });
    const task = service.create(input);
    vi.spyOn(store, "patchRuntime").mockImplementation(() => {
      throw new Error("disk full");
    });

    service.runNow(task.id);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());

    const [, reportedError] = onError.mock.calls[0]!;
    expect((reportedError as Error).message).toBe("disk full");
    // The failed write is never converted into another failed settlement.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.get(task.id)?.lastStatus).toBe("running");
    service.dispose();
  });

  it("normalizes startup bookkeeping through the narrow patch without full saves", () => {
    const store = memoryStore();
    const now = new Date(2026, 6, 6, 9, 0).getTime();
    const seed = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      now: () => now,
    });
    seed.create(input);
    const task = store.list()[0]!;
    // Simulate a prior process that died mid-run.
    store.upsert({ ...task, lastStatus: "running" });

    const upsert = vi.spyOn(store, "upsert");
    const patchRuntime = vi.spyOn(store, "patchRuntime");
    const onStartupInterrupted = vi.fn<(scheduleId: string) => void>();
    const service = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(),
      onStartupInterrupted,
      now: () => now,
    });
    service.start();

    expect(upsert).not.toHaveBeenCalled();
    expect(onStartupInterrupted).toHaveBeenCalledWith(task.id);
    expect(patchRuntime).toHaveBeenCalledTimes(1);
    expect(patchRuntime).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ enabled: true, lastStatus: "failed", lastError: null }),
    );
    // The captured execution config passes through untouched.
    expect(store.get(task.id)?.config).toEqual(input.config);
    service.dispose();
  });

  it("startup normalization isolates a failing task from its siblings", () => {
    const store = memoryStore();
    const onError = vi.fn<(scheduleId: string, error: unknown) => void>();
    const service = new ScheduleService({ store, runTask: async () => "Done", onError });
    const blocked = service.create({ ...input, name: "Blocked" });
    const healthy = service.create({ ...input, name: "Healthy" });

    const realPatch = store.patchRuntime.bind(store);
    vi.spyOn(store, "patchRuntime").mockImplementation((id, patch) => {
      if (id === blocked.id) throw new Error("locked");
      realPatch(id, patch);
    });

    service.start();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe(blocked.id);
    expect(store.get(blocked.id)?.enabled).toBe(true);
    expect(store.get(healthy.id)?.enabled).toBe(true);
    service.dispose();
  });

  it("settles a synchronously throwing runTask instead of stranding the running ID", async () => {
    const store = memoryStore();
    const service = new ScheduleService({
      store,
      runTask: vi.fn<() => Promise<string>>(() => {
        throw new Error("sync boom");
      }),
    });
    const task = service.create(input);

    const running = service.runNow(task.id);
    expect(running.lastStatus).toBe("running");
    await vi.waitFor(() => expect(store.get(task.id)?.lastStatus).toBe("failed"));
    expect(store.get(task.id)?.lastError).toBe("sync boom");

    // The running ID was released: a retry launches instead of bouncing off
    // the coalescing guard.
    expect(service.runNow(task.id).lastStatus).toBe("running");
    service.dispose();
  });
});
