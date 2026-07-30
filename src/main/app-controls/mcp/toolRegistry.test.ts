import { describe, expect, it, vi } from "vitest";
import type {
  ScheduleAutomation,
  ScheduledTask,
  ScheduledTaskInput,
  ScheduledTaskRun,
  Thread,
} from "@/shared/contracts";
import type { ScheduleService } from "../../schedules/ScheduleService";
import { dispatchTool, TOOLS, type AppControlsToolContext } from "./toolRegistry";

const SCHEDULE_ID = "d2ac39e9-14ac-4776-9279-37a1e455a5db";
const RUN_ID = "6c7406dc-a3b2-4841-89aa-b7e2eba78c79";

const thread = {
  id: "thread-1",
  agentKind: "codex",
  config: { model: "gpt-5.6", effort: "high", fast: true },
} as Thread;

function context(tasks: ScheduledTask[] = []) {
  const service = {
    list: vi.fn<() => ScheduledTask[]>(() => tasks),
    get: vi.fn<(id: string) => ScheduledTask | null>(
      (id) => tasks.find((task) => task.id === id) ?? null,
    ),
    create: vi.fn<(input: ScheduledTaskInput) => ScheduledTask>(
      (input) => ({ id: "created", ...input }) as ScheduledTask,
    ),
    update: vi.fn<(id: string, input: ScheduledTaskInput) => ScheduledTask>(
      (id, input) => ({ id, ...input }) as ScheduledTask,
    ),
    runNow: vi.fn<(id: string) => ScheduledTask>(
      (id) => ({ id, lastStatus: "running" }) as ScheduledTask,
    ),
    cancelRun: vi.fn<(id: string) => boolean>(() => true),
    delete: vi.fn<(id: string) => void>(),
  } as unknown as ScheduleService;
  const run = { id: RUN_ID, scheduleId: SCHEDULE_ID } as ScheduledTaskRun;
  const scheduleRuns = {
    listScheduleRuns: vi.fn<(scheduleId: string) => ScheduledTaskRun[]>(() => [run]),
    listScheduleRunInbox: vi.fn<() => ScheduledTaskRun[]>(() => [run]),
    updateScheduleRunState: vi.fn<() => ScheduledTaskRun | null>(() => run),
  };
  const ctx: AppControlsToolContext = {
    identity: { threadId: thread.id, title: "Schedule this" },
    scheduleService: service,
    scheduleRuns,
    getThread: (id) => (id === thread.id ? thread : null),
  };
  return { ctx, service, scheduleRuns, run };
}

const heartbeatAutomation: ScheduleAutomation = {
  version: 1,
  mode: { kind: "heartbeat", targetThreadId: thread.id },
  maxRuntimeSeconds: 900,
  maxIterations: 12,
  stopOnError: true,
  misfirePolicy: "run-latest",
  retryPolicy: {
    kind: "exponential",
    maxAttempts: 4,
    initialDelaySeconds: 10,
    maxDelaySeconds: 120,
  },
  completionPolicy: {
    kind: "ai-evaluated",
    stopWhen: "All migration checks pass.",
    confidenceThreshold: 0.9,
  },
};

