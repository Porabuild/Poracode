import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ToolCallProgress } from "@/shared/contracts";
import type { ClaudeMapperState, ToolItemState } from "../sdkCanonicalMappingState";
import { classifyToolItemType, isSubAgentToolName } from "./toolClassification";
import { syncSubAgentModelProgress } from "./toolItems";
import { toolPayload } from "./toolPayload";

interface TaskLifecycleMessage {
  task_id?: unknown;
  tool_use_id?: unknown;
  description?: unknown;
  last_tool_name?: unknown;
  summary?: unknown;
  usage?: unknown;
}

type TaskUsage = { total_tokens?: number; tool_uses?: number; duration_ms?: number };

function readTaskUsage(obj: { usage?: unknown }): TaskUsage | undefined {
  return obj.usage && typeof obj.usage === "object" ? (obj.usage as TaskUsage) : undefined;
}

/**
 * Record a live progress description on a Workflow tool's structured metadata.
 * Descriptions are the only in-flight source of agent labels ("Phase: label");
 * the manifest with authoritative labels is only written at completion. Kept
 * distinct and in first-seen order so the renderer can pair them positionally
 * with journal-ordered agents.
 */
function recordWorkflowLiveDescription(tool: ToolItemState, description: unknown): void {
  if (tool.toolName !== "Workflow") return;
  if (typeof description !== "string" || description.length === 0) return;
  const workflow = (tool.workflow ??= {});
  const log = (workflow.liveDescriptions ??= []);
  if (log.length >= 1000 || log.includes(description)) return;
  log.push(description);
}

/** Merge a task lifecycle message's descriptive/usage fields onto a tool's progress. */
function mergeTaskProgress(
  tool: ToolItemState,
  obj: TaskLifecycleMessage,
  usage: TaskUsage | undefined,
): ToolCallProgress {
  const next: ToolCallProgress = {
    ...tool.progress,
    ...(typeof obj.description === "string" && obj.description.length > 0
      ? { description: obj.description }
      : {}),
    ...(typeof obj.last_tool_name === "string" && obj.last_tool_name.length > 0
      ? { lastToolName: obj.last_tool_name }
      : {}),
    ...(typeof obj.summary === "string" && obj.summary.length > 0 ? { summary: obj.summary } : {}),
    ...(typeof usage?.total_tokens === "number" ? { tokens: usage.total_tokens } : {}),
    ...(typeof usage?.tool_uses === "number" ? { toolUses: usage.tool_uses } : {}),
    ...(typeof usage?.duration_ms === "number" ? { durationMs: usage.duration_ms } : {}),
  };
  if (typeof usage?.tool_uses === "number") {
    next.stepCount = Math.max(next.stepCount ?? 0, usage.tool_uses);
  }
  return next;
}

/**
 * Absorb a `task_started` / `task_progress` / `task_notification` system
 * message into the parent Task tool_call's progress field. Lets a collapsed
 * sub-agent row show its current step without expanding to read the children.
 *
 * The per-task `usage` is reflected on the tool progress only — it must NOT
 * feed goal/session token totals: sidechain spend is already counted exactly
 * once from the sub-agent's own assistant messages, and task usage is a
 * cumulative-per-task counter that would double-count it.
 */
export function applyTaskLifecycle(message: SDKMessage, state: ClaudeMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const obj = message as TaskLifecycleMessage;
  const usage = readTaskUsage(obj);

  const toolUseId = typeof obj.tool_use_id === "string" ? obj.tool_use_id : undefined;
  if (!toolUseId) return events;
  const tool = state.toolItemsById.get(toolUseId);
  if (!tool) return events;
  syncSubAgentModelProgress(tool);
  recordWorkflowLiveDescription(tool, obj.description);

  const next = mergeTaskProgress(tool, obj, usage);
  if (Object.keys(next).length === 0) return events;
  tool.progress = next;
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: toolPayload(tool, "running"),
  });
  return events;
}

function unregisterSubAgentTask(state: ClaudeMapperState, taskId: string, toolUseId: string): void {
  state.activeSubAgentTaskToTool?.delete(taskId);
  state.activeSubAgentToolToTask?.delete(toolUseId);
}

/**
 * Record a live background subagent task so later lifecycle events can find the
 * parent tool item and keep it "running" past its launch tool_result. Only
 * genuine subagent launches register: a `task_started` WITHOUT `subagent_type`
 * (a plain background Bash task) whose tool is not a subagent-like tool is
 * ignored so it still completes normally when its tool_result arrives.
 */
export function registerSubAgentTaskIfNeeded(message: SDKMessage, state: ClaudeMapperState): void {
  const obj = message as { task_id?: unknown; tool_use_id?: unknown; subagent_type?: unknown };
  const taskId =
    typeof obj.task_id === "string" && obj.task_id.length > 0 ? obj.task_id : undefined;
  const toolUseId =
    typeof obj.tool_use_id === "string" && obj.tool_use_id.length > 0 ? obj.tool_use_id : undefined;
  if (!taskId || !toolUseId) return;
  const hasSubagentType = typeof obj.subagent_type === "string" && obj.subagent_type.length > 0;
  const tool = state.toolItemsById.get(toolUseId);
  const toolIsSubAgent = tool ? isSubAgentToolName(tool.toolName) : false;
  if (!hasSubagentType && !toolIsSubAgent) return;
  (state.activeSubAgentTaskToTool ??= new Map<string, string>()).set(taskId, toolUseId);
  (state.activeSubAgentToolToTask ??= new Map<string, string>()).set(toolUseId, taskId);
}

