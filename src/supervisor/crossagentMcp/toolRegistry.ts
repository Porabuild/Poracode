import type { AgentKind, AgentStatus } from "@/shared/contracts";
import { capabilitiesForPresentation, modelSelectionFor } from "@/shared/agentSelection";
import { formatReasoningLabel } from "@/shared/modelLabels";
import type { AgentAdapter } from "@/supervisor/agents/base";
import {
  filterCrossagentCapabilities,
  isCrossagentProviderEnabled,
  type CrossagentVisibilitySettings,
} from "./availability";
import { MAX_CONCURRENT_CHILDREN_PER_PARENT, type SubagentRunManager } from "./SubagentRunManager";
import { errorResult, jsonResult, parseWaitTimeoutMs, TIMEOUT_S_DESCRIPTION } from "./toolResult";
import { parseRunIds, parseSpawnRequest, parseSpawnRequests } from "./toolRequests";
import { resolveSubagentExecution } from "./types";
import type {
  McpToolResult,
  ModelTier,
  SpawnableAgent,
  SpawnableAgentSummary,
  ToolSpec,
} from "./types";

export type { ToolSpec } from "./types";

const FAST_CHEAP_KEYWORDS = ["haiku", "mini", "nano", "lite", "flash", "small", "spark", "fast"];
const MAX_CAPABILITY_KEYWORDS = ["opus", "fable", "pro", "max", "ultra", "big"];

/** Whether `keyword` appears in `haystack` as a whole word (not as a substring of a larger word). */
function hasWholeWordMatch(haystack: string, keyword: string): boolean {
  return new RegExp(`\\b${keyword}\\b`, "i").test(haystack);
}

/**
 * Classify a model into a coarse cost/capability tier from its id/label,
 * keyword-matched case-insensitively and provider-agnostic (no per-provider
 * special-casing). Matches whole words only, so e.g. "gemini" doesn't
 * false-positive on the "mini" keyword.
 */
export function classifyModelTier(modelId: string, modelLabel: string): ModelTier {
  const haystack = `${modelId} ${modelLabel}`;
  if (FAST_CHEAP_KEYWORDS.some((keyword) => hasWholeWordMatch(haystack, keyword)))
    return "fast-cheap";
  if (MAX_CAPABILITY_KEYWORDS.some((keyword) => hasWholeWordMatch(haystack, keyword)))
    return "max-capability";
  return "balanced";
}

/** Base routing guidance always included in the MCP `initialize` instructions. */
export const CROSSAGENT_MCP_INSTRUCTIONS_BASE = [
  "Use the Crossagents MCP server to delegate lightweight, ephemeral work to the other AI agents connected to this Poracode session.",
  "Call list_agents first for the compact provider roster, then call get_agent with the chosen provider id for its models, reasoning options, Fast availability, and permissions preset.",
  "This server hosts one delegation lane: ephemeral subagent runs whose output streams into your own thread, best for search, summarization, bulk edits, and one-off checks.",
  "Use spawn_agent for delegation: it waits by default, or set background=true to return immediately so the parent can keep working. A background completion is delivered back automatically, so do not call wait_for_agent unless you explicitly need to synchronize sooner; get_status and list_runs remain available for manual inspection.",
  "Pass tasks=[...] to the same spawn_agent call to launch up to four independent agents in parallel.",
  "Use ordered fallbacks to retry startup failures on another model or provider. Retrying after a dispatched turn requires retry_on='any-failure' because it may repeat side effects.",
  "Background runs also survive interruption of the current parent turn, but still stop when the parent thread closes.",
  "Give each subagent a self-contained prompt — it does not share your conversation context.",
  "Routing: prefer fast/cheap agents+models for search, bulk edits, and summarization; reserve the strongest agents for implementation and review.",
  "For long-lived, first-class app threads the user sees in the sidebar (optionally in their own git worktree) — e.g. one ticket or feature per thread — use the always-on `poracode` MCP server's thread tools (create_thread, list_threads, get_thread, read_thread, send_to_thread, wait_for_thread, interrupt_thread, stop_thread) instead.",
].join(" ");

