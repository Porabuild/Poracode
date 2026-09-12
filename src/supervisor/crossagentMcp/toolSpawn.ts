import { normalizeCrossagentTags } from "@/shared/crossagentRanking";
import { MAX_CONCURRENT_CHILDREN_PER_PARENT } from "./SubagentRunManager";
import { errorResult, jsonResult, parseOutputMode, parseWaitTimeoutMs } from "./toolResult";
import { parseSpawnRequest, parseSpawnRequests, parseResultMode } from "./toolRequests";
import type {
  McpToolResult,
  SpawnableAgent,
  ExplicitSpawnAgentSelection,
  SpawnAgentSelection,
} from "./types";
import type { SubagentToolContext } from "./toolRegistry";

interface ResolvedSelectionArgs {
  args: Record<string, unknown>;
  tags: string[];
  explicitFields: ExplicitSpawnAgentSelection["explicitFields"];
  inheritedFallbacks?: SpawnAgentSelection[];
  inheritedRetryMode?: "startup" | "any-failure";
}

export function resolveSelectionArgs(
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

  const override = agent.preference?.override;
  const primaryFromOverride =
    override !== undefined &&
    override.agentKind === provider &&
    (override.modelId === undefined || override.modelId === model) &&
    (override.effort === undefined || override.effort === reasoning) &&
    (override.fast === undefined || override.fast === fast);
  const inheritedFallbacks = primaryFromOverride
    ? override.fallbacks?.map((fallback) => ({
        agent: fallback.agentKind,
        ...(fallback.modelId ? { model: fallback.modelId } : {}),
        ...(fallback.effort ? { effort: fallback.effort } : {}),
        ...(typeof fallback.fast === "boolean" ? { fast: fallback.fast } : {}),
      }))
    : undefined;
  const inheritedRetryMode = primaryFromOverride ? override.retryMode : undefined;

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
    ...(inheritedFallbacks ? { inheritedFallbacks } : {}),
    ...(inheritedRetryMode ? { inheritedRetryMode } : {}),
  };
}

export async function spawnAgent(
  args: Record<string, unknown>,
  ctx: SubagentToolContext,
): Promise<McpToolResult> {
  parseResultMode(args);
  const outputMode = parseOutputMode(args);
  const outputOptions = outputMode ? { outputMode } : {};
  const timeoutMs = parseWaitTimeoutMs(args);
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

  // The published schema is union-free for Cursor compatibility, so the
  // either/or contract is enforced here: a call carrying both shapes is
  // ambiguous and must fail instead of silently picking one branch.
  if (args.tasks !== undefined && args.prompt !== undefined) {
    return errorResult("Pass either prompt or tasks, not both.");
  }
  if (Array.isArray(args.tasks)) {
    const tasks = args.tasks;
    if (tasks.length > MAX_CONCURRENT_CHILDREN_PER_PARENT) {
      return errorResult(`tasks supports at most ${MAX_CONCURRENT_CHILDREN_PER_PARENT} entries`);
    }
    const batchSelection = {
      ...(args.result_mode !== undefined ? { result_mode: args.result_mode } : {}),
      ...(typeof args.provider === "string" ? { provider: args.provider } : {}),
      ...(typeof args.model === "string" ? { model: args.model } : {}),
      ...(typeof args.reasoning === "string" ? { reasoning: args.reasoning } : {}),
      ...(typeof args.fast === "boolean" ? { fast: args.fast } : {}),
      ...(typeof args.permissions === "string" ? { permissions: args.permissions } : {}),
    };
    const resolvedTasks: Array<ResolvedSelectionArgs | null> = await Promise.all(
      tasks.map(async (task) => {
        if (!task || typeof task !== "object" || Array.isArray(task)) {
          return null;
        }
        const { provider, model, reasoning, fast, permissions, ...taskProperties } = task as Record<
          string,
          unknown
        >;
        const taskArgs = {
          ...batchSelection,
          ...taskProperties,
          ...(typeof provider === "string" && provider.length > 0 ? { provider } : {}),
          ...(typeof model === "string" && model.length > 0 ? { model } : {}),
          ...(typeof reasoning === "string" && reasoning.length > 0 ? { reasoning } : {}),
          ...(typeof fast === "boolean" ? { fast } : {}),
          ...(typeof permissions === "string" ? { permissions } : {}),
        };
        return resolveSelectionArgs(taskArgs, await agentsFor(taskArgs));
      }),
    );
    const requests = parseSpawnRequests(
      {
        ...args,
        tasks: resolvedTasks.map((entry, index) => entry?.args ?? tasks[index]),
      },
      resolvedTasks.map((entry) => ({
        fallbacks: entry?.inheritedFallbacks,
        retryMode: entry?.inheritedRetryMode,
      })),
    ).map((request) => {
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
        { ...outputOptions, fullOutput: args.full_output === true, currentAttemptOnly: true },
      ),
    });
  }

  const resolved = resolveSelectionArgs(args, await agentsFor(args));
  const request = parseSpawnRequest(
    resolved.args,
    resolved.inheritedFallbacks,
    resolved.inheritedRetryMode,
  );
  const { runId } = ctx.runManager.spawn(ctx.parentThreadId, request);
  if (Object.values(resolved.explicitFields).some(Boolean)) {
    ctx.recordExplicitSelections?.([
      { selection: request, explicitFields: resolved.explicitFields, tags: resolved.tags },
    ]);
  }
  if (background) {
    return jsonResult({ run_id: runId, status: "running", output: "" });
  }
  const result = await ctx.runManager.waitFor(runId, timeoutMs, ctx.parentThreadId, {
    ...outputOptions,
    fullOutput: args.full_output === true,
    currentAttemptOnly: true,
  });
  return jsonResult({ run_id: runId, ...result });
}
