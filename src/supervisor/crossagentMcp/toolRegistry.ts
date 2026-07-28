import type { AgentKind, AgentStatus } from "@/shared/contracts";
import { capabilitiesForPresentation, modelSelectionFor } from "@/shared/agentSelection";
import { normalizeCrossagentTags, rankCrossagentCandidates } from "@/shared/crossagentRanking";
import type { CrossagentRoutingSnapshotEntry } from "@/shared/crossagentRanking";
import { formatReasoningLabel } from "@/shared/modelLabels";
import type { CrossagentRoutingOverride, SharedSettings } from "@/shared/settings";
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
  ExplicitSpawnAgentSelection,
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
  "Call list_agents first for the compact provider roster, learned rank, and preferred selection, then call get_agent with a provider id when you need its full models, reasoning options, Fast availability, and permissions preset.",
  "Classify every task with 1-5 concise lowercase tags and pass the same tags to list_agents and spawn_agent. Prefer this vocabulary when applicable: frontend, ui, design, backend, mobile, simulator, implementation, bugfix, review, testing, research, refactor, docs, devops, data. Crossagents learns tag-to-selection affinity from user-explicit selection choices without an extra model call.",
  "Explicit provider, model, reasoning, and Fast values always win. When the user does not specify them, omit those fields and Crossagents will resolve matching manual task routes first, then learned task tags, global explicit Crossagents usage, favorite and frequently used composer selections, then built-in order.",
  "When the user explicitly asks to always prefer a provider/model for a kind of task, call set_routing_preference with its tags and selection. This persistent manual override ranks before learned affinity. Use remove_routing_preference when the user asks to forget or reset it; do not create or remove persistent preferences without clear user intent.",
  "This server hosts one delegation lane: ephemeral subagent runs whose output streams into your own thread, best for search, summarization, bulk edits, and one-off checks.",
  "Use spawn_agent for delegation: it waits by default. Set background=true only when the parent has useful work to do before the result; this returns a run_id and never injects a new message into the parent thread. At the next synchronization point, call wait_for_agent once for every background result the task requires. Use a bounded timeout and do not repeatedly poll a stalled run; cancel it or continue without it.",
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
    description:
      "Provider id from list_agents (for example `codex`). Omit when the user did not specify one to use the highest-ranked available provider.",
  },
  model: {
    type: "string",
    description:
      "Model value from get_agent. Omit when the user did not specify one to use the provider's preferred model.",
  },
  reasoning: {
    type: "string",
    description:
      "Reasoning value listed on the selected get_agent model. Omit when the user did not specify one to use the preferred or model-default value.",
  },
  fast: {
    type: "boolean",
    description:
      "Enable Fast when the selected model reports fast.available=true. Omit to use the learned preference when applicable, otherwise false.",
  },
  permissions: {
    type: "string",
    enum: ["full-access"],
    description: "Permission preset from get_agent. Defaults to full-access for subagents.",
  },
} as const;

const TASK_TAGS_PROPERTY = {
  type: "array",
  minItems: 1,
  maxItems: 5,
  uniqueItems: true,
  items: { type: "string", minLength: 1, maxLength: 32 },
  description:
    "1-5 concise task classifications used for contextual routing and learning. Prefer: frontend, ui, design, backend, mobile, simulator, implementation, bugfix, review, testing, research, refactor, docs, devops, data.",
} as const;

const SUBAGENT_TASK_PROPERTIES = {
  ...SUBAGENT_SELECTION_PROPERTIES,
  prompt: { type: "string", description: "Self-contained task for the subagent." },
  tags: TASK_TAGS_PROPERTY,
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
      "Return immediately with a run_id so the parent can continue useful work. The result is never injected as a message; call wait_for_agent at a synchronization point if it is required. Default false waits for completion. Background runs survive parent-turn interruption but stop when the parent thread closes.",
  },
} as const;