export function buildSubagentInstructions(routingGuide?: string): string {
  const guide = routingGuide?.trim();
  return guide
    ? `${CROSSAGENT_MCP_INSTRUCTIONS_BASE}\n\n${guide}`
    : CROSSAGENT_MCP_INSTRUCTIONS_BASE;
}

const SUBAGENT_SELECTION_PROPERTIES = {
  provider: {
    type: "string",
    description: "Provider id from list_agents (for example `codex`).",
  },
  model: {
    type: "string",
    description: "Model value from get_agent. Omit for its defaultModel.",
  },
  reasoning: {
    type: "string",
    description: "Reasoning value listed on the selected get_agent model. Omit for its default.",
  },
  fast: {
    type: "boolean",
    description: "Enable Fast when the selected model reports fast.available=true. Default false.",
  },
  permissions: {
    type: "string",
    enum: ["full-access"],
    description: "Permission preset from get_agent. Defaults to full-access for subagents.",
  },
} as const;

const SUBAGENT_TASK_PROPERTIES = {
  ...SUBAGENT_SELECTION_PROPERTIES,
  prompt: { type: "string", description: "Self-contained task for the subagent." },
  name: { type: "string", description: "Optional short label for the run." },
  fallbacks: {
    type: "array",
    maxItems: 3,
    description:
      "Ordered alternate provider/model selections for failed attempts. Startup failures retry safely by default.",
    items: {
      type: "object",
      required: ["provider"],
      properties: SUBAGENT_SELECTION_PROPERTIES,
    },
  },
  retry_on: {
    type: "string",
    enum: ["startup", "any-failure"],
    description:
      "Retry only before turn dispatch (default), or retry any failure even when work may have side effects.",
  },
} as const;

const SUBAGENT_REQUEST_PROPERTIES = {
  ...SUBAGENT_TASK_PROPERTIES,
  background: {
    type: "boolean",
    description:
      "Return immediately so the parent can continue working; completion is delivered back automatically. Default false waits for completion. Background runs survive parent-turn interruption but stop when the parent thread closes.",
  },
} as const;

const BASE_TOOLS: ToolSpec[] = [
  {
    name: "list_agents",
    description:
      "List spawnable providers as compact summaries: id, label, execution lane, default model, and model count. Call get_agent with an id before spawning to get that provider's full composer options.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_agent",
    description:
      "Get one provider's full composer-style options by id: models, model-specific reasoning values, Fast availability, permissions, and execution lane. Use these values in spawn_agent or create_thread.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Provider id from list_agents." },
      },
    },
  },
  {
    name: "spawn_agent",
    description:
      "Spawn one agent and wait for its result by default. Set background=true to return immediately and receive its completion automatically, or pass tasks=[...] to atomically launch several agents in parallel through this same tool.",
    inputSchema: {
      type: "object",
      properties: {
        ...SUBAGENT_REQUEST_PROPERTIES,
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: MAX_CONCURRENT_CHILDREN_PER_PARENT,
          items: {
            type: "object",
            required: ["provider", "prompt"],
            properties: SUBAGENT_TASK_PROPERTIES,
          },
        },
        timeout_s: {
          type: "number",
          description: TIMEOUT_S_DESCRIPTION,
        },
      },
      oneOf: [{ required: ["provider", "prompt"] }, { required: ["tasks"] }],
    },
  },
  {
    name: "wait_for_agent",
    description:
      "Wait for one background run_id or several run_ids concurrently, returning their status and output.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        run_ids: {
          type: "array",
          minItems: 1,
          maxItems: MAX_CONCURRENT_CHILDREN_PER_PARENT,
          items: { type: "string" },
        },
        timeout_s: {
          type: "number",
          description: TIMEOUT_S_DESCRIPTION,
        },
      },
      oneOf: [{ required: ["run_id"] }, { required: ["run_ids"] }],
    },
  },
  {
    name: "get_status",
    description:
      "Check a spawned subagent without blocking: returns its current status and the output produced so far.",
    inputSchema: {
      type: "object",
      required: ["run_id"],
      properties: { run_id: { type: "string" } },
    },
  },
  {
    name: "list_runs",
    description:
      "List this parent thread's subagent runs, including background work, current status, and retry attempt.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cancel",
    description: "Interrupt and dispose a running subagent by run_id.",
    inputSchema: {
      type: "object",
      required: ["run_id"],
      properties: { run_id: { type: "string" } },
    },
  },
];

