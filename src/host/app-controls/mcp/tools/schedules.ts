import { z } from "zod";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  agentKindSchema,
  scheduleRecurrenceSchema,
  type ScheduledTask,
  type ScheduledTaskInput,
} from "@/shared/contracts";
import type { AppControlsToolContext, ToolDomain } from "./types";

const createArgsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(50_000),
  recurrence: scheduleRecurrenceSchema,
  enabled: z.boolean().optional().default(true),
  agentKind: agentKindSchema.optional(),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
});

const updateArgsSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(50_000).optional(),
  recurrence: scheduleRecurrenceSchema.optional(),
  enabled: z.boolean().optional(),
  agentKind: agentKindSchema.optional(),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).nullable().optional(),
});

const idArgsSchema = z.object({ id: z.string().uuid() });

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
      return ctx.scheduleService.update(parsed.id, {
        name: parsed.name ?? current.name,
        prompt: parsed.prompt ?? current.prompt,
        recurrence: parsed.recurrence ?? current.recurrence,
        enabled: parsed.enabled ?? current.enabled,
        agentKind: parsed.agentKind ?? current.agentKind,
        config: {
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

function idJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  };
}

function recurrenceJsonSchema(): Record<string, unknown> {
  return {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "minute"],
        properties: {
          kind: { const: "hourly" },
          minute: { type: "integer", minimum: 0, maximum: 59 },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "days", "time"],
        properties: {
          kind: { const: "weekly" },
          days: {
            type: "array",
            minItems: 1,
            items: { type: "integer", minimum: 0, maximum: 6 },
          },
          time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "runAt"],
        properties: {
          kind: { const: "once" },
          runAt: { type: "string", format: "date-time" },
        },
      },
    ],
  };
}
