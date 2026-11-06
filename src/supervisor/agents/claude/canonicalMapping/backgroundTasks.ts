import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BashOutput, MonitorOutput } from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import type { BackgroundTask, BackgroundTaskCategory, RuntimeEvent } from "@/shared/contracts";
import type { ClaudeMapperState, ToolItemState } from "../sdkCanonicalMappingState";
import { readNonEmptyString } from "./taskLifecycle";

/** CLI `task_type` values whose work already surfaces as a running tool row. */
const SUBAGENT_TASK_TYPES = new Set(["local_agent", "local_workflow", "remote_agent"]);

/** Provider-private metadata maps stay bounded even for long-lived sessions. */
const MAX_TRACKED_TASK_METADATA = 256;
/** `backgroundTaskSchema.command` bound. */
const MAX_COMMAND_CHARS = 16_384;

/**
 * Normalize the roster's provider-owned `task_type` into the shared display
 * category. Unknown values deliberately fall back to `other` — never to a
 * guessed capability — and sub-agent types keep the historical separate-row
 * filtering below.
 */
const TASK_TYPE_CATEGORIES = new Map<string, BackgroundTaskCategory>([
  ["local_bash", "command"],
  ["local_monitor", "monitor"],
  ["mcp_task", "tool"],
  ["local_agent", "agent"],
  ["remote_agent", "agent"],
  ["local_workflow", "workflow"],
]);

function taskTypeCategory(taskType: unknown): BackgroundTaskCategory {
  return typeof taskType === "string" ? (TASK_TYPE_CATEGORIES.get(taskType) ?? "other") : "other";
}

/** The display class a launch tool guarantees before the roster names its type. */
function toolCategory(tool: Pick<ToolItemState, "toolName">): BackgroundTaskCategory | undefined {
  if (tool.toolName === "Monitor") return "monitor";
  if (tool.toolName === "Bash") return "command";
  return undefined;
}

function toolCommand(tool: Pick<ToolItemState, "input">): string | undefined {
  const command = tool.input.command;
  if (typeof command !== "string") return undefined;
  const trimmed = command.trim();
  if (!trimmed) return undefined;
  let bounded = trimmed.slice(0, MAX_COMMAND_CHARS);
  const lastUnit = bounded.charCodeAt(bounded.length - 1);
  if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) bounded = bounded.slice(0, -1);
  return bounded;
}

function toBackgroundTask(
  state: ClaudeMapperState,
  taskId: string,
  taskType: unknown,
  description: unknown,
): BackgroundTask {
  const category = state.backgroundTaskCategories?.get(taskId) ?? taskTypeCategory(taskType);
  const command = state.backgroundTaskCommands?.get(taskId);
  return {
    taskId,
    kind: category === "command" ? "command" : "other",
    category,
    description: readNonEmptyString(description) ?? "",
    ...(command ? { command } : {}),
  };
}

function backgroundTasksKey(tasks: readonly BackgroundTask[]): string {
  return tasks
    .map(
      (task) =>
        `${task.taskId}\u0000${task.kind}\u0000${task.category ?? ""}\u0000${task.description}\u0000${task.command ?? ""}`,
    )
    .join("\n");
}

function backgroundTasksChangedEvent(
  state: ClaudeMapperState,
  tasks: readonly BackgroundTask[],
): RuntimeEvent[] {
  const key = backgroundTasksKey(tasks);
  if ((state.lastReportedBackgroundTasksKey ?? "") === key) return [];
  state.lastReportedBackgroundTasksKey = key;
  return [{ type: "background_tasks.changed", threadId: state.threadId, tasks: [...tasks] }];
}

function setBoundedMetadata<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  live: (key: K) => boolean,
): void {
  map.delete(key);
  map.set(key, value);
  for (const existing of map.keys()) {
    if (map.size <= MAX_TRACKED_TASK_METADATA) return;
    if (existing === key || live(existing)) continue;
    map.delete(existing);
  }
}

