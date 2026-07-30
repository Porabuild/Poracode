import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  type ScheduleRunInboxQuery,
  type ScheduledTask,
  type ScheduledTaskInput,
  type ScheduledTaskRun,
  type Thread,
  type UpdateScheduleRunStatePayload,
} from "@/shared/contracts";
import type {
  StreamableHttpMcpToolResult,
  StreamableHttpMcpToolSpec,
} from "../../mcp/StreamableHttpMcpIngress";
import type { ScheduleService } from "../../schedules/ScheduleService";
import {
  automationJsonSchema,
  createScheduleArgsSchema,
  idArgsSchema,
  idJsonSchema,
  recurrenceJsonSchema,
  scheduleRunInboxArgsSchema,
  scheduleRunsArgsSchema,
  updateScheduleArgsSchema,
} from "./scheduleToolSchemas";

export interface AppControlsToolContext {
  identity: McpThreadIdentity;
  scheduleService: ScheduleService;
  scheduleRuns: AppControlsScheduleRunControls;
  getThread(threadId: string): Thread | null;
}

export interface AppControlsScheduleRunControls {
  listScheduleRuns(scheduleId: string): ScheduledTaskRun[];
  listScheduleRunInbox(query: ScheduleRunInboxQuery): ScheduledTaskRun[];
  updateScheduleRunState(payload: UpdateScheduleRunStatePayload): ScheduledTaskRun | null;
}

export const APP_CONTROLS_MCP_INSTRUCTIONS =
  "Use these Poracode controls to manage the user's device schedules, automation policies, and run-result inbox. Explain consequential changes before making them. Schedules run only while the device is awake and Poracode is open.";

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
        agentKind: { type: "string" },
        model: { type: "string" },
        effort: { type: ["string", "null"] },
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
    description: "List the newest run results for one schedule.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["scheduleId"],
      properties: { scheduleId: { type: "string", format: "uuid" } },
    },
  },
  {
    name: "list_schedule_run_inbox",
    description: "List unread, current, or archived schedule run results across all schedules.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        filter: { enum: ["unread", "all", "archived"], default: "unread" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "mark_schedule_run_read",
    description: "Mark a schedule run result as read.",
    inputSchema: idJsonSchema(),
  },
  {
    name: "mark_schedule_run_unread",
    description: "Mark a schedule run result as unread.",
    inputSchema: idJsonSchema(),
  },
  {
    name: "archive_schedule_run",
    description: "Archive a schedule run result and mark it read.",
    inputSchema: idJsonSchema(),
  },
  {
    name: "restore_schedule_run",
    description: "Restore an archived schedule run result to the current inbox.",
    inputSchema: idJsonSchema(),
  },
  {
    name: "cancel_schedule_run",
    description: "Cancel an active schedule run by its run ID.",
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
    const parsed = createScheduleArgsSchema.parse(args);
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
  }
  if (name === "update_schedule") {
    const parsed = updateScheduleArgsSchema.parse(args);
    const current = requireSchedule(ctx, parsed.id);
    const automation = parsed.automation ?? current.automation;
    return ctx.scheduleService.update(parsed.id, {
      name: parsed.name ?? current.name,
      prompt: parsed.prompt ?? current.prompt,
      recurrence: parsed.recurrence ?? current.recurrence,
      enabled: parsed.enabled ?? current.enabled,
      agentKind: parsed.agentKind ?? current.agentKind,
      projectId: current.projectId ?? null,
      ...(automation ? { automation } : {}),
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
  if (name === "list_schedule_runs") {
    const { scheduleId } = scheduleRunsArgsSchema.parse(args);
    requireSchedule(ctx, scheduleId);
    return ctx.scheduleRuns.listScheduleRuns(scheduleId);
  }
  if (name === "list_schedule_run_inbox") {
    return ctx.scheduleRuns.listScheduleRunInbox(scheduleRunInboxArgsSchema.parse(args));
  }
  if (name === "mark_schedule_run_read") {
    return updateScheduleRunState(ctx, idArgsSchema.parse(args).id, { unread: false });
  }
  if (name === "mark_schedule_run_unread") {
    return updateScheduleRunState(ctx, idArgsSchema.parse(args).id, { unread: true });
  }
  if (name === "archive_schedule_run") {
    return updateScheduleRunState(ctx, idArgsSchema.parse(args).id, { archived: true });
  }
  if (name === "restore_schedule_run") {
    return updateScheduleRunState(ctx, idArgsSchema.parse(args).id, { archived: false });
  }
  if (name === "cancel_schedule_run") {
    const { id } = idArgsSchema.parse(args);
    return { id, cancelled: ctx.scheduleService.cancelRun(id) };
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

function updateScheduleRunState(
  ctx: AppControlsToolContext,
  id: string,
  patch: Omit<UpdateScheduleRunStatePayload, "id">,
): ScheduledTaskRun {
  const run = ctx.scheduleRuns.updateScheduleRunState({ id, ...patch });
  if (!run) throw new Error("Scheduled run not found.");
  return run;
}
