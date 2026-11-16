import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ToolCallProgress } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import type { ClaudeMapperState, ToolItemState } from "../sdkCanonicalMappingState";
import {
  classifyToolItemType,
  isAgentAddressableToolName,
  isSubAgentToolName,
} from "./toolClassification";
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
  // A row already settled for a missing terminal report may receive late
  // metadata, but it must stay completed: never resurrect a running payload.
  if (tool.awaitingTaskReport) return events;
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
  forgetSubAgentParentAlias(state, taskId);
}

/**
 * Record a live background subagent task so later lifecycle events can find the
 * parent tool item and keep it "running" past its launch tool_result. Only
 * genuine subagent launches register: a `task_started` WITHOUT `subagent_type`
 * (a plain background Bash task) whose tool is not a subagent-like tool is
 * ignored so it still completes normally when its tool_result arrives.
 *
 * A `SendMessage` that resumes a completed sub-agent reports the resumed run
 * against its OWN tool_use id, so the binding also promotes that row to a
 * sub-agent parent (see {@link isAgentAddressableToolName}) and titles it from
 * the run's description. A send that resumes nothing emits no `task_started`,
 * never registers, and completes as an ordinary tool row.
 */
export function registerSubAgentTaskIfNeeded(
  message: SDKMessage,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  const obj = message as {
    task_id?: unknown;
    tool_use_id?: unknown;
    subagent_type?: unknown;
    description?: unknown;
    is_backgrounded?: unknown;
  };
  const taskId =
    typeof obj.task_id === "string" && obj.task_id.length > 0 ? obj.task_id : undefined;
  const toolUseId =
    typeof obj.tool_use_id === "string" && obj.tool_use_id.length > 0 ? obj.tool_use_id : undefined;
  if (!taskId || !toolUseId) return [];
  const hasSubagentType = typeof obj.subagent_type === "string" && obj.subagent_type.length > 0;
  const tool = state.toolItemsById.get(toolUseId);
  const toolIsSubAgent = tool ? isSubAgentToolName(tool.toolName) : false;
  if (!hasSubagentType && !toolIsSubAgent) return [];
  const events: RuntimeEvent[] = [];
  const previousToolUseId = state.activeSubAgentTaskToTool?.get(taskId);
  if (previousToolUseId && previousToolUseId !== toolUseId) {
    // A resumed run under a NEW tool_use id is positive proof the previous run
    // is superseded, independent of roster timing. Settle it now (canonical
    // missing-report error) before overwriting the binding, so its running
    // parent row and reverse mapping cannot survive forever.
    events.push(...settleMissingSubAgentTaskReport(state, taskId));
    state.activeSubAgentToolToTask?.delete(previousToolUseId);
  }
  (state.activeSubAgentTaskToTool ??= new Map<string, string>()).set(taskId, toolUseId);
  (state.activeSubAgentToolToTask ??= new Map<string, string>()).set(toolUseId, taskId);
  events.push(...rememberSubAgentParent(state, taskId, toolUseId));
  if (tool) {
    // `is_backgrounded: false` means the spawning tool call blocks on this run:
    // track it for progress/correlation, but let its normal tool_result close
    // it. Absent (older CLIs) keeps the historical background keep-alive.
    if (obj.is_backgrounded === false) tool.subAgentForeground = true;
    else delete tool.subAgentForeground;
    // A live task_started on this row supersedes a missing-report settlement;
    // stale-run filtering upstream has already dropped older runs.
    delete tool.awaitingTaskReport;
  }
  if (!tool || toolIsSubAgent || !isAgentAddressableToolName(tool.toolName)) return events;
  tool.subAgentParent = true;
  const subagentType = readNonEmptyString(obj.subagent_type);
  if (subagentType) tool.subAgentType = subagentType;
  // The send's own `summary` describes THIS message; `task_started.description`
  // is frozen at the agent's original spawn, so leading with it would label
  // every resume of one agent identically.
  const title =
    readNonEmptyString(tool.input.summary) ?? readNonEmptyString(obj.description) ?? subagentType;
  if (title) tool.subAgentTitle = title;
  return events;
}

export function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Structured Agent launch output (`sdk-tools.d.ts` `AgentOutput`) that says the
 * foreground tool call actually moved the run to the background. Read from
 * `message.tool_use_result` at this provider boundary; prose text is never
 * sniffed. Such a run keeps its parent row alive even before the
 * `task_updated.patch.is_backgrounded` signal arrives.
 */