function liveMetadataKeys(state: ClaudeMapperState): ReadonlySet<string> {
  return new Set([
    ...(state.liveBackgroundTaskIds ?? []),
    ...(state.reportedBackgroundTasks?.map((task) => task.taskId) ?? []),
    ...(state.activeSubAgentTaskToTool?.keys() ?? []),
  ]);
}

/**
 * Fold a task's launch-tool facts into the provider-private metadata and
 * re-publish the visible roster only when a category/command actually changed.
 * Called from `task_started` and, while the tool row still exists, from the
 * user `tool_result` that names the native task id.
 */
export function recordBackgroundTaskToolMetadata(
  state: ClaudeMapperState,
  taskId: string,
  tool: Pick<ToolItemState, "toolName" | "input">,
): RuntimeEvent[] {
  const category = toolCategory(tool);
  const command = toolCommand(tool);
  if (!category && !command) return [];
  const live = liveMetadataKeys(state);
  let changed = false;
  if (category) {
    const categories = (state.backgroundTaskCategories ??= new Map());
    if (categories.get(taskId) !== category) {
      setBoundedMetadata(categories, taskId, category, (key) => live.has(key));
      changed = true;
    }
  }
  if (command) {
    const commands = (state.backgroundTaskCommands ??= new Map());
    if (commands.get(taskId) !== command) {
      setBoundedMetadata(commands, taskId, command, (key) => live.has(key));
      changed = true;
    }
  }
  if (!changed) return [];
  const tasks = state.reportedBackgroundTasks;
  if (!tasks?.some((task) => task.taskId === taskId)) return [];
  const next = tasks.map((task) => {
    if (task.taskId !== taskId) return task;
    const nextCategory = category ?? task.category ?? taskTypeCategory(undefined);
    return {
      ...task,
      kind: nextCategory === "command" ? ("command" as const) : ("other" as const),
      category: nextCategory,
      ...((command ?? task.command) ? { command: command ?? task.command } : {}),
    };
  });
  state.reportedBackgroundTasks = next;
  return backgroundTasksChangedEvent(state, next);
}

/** Read the native task id from a Bash/Monitor structured tool result. */
export function readBackgroundTaskResultId(
  tool: Pick<ToolItemState, "toolName" | "itemType">,
  value: unknown,
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (tool.toolName === "Monitor") {
    return readNonEmptyString((value as Partial<MonitorOutput>).taskId);
  }
  if (tool.toolName === "Bash" || tool.itemType === "command_execution") {
    return readNonEmptyString((value as Partial<BashOutput>).backgroundTaskId);
  }
  return undefined;
}

/**
 * Fold a `background_tasks_changed` level signal into the mapper state and
 * report the renderer-facing task list.
 *
 * The payload is the complete live set after the change (REPLACE semantics —
 * never merge), so a missed bookend cannot wedge a stale entry. Per the CLI
 * contract, ambient housekeeping entries are not user work and are dropped
 * everywhere. {@link ClaudeMapperState.liveBackgroundTaskIds} keeps EVERY
 * remaining id (sub-agent runs included) for the "is background work still
 * running" checks: goal completion and process-restart guards wait for every
 * live id, while response completion waits only for awaited work
 * ({@link hasAwaitedBackgroundWork}), so an independent command does not. The
 * emitted `background_tasks.changed` event carries only work that has no other
 * surface: sub-agent runs are excluded because their launch tool row already
 * renders as running and the sub-agent dock lists it.
 *
 * This signal is a level, not an edge: it is installed verbatim (REPLACE), and
 * a registered sub-agent missing from it is only settled by the session after
 * the resume grace for a held clean-turn completion expires — never on the
 * roster frame itself, whose ordering relative to bookends is unspecified.
 */