/** Catalog: the ephemeral subagent-run lane. Full-thread orchestration lives
 *  in the always-on `poracode` (app-controls) MCP server's thread tools. */
export const TOOLS: ToolSpec[] = BASE_TOOLS;

export const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));
const LEGACY_TOOL_NAMES = new Set(["run_agent", "spawn_agents", "wait_for_agents"]);

export function isKnownToolName(name: string): boolean {
  return TOOL_NAMES.has(name) || LEGACY_TOOL_NAMES.has(name);
}

/**
 * Build the spawnable-agent catalog from the adapter registry + agent statuses,
 * filtered to installed + authenticated providers the run manager can drive as a
 * child. An adapter qualifies via either lane:
 * - `structured`: implements `createStructuredSession` (full GUI runtime).
 * - `one-shot`: has no structured runtime but implements
 *   `buildSubagentOneShotCommand` (a bypass-permissions CLI invocation) — this
 *   pulls CLI-only providers (Antigravity, Command Code) into the roster.
 * The `execution` field is surfaced so calling agents can see which lane a child
 * uses (one-shot children stream a single result and can't be steered).
 */
export function buildSpawnableAgents(
  adapters: Map<AgentKind, AgentAdapter>,
  statuses: readonly AgentStatus[],
  visibility: CrossagentVisibilitySettings = {
    disabledAgents: [],
    hiddenModels: {},
  },
): SpawnableAgent[] {
  const out: SpawnableAgent[] = [];
  for (const status of statuses) {
    if (!status.installed || status.authState !== "authenticated") continue;
    if (!isCrossagentProviderEnabled(status.kind, visibility)) continue;
    const adapter = adapters.get(status.kind);
    if (!adapter) continue;
    const execution = resolveSubagentExecution(adapter);
    if (!execution) continue;
    const presentationCapabilities =
      execution === "structured"
        ? capabilitiesForPresentation(status.capabilities, "gui")
        : status.capabilities;
    const capabilities = filterCrossagentCapabilities(
      status.kind,
      execution,
      presentationCapabilities,
      visibility,
    );
    const reasoningOptions = new Map<string, string>();
    const models = capabilities.models.map((m) => {
      const selection = modelSelectionFor(capabilities, m.id);
      for (const value of selection.reasoning.values) {
        reasoningOptions.set(value, formatReasoningLabel(value));
      }
      return {
        value: m.id,
        label: m.label,
        tier: classifyModelTier(m.id, m.label),
        reasoning: {
          values: selection.reasoning.values,
          ...(selection.reasoning.default ? { default: selection.reasoning.default } : {}),
        },
        ...(selection.fast.supported
          ? {
              fast: {
                available: selection.fast.available,
                ...(selection.fast.disabledReason
                  ? { disabledReason: selection.fast.disabledReason }
                  : {}),
              },
            }
          : {}),
      };
    });
    if (models.length === 0) continue;
    out.push({
      provider: { value: status.kind, label: status.label },
      models,
      reasoningOptions: [...reasoningOptions].map(([value, label]) => ({ value, label })),
      defaultModel: models[0]!.value,
      execution,
      permissions: {
        options: [{ value: "full-access", label: "Full access" }],
        default: "full-access",
      },
    });
  }
  return out;
}

function summarizeAgent(agent: SpawnableAgent): SpawnableAgentSummary {
  return {
    id: agent.provider.value,
    label: agent.provider.label,
    execution: agent.execution,
    defaultModel: agent.defaultModel,
    modelCount: agent.models.length,
  };
}

export interface SubagentToolContext {
  parentThreadId: string;
  runManager: SubagentRunManager;
  listSpawnableAgents: () => Promise<SpawnableAgent[]>;
}

