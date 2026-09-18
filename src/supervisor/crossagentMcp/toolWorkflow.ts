import { normalizeCrossagentTags } from "@/shared/crossagentRanking";
import { SubagentWorkflowManager, type WorkflowTask } from "./SubagentWorkflowManager";
import type { SubagentRunManager } from "./SubagentRunManager";
import { parseSpawnRequest } from "./toolRequests";
import { jsonResult, parseWaitTimeoutMs } from "./toolResult";
import { resolveSelectionArgs } from "./toolSpawn";
import type { SubagentToolContext } from "./toolRegistry";
import type { ExplicitSpawnAgentSelection, McpToolResult, SpawnableAgent } from "./types";

const managers = new WeakMap<SubagentRunManager, SubagentWorkflowManager>();

function managerFor(runs: SubagentRunManager): SubagentWorkflowManager {
  let manager = managers.get(runs);
  if (!manager) {
    manager = new SubagentWorkflowManager({
      validate: (parent, requests) => runs.validateRequests(parent, requests),
      spawn: (parent, request) => runs.spawn(parent, request),
      waitForSettlement: (parent, runId) => runs.waitForSettlement(parent, runId),
      getStatus: (parent, runId) => runs.getStatus(runId, parent),
      getCapacity: (parent) => runs.getCapacity(parent).available_slots,
      subscribe: (parent, listener) => runs.subscribe(parent, listener),
      cancel: (parent, runId) => runs.cancel(runId, parent),
    });
    managers.set(runs, manager);
  }
  return manager;
}

function stringArray(value: unknown, name: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 64 ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(`${name} must be an array of at most 64 nonblank strings`);
  }
  return value;
}

export async function dispatchWorkflow(
  args: Record<string, unknown>,
  ctx: SubagentToolContext,
): Promise<McpToolResult> {
  const action = args.action === undefined ? "start" : args.action;
  if (
    typeof action !== "string" ||
    !["start", "status", "wait", "cancel", "list"].includes(action)
  ) {
    throw new Error("Unknown workflow action");
  }
  const manager = managerFor(ctx.runManager);
  const parent = ctx.parentThreadId;
  if (action !== "start") {
    if (args.tasks !== undefined) throw new Error("tasks are only accepted for workflow start");
    if (action === "list") return jsonResult(manager.list(parent));
    const id = typeof args.workflow_id === "string" ? args.workflow_id : "";
    if (!id) throw new Error("workflow_id is required");
    if (action === "cancel") await manager.cancel(parent, id);
    return jsonResult(
      action === "wait"
        ? await manager.waitFor(parent, id, parseWaitTimeoutMs(args))
        : manager.getStatus(parent, id),
    );
  }
  if (args.workflow_id !== undefined) throw new Error("workflow_id is not accepted for start");
  if (!Array.isArray(args.tasks) || args.tasks.length < 1 || args.tasks.length > 16) {
    throw new Error("A workflow requires 1–16 tasks");
  }
  const defaults = Object.fromEntries(
    ["provider", "model", "reasoning", "fast", "permissions"].flatMap((key) =>
      args[key] !== undefined ? [[key, args[key]]] : [],
    ),
  );
  const roster = new Map<string, Promise<SpawnableAgent[]>>();
  const selections: ExplicitSpawnAgentSelection[] = [];
  const tasks: WorkflowTask[] = await Promise.all(
    args.tasks.map(async (value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`tasks[${index}] must be an object`);
      const task = value as Record<string, unknown>;
      if (typeof task.id !== "string") throw new Error(`tasks[${index}].id is required`);
      const writeScope = stringArray(task.write_scope, "write_scope");
      const dependsOn =
        task.depends_on === undefined ? [] : stringArray(task.depends_on, "depends_on");
      const selection = { ...defaults, ...task };
      const tags = normalizeCrossagentTags(selection.tags);
      const key = tags.join("\0");
      let pending = roster.get(key);
      if (!pending) {
        pending = ctx.listSpawnableAgents(tags);
        roster.set(key, pending);
      }
      const resolved = resolveSelectionArgs(selection, await pending);
      const request = parseSpawnRequest({
        ...resolved.args,
        result_mode: task.result_mode === undefined ? "compact" : task.result_mode,
      });
      if (Object.values(resolved.explicitFields).some(Boolean)) {
        selections.push({ selection: request, tags, explicitFields: resolved.explicitFields });
      }
      return { id: task.id, dependsOn, writeScope, request };
    }),
  );
  const { workflowId } = manager.start(parent, tasks);
  if (selections.length) ctx.recordExplicitSelections?.(selections);
  return jsonResult(
    args.background === true
      ? manager.getStatus(parent, workflowId)
      : await manager.waitFor(parent, workflowId, parseWaitTimeoutMs(args)),
  );
}