const BASE_TOOLS: ToolSpec[] = [
  {
    name: "list_agents",
    description:
      "List currently spawnable providers in resolved routing order, including task-tag affinity, rank, ranking source, usage count, learned tags, preferred selection, execution lane, default model, and model count. Pass the task's tags here and again to spawn_agent.",
    inputSchema: {
      type: "object",
      properties: { tags: TASK_TAGS_PROPERTY },
    },
  },
  {
    name: "get_agent",
    description:
      "Get one currently spawnable provider by id, including its task-tag affinity, learned tags, preference and rank, models, model-specific reasoning values, Fast availability, permissions, and execution lane.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Provider id from list_agents." },
        tags: TASK_TAGS_PROPERTY,
      },
    },
  },
  {
    name: "spawn_agent",
    description:
      "Spawn one task-tagged agent and wait for its result by default. Omitted selection fields resolve from contextual rank. Set background=true to return a run_id immediately, or pass tasks=[...] to launch several agents in parallel.",
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
            required: ["prompt"],
            properties: SUBAGENT_TASK_PROPERTIES,
          },
        },
        timeout_s: {
          type: "number",
          description: TIMEOUT_S_DESCRIPTION,
        },
      },
      oneOf: [{ required: ["prompt"] }, { required: ["tasks"] }],
    },
  },
  {
    name: "list_routing_preferences",
    description:
      "List persistent user-pinned task-tag routes. Use this when the user asks what manual Crossagents preferences are active.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_routing_preference",
    description:
      "Create or replace a persistent manual route for an exact task-tag set. Call only when the user clearly asks to always prefer or remember this route.",
    inputSchema: {
      type: "object",
      required: ["tags", "provider"],
      properties: {
        tags: TASK_TAGS_PROPERTY,
        provider: SUBAGENT_SELECTION_PROPERTIES.provider,
        model: SUBAGENT_SELECTION_PROPERTIES.model,
        reasoning: SUBAGENT_SELECTION_PROPERTIES.reasoning,
        fast: SUBAGENT_SELECTION_PROPERTIES.fast,
      },
    },
  },
  {
    name: "remove_routing_preference",
    description:
      "Remove the persistent manual route for an exact task-tag set. Call only when the user clearly asks to forget or reset that preference.",
    inputSchema: {
      type: "object",
      required: ["tags"],
      properties: { tags: TASK_TAGS_PROPERTY },
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
  visibility: CrossagentVisibilitySettings &
    Partial<
      Pick<
        SharedSettings,
        | "crossagentSelectionUsage"
        | "crossagentRoutingOverrides"
        | "agentSelectionUsage"
        | "favoriteModels"
      >
    > = {
    disabledAgents: [],
    hiddenModels: {},
  },
  contextTags: readonly string[] = [],
): SpawnableAgent[] {
  const out: Array<Omit<SpawnableAgent, "preference">> = [];
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
  const ranked = rankCrossagentCandidates(
    out.map((agent) => ({
      provider: agent.provider.value,
      defaultModel: agent.defaultModel,
      models: agent.models.map((model) => ({
        id: model.value,
        efforts: model.reasoning.values,
        ...(model.reasoning.default ? { defaultEffort: model.reasoning.default } : {}),
        fastAvailable: model.fast?.available === true,
      })),
    })),
    {
      crossagentSelectionUsage: visibility.crossagentSelectionUsage ?? [],
      routingOverrides: visibility.crossagentRoutingOverrides ?? [],
      agentSelectionUsage: visibility.agentSelectionUsage ?? [],
      favoriteModels: visibility.favoriteModels ?? [],
      contextTags,
    },
  );
  const agentsByProvider = new Map(out.map((agent) => [agent.provider.value, agent]));
  return ranked.map((entry) => {
    const agent = agentsByProvider.get(entry.provider)!;
    return {
      ...agent,
      preference: {
        rank: entry.rank,
        source: entry.source,
        usageCount: entry.usageCount,
        model: entry.preferredSelection.model,
        ...(entry.preferredSelection.effort ? { reasoning: entry.preferredSelection.effort } : {}),
        fast: entry.preferredSelection.fast,
        matchedTags: entry.matchedTags,
        learnedTags: entry.learnedTags,
      },
    };
  });
}

function summarizeAgent(agent: SpawnableAgent): SpawnableAgentSummary {
  const preference = agent.preference ?? {
    rank: 1,
    source: "built-in" as const,
    usageCount: 0,
    model: agent.defaultModel,
    fast: false,
    matchedTags: [],
    learnedTags: [],
  };
  return {
    id: agent.provider.value,
    label: agent.provider.label,
    execution: agent.execution,
    defaultModel: agent.defaultModel,
    modelCount: agent.models.length,
    rank: preference.rank,
    preferenceSource: preference.source,
    usageCount: preference.usageCount,
    preferredModel: preference.model,
    ...(preference.reasoning ? { preferredReasoning: preference.reasoning } : {}),
    preferredFast: preference.fast,
    matchedTags: preference.matchedTags ?? [],
    learnedTags: preference.learnedTags ?? [],
  };
}

export function crossagentRoutingSnapshot(
  agents: readonly SpawnableAgent[],
): CrossagentRoutingSnapshotEntry[] {
  return agents.map((agent) => {
    const summary = summarizeAgent(agent);
    const model = agent.models.find((candidate) => candidate.value === summary.preferredModel);
    return {
      provider: summary.id,
      label: summary.label,
      execution: summary.execution,
      rank: summary.rank,
      source: summary.preferenceSource,
      usageCount: summary.usageCount,
      model: {
        id: summary.preferredModel,
        label: model?.label ?? summary.preferredModel,
      },
      ...(summary.preferredReasoning ? { reasoning: summary.preferredReasoning } : {}),
      fast: summary.preferredFast,
      learnedTags: summary.learnedTags,
    };
  });
}

export interface SubagentToolContext {
  parentThreadId: string;
  runManager: SubagentRunManager;
  listSpawnableAgents: (tags?: readonly string[]) => Promise<SpawnableAgent[]>;
  recordExplicitSelections?: (selections: readonly ExplicitSpawnAgentSelection[]) => void;
  listRoutingOverrides?: () => readonly CrossagentRoutingOverride[];
  setRoutingOverride?: (override: CrossagentRoutingOverride) => void | Promise<void>;
  removeRoutingOverride?: (tags: readonly string[]) => void | Promise<void>;
}

interface ResolvedSelectionArgs {
  args: Record<string, unknown>;
  tags: string[];
  explicitFields: ExplicitSpawnAgentSelection["explicitFields"];
}

function resolveSelectionArgs(
  args: Record<string, unknown>,
  agents: readonly SpawnableAgent[],
): ResolvedSelectionArgs {
  const requestedProvider =
    typeof args.provider === "string" && args.provider.length > 0 ? args.provider : undefined;
  const requestedModel =
    typeof args.model === "string" && args.model.length > 0 ? args.model : undefined;
  const requestedReasoning =
    typeof args.reasoning === "string" && args.reasoning.length > 0 ? args.reasoning : undefined;
  const requestedFast = typeof args.fast === "boolean" ? args.fast : undefined;
  const tags = normalizeCrossagentTags(args.tags);
  const explicitFields = {
    provider: requestedProvider !== undefined,
    model: requestedModel !== undefined,
    effort: requestedReasoning !== undefined,
    fast: requestedFast !== undefined,
  };
  const eligibleAgents = agents.flatMap((candidate) => {
    if (requestedProvider && candidate.provider.value !== requestedProvider) return [];
    const preference = candidate.preference;
    const modelIds = requestedModel
      ? [requestedModel]
      : [
          ...new Set([
            ...(preference?.model ? [preference.model] : []),
            candidate.defaultModel,
            ...candidate.models.map((model) => model.value),
          ]),
        ];
    const model = modelIds
      .map((modelId) => candidate.models.find((option) => option.value === modelId))
      .find(
        (option) =>
          option !== undefined &&
          (!requestedReasoning || option.reasoning.values.includes(requestedReasoning)) &&
          (requestedFast !== true || option.fast?.available === true),
      );
    return model ? [{ agent: candidate, model }] : [];
  });
  const selected = eligibleAgents[0];
  if (!selected) {
    if (requestedProvider) {
      throw new Error(
        `Provider or requested selection is not currently available: ${requestedProvider}`,
      );
    }
    throw new Error("No available Crossagents provider supports the requested selection");
  }
  const { agent, model: modelOption } = selected;
  const provider = agent.provider.value;

  const preferred = agent.preference ?? {
    rank: 1,
    source: "built-in" as const,
    usageCount: 0,
    model: agent.defaultModel,
    fast: false,
    matchedTags: [],
    learnedTags: [],
  };
  const model = modelOption.value;
  const usePreferredDetails = preferred.model === model;
  const reasoning =
    requestedReasoning ??
    (usePreferredDetails ? preferred.reasoning : undefined) ??
    modelOption.reasoning.default;
  const fast =
    requestedFast !== undefined ? requestedFast : usePreferredDetails ? preferred.fast : false;

  return {
    explicitFields,
    tags,
    args: {
      ...args,
      provider,
      model,
      ...(reasoning ? { reasoning } : {}),
      fast,
    },
  };
}

async function spawnAgent(
  args: Record<string, unknown>,
  ctx: SubagentToolContext,
): Promise<McpToolResult> {
  const timeoutMs = parseWaitTimeoutMs(args.timeout_s);
  const background = args.background === true;
  const rosterCache = new Map<string, Promise<SpawnableAgent[]>>();
  const agentsFor = (selectionArgs: Record<string, unknown>) => {
    const selectionTags = normalizeCrossagentTags(selectionArgs.tags);
    const key = selectionTags.join("\0");
    const cached = rosterCache.get(key);
    if (cached) return cached;
    const pending = ctx.listSpawnableAgents(selectionTags);
    rosterCache.set(key, pending);
    return pending;
  };

  if (Array.isArray(args.tasks)) {
    const tasks = args.tasks;
    if (tasks.length > MAX_CONCURRENT_CHILDREN_PER_PARENT) {
      return errorResult(`tasks supports at most ${MAX_CONCURRENT_CHILDREN_PER_PARENT} entries`);
    }
    const resolvedTasks: Array<ResolvedSelectionArgs | null> = await Promise.all(
      tasks.map(async (task) => {
        if (!task || typeof task !== "object" || Array.isArray(task)) {
          return null;
        }
        const taskArgs = task as Record<string, unknown>;
        return resolveSelectionArgs(taskArgs, await agentsFor(taskArgs));
      }),
    );
    const requests = parseSpawnRequests({
      ...args,
      tasks: resolvedTasks.map((entry, index) => entry?.args ?? tasks[index]),
    }).map((request) => {
      const { background: _taskBackground, ...rest } = request;
      return background ? { ...rest, background: true as const } : rest;
    });
    const runs = ctx.runManager.spawnMany(ctx.parentThreadId, requests);
    const explicitSelections = requests.flatMap((request, index) => {
      const explicitFields = resolvedTasks[index]?.explicitFields;
      const tags = resolvedTasks[index]?.tags ?? [];
      return explicitFields && Object.values(explicitFields).some(Boolean)
        ? [{ selection: request, explicitFields, tags }]
        : [];
    });
    if (explicitSelections.length > 0) ctx.recordExplicitSelections?.(explicitSelections);
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

  const resolved = resolveSelectionArgs(args, await agentsFor(args));
  const request = parseSpawnRequest(resolved.args);
  const { runId } = ctx.runManager.spawn(ctx.parentThreadId, request);
  if (Object.values(resolved.explicitFields).some(Boolean)) {
    ctx.recordExplicitSelections?.([
      { selection: request, explicitFields: resolved.explicitFields, tags: resolved.tags },
    ]);
  }
  if (background) {
    return jsonResult({ run_id: runId, status: "running", output: "" });
  }
  const result = await ctx.runManager.waitFor(runId, timeoutMs, ctx.parentThreadId);
  return jsonResult({ run_id: runId, ...result });
}

async function setRoutingPreference(
  args: Record<string, unknown>,
  ctx: SubagentToolContext,
): Promise<McpToolResult> {
  if (!ctx.setRoutingOverride) return errorResult("Manual routing preferences are unavailable");
  const tags = normalizeCrossagentTags(args.tags);
  if (tags.length === 0) return errorResult("tags must contain at least one valid task tag");
  const provider =
    typeof args.provider === "string" && args.provider.length > 0 ? args.provider : "";
  if (!provider) return errorResult("provider is required");
  const selectionArgs = { ...args, tags, provider };
  resolveSelectionArgs(selectionArgs, await ctx.listSpawnableAgents(tags));
  const override: CrossagentRoutingOverride = {
    tags,
    agentKind: provider,
    ...(typeof args.model === "string" && args.model.length > 0 ? { modelId: args.model } : {}),
    ...(typeof args.reasoning === "string" && args.reasoning.length > 0
      ? { effort: args.reasoning }
      : {}),
    ...(typeof args.fast === "boolean" ? { fast: args.fast } : {}),
    updatedAt: Date.now(),
  };
  await ctx.setRoutingOverride(override);
  return jsonResult({ status: "saved", override });
}

async function removeRoutingPreference(
  args: Record<string, unknown>,
  ctx: SubagentToolContext,
): Promise<McpToolResult> {
  if (!ctx.removeRoutingOverride) return errorResult("Manual routing preferences are unavailable");
  const tags = normalizeCrossagentTags(args.tags);
  if (tags.length === 0) return errorResult("tags must contain at least one valid task tag");
  await ctx.removeRoutingOverride(tags);
  return jsonResult({ status: "removed", tags });
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
        return jsonResult(
          (await ctx.listSpawnableAgents(normalizeCrossagentTags(args.tags))).map(summarizeAgent),
        );
      case "get_agent": {
        const id = typeof args.id === "string" ? args.id : "";
        if (!id) return errorResult("id is required");
        const agent = (await ctx.listSpawnableAgents(normalizeCrossagentTags(args.tags))).find(
          (candidate) => candidate.provider.value === id,
        );
        return agent ? jsonResult(agent) : errorResult(`Unknown provider id: ${id}`);
      }
      case "list_routing_preferences":
        return ctx.listRoutingOverrides
          ? jsonResult(ctx.listRoutingOverrides())
          : errorResult("Manual routing preferences are unavailable");
      case "set_routing_preference":
        return await setRoutingPreference(args, ctx);
      case "remove_routing_preference":
        return await removeRoutingPreference(args, ctx);
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