/**
 * `task_updated` carries a `patch` but no `tool_use_id`. For a tracked subagent
 * task, fold the patch's descriptive fields onto the parent tool's progress so
 * the collapsed pill reflects the latest state. Terminal patch statuses are NOT
 * closed here — the authoritative `task_notification` (which carries the summary)
 * owns the close.
 */
export function applyTaskUpdated(message: SDKMessage, state: ClaudeMapperState): RuntimeEvent[] {
  const obj = message as { task_id?: unknown; patch?: unknown };
  const taskId = typeof obj.task_id === "string" ? obj.task_id : undefined;
  if (!taskId) return [];
  const toolUseId = state.activeSubAgentTaskToTool?.get(taskId);
  if (!toolUseId) return [];
  const tool = state.toolItemsById.get(toolUseId);
  if (!tool) return [];
  const patch =
    obj.patch && typeof obj.patch === "object" ? (obj.patch as Record<string, unknown>) : undefined;
  if (!patch) return [];
  const description =
    typeof patch.description === "string" && patch.description.length > 0
      ? patch.description
      : undefined;
  const error = typeof patch.error === "string" && patch.error.length > 0 ? patch.error : undefined;
  if (!description && !error) return [];
  recordWorkflowLiveDescription(tool, description);
  tool.progress = {
    ...tool.progress,
    ...(description ? { description } : {}),
    ...(error ? { summary: error } : {}),
  };
  return [
    {
      type: "item.updated",
      threadId: state.threadId,
      itemId: tool.itemId,
      payload: toolPayload(tool, "running"),
    },
  ];
}

/**
 * `task_notification` is the authoritative close for a background task. For a
 * tracked subagent, emit the final `item.updated` (+ `item.completed`) on the
 * parent tool and clean up the registry. For everything else (plain background
 * Bash), fall back to the progress-attach behavior — the tool's own tool_result
 * still owns its completion.
 */
export function applyTaskNotification(
  message: SDKMessage,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  const obj = message as TaskLifecycleMessage & { status?: unknown };
  const taskId = typeof obj.task_id === "string" ? obj.task_id : undefined;
  const registeredToolUseId = taskId ? state.activeSubAgentTaskToTool?.get(taskId) : undefined;
  if (!taskId || !registeredToolUseId) {
    return applyTaskLifecycle(message, state);
  }

  const events: RuntimeEvent[] = [];
  const usage = readTaskUsage(obj);

  const tool = state.toolItemsById.get(registeredToolUseId);
  if (!tool) {
    unregisterSubAgentTask(state, taskId, registeredToolUseId);
    return events;
  }

  syncSubAgentModelProgress(tool);
  tool.progress = mergeTaskProgress(tool, obj, usage);
  const status: "success" | "error" = obj.status === "completed" ? "success" : "error";
  const summary =
    typeof obj.summary === "string" && obj.summary.length > 0 ? obj.summary : undefined;
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload:
      status === "error"
        ? toolPayload(tool, "error", summary ? { message: summary } : undefined)
        : toolPayload(tool, "success", summary),
  });
  events.push({
    type: "item.completed",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: toolPayload(tool, status),
  });
  state.toolItemsById.delete(registeredToolUseId);
  for (const [idx, value] of state.toolItemsByIndex) {
    if (value.itemId === registeredToolUseId) state.toolItemsByIndex.delete(idx);
  }
  unregisterSubAgentTask(state, taskId, registeredToolUseId);
  return events;
}

export function mapPermissionDenied(message: SDKMessage, state: ClaudeMapperState): RuntimeEvent[] {
  const denied = message as {
    tool_name?: unknown;
    tool_use_id?: unknown;
    message?: unknown;
    decision_reason?: unknown;
    decision_reason_type?: unknown;
  };
  const toolUseId = typeof denied.tool_use_id === "string" ? denied.tool_use_id : undefined;
  if (!toolUseId) return [];

  const existing = state.toolItemsById.get(toolUseId);
  const toolName = typeof denied.tool_name === "string" ? denied.tool_name : "Tool";
  const tool =
    existing ??
    ({
      itemId: toolUseId,
      itemType: classifyToolItemType(toolName),
      toolName,
      input: {},
      partialInputJson: "",
    } satisfies ToolItemState);

  const events: RuntimeEvent[] = [];
  if (!existing) {
    state.toolItemsById.set(toolUseId, tool);
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId: tool.itemId,
      itemType: tool.itemType,
      payload: toolPayload(tool, "running"),
    });
  }

  const messageText =
    typeof denied.message === "string" && denied.message.length > 0
      ? denied.message
      : "Tool use was denied.";
  const result = {
    message: messageText,
    ...(typeof denied.decision_reason === "string"
      ? { decisionReason: denied.decision_reason }
      : {}),
    ...(typeof denied.decision_reason_type === "string"
      ? { decisionReasonType: denied.decision_reason_type }
      : {}),
  };
  const stream =
    tool.itemType === "command_execution"
      ? "command_output"
      : tool.itemType === "file_change"
        ? "file_change_output"
        : undefined;
  if (stream) {
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId: tool.itemId,
      stream,
      delta: messageText,
    });
  }
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: toolPayload(tool, "error", result),
  });
  events.push({ type: "item.completed", threadId: state.threadId, itemId: tool.itemId });
  state.toolItemsById.delete(toolUseId);
  for (const [idx, value] of state.toolItemsByIndex) {
    if (value.itemId === toolUseId) state.toolItemsByIndex.delete(idx);
  }
  return events;
}
