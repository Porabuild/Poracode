import {
  loadPluginCoreSkillPhrase,
  uniqueCoreSkillForBuiltInMcp,
} from "@/shared/plugins/builtInCoreSkills";
import type { AgentKind, AgentStatus } from "@/shared/contracts";
import type { ThreadCrewBinding } from "@/shared/crew";
import { modelSelectionFor } from "@/shared/agentSelection";
import {
  crossagentRankingPreferences,
  normalizeCrossagentTags,
  rankCrossagentCandidates,
} from "@/shared/crossagentRanking";
import { formatReasoningLabel } from "@/shared/modelLabels";
import { classifyModelTier } from "@/shared/modelTier";
import {
  crossagentRoutingOverrideSchema,
  type CrossagentRoutingOverride,
  type CrossagentRoutingSelection,
  type SharedSettings,
} from "@/shared/settings";
import type { AgentAdapter } from "@/supervisor/agents/base";
import {
  filterCrossagentCapabilities,
  isCrossagentProviderEnabled,
  presentedCrossagentCapabilities,
  type CrossagentVisibilitySettings,
} from "./availability";
import { MAX_CONCURRENT_CHILDREN_PER_PARENT, type SubagentRunManager } from "./SubagentRunManager";
import {
  errorResult,
  jsonResult,
  runToolResult,
  WAIT_AGAIN_INSTRUCTION,
  parseWaitOptions,
  parseWaitTimeoutMs,
  TIMEOUT_S_DESCRIPTION,
  workflowTimeoutDescription,
} from "./toolResult";
import { parseRunIds, parseSpawnRequests } from "./toolRequests";
import { crewListDescription } from "./crewRoles";
import { resolveSelectionArgs, spawnAgent } from "./toolSpawn";
import { dispatchWorkflow } from "./toolWorkflow";
import { steerAgent } from "./toolSteer";
import { rankingCandidateOf, resolveSubagentExecution } from "./types";
import type {
  McpToolResult,
  ExplicitSpawnAgentSelection,
  SpawnableAgent,
  SpawnableAgentSummary,
  ToolSpec,
} from "./types";

export type { ToolSpec } from "./types";

const CROSSAGENTS_CORE_SKILL = uniqueCoreSkillForBuiltInMcp("crossagents");

const AUTHORIZATION_INSTRUCTION =
  "Delegate only after the user's explicit request in this thread; authorization persists.";
const CORE_SKILL_INSTRUCTION = `Before first delegation, ${loadPluginCoreSkillPhrase(CROSSAGENTS_CORE_SKILL)} once using its known path or ID.`;
const TOOL_SETUP_INSTRUCTIONS = [
  "Resolve crossagents-qualified tool names and only needed schemas together. Reuse loaded instructions and batch independent setup.",
  "Known selections can spawn directly; use get_agent for missing model details and list_agents only when the provider is unknown.",
];

/** Keep bootstrap small: some clients repeat initialize instructions in every tool description. */
export const CROSSAGENT_MCP_INSTRUCTIONS_BASE = [
  AUTHORIZATION_INSTRUCTION,
  CORE_SKILL_INSTRUCTION,
  ...TOOL_SETUP_INSTRUCTIONS,
].join(" ");

/**
 * Crew threads carry their own delegation playbook in the crew brief, so the
 * lead skips loading the core skill (a whole extra lead turn and context).
 */
export const CROSSAGENT_MCP_CREW_INSTRUCTIONS_BASE = [
  AUTHORIZATION_INSTRUCTION,
  ...TOOL_SETUP_INSTRUCTIONS,
].join(" ");

export function buildSubagentInstructions(
  routingGuide?: string,
  options?: { crew?: boolean },
): string {
  const base = options?.crew
    ? CROSSAGENT_MCP_CREW_INSTRUCTIONS_BASE
    : CROSSAGENT_MCP_INSTRUCTIONS_BASE;
  const guide = routingGuide?.trim();
  return guide ? `${base}\n\n${guide}` : base;
}

const NESTED_SELECTION_PROPERTIES = {
  provider: { type: "string" },
  model: { type: "string" },
  reasoning: { type: "string" },
  fast: { type: "boolean" },
  permissions: { type: "string", enum: ["full-access"] },
} as const;

