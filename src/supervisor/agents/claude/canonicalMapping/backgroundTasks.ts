import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BackgroundTask, RuntimeEvent } from "@/shared/contracts";
import type { ClaudeMapperState } from "../sdkCanonicalMappingState";
import { readNonEmptyString } from "./taskLifecycle";

/** CLI `task_type` values whose work already surfaces as a running tool row. */
const SUBAGENT_TASK_TYPES = new Set(["local_agent", "local_workflow", "remote_agent"]);

function toBackgroundTask(
  state: ClaudeMapperState,
  taskId: string,
  taskType: unknown,
  description: unknown,
): BackgroundTask {
  return {
    taskId,
    kind:
      state.backgroundTaskKinds?.get(taskId) ?? (taskType === "local_bash" ? "command" : "other"),
    description: readNonEmptyString(description) ?? "",
  };
}

function backgroundTasksKey(tasks: readonly BackgroundTask[]): string {
  return tasks
    .map((task) => `${task.taskId}\u0000${task.kind}\u0000${task.description}`)
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
  delete state.backgroundTaskKinds;
  state.reportedBackgroundTasks = [];
  return backgroundTasksChangedEvent(state, []);
}

/**
 * A Monitor's roster entry can look like a Bash task, and its roster entry may
 * arrive before this launch event; reclassify it so its result stays awaited.
 */
export function classifyBackgroundTaskLaunch(
  message: SDKMessage,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  const obj = message as { task_id?: unknown; tool_use_id?: unknown };
  const taskId = readNonEmptyString(obj.task_id);
  const toolUseId = readNonEmptyString(obj.tool_use_id);
  if (!taskId || !toolUseId || state.toolItemsById.get(toolUseId)?.toolName !== "Monitor") {
    return [];
  }
  (state.backgroundTaskKinds ??= new Map()).set(taskId, "other");
  const tasks = state.reportedBackgroundTasks ?? [];
  if (!tasks.some((task) => task.taskId === taskId && task.kind !== "other")) return [];
  state.reportedBackgroundTasks = tasks.map((task) =>
    task.taskId === taskId ? { ...task, kind: "other" } : task,
  );
  return backgroundTasksChangedEvent(state, state.reportedBackgroundTasks);
}

/** Commands left running do not hold a response open; subagents, monitors and unknown work do. */
export function hasAwaitedBackgroundWork(state: ClaudeMapperState): boolean {
  if ((state.activeSubAgentTaskToTool?.size ?? 0) > 0) return true;
  const independentIds = new Set(
    state.reportedBackgroundTasks
      ?.filter((task) => task.kind === "command")
      .map((task) => task.taskId),
  );
  return [...(state.liveBackgroundTaskIds ?? [])].some((id) => !independentIds.has(id));
}

/** Terminal task notifications also drain the live set on CLIs that omit a later level update. */
export function forgetBackgroundTask(state: ClaudeMapperState, taskId: string): RuntimeEvent[] {
  state.liveBackgroundTaskIds?.delete(taskId);
  state.backgroundTaskKinds?.delete(taskId);
  const tasks = (state.reportedBackgroundTasks ?? []).filter((task) => task.taskId !== taskId);
  state.reportedBackgroundTasks = tasks;
  return backgroundTasksChangedEvent(state, tasks);
}
