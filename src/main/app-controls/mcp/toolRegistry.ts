import { z } from "zod";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  agentKindSchema,
  scheduleRecurrenceSchema,
  type ScheduledTask,
  type ScheduledTaskInput,
  type Thread,
} from "@/shared/contracts";
import type {
  StreamableHttpMcpToolResult,
  StreamableHttpMcpToolSpec,
} from "../../mcp/StreamableHttpMcpIngress";
import type { ScheduleService } from "../../schedules/ScheduleService";

export interface AppControlsToolContext {
  identity: McpThreadIdentity;
  scheduleService: ScheduleService;
  getThread(threadId: string): Thread | null;
}

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

export const APP_CONTROLS_MCP_INSTRUCTIONS =
  "Use these Poracode controls to list, create, update, run, and delete the user's device schedules. Explain consequential changes before making them. Schedules run only while the device is awake and Poracode is open.";

export const TOOLS: readonly StreamableHttpMcpToolSpec[] = [
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
        enabled: { type: "boolean", default: true },
        agentKind: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
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
        agentKind: { type: "string" },
        model: { type: "string" },
        effort: { type: ["string", "null"] },
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
];

const TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));

export function isKnownToolName(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AppControlsToolContext,
): Promise<unknown> {
  if (name === "list_schedules") return ctx.scheduleService.list();
  if (name === "create_schedule") {
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
  }
  if (name === "update_schedule") {
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
  }
  if (name === "run_schedule") {
    return ctx.scheduleService.runNow(idArgsSchema.parse(args).id);
  }
  if (name === "delete_schedule") {
    const { id } = idArgsSchema.parse(args);
    requireSchedule(ctx, id);
    ctx.scheduleService.delete(id);
    return { deleted: true, id };
  }
  throw new Error(`Unknown tool: ${name}`);
}

export function formatToolResult(_name: string, result: unknown): StreamableHttpMcpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

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