const SUBAGENT_SELECTION_PROPERTIES = {
  provider: { type: "string", description: "Provider id from list_agents; omit for auto-rank." },
  model: { type: "string", description: "Model id from get_agent; omit for provider default." },
  reasoning: { type: "string", description: "Reasoning level from get_agent." },
  fast: { type: "boolean", description: "Enable Fast when supported." },
  permissions: { type: "string", enum: ["full-access"], description: "Default full-access." },
} as const;

const OUTPUT_MODE_PROPERTY = {
  type: "string",
  enum: ["quiet", "progress"],
  description: "quiet (default) omits worker narration; progress restores it.",
} as const;

const FULL_OUTPUT_PROPERTY = {
  type: "boolean",
  description: "Return full accumulated output instead of tail.",
} as const;

const AFTER_OUTPUT_CHARS_PROPERTY = {
  type: "integer",
  minimum: 0,
  description: "Return output produced after this char offset (previous total_output_chars).",
} as const;

const AFTER_OUTPUT_CHARS_BY_RUN_PROPERTY = {
  type: "object",
  additionalProperties: { type: "integer", minimum: 0 },
  description: "Per-run char offsets keyed by run_id.",
} as const;

const NESTED_TAGS_PROPERTY = {
  type: "array",
  minItems: 1,
  maxItems: 5,
  uniqueItems: true,
  items: { type: "string", minLength: 1, maxLength: 32 },
} as const;

const TASK_TAGS_PROPERTY = {
  ...NESTED_TAGS_PROPERTY,
  description: "1-5 task tags (e.g. frontend, backend, review, testing, research, refactor, docs).",
} as const;

const FALLBACKS_PROPERTY = {
  type: "array",
  maxItems: 3,
  description: "Ordered fallback selections.",
  items: {
    type: "object",
    required: ["provider"],
    properties: NESTED_SELECTION_PROPERTIES,
  },
} as const;

const SUBAGENT_TASK_PROPERTIES = {
  ...SUBAGENT_SELECTION_PROPERTIES,
  role: {
    type: "string",
    description:
      "Crew role id from list_agents (for example `sidekick`) when this thread has a crew. The role sets provider, model, reasoning and Fast; omit those.",
  },
  user_requested: {
    type: "boolean",
    description: "True only when the user explicitly asked for an agent/model outside the crew.",
  },
  fresh_session: {
    type: "boolean",
    description: "With role: start a fresh session instead of continuing.",
  },
  prompt: { type: "string", description: "Self-contained task prompt." },
  result_mode: {
    type: "string",
    enum: ["compact"],
    description: "Structured final report instead of narration.",
  },
  tags: TASK_TAGS_PROPERTY,
  name: {
    type: "string",
    description: "Short action + target describing what this run does.",
  },
  fallbacks: FALLBACKS_PROPERTY,
  retry_on: {
    type: "string",
    enum: ["startup", "any-failure"],
    description: "Retry startup failures only (default) or any failure.",
  },
} as const;

const NESTED_SUBAGENT_TASK_PROPERTIES = {
  ...NESTED_SELECTION_PROPERTIES,
  role: { type: "string" },
  user_requested: { type: "boolean" },
  fresh_session: { type: "boolean" },
  prompt: { type: "string" },
  result_mode: { type: "string", enum: ["compact"] },
  tags: NESTED_TAGS_PROPERTY,
  name: { type: "string" },
  fallbacks: {
    type: "array",
    maxItems: 3,
    items: { type: "object", required: ["provider"], properties: NESTED_SELECTION_PROPERTIES },
  },
  retry_on: { type: "string", enum: ["startup", "any-failure"] },
} as const;

const SUBAGENT_REQUEST_PROPERTIES = {
  ...SUBAGENT_TASK_PROPERTIES,
  background: {
    type: "boolean",
    description: "Return run_id immediately instead of waiting; join later with wait_for_agent.",
  },
} as const;

const INCLUDE_TRACE_PROPERTY = {
  type: "boolean",
  description: "Include bounded selection/fallback trace.",
} as const;

