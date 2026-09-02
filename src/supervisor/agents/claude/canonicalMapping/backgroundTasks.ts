import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BackgroundTask, RuntimeEvent } from "@/shared/contracts";
import type { ClaudeMapperState } from "../sdkCanonicalMappingState";
import { readNonEmptyString } from "./taskLifecycle";

/** CLI `task_type` values whose work already surfaces as a running tool row. */
const SUBAGENT_TASK_TYPES = new Set(["local_agent", "local_workflow", "remote_agent"]);

function toBackgroundTask(taskId: string, taskType: unknown, description: unknown): BackgroundTask {
  return {
    taskId,
    kind: taskType === "local_bash" ? "command" : "other",
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
 * running" checks that hold turn completion and goal evaluation open. The
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
      reported.push(toBackgroundTask(taskId, entry.task_type, entry.description));
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
  state.reportedBackgroundTasks = [];
  return backgroundTasksChangedEvent(state, []);
}