export function isAsyncSubAgentLaunchResult(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  return status === "async_launched" || status === "remote_launched";
}

const MAX_TRACKED_SUBAGENT_LAUNCHES = 500;

/**
 * Track which tool call currently owns a sub-agent task. The first
 * `task_started` records the launch tool; a later one for the same task means
 * the agent was resumed by a different tool (`SendMessage`), so the launch id
 * is aliased forward. The resumed run's forwarded children keep naming the
 * ORIGINAL launch id in `parent_tool_use_id`, and that row was completed and
 * dropped when the first run ended — the alias is what re-points them at the
 * live row. Verified against the SDK: a resumed agent's `Glob`/`Read` children
 * carry the launch `Agent` tool_use id while its `task_progress` carries the
 * `SendMessage` id.
 *
 * A new run fences the previous run: if that owner was only retained as a
 * missing-report row, its mapper metadata is dropped (the persisted error row
 * and the launch/alias maps stay) so a late report cannot revive the old row.
 */
function rememberSubAgentParent(
  state: ClaudeMapperState,
  taskId: string,
  toolUseId: string,
): RuntimeEvent[] {
  const launches = (state.subAgentTaskLaunchTools ??= new Map<string, string>());
  const launchToolUseId = launches.get(taskId);
  if (!launchToolUseId) {
    // Bounded: one entry per sub-agent ever launched in this session. Evict the
    // oldest inactive entry (and any row it stranded) rather than clearing the
    // whole map, which would make retained missing-report rows unreachable.
    const evicted =
      launches.size >= MAX_TRACKED_SUBAGENT_LAUNCHES ? evictOldestInactiveLaunch(state) : [];
    launches.set(taskId, toolUseId);
    return evicted;
  }
  if (launchToolUseId === toolUseId) return [];
  const previousOwner = resolveSubAgentParentToolUseId(state, launchToolUseId);
  (state.subAgentParentAliases ??= new Map<string, string>()).set(launchToolUseId, toolUseId);
  if (previousOwner && previousOwner !== toolUseId) {
    return retireAwaitingReportRow(state, previousOwner);
  }
  return [];
}

/**
 * Drop a retained missing-report row; its already-emitted error row is kept.
 * Ordinary children of that run can never receive a result either, so they are
 * completed as errors now instead of being dropped by the next turn reset.
 */
function retireAwaitingReportRow(state: ClaudeMapperState, toolUseId: string): RuntimeEvent[] {
  const tool = state.toolItemsById.get(toolUseId);
  if (tool?.awaitingTaskReport !== true) return [];
  state.toolItemsById.delete(toolUseId);
  for (const [idx, value] of state.toolItemsByIndex) {
    if (value.itemId === toolUseId) state.toolItemsByIndex.delete(idx);
  }
  state.subAgentChildToolItemIds?.delete(toolUseId);
  return settleOrphanedOrdinaryChildren(state, toolUseId);
}

/**
 * Evict the oldest launch whose task has no live active binding. Never evicts
 * a live task, and drops the stranded awaiting-report row together with the
 * launch/alias entries so metadata stays bounded.
 */
function evictOldestInactiveLaunch(state: ClaudeMapperState): RuntimeEvent[] {
  const launches = state.subAgentTaskLaunchTools;
  if (!launches) return [];
  for (const [taskId, launchToolUseId] of launches) {
    if (state.activeSubAgentTaskToTool?.has(taskId)) continue;
    const ownerToolUseId = resolveSubAgentParentToolUseId(state, launchToolUseId);
    launches.delete(taskId);
    state.subAgentParentAliases?.delete(launchToolUseId);
    const events = retireAwaitingReportRow(state, launchToolUseId);
    if (ownerToolUseId && ownerToolUseId !== launchToolUseId)
      events.push(...retireAwaitingReportRow(state, ownerToolUseId));
    return events;
  }
  return [];
}

/**
 * Follow {@link ClaudeMapperState.subAgentParentAliases} to the tool call that
 * currently owns a sub-agent run. The latest explicit alias wins even while the
 * original row is still retained as awaiting-report metadata: such a row is
 * not a live owner, so it must not short-circuit the resume route. Without an
 * alias the input is returned unchanged, leaving ordinary nesting untouched.
 * The hop limit guards against a cycle if a tool id were ever reused.
 */