const RAW_TOOLS: ToolSpec[] = [
  {
    name: "run_workflow",
    description:
      "Run a host-scheduled task graph (macOS/Linux only). Validates stages and disjoint write_scope before launch; passes compact reports to dependents. Requires delegation authorization.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["start", "status", "wait", "cancel", "list"],
          default: "start",
        },
        workflow_id: { type: "string", description: "Required for status/wait/cancel." },
        background: { type: "boolean", description: "Return immediately instead of waiting." },
        ...NESTED_SELECTION_PROPERTIES,
        role: { type: "string" },
        user_requested: { type: "boolean" },
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: {
            type: "object",
            required: ["id", "prompt", "write_scope"],
            properties: {
              ...NESTED_SUBAGENT_TASK_PROPERTIES,
              retry_on: { type: "string", enum: ["startup"] },
              id: { type: "string" },
              depends_on: { type: "array", items: { type: "string" } },
              write_scope: {
                type: "array",
                items: { type: "string" },
                description:
                  "Owned relative paths ([] = read-only; must not overlap concurrently).",
              },
            },
          },
        },
        timeout_s: {
          type: "number",
          description: workflowTimeoutDescription(),
        },
      },
    },
  },
  {
    name: "list_agents",
    description:
      "List ranked providers (and crew roles if active). Skip when the provider is already known.",
    inputSchema: {
      type: "object",
      properties: { tags: TASK_TAGS_PROPERTY },
    },
  },
  {
    name: "get_agent",
    description:
      "Get one provider's models, reasoning, Fast, and permission options by ID. Pass model to narrow.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Provider ID." },
        model: { type: "string", description: "Optional exact model filter." },
        tags: NESTED_TAGS_PROPERTY,
      },
    },
  },
  {
    name: "spawn_agent",
    description:
      "Call only after the user explicitly asked to delegate in this thread; never spawn before it. Spawns one task or parallel tasks=[...] and waits by default (background=true returns run_id). With tasks=[...], root provider/model/reasoning/fast/permissions/role/user_requested are batch defaults.",
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
            properties: NESTED_SUBAGENT_TASK_PROPERTIES,
          },
        },
        timeout_s: {
          type: "number",
          description: TIMEOUT_S_DESCRIPTION,
        },
        full_output: FULL_OUTPUT_PROPERTY,
        output_mode: OUTPUT_MODE_PROPERTY,
      },
      // No root-level union here: Cursor's backend rejects tool schemas that carry
      // `oneOf` at the root and fails the whole turn with a provider error. Callers
      // pass either `prompt` or `tasks`; dispatch rejects calls carrying both.
    },
  },
  {
    name: "list_routing_preferences",
    description: "List persistent user-pinned task-tag routes.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_routing_preference",
    description: "Save a persistent route for an exact task-tag set when the user asks.",
    inputSchema: {
      type: "object",
      required: ["tags", "provider"],
      properties: {
        tags: NESTED_TAGS_PROPERTY,
        provider: NESTED_SELECTION_PROPERTIES.provider,
        model: NESTED_SELECTION_PROPERTIES.model,
        reasoning: NESTED_SELECTION_PROPERTIES.reasoning,
        fast: NESTED_SELECTION_PROPERTIES.fast,
        fallbacks: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            required: ["provider"],
            properties: {
              provider: { type: "string" },
              model: { type: "string" },
              reasoning: { type: "string" },
              fast: { type: "boolean" },
            },
          },
        },
        retry_on: { type: "string", enum: ["startup", "any-failure"] },
      },
    },
  },
  {
    name: "remove_routing_preference",
    description: "Remove a persistent route for an exact task-tag set.",
    inputSchema: {
      type: "object",
      required: ["tags"],
      properties: { tags: NESTED_TAGS_PROPERTY },
    },
  },
  {
    name: "wait_for_agent",
    description:
      'Wait for run_id or run_ids concurrently; pass after_output_chars / after_output_chars_by_run for incremental output. A "running" result means the wait call timed out while the child stayed active.',
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
        full_output: FULL_OUTPUT_PROPERTY,
        output_mode: OUTPUT_MODE_PROPERTY,
        after_output_chars: AFTER_OUTPUT_CHARS_PROPERTY,
        after_output_chars_by_run: AFTER_OUTPUT_CHARS_BY_RUN_PROPERTY,
        include_trace: INCLUDE_TRACE_PROPERTY,
        wait_mode: {
          type: "string",
          enum: ["all", "any"],
          default: "all",
          description: "all waits for every run; any returns when one settles.",
        },
      },
      // No root-level union — see the spawn_agent schema above.
    },
  },
  {
    name: "get_status",
    description:
      "Check a subagent without blocking. Pass after_output_chars for incremental output.",
    inputSchema: {
      type: "object",
      required: ["run_id"],
      properties: {
        run_id: { type: "string" },
        full_output: FULL_OUTPUT_PROPERTY,
        output_mode: OUTPUT_MODE_PROPERTY,
        after_output_chars: AFTER_OUTPUT_CHARS_PROPERTY,
        include_trace: INCLUDE_TRACE_PROPERTY,
      },
    },
  },
  {
    name: "list_runs",
    description:
      "List this parent thread's subagent runs (pass include_capacity=true for slot counts).",
    inputSchema: { type: "object", properties: { include_capacity: { type: "boolean" } } },
  },
  {
    name: "steer_agent",
    description:
      "Continue a completed structured worker (resumes session, returns new run_id) or rarely correct active work for a material blocker. Waits by default; background=true returns after acceptance.",
    inputSchema: {
      type: "object",
      required: ["run_id", "prompt"],
      properties: {
        run_id: { type: "string" },
        prompt: { type: "string", minLength: 1 },
        name: {
          type: "string",
          description: "Task label for a completed worker's next task; omit for live correction.",
        },
        background: { type: "boolean", description: "Return after acceptance instead of waiting." },
        timeout_s: { type: "number", description: TIMEOUT_S_DESCRIPTION },
        full_output: FULL_OUTPUT_PROPERTY,
        output_mode: OUTPUT_MODE_PROPERTY,
        after_output_chars: AFTER_OUTPUT_CHARS_PROPERTY,
      },
    },
  },
  {
    name: "cancel",
    description:
      "Interrupt and dispose a running subagent by run_id. Never cancel solely because a wait timed out.",
    inputSchema: {
      type: "object",
      required: ["run_id"],
      properties: { run_id: { type: "string" } },
    },
  },
];