describe("Poracode app control tools", () => {
  it("advertises every supported schedule recurrence", () => {
    const createTool = TOOLS.find((tool) => tool.name === "create_schedule")!;
    const schema = createTool.inputSchema as {
      properties: {
        recurrence: {
          oneOf: {
            properties: { kind: { const: string }; expression?: { pattern: string } };
          }[];
        };
      };
    };

    expect(schema.properties.recurrence.oneOf.map((entry) => entry.properties.kind.const)).toEqual([
      "hourly",
      "weekly",
      "once",
      "interval",
      "cron",
    ]);
    const cron = schema.properties.recurrence.oneOf.find(
      (entry) => entry.properties.kind.const === "cron",
    );
    expect(cron?.properties.expression?.pattern).toBe("^\\s*[0-9*,/-]+(?:\\s+[0-9*,/-]+){4}\\s*$");
  });

  it("advertises the complete automation policy and run-result controls", () => {
    const createTool = TOOLS.find((tool) => tool.name === "create_schedule")!;
    const schema = createTool.inputSchema as {
      properties: {
        automation: {
          required: string[];
          properties: {
            mode: { oneOf: { properties: { kind: { const: string } } }[] };
            retryPolicy: { oneOf: { properties: { kind: { const: string } } }[] };
            completionPolicy: { oneOf: { properties: { kind: { const: string } } }[] };
          };
        };
      };
    };

    expect(schema.properties.automation.required).toEqual([
      "version",
      "mode",
      "maxRuntimeSeconds",
      "maxIterations",
      "stopOnError",
      "misfirePolicy",
      "retryPolicy",
      "completionPolicy",
    ]);
    expect(
      schema.properties.automation.properties.mode.oneOf.map(
        (entry) => entry.properties.kind.const,
      ),
    ).toEqual(["new-thread", "heartbeat"]);
    expect(
      schema.properties.automation.properties.retryPolicy.oneOf.map(
        (entry) => entry.properties.kind.const,
      ),
    ).toEqual(["none", "fixed", "exponential"]);
    expect(
      schema.properties.automation.properties.completionPolicy.oneOf.map(
        (entry) => entry.properties.kind.const,
      ),
    ).toEqual(["none", "ai-evaluated"]);
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "list_schedules",
      "create_schedule",
      "update_schedule",
      "run_schedule",
      "delete_schedule",
      "list_schedule_runs",
      "list_schedule_run_inbox",
      "mark_schedule_run_read",
      "mark_schedule_run_unread",
      "archive_schedule_run",
      "restore_schedule_run",
      "cancel_schedule_run",
    ]);
  });

  it("creates a schedule with the calling thread's agent defaults", async () => {
    const { ctx, service } = context();
    await dispatchTool(
      "create_schedule",
      {
        name: "Daily brief",
        prompt: "Summarize priorities",
        recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
      },
      ctx,
    );

    expect(service.create).toHaveBeenCalledWith({
      name: "Daily brief",
      prompt: "Summarize priorities",
      recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
      enabled: true,
      agentKind: "codex",
      config: { model: "gpt-5.6", effort: "high", fast: true },
    });
  });

  it("creates a schedule with the full automation policy", async () => {
    const { ctx, service } = context();
    await dispatchTool(
      "create_schedule",
      {
        name: "Migration heartbeat",
        prompt: "Continue the migration",
        recurrence: { kind: "interval", every: 15, unit: "minutes" },
        automation: heartbeatAutomation,
      },
      ctx,
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ automation: heartbeatAutomation }),
    );
  });

  it("updates only the requested schedule fields", async () => {
    const task = {
      id: SCHEDULE_ID,
      name: "Old name",
      prompt: "Keep this prompt",
      agentKind: "claude:home",
      config: { model: "claude-fable-5", effort: "medium" },
      recurrence: { kind: "hourly", minute: 0 },
      enabled: true,
      automation: heartbeatAutomation,
    } as ScheduledTask;
    const { ctx, service } = context([task]);

    await dispatchTool("update_schedule", { id: task.id, name: "New name", enabled: false }, ctx);

    expect(service.update).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({
        name: "New name",
        prompt: "Keep this prompt",
        enabled: false,
        recurrence: { kind: "hourly", minute: 0 },
        automation: heartbeatAutomation,
      }),
    );
  });

  it("updates the full automation policy", async () => {
    const task = {
      id: SCHEDULE_ID,
      name: "Migration",
      prompt: "Continue",
      agentKind: "codex",
      config: { model: "gpt-5.6" },
      recurrence: { kind: "interval", every: 15, unit: "minutes" },
      enabled: true,
    } as ScheduledTask;
    const { ctx, service } = context([task]);

    await dispatchTool("update_schedule", { id: task.id, automation: heartbeatAutomation }, ctx);

    expect(service.update).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ automation: heartbeatAutomation }),
    );
  });

  it("lists results for one schedule and the global inbox", async () => {
    const task = { id: SCHEDULE_ID } as ScheduledTask;
    const { ctx, scheduleRuns, run } = context([task]);

    await expect(
      dispatchTool("list_schedule_runs", { scheduleId: SCHEDULE_ID }, ctx),
    ).resolves.toEqual([run]);
    expect(scheduleRuns.listScheduleRuns).toHaveBeenCalledWith(SCHEDULE_ID);

    await expect(
      dispatchTool("list_schedule_run_inbox", { filter: "archived", limit: 25 }, ctx),
    ).resolves.toEqual([run]);
    expect(scheduleRuns.listScheduleRunInbox).toHaveBeenCalledWith({
      filter: "archived",
      limit: 25,
    });
  });

  it("defaults the run inbox to unread results", async () => {
    const { ctx, scheduleRuns } = context();

    await dispatchTool("list_schedule_run_inbox", {}, ctx);

    expect(scheduleRuns.listScheduleRunInbox).toHaveBeenCalledWith({ filter: "unread" });
  });

  it.each([
    ["mark_schedule_run_read", { unread: false }],
    ["mark_schedule_run_unread", { unread: true }],
    ["archive_schedule_run", { archived: true }],
    ["restore_schedule_run", { archived: false }],
  ])("applies the %s state transition", async (tool, patch) => {
    const { ctx, scheduleRuns, run } = context();

    await expect(dispatchTool(tool, { id: RUN_ID }, ctx)).resolves.toBe(run);
    expect(scheduleRuns.updateScheduleRunState).toHaveBeenCalledWith({ id: RUN_ID, ...patch });
  });

  it("cancels an active run through the schedule service", async () => {
    const { ctx, service } = context();

    await expect(dispatchTool("cancel_schedule_run", { id: RUN_ID }, ctx)).resolves.toEqual({
      id: RUN_ID,
      cancelled: true,
    });
    expect(service.cancelRun).toHaveBeenCalledWith(RUN_ID);
  });
});