export function applyBackgroundTasksChanged(
  message: SDKMessage,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  const tasks = (message as { tasks?: unknown }).tasks;
  const liveIds = new Set<string>();
  const reported: BackgroundTask[] = [];
  if (Array.isArray(tasks)) {
    for (const task of tasks) {
      if (!task || typeof task !== "object") continue;
      const entry = task as {
        task_id?: unknown;
        task_type?: unknown;
        description?: unknown;
        ambient?: unknown;
      };
      if (entry.ambient === true) continue;
      const taskId = readNonEmptyString(entry.task_id);
      if (!taskId) continue;
      liveIds.add(taskId);
      const isSubAgent =
        state.activeSubAgentTaskToTool?.has(taskId) === true ||
        (typeof entry.task_type === "string" && SUBAGENT_TASK_TYPES.has(entry.task_type));
      if (isSubAgent) continue;
      reported.push(toBackgroundTask(state, taskId, entry.task_type, entry.description));
    }
  }
  state.liveBackgroundTaskIds = liveIds;
  state.reportedBackgroundTasks = reported;
  return backgroundTasksChangedEvent(state, reported);
}

/**
 * Forget every live background task — the CLI process that owned them is gone
 * (restart, forced turn completion) — and tell the renderer the list drained
 * if it had anything on it.
 */
export function clearBackgroundTasks(state: ClaudeMapperState): RuntimeEvent[] {
  delete state.liveBackgroundTaskIds;
  delete state.backgroundTaskCategories;
  delete state.backgroundTaskCommands;
  state.reportedBackgroundTasks = [];
  return backgroundTasksChangedEvent(state, []);
}

/**
 * A Monitor's roster entry can look like a Bash task, and its roster entry may
 * arrive before this launch event; reclassify it so its result stays awaited.
 * The same launch event is where the actual command becomes known for a Bash
 * task, so capture it before the launch row is removed.
 */
export function classifyBackgroundTaskLaunch(
  message: SDKMessage,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  const obj = message as { task_id?: unknown; tool_use_id?: unknown };
  const taskId = readNonEmptyString(obj.task_id);
  const toolUseId = readNonEmptyString(obj.tool_use_id);
  if (!taskId || !toolUseId) return [];
  const tool = state.toolItemsById.get(toolUseId);
  if (!tool) return [];
  return recordBackgroundTaskToolMetadata(state, taskId, tool);
}

/**
 * Whether the CLI still owns live background work: any entry in the
 * authoritative `background_tasks_changed` level set, or — on CLIs that never
 * emit that level — a registered sub-agent edge. Once the level exists it
 * REPLACES the edge maps as the liveness source; relying on a paired
 * task_started/task_notification edge after a missed bookend would otherwise
 * wedge a stale "running" indicator.
 */
export function hasLiveBackgroundWork(state: ClaudeMapperState): boolean {
  const level = state.liveBackgroundTaskIds;
  if (level !== undefined) return level.size > 0;
  return (state.activeSubAgentTaskToTool?.size ?? 0) > 0;
}

/**
 * Commands left running do not hold a response open; subagents, monitors and
 * unknown work do. When the CLI emits the authoritative level, it alone
 * decides: independent `local_bash` entries are detached, everything else in
 * the live set is awaited. Older CLIs (no level) keep the edge-based behavior.
 */
export function hasAwaitedBackgroundWork(state: ClaudeMapperState): boolean {
  const level = state.liveBackgroundTaskIds;
  if (level === undefined) return (state.activeSubAgentTaskToTool?.size ?? 0) > 0;
  const independentIds = new Set(
    state.reportedBackgroundTasks
      ?.filter((task) => task.kind === "command")
      .map((task) => task.taskId),
  );
  return [...level].some((id) => !independentIds.has(id));
}

/** Terminal task notifications also drain the live set on CLIs that omit a later level update. */
export function forgetBackgroundTask(state: ClaudeMapperState, taskId: string): RuntimeEvent[] {
  state.liveBackgroundTaskIds?.delete(taskId);
  state.backgroundTaskCategories?.delete(taskId);
  state.backgroundTaskCommands?.delete(taskId);
  const tasks = (state.reportedBackgroundTasks ?? []).filter((task) => task.taskId !== taskId);
  state.reportedBackgroundTasks = tasks;
  return backgroundTasksChangedEvent(state, tasks);
}
