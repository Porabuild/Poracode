import {
  automationJsonSchema,
  createScheduleArgsSchema as createArgsSchema,
  updateScheduleArgsSchema as updateArgsSchema,
  idArgsSchema,
  idJsonSchema,
  recurrenceJsonSchema,
  scheduleRunInboxArgsSchema,
  scheduleRunsArgsSchema,
} from "./scheduleSchemas";
import { isHomeProjectId } from "@/shared/homeScope";
import { type ScheduledTask, type ScheduledTaskInput } from "@/shared/contracts";
import { assertNotSelf, type AppControlsToolContext, type ToolDomain } from "./types";

export const scheduleTools: ToolDomain = {
  specs: [
    {
      name: "list_schedules",
      description: "List the user's Poracode schedules and their current status.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "create_schedule",
      description:
        "Create a device schedule. The current agent and model are used unless overridden.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["name", "prompt", "recurrence"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          prompt: { type: "string", minLength: 1, maxLength: 50000 },
          recurrence: recurrenceJsonSchema(),
          enabled: { type: "boolean" },
          agentKind: { type: "string", minLength: 1 },
          model: { type: "string", minLength: 1 },
          effort: { type: "string", minLength: 1 },
          automation: automationJsonSchema(),
        },
      },
    },
    {
      name: "update_schedule",
      description: "Update selected fields on an existing Poracode schedule.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", minLength: 1, maxLength: 120 },
          prompt: { type: "string", minLength: 1, maxLength: 50000 },
          recurrence: recurrenceJsonSchema(),
          enabled: { type: "boolean" },
          agentKind: { type: "string", minLength: 1 },
          model: { type: "string", minLength: 1 },
          effort: { type: ["string", "null"], minLength: 1 },
          automation: automationJsonSchema(),
        },
      },
    },
    {
      name: "run_schedule",
      description: "Run an existing schedule now without changing its next scheduled run.",
      inputSchema: idJsonSchema(),
    },
    {
      name: "delete_schedule",
      description: "Permanently delete an existing schedule from this device.",
      inputSchema: idJsonSchema(),
    },
    {
      name: "list_schedule_runs",
      description: "List the newest results for one schedule.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["scheduleId"],
        properties: { scheduleId: { type: "string", format: "uuid" } },
      },
    },
    {
      name: "list_schedule_run_inbox",
      description:
        "List unread, current, or archived automation results. Use the last run's startedAt|id as cursor to page older results.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          filter: { enum: ["unread", "all", "archived"], default: "unread" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: "string" },
          search: { type: "string", maxLength: 200 },
        },
      },
    },
    ...(
      [
        "mark_schedule_run_read",
        "mark_schedule_run_unread",
        "archive_schedule_run",
        "restore_schedule_run",
        "cancel_schedule_run",
      ] as const
    ).map((name) => ({
      name,
      description: {
        mark_schedule_run_read: "Mark a run result read.",
        mark_schedule_run_unread: "Mark a run result unread.",
        archive_schedule_run: "Archive a run result and mark it read.",
        restore_schedule_run: "Restore an archived run result.",
        cancel_schedule_run:
          "Cancel an active run or scheduled retry. You cannot cancel your own run.",
      }[name],
      inputSchema: idJsonSchema(),
    })),
  ],
  handlers: {
    list_schedules: (_args, ctx) => ctx.scheduleService.list(),
    create_schedule: (args, ctx) => {
      const parsed = createArgsSchema.parse(args);
      const sourceThread = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
      const agentKind = parsed.agentKind ?? sourceThread?.agentKind;
      const model = parsed.model ?? sourceThread?.config.model;
      if (!agentKind || !model) {
        throw new Error("agentKind and model are required when the calling thread is unavailable.");
      }
      // Default the run's project to the calling thread's project (so a schedule
      // created from inside a project runs there). Home-scope threads leave it
      // null, which the coordinator resolves to the built-in Home project.
      const projectId =
        sourceThread && !isHomeProjectId(sourceThread.projectId) ? sourceThread.projectId : null;
      const input: ScheduledTaskInput = {
        name: parsed.name,
        prompt: parsed.prompt,
        recurrence: parsed.recurrence,
        enabled: parsed.enabled,
        agentKind,
        ...(projectId ? { projectId } : {}),
        ...(parsed.automation ? { automation: parsed.automation } : {}),
        config: {
          model,
          ...((parsed.effort ?? sourceThread?.config.effort)
            ? { effort: parsed.effort ?? sourceThread?.config.effort }
            : {}),
          ...(sourceThread?.config.fast !== undefined ? { fast: sourceThread.config.fast } : {}),
        },
      };
      return ctx.scheduleService.create(input);
    },
    update_schedule: (args, ctx) => {
      const parsed = updateArgsSchema.parse(args);
      const current = requireSchedule(ctx, parsed.id);
      const { effort: _currentEffort, ...baseConfig } = current.config;
      return ctx.scheduleService.update(parsed.id, {
        name: parsed.name ?? current.name,
        prompt: parsed.prompt ?? current.prompt,
        recurrence: parsed.recurrence ?? current.recurrence,
        enabled: parsed.enabled ?? current.enabled,
        agentKind: parsed.agentKind ?? current.agentKind,
        projectId: current.projectId ?? null,
        ...((parsed.automation ?? current.automation)
          ? { automation: parsed.automation ?? current.automation }
          : {}),
        config: {
          ...baseConfig,
          model: parsed.model ?? current.config.model,
          ...(parsed.effort === null
            ? {}
            : parsed.effort !== undefined
              ? { effort: parsed.effort }
              : current.config.effort
                ? { effort: current.config.effort }
                : {}),
          ...(current.config.fast !== undefined ? { fast: current.config.fast } : {}),
        },
      });
    },
    run_schedule: (args, ctx) => ctx.scheduleService.runNow(idArgsSchema.parse(args).id),
    list_schedule_runs: (args, ctx) =>
      ctx.scheduleService.runs(scheduleRunsArgsSchema.parse(args).scheduleId),
    list_schedule_run_inbox: (args, ctx) =>
      ctx.scheduleService.inbox(scheduleRunInboxArgsSchema.parse(args)),
    mark_schedule_run_read: (args, ctx) =>
      ctx.scheduleService.updateRunState({ id: idArgsSchema.parse(args).id, unread: false }),
    mark_schedule_run_unread: (args, ctx) =>
      ctx.scheduleService.updateRunState({ id: idArgsSchema.parse(args).id, unread: true }),
    archive_schedule_run: (args, ctx) =>
      ctx.scheduleService.updateRunState({ id: idArgsSchema.parse(args).id, archived: true }),
    restore_schedule_run: (args, ctx) =>
      ctx.scheduleService.updateRunState({ id: idArgsSchema.parse(args).id, archived: false }),
    cancel_schedule_run: (args, ctx) => {
      const { id } = idArgsSchema.parse(args);
      const run = ctx.scheduleService.getRun(id);
      if (run) assertNotSelf(ctx, run.threadId, "cancel");
      return { id, cancelled: ctx.scheduleService.cancelRun(id) };
    },
    delete_schedule: (args, ctx) => {
      const { id } = idArgsSchema.parse(args);
      requireSchedule(ctx, id);
      ctx.scheduleService.delete(id);
      return { deleted: true, id };
    },
  },
};

function requireSchedule(ctx: AppControlsToolContext, id: string): ScheduledTask {
  const task = ctx.scheduleService.get(id);
  if (!task) throw new Error("Scheduled task not found.");
  return task;
}
