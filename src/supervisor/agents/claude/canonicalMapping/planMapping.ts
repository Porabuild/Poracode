import type { RuntimeEvent } from "@/shared/contracts";
import {
  createPlanAggregator,
  registerPlanTaskId,
  removePlanTask,
  replaceAllPlanTasks,
  resolvePlanTaskKey,
  upsertPlanTask,
  type PlanAggregatorState,
  type PlanStepStatus,
} from "../../planAggregator";
import { readStringField } from "../../fileChangeSummary";
import type { ClaudeMapperState, ToolItemState } from "../sdkCanonicalMappingState";

function ensurePlanAggregator(state: ClaudeMapperState): PlanAggregatorState {
  if (!state.planAggregator) {
    state.planAggregator = createPlanAggregator(state.threadId, `plan-${state.threadId}`);
  }
  return state.planAggregator;
}

function readPlanStepStatus(value: unknown): PlanStepStatus | undefined {
  if (value === "pending" || value === "in_progress" || value === "completed") return value;
  return undefined;
}

/**
 * Translate the input of a Task / TodoWrite tool_use into aggregator events.
 * Called both at start time (when `block.input` is populated up front) and
 * after `input_json_delta` finishes streaming a partial payload. Idempotent —
 * the aggregator's no-op detection swallows repeat calls.
 */
export function applyPlanAggregatorInput(
  state: ClaudeMapperState,
  tool: ToolItemState,
): RuntimeEvent[] {
  const aggregator = ensurePlanAggregator(state);
  switch (tool.planAggregatorRole) {
    case "TodoWrite":
      return replaceAllPlanTasks(aggregator, extractTodoWriteTasks(tool.input));
    case "TaskCreate": {
      const description = readTaskCreateDescription(tool.input);
      if (!description) return [];
      return upsertPlanTask(aggregator, tool.itemId, {
        description,
        status: "pending",
      });
    }
    case "TaskUpdate": {
      const taskId =
        readStringField(tool.input, "taskId") ?? readStringField(tool.input, "task_id");
      if (!taskId) return [];
      const status = readPlanStepStatus(tool.input.status);
      const isDeleted = tool.input.status === "deleted";
      const description =
        readStringField(tool.input, "subject") ?? readStringField(tool.input, "description");
      const key = resolvePlanTaskKey(aggregator, taskId) ?? `task:${taskId}`;
      if (isDeleted) return removePlanTask(aggregator, key);
      const fields: { description?: string; status?: PlanStepStatus } = {};
      if (description) fields.description = description;
      if (status) fields.status = status;
      if (!fields.description && !fields.status) return [];
      return upsertPlanTask(aggregator, key, fields);
    }
    case "TaskStop": {
      const taskId =
        readStringField(tool.input, "taskId") ?? readStringField(tool.input, "task_id");
      if (!taskId) return [];
      const key = resolvePlanTaskKey(aggregator, taskId);
      if (!key) return [];
      return upsertPlanTask(aggregator, key, { status: "completed" });
    }
    default:
      return [];
  }
}

/**
 * When a TaskCreate tool_result arrives, parse the runtime-assigned task_id
 * out of the response (formats vary across hosts — Anthropic's "Task #N
 * created successfully" string and a JSON `{task_id|taskId|id}` are both
 * accepted) and register it against the aggregator so later TaskUpdate calls
 * referencing that id land on the same entry.
 */
export function bindTaskCreateResult(
  state: ClaudeMapperState,
  tool: ToolItemState,
  resultText: string,
): void {
  const taskId = parseTaskIdFromResult(resultText);
  if (!taskId) return;
  const aggregator = ensurePlanAggregator(state);
  registerPlanTaskId(aggregator, taskId, tool.itemId);
}

function parseTaskIdFromResult(resultText: string): string | undefined {
  const text = resultText.trim();
  if (text.length === 0) return undefined;
  const phrase = /Task #?([\w-]+)\s+created/i.exec(text);
  if (phrase?.[1]) return phrase[1];
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const candidate =
          (typeof obj.task_id === "string" && obj.task_id) ||
          (typeof obj.taskId === "string" && obj.taskId) ||
          (typeof obj.id === "string" && obj.id) ||
          (typeof obj.id === "number" && String(obj.id));
        if (candidate) return candidate;
      }
    } catch {
      // fall through
    }
  }
  return undefined;
}

function extractTodoWriteTasks(
  input: Record<string, unknown>,
): Array<{ key: string; description: string; status: PlanStepStatus }> {
  const todos = input.todos;
  if (!Array.isArray(todos)) return [];
  const tasks: Array<{ key: string; description: string; status: PlanStepStatus }> = [];
  todos.forEach((todo, index) => {
    if (!todo || typeof todo !== "object") return;
    const obj = todo as Record<string, unknown>;
    const description =
      typeof obj.content === "string" && obj.content.trim().length > 0
        ? obj.content.trim()
        : "Task";
    const status = readPlanStepStatus(obj.status) ?? "pending";
    tasks.push({ key: `todo:${index}`, description, status });
  });
  return tasks;
}

function readTaskCreateDescription(input: Record<string, unknown>): string | undefined {
  return readStringField(input, "subject") ?? readStringField(input, "description");
}