export function resolveSubAgentParentToolUseId(
  state: ClaudeMapperState,
  parentToolUseId: string | undefined,
): string | undefined {
  if (!parentToolUseId) return parentToolUseId;
  const aliases = state.subAgentParentAliases;
  if (!aliases || aliases.size === 0) return parentToolUseId;
  let current = parentToolUseId;
  for (let hop = 0; hop < 8; hop += 1) {
    const next = aliases.get(current);
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

/** Drop a superseded-parent alias once its run is closed for good. */
export function forgetSubAgentParentAlias(state: ClaudeMapperState, taskId: string): void {
  const launchToolUseId = state.subAgentTaskLaunchTools?.get(taskId);
  if (launchToolUseId) state.subAgentParentAliases?.delete(launchToolUseId);
}

/**
 * The tool row that currently owns a task: the active binding while it is
 * registered, otherwise the launch row (followed through resume aliases) that
 * a missing-report settlement left awaiting its late terminal notification.
 */
function resolveSubAgentTaskToolUseId(
  state: ClaudeMapperState,
  taskId: string,
): string | undefined {
  return (
    state.activeSubAgentTaskToTool?.get(taskId) ??
    resolveSubAgentParentToolUseId(state, state.subAgentTaskLaunchTools?.get(taskId))
  );
}

/**
 * Settle one registered sub-agent task whose run ended without its terminal
 * report. Emits the localized result-delivery error and drains the active
 * binding, but keeps the row and the launch/alias maps: a late
 * `task_notification` (even without `tool_use_id`) must still find this row and
 * replace the error with the real outcome. Never claims success.
 */
function settleMissingSubAgentTaskReport(state: ClaudeMapperState, taskId: string): RuntimeEvent[] {
  const toolUseId = state.activeSubAgentTaskToTool?.get(taskId);
  if (!toolUseId) return [];
  state.activeSubAgentTaskToTool?.delete(taskId);
  state.activeSubAgentToolToTask?.delete(toolUseId);
  const tool = state.toolItemsById.get(toolUseId);
  if (!tool) return [];
  tool.awaitingTaskReport = true;
  return [
    {
      type: "item.completed",
      threadId: state.threadId,
      itemId: tool.itemId,
      payload: toolPayload(tool, "error", {
        error: msg("thread.backgroundTaskReportMissing"),
      }),
    },
    ...settleOrphanedOrdinaryChildren(state, toolUseId),
  ];
}

/**
 * Complete the ordinary forwarded children of a parent row that can no longer
 * receive their results: the parent run is settled for a missing report or was
 * superseded by a resumed owner. A child that owns a live sub-agent binding, or
 * is itself a retained parent awaiting a late terminal report, is left alone
 * (its own settlement owns it). Tracking is removed for the completed rows so
 * the next turn's per-turn reset cannot drop a still-"running" row silently.
 */
function settleOrphanedOrdinaryChildren(
  state: ClaudeMapperState,
  parentToolUseId: string,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const [id, tool] of [...state.toolItemsById]) {
    if (tool.subAgentParentItemId !== parentToolUseId) continue;
    if (tool.awaitingTaskReport === true) continue;
    // An Agent/Workflow/SendMessage row can receive its task_started after the
    // parent is superseded; its own lifecycle, not this sweep, owns that row.
    if (isSubAgentToolName(tool.toolName) || isAgentAddressableToolName(tool.toolName)) continue;
    // A forwarded Agent row can itself own a live task. Its binding, not the
    // parent, decides when it closes.
    if (state.activeSubAgentToolToTask?.has(id)) continue;
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId: tool.itemId,
      payload: toolPayload(tool, "error"),
    });
    state.toolItemsById.delete(id);
    state.subAgentChildToolItemIds?.delete(id);
    for (const [index, value] of state.toolItemsByIndex) {
      if (value.itemId === id) state.toolItemsByIndex.delete(index);
    }
  }
  return events;
}

/**
 * Settle every registered sub-agent task absent from the authoritative level.
 * The session calls this only when a clean-result completion is still held
 * after the resume grace, so a terminal report or a positive roster arriving
 * in that window wins first. No level means an older CLI with edge bookends:
 * those tasks are still genuinely live and must not be settled.
 */