const READ_ONLY_TOOL_NAMES = new Set([
  "list_agents",
  "get_agent",
  "list_routing_preferences",
  "wait_for_agent",
  "get_status",
  "list_runs",
]);
const ROUTING_WRITE_TOOL_NAMES = new Set(["set_routing_preference", "remove_routing_preference"]);

const BASE_TOOLS: ToolSpec[] = RAW_TOOLS.map((tool) => ({
  ...tool,
  annotations: READ_ONLY_TOOL_NAMES.has(tool.name)
    ? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    : ROUTING_WRITE_TOOL_NAMES.has(tool.name)
      ? { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      : {
          readOnlyHint: false,
          destructiveHint:
            tool.name === "spawn_agent" ||
            tool.name === "run_workflow" ||
            tool.name === "steer_agent" ||
            tool.name === "cancel",
          openWorldHint:
            tool.name === "spawn_agent" ||
            tool.name === "run_workflow" ||
            tool.name === "steer_agent",
        },
}));

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
 * - `one-shot`: implements `buildSubagentOneShotCommand` (a bypass-permissions
 *   CLI invocation) and either lacks a structured runtime or explicitly keeps
 *   its CLI child lane — this pulls Antigravity and Command Code into the roster.
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
    const presentationCapabilities = presentedCrossagentCapabilities(
      execution,
      status.capabilities,
    );
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
    out.map(rankingCandidateOf),
    crossagentRankingPreferences(visibility, contextTags),
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
        ...(entry.matchedOverride ? { override: entry.matchedOverride } : {}),
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

export interface SubagentToolContext {
  parentThreadId: string;
  runManager: SubagentRunManager;
  listSpawnableAgents: (tags?: readonly string[]) => Promise<SpawnableAgent[]>;
  getCrew?: () => ThreadCrewBinding | undefined;
  /** Optional per-parent cap (ms) for blocking wait calls when the caller's transport has a shorter HTTP deadline. */
  maxWaitTimeoutMs?: number | undefined;
  recordExplicitSelections?: (selections: readonly ExplicitSpawnAgentSelection[]) => void;
  listRoutingOverrides?: () => readonly CrossagentRoutingOverride[];
  setRoutingOverride?: (override: CrossagentRoutingOverride) => void | Promise<void>;
  removeRoutingOverride?: (tags: readonly string[]) => void | Promise<void>;
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

  const rawFallbacks = args.fallbacks;
  let fallbacks: CrossagentRoutingSelection[] | undefined;
  if (rawFallbacks !== undefined) {
    if (!Array.isArray(rawFallbacks)) return errorResult("fallbacks must be an array");
    if (rawFallbacks.length > 3) {
      return errorResult("fallbacks supports at most 3 alternate selections");
    }
    const mapped: CrossagentRoutingSelection[] = [];
    for (let i = 0; i < rawFallbacks.length; i++) {
      const value = rawFallbacks[i];
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return errorResult(`fallbacks[${i}] must be an object`);
      }
      const fallback = value as Record<string, unknown>;
      const fallbackProvider =
        typeof fallback.provider === "string" && fallback.provider.length > 0
          ? fallback.provider
          : "";
      if (!fallbackProvider) return errorResult(`fallbacks[${i}].provider is required`);
      mapped.push({
        agentKind: fallbackProvider,
        ...(typeof fallback.model === "string" && fallback.model.length > 0
          ? { modelId: fallback.model }
          : {}),
        ...(typeof fallback.reasoning === "string" && fallback.reasoning.length > 0
          ? { effort: fallback.reasoning }
          : {}),
        ...(typeof fallback.fast === "boolean" ? { fast: fallback.fast } : {}),
      });
    }
    fallbacks = mapped;
  }

  const retry_on = args.retry_on;
  const retryMode =
    retry_on === "any-failure" ? "any-failure" : retry_on === "startup" ? "startup" : undefined;
  if (retry_on !== undefined && retryMode === undefined) {
    return errorResult("retry_on must be startup or any-failure");
  }

  const selectionArgs = { ...args, tags, provider };
  resolveSelectionArgs(selectionArgs, await ctx.listSpawnableAgents(tags));
  const override = {
    tags,
    agentKind: provider,
    ...(typeof args.model === "string" && args.model.length > 0 ? { modelId: args.model } : {}),
    ...(typeof args.reasoning === "string" && args.reasoning.length > 0
      ? { effort: args.reasoning }
      : {}),
    ...(typeof args.fast === "boolean" ? { fast: args.fast } : {}),
    ...(fallbacks !== undefined ? { fallbacks } : {}),
    ...(retryMode ? { retryMode } : {}),
    updatedAt: Date.now(),
  };
  const parsed = crossagentRoutingOverrideSchema.safeParse(override);
  if (!parsed.success) {
    return errorResult(
      "Invalid routing preference: " +
        parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  }
  await ctx.setRoutingOverride(parsed.data);
  return jsonResult({ status: "saved", override: parsed.data });
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
      case "list_agents": {
        const agents = await ctx.listSpawnableAgents(normalizeCrossagentTags(args.tags));
        const crew = ctx.getCrew?.();
        if (!crew) return jsonResult(agents.map(summarizeAgent));
        const description = crewListDescription(
          crew,
          agents,
          ctx.runManager.listRuns(ctx.parentThreadId),
        );
        return jsonResult(
          crew.policy === "crew-first"
            ? { ...description, agents: agents.map(summarizeAgent) }
            : description,
        );
      }
      case "get_agent": {
        const id = typeof args.id === "string" ? args.id : "";
        if (!id) return errorResult("id is required");
        if (args.model !== undefined && (typeof args.model !== "string" || !args.model.trim())) {
          return errorResult("model must be a non-empty model value");
        }
        const agent = (await ctx.listSpawnableAgents(normalizeCrossagentTags(args.tags))).find(
          (candidate) => candidate.provider.value === id,
        );
        if (!agent) return errorResult(`Unknown provider id: ${id}`);
        if (args.model === undefined) return jsonResult(agent);
        const model = agent.models.find((candidate) => candidate.value === args.model);
        return model
          ? jsonResult({ ...agent, models: [model] })
          : errorResult(`Unknown model value for ${id}: ${args.model}`);
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
      case "run_workflow":
        return await dispatchWorkflow(args, ctx);
      // Hidden compatibility aliases for provider sessions initialized against
      // the earlier, wider tool catalog.
      case "spawn_agents": {
        const hasTaskRole =
          Array.isArray(args.tasks) &&
          args.tasks.some(
            (task) => !!task && typeof task === "object" && !Array.isArray(task) && "role" in task,
          );
        if (
          (ctx.getCrew?.() || args.role !== undefined || hasTaskRole) &&
          Array.isArray(args.tasks)
        ) {
          const result = await spawnAgent({ ...args, background: true }, ctx);
          if (result.isError) return result;
          const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
            runs?: Array<{ run_id?: string }>;
          };
          return jsonResult(
            {
              run_ids: (payload.runs ?? []).flatMap((run) =>
                typeof run.run_id === "string" ? [run.run_id] : [],
              ),
            },
            WAIT_AGAIN_INSTRUCTION,
          );
        }
        const requests = parseSpawnRequests(args).map((request) => ({
          ...request,
          background: true as const,
        }));
        const runs = ctx.runManager.spawnMany(ctx.parentThreadId, requests);
        return jsonResult({ run_ids: runs.map(({ runId }) => runId) }, WAIT_AGAIN_INSTRUCTION);
      }
      case "wait_for_agent": {
        const waitOptions = parseWaitOptions(args);
        if (args.wait_mode !== undefined && args.wait_mode !== "all" && args.wait_mode !== "any") {
          return errorResult("wait_mode must be all or any");
        }
        if (args.run_id !== undefined && args.run_ids !== undefined) {
          return errorResult("Pass either run_id or run_ids, not both.");
        }
        if (Array.isArray(args.run_ids)) {
          const runIds = parseRunIds(args);
          return runToolResult(
            await ctx.runManager.waitForMany(
              runIds,
              parseWaitTimeoutMs(args, ctx.maxWaitTimeoutMs),
              ctx.parentThreadId,
              (runId) => parseWaitOptions(args, runId),
              args.wait_mode === "any" ? "any" : "all",
            ),
          );
        }
        const runId = typeof args.run_id === "string" ? args.run_id : "";
        if (!runId) return errorResult("run_id is required");
        return runToolResult(
          await ctx.runManager.waitFor(
            runId,
            parseWaitTimeoutMs(args, ctx.maxWaitTimeoutMs),
            ctx.parentThreadId,
            waitOptions,
          ),
        );
      }
      case "wait_for_agents": {
        parseWaitOptions(args);
        const runIds = parseRunIds(args);
        return runToolResult(
          await ctx.runManager.waitForMany(
            runIds,
            parseWaitTimeoutMs(args, ctx.maxWaitTimeoutMs),
            ctx.parentThreadId,
            (runId) => parseWaitOptions(args, runId),
          ),
        );
      }
      case "run_agent": {
        return await spawnAgent(args, ctx);
      }
      case "get_status": {
        const runId = typeof args.run_id === "string" ? args.run_id : "";
        if (!runId) return errorResult("run_id is required");
        return runToolResult(
          ctx.runManager.getStatus(runId, ctx.parentThreadId, parseWaitOptions(args)),
        );
      }
      case "list_runs":
        return jsonResult(
          args.include_capacity === true
            ? {
                runs: ctx.runManager.listRuns(ctx.parentThreadId),
                capacity: ctx.runManager.getCapacity(ctx.parentThreadId),
              }
            : ctx.runManager.listRuns(ctx.parentThreadId),
        );
      case "cancel": {
        const runId = typeof args.run_id === "string" ? args.run_id : "";
        if (!runId) return errorResult("run_id is required");
        await ctx.runManager.cancel(runId, ctx.parentThreadId);
        return jsonResult({ ok: true });
      }
      case "steer_agent":
        return await steerAgent(args, ctx);
      default:
        return errorResult(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}