async function spawnAgent(
  args: Record<string, unknown>,
  ctx: SubagentToolContext,
): Promise<McpToolResult> {
  const timeoutMs = parseWaitTimeoutMs(args.timeout_s);
  const background = args.background === true;

  if (Array.isArray(args.tasks)) {
    const requests = parseSpawnRequests(args).map((request) => {
      const { background: _taskBackground, ...rest } = request;
      return background ? { ...rest, background: true as const } : rest;
    });
    const runs = ctx.runManager.spawnMany(ctx.parentThreadId, requests);
    if (background) {
      return jsonResult({
        runs: runs.map(({ runId }) => ({
          run_id: runId,
          status: "running",
          output: "",
        })),
      });
    }
    return jsonResult({
      runs: await ctx.runManager.waitForMany(
        runs.map(({ runId }) => runId),
        timeoutMs,
        ctx.parentThreadId,
      ),
    });
  }

  const request = parseSpawnRequest(args);
  const { runId } = ctx.runManager.spawn(ctx.parentThreadId, request);
  if (background) {
    return jsonResult({ run_id: runId, status: "running", output: "" });
  }
  const result = await ctx.runManager.waitFor(runId, timeoutMs, ctx.parentThreadId);
  return jsonResult({ run_id: runId, ...result });
}

/** Dispatch a tools/call. Never throws — validation failures return isError results. */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: SubagentToolContext,
): Promise<McpToolResult> {
  try {
    switch (name) {
      case "list_agents":
        return jsonResult((await ctx.listSpawnableAgents()).map(summarizeAgent));
      case "get_agent": {
        const id = typeof args.id === "string" ? args.id : "";
        if (!id) return errorResult("id is required");
        const agent = (await ctx.listSpawnableAgents()).find(
          (candidate) => candidate.provider.value === id,
        );
        return agent ? jsonResult(agent) : errorResult(`Unknown provider id: ${id}`);
      }
      case "spawn_agent":
        return await spawnAgent(args, ctx);
      // Hidden compatibility aliases for provider sessions initialized against
      // the earlier, wider tool catalog.
      case "spawn_agents": {
        const requests = parseSpawnRequests(args).map((request) => ({
          ...request,
          background: true as const,
        }));
        const runs = ctx.runManager.spawnMany(ctx.parentThreadId, requests);
        return jsonResult({ run_ids: runs.map(({ runId }) => runId) });
      }
      case "wait_for_agent": {
        if (Array.isArray(args.run_ids)) {
          const runIds = parseRunIds(args);
          return jsonResult(
            await ctx.runManager.waitForMany(
              runIds,
              parseWaitTimeoutMs(args.timeout_s),
              ctx.parentThreadId,
            ),
          );
        }
        const runId = typeof args.run_id === "string" ? args.run_id : "";
        if (!runId) return errorResult("run_id is required");
        return jsonResult(
          await ctx.runManager.waitFor(
            runId,
            parseWaitTimeoutMs(args.timeout_s),
            ctx.parentThreadId,
          ),
        );
      }
      case "wait_for_agents": {
        const runIds = parseRunIds(args);
        return jsonResult(
          await ctx.runManager.waitForMany(
            runIds,
            parseWaitTimeoutMs(args.timeout_s),
            ctx.parentThreadId,
          ),
        );
      }
      case "run_agent": {
        return await spawnAgent(args, ctx);
      }
      case "get_status": {
        const runId = typeof args.run_id === "string" ? args.run_id : "";
        if (!runId) return errorResult("run_id is required");
        return jsonResult(ctx.runManager.getStatus(runId, ctx.parentThreadId));
      }
      case "list_runs":
        return jsonResult(ctx.runManager.listRuns(ctx.parentThreadId));
      case "cancel": {
        const runId = typeof args.run_id === "string" ? args.run_id : "";
        if (!runId) return errorResult("run_id is required");
        await ctx.runManager.cancel(runId, ctx.parentThreadId);
        return jsonResult({ ok: true });
      }
      default:
        return errorResult(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}