export function settleMissingSubAgentTaskReports(state: ClaudeMapperState): RuntimeEvent[] {
  const level = state.liveBackgroundTaskIds;
  if (level === undefined) return [];
  const active = state.activeSubAgentTaskToTool;
  if (!active || active.size === 0) return [];
  const events: RuntimeEvent[] = [];
  for (const taskId of [...active.keys()]) {
    if (level.has(taskId)) continue;
    events.push(...settleMissingSubAgentTaskReport(state, taskId));
  }
  return events;
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
  const toolUseId = resolveSubAgentTaskToolUseId(state, taskId);
  if (!toolUseId) return [];
  const tool = state.toolItemsById.get(toolUseId);
  if (!tool) return [];
  const patch =
    obj.patch && typeof obj.patch === "object" ? (obj.patch as Record<string, unknown>) : undefined;
  if (!patch) return [];
  // The spawning tool call stopped blocking and the run moved to the
  // background: its own tool_result must now keep the row alive instead of
  // closing it.
  if (patch.is_backgrounded === true) delete tool.subAgentForeground;
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
  // Metadata only on a row already settled for a missing terminal report.
  if (tool.awaitingTaskReport) return [];
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
 * parent tool and clean up the registry. A late notification for a row already
 * settled as a missing report still overrides that error, even when it carries
 * no `tool_use_id`; the launch/alias maps locate the retired owner. For
 * everything else (plain background Bash), fall back to the progress-attach
 * behavior — the tool's own tool_result still owns its completion.
 */
export function applyTaskNotification(
  message: SDKMessage,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  const obj = message as TaskLifecycleMessage & { status?: unknown };
  const taskId = typeof obj.task_id === "string" ? obj.task_id : undefined;
  if (!taskId) return applyTaskLifecycle(message, state);
  const registeredToolUseId = state.activeSubAgentTaskToTool?.get(taskId);
  const notificationToolUseId =
    typeof obj.tool_use_id === "string" && obj.tool_use_id.length > 0 ? obj.tool_use_id : undefined;
  const ownerToolUseId =
    registeredToolUseId ?? lateReportOwnerToolUseId(state, taskId, notificationToolUseId);
  if (!ownerToolUseId) return applyTaskLifecycle(message, state);

  const events: RuntimeEvent[] = [];
  const usage = readTaskUsage(obj);

  const tool = state.toolItemsById.get(ownerToolUseId);
  if (!tool) {
    unregisterSubAgentTask(state, taskId, ownerToolUseId);
    return events;
  }
  const lateReport = !registeredToolUseId && tool.awaitingTaskReport === true;
  if (!registeredToolUseId && !lateReport) {
    // The launch row exists but this is not a retired missing-report row.
    return applyTaskLifecycle(message, state);
  }

  syncSubAgentModelProgress(tool);
  tool.progress = mergeTaskProgress(tool, obj, usage);
  const status: "success" | "error" = obj.status === "completed" ? "success" : "error";
  const summary =
    typeof obj.summary === "string" && obj.summary.length > 0 ? obj.summary : undefined;
  // One payload for both events: the completion event must not erase (direct
  // merge) or retain (JSON/missing-value merge) text from the other one. A late
  // report on a settled row always names its result explicitly, including
  // `null`, so the provisional missing-report error is cleared.
  const terminalResult = lateReport
    ? (summary ?? null)
    : status === "error" && summary
      ? { message: summary }
      : summary;
  const terminalPayload = toolPayload(tool, status, terminalResult);
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: terminalPayload,
  });
  events.push({
    type: "item.completed",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: terminalPayload,
  });
  state.toolItemsById.delete(ownerToolUseId);
  for (const [idx, value] of state.toolItemsByIndex) {
    if (value.itemId === ownerToolUseId) state.toolItemsByIndex.delete(idx);
  }
  // A true terminal report is the only thing that forgets the resume alias.
  unregisterSubAgentTask(state, taskId, ownerToolUseId);
  return events;
}

/** Resolve the retired owner a late terminal report must replace, if any. */
function lateReportOwnerToolUseId(
  state: ClaudeMapperState,
  taskId: string,
  notificationToolUseId: string | undefined,
): string | undefined {
  const candidates = [resolveSubAgentTaskToolUseId(state, taskId), notificationToolUseId].filter(
    (value): value is string => value !== undefined,
  );
  return candidates.find(
    (toolUseId) => state.toolItemsById.get(toolUseId)?.awaitingTaskReport === true,
  );
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
