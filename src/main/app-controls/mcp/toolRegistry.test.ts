import { describe, expect, it, vi } from "vitest";
import type { ScheduledTask, ScheduledTaskInput, Thread } from "@/shared/contracts";
import type { ScheduleService } from "../../schedules/ScheduleService";
import { dispatchTool, type AppControlsToolContext } from "./toolRegistry";

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
    delete: vi.fn<(id: string) => void>(),
  } as unknown as ScheduleService;
  const ctx: AppControlsToolContext = {
    identity: { threadId: thread.id, title: "Schedule this" },
    scheduleService: service,
    getThread: (id) => (id === thread.id ? thread : null),
  };
  return { ctx, service };
}

describe("Poracode app control tools", () => {
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

  it("updates only the requested schedule fields", async () => {
    const task = {
      id: "d2ac39e9-14ac-4776-9279-37a1e455a5db",
      name: "Old name",
      prompt: "Keep this prompt",
      agentKind: "claude:home",
      config: { model: "claude-fable-5", effort: "medium" },
      recurrence: { kind: "hourly", minute: 0 },
      enabled: true,
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
      }),
    );
  });
});
