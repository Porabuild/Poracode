import {
  createScheduleArgsSchema as createArgsSchema,
  updateScheduleArgsSchema as updateArgsSchema,
  idArgsSchema,
  idJsonSchema,
  scheduleRunInboxArgsSchema,
  scheduleRunsArgsSchema,
} from "./scheduleSchemas";
import { isHomeProjectId } from "@/shared/homeScope";
import { type ScheduledTask, type ScheduledTaskInput } from "@/shared/contracts";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import {
  assertNotSelf,
  requireProject,
  type AppControlsToolContext,
  type ToolDomain,
} from "./types";

const createSchedule = defineAppControlTool({
  name: "create_schedule",
  description:
    "Create a schedule with the app's model config and recurrence. Pass projectId to choose its project, or null for Home. When omitted, the caller's project, agent and model supply the defaults. Legacy model and effort inputs are also accepted.",
  input: createArgsSchema,
  run: ({ projectId, config, model, effort, agentKind, ...fields }, ctx) => {
    rejectMixedConfig(config, model, effort);
    const source = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
    const resolvedAgent = agentKind ?? source?.agentKind;
    const resolvedModel = model ?? source?.config.model;
    if (!resolvedAgent || (!config && !resolvedModel))
      throw new Error(
        "Provide agentKind and config or model when the calling thread has no defaults.",
      );
    const inheritedEffort = effort ?? source?.config.effort;
    return ctx.scheduleService.create({
      ...fields,
      agentKind: resolvedAgent,
      projectId:
        projectId === undefined
          ? source && !isHomeProjectId(source.projectId)
            ? source.projectId
            : null
          : scheduleProject(ctx, projectId),
      config: config ?? {
        model: resolvedModel!,
        ...(inheritedEffort !== undefined ? { effort: inheritedEffort } : {}),
        ...(source?.config.fast !== undefined ? { fast: source.config.fast } : {}),
      },
    });
  },
});

const updateSchedule = defineAppControlTool({
  name: "update_schedule",
  description:
    "Update selected schedule fields. Pass projectId: null to move it to Home, or config to set the complete model selection. Omitted fields retain their saved values.",
  input: updateArgsSchema,
  run: ({ id, projectId, config, model, effort, ...patch }, ctx) => {
    rejectMixedConfig(config, model, effort);
    const current = requireSchedule(ctx, id);
    const { effort: previousEffort, ...baseConfig } = current.config;
    const nextEffort = effort === undefined ? previousEffort : effort;
    return ctx.scheduleService.update(id, {
      name: patch.name ?? current.name,
      prompt: patch.prompt ?? current.prompt,
      recurrence: patch.recurrence ?? current.recurrence,
      enabled: patch.enabled ?? current.enabled,
      agentKind: patch.agentKind ?? current.agentKind,
      projectId:
        projectId === undefined ? (current.projectId ?? null) : scheduleProject(ctx, projectId),
      ...((patch.automation ?? current.automation)
        ? { automation: patch.automation ?? current.automation }
        : {}),
      config: config ?? {
        ...baseConfig,
        model: model ?? baseConfig.model,
        ...(nextEffort != null ? { effort: nextEffort } : {}),
      },
    });
  },
});

function rejectMixedConfig(
  config: ScheduledTaskInput["config"] | undefined,
  model: string | undefined,
  effort: string | null | undefined,
): void {
  if (config && (model !== undefined || effort !== undefined))
    throw new Error("Pass config or the legacy model and effort fields.");
}

function scheduleProject(ctx: AppControlsToolContext, projectId: string | null | undefined) {
  return !projectId || isHomeProjectId(projectId) ? null : requireProject(ctx, projectId).id;
}

const generatedScheduleTools = appControlToolDomain(createSchedule, updateSchedule);

export const scheduleTools: ToolDomain = {
  specs: [
    {
      name: "list_schedules",
      description: "List the user's Poracode schedules and their current status.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    ...generatedScheduleTools.specs,
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
    ...generatedScheduleTools.handlers,
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
