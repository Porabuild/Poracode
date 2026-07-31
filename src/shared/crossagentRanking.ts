import {
  MAX_CROSSAGENT_ROUTING_OVERRIDES,
  type AgentSelectionUsageEntry,
  type CrossagentRoutingOverride,
  type CrossagentSelectionUsageEntry,
  type SharedSettings,
} from "./settings";

export type CrossagentRankSource =
  | "manual-override"
  | "tag-affinity"
  | "crossagent-usage"
  | "favorite"
  | "agent-usage"
  | "built-in";

export const MAX_CROSSAGENT_TAGS = 5;
const MAX_LEARNED_TAGS = 8;
const CROSSAGENT_TAG_ALIASES = new Map([
  ["fe", "frontend"],
  ["front-end", "frontend"],
  ["user-interface", "ui"],
  ["ux", "design"],
  ["user-experience", "design"],
  ["bug-fix", "bugfix"],
  ["bug-fixer", "bugfix"],
  ["debug", "bugfix"],
  ["debugging", "bugfix"],
  ["execute", "implementation"],
  ["execution", "implementation"],
  ["executor", "implementation"],
  ["code-review", "review"],
  ["mobile-sim", "simulator"],
  ["mobile-simulator", "simulator"],
  ["sim-driver", "simulator"],
  ["simulator-driver", "simulator"],
]);

export function normalizeCrossagentTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en-US")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    if (!tag) continue;
    normalized.add(CROSSAGENT_TAG_ALIASES.get(tag) ?? tag);
    if (normalized.size >= MAX_CROSSAGENT_TAGS) break;
  }
  return [...normalized].sort();
}

export interface CrossagentRankingModel {
  id: string;
  efforts: readonly string[];
  defaultEffort?: string;
  fastAvailable: boolean;
}

export interface CrossagentRankingCandidate {
  provider: string;
  defaultModel: string;
  models: readonly CrossagentRankingModel[];
}

export interface RankedCrossagentCandidate {
  provider: string;
  rank: number;
  source: CrossagentRankSource;
  usageCount: number;
  matchedTags: string[];
  learnedTags: Array<{ tag: string; count: number }>;
  preferredSelection: {
    model: string;
    effort?: string;
    fast: boolean;
  };
}

export interface CrossagentRankingPreferences {
  crossagentSelectionUsage: readonly CrossagentSelectionUsageEntry[];
  agentSelectionUsage: readonly AgentSelectionUsageEntry[];
  favoriteModels: SharedSettings["favoriteModels"];
  routingOverrides?: SharedSettings["crossagentRoutingOverrides"];
  contextTags?: readonly string[];
}

export interface CrossagentRoutingSnapshotEntry {
  provider: string;
  label: string;
  execution: "structured" | "one-shot";
  rank: number;
  source: CrossagentRankSource;
  usageCount: number;
  model: { id: string; label: string };
  reasoning?: string;
  fast: boolean;
  learnedTags: Array<{ tag: string; count: number }>;
}

const SELECTION_USAGE_LIMIT = 100;

export function incrementAgentSelectionUsage(
  entries: readonly AgentSelectionUsageEntry[],
  selections: readonly {
    agentKind: string;
    modelId: string;
    effort?: string;
    fast: boolean;
  }[],
  now = Date.now(),
): AgentSelectionUsageEntry[] {
  let next = [...entries];
  for (const selection of selections) {
    const index = next.findIndex(
      (entry) =>
        entry.agentKind === selection.agentKind &&
        entry.modelId === selection.modelId &&
        entry.effort === selection.effort &&
        entry.fast === selection.fast,
    );
    const updated: AgentSelectionUsageEntry = {
      ...selection,
      count: index >= 0 ? next[index]!.count + 1 : 1,
      lastUsedAt: now,
    };
    next = [updated, ...next.filter((_, entryIndex) => entryIndex !== index)].slice(
      0,
      SELECTION_USAGE_LIMIT,
    );
  }
  return next;
}

export function incrementCrossagentSelectionUsage(
  entries: readonly CrossagentSelectionUsageEntry[],
  selections: readonly Omit<CrossagentSelectionUsageEntry, "count" | "lastUsedAt">[],
  now = Date.now(),
): CrossagentSelectionUsageEntry[] {
  let next = [...entries];
  for (const selection of selections) {
    const normalizedTags = normalizeCrossagentTags(selection.tags);
    const index = next.findIndex(
      (entry) =>
        entry.agentKind === selection.agentKind &&
        entry.modelId === selection.modelId &&
        entry.effort === selection.effort &&
        entry.fast === selection.fast &&
        (entry.explicitFields?.provider ?? true) === (selection.explicitFields?.provider ?? true) &&
        (entry.explicitFields?.model ?? true) === (selection.explicitFields?.model ?? true) &&
        (entry.explicitFields?.effort ?? true) === (selection.explicitFields?.effort ?? true) &&
        (entry.explicitFields?.fast ?? true) === (selection.explicitFields?.fast ?? true) &&
        normalizeCrossagentTags(entry.tags).join("\0") === normalizedTags.join("\0"),
    );
    const { tags: _tags, ...selectionWithoutTags } = selection;
    const updated: CrossagentSelectionUsageEntry = {
      ...selectionWithoutTags,
      ...(normalizedTags.length > 0 ? { tags: normalizedTags } : {}),
      count: index >= 0 ? next[index]!.count + 1 : 1,
      lastUsedAt: now,
    };
    next = [updated, ...next.filter((_, entryIndex) => entryIndex !== index)].slice(
      0,
      SELECTION_USAGE_LIMIT,
    );
  }
  return next;
}

function routingOverrideKey(tags: unknown): string {
  return normalizeCrossagentTags(tags).join("\0");
}

export function upsertCrossagentRoutingOverride(
  entries: readonly CrossagentRoutingOverride[],
  override: CrossagentRoutingOverride,
): CrossagentRoutingOverride[] {
  const tags = normalizeCrossagentTags(override.tags);
  if (tags.length === 0) return [...entries];
  const key = routingOverrideKey(tags);
  return [
    { ...override, tags },
    ...entries.filter((entry) => routingOverrideKey(entry.tags) !== key),
  ].slice(0, MAX_CROSSAGENT_ROUTING_OVERRIDES);
}

export function removeCrossagentRoutingOverride(
  entries: readonly CrossagentRoutingOverride[],
  tags: readonly string[],
): CrossagentRoutingOverride[] {
  const key = routingOverrideKey(tags);
  if (!key) return [...entries];
  return entries.filter((entry) => routingOverrideKey(entry.tags) !== key);
}

function modelFor(
  candidate: CrossagentRankingCandidate,
  modelId: string,
): CrossagentRankingModel | undefined {
  return candidate.models.find((model) => model.id === modelId);
}

function isValidUsage(
  candidate: CrossagentRankingCandidate,
  entry: AgentSelectionUsageEntry,
): boolean {
  if (entry.agentKind !== candidate.provider) return false;
  const model = modelFor(candidate, entry.modelId);
  if (!model) return false;
  if (entry.effort && !model.efforts.includes(entry.effort)) return false;
  return entry.fast !== true || model.fastAvailable;
}

type ExplicitCrossagentField = keyof NonNullable<CrossagentSelectionUsageEntry["explicitFields"]>;

function isExplicitCrossagentField(
  entry: CrossagentSelectionUsageEntry,
  field: ExplicitCrossagentField,
): boolean {
  return entry.explicitFields?.[field] ?? true;
}

function compareUsage(left: AgentSelectionUsageEntry, right: AgentSelectionUsageEntry): number {
  return right.count - left.count || right.lastUsedAt - left.lastUsedAt;
}

function tagOverlap(
  entry: CrossagentSelectionUsageEntry,
  contextTags: readonly string[],
): string[] {
  if (contextTags.length === 0) return [];
  const requested = new Set(contextTags);
  return normalizeCrossagentTags(entry.tags).filter((tag) => requested.has(tag));
}

function contextualUsageScore(
  entry: CrossagentSelectionUsageEntry,
  contextTags: readonly string[],
): number {
  return entry.count * tagOverlap(entry, contextTags).length;
}

function compareContextualUsage(
  left: CrossagentSelectionUsageEntry,
  right: CrossagentSelectionUsageEntry,
  contextTags: readonly string[],
): number {
  return (
    tagOverlap(right, contextTags).length - tagOverlap(left, contextTags).length ||
    contextualUsageScore(right, contextTags) - contextualUsageScore(left, contextTags) ||
    compareUsage(left, right)
  );
}

function learnedTagsFor(
  candidate: CrossagentRankingCandidate,
  entries: readonly CrossagentSelectionUsageEntry[],
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.agentKind !== candidate.provider) continue;
    for (const tag of normalizeCrossagentTags(entry.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + entry.count);
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .toSorted((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, MAX_LEARNED_TAGS);
}

function selectionFromUsage(
  entry: AgentSelectionUsageEntry,
): RankedCrossagentCandidate["preferredSelection"] {
  return {
    model: entry.modelId,
    ...(entry.effort ? { effort: entry.effort } : {}),
    fast: entry.fast,
  };
}

function defaultSelection(
  candidate: CrossagentRankingCandidate,
): RankedCrossagentCandidate["preferredSelection"] {
  const model: CrossagentRankingModel = modelFor(candidate, candidate.defaultModel) ??
    candidate.models[0] ?? { id: candidate.defaultModel, efforts: [], fastAvailable: false };
  return {
    model: model.id,
    ...(model.defaultEffort ? { effort: model.defaultEffort } : {}),
    fast: false,
  };
}

function fallbackProviderPreference(
  candidate: CrossagentRankingCandidate,
  preferences: CrossagentRankingPreferences,
): Omit<RankedCrossagentCandidate, "rank" | "matchedTags" | "learnedTags"> & {
  bucket: number;
  recency: number;
} {
  const favoriteModelIds = new Set(
    preferences.favoriteModels
      .filter(
        (entry) =>
          entry.agentKind === candidate.provider &&
          modelFor(candidate, entry.modelId) !== undefined,
      )
      .map((entry) => entry.modelId),
  );
  const agentUsage = preferences.agentSelectionUsage
    .filter((entry) => isValidUsage(candidate, entry))
    .toSorted(compareUsage);
  if (favoriteModelIds.size > 0) {
    const favoriteUsage = agentUsage.filter((entry) => favoriteModelIds.has(entry.modelId));
    const favoriteModel =
      favoriteUsage[0]?.modelId ??
      preferences.favoriteModels.find(
        (entry) => entry.agentKind === candidate.provider && favoriteModelIds.has(entry.modelId),
      )!.modelId;
    const model = modelFor(candidate, favoriteModel)!;
    const bestUsage = favoriteUsage[0];
    return {
      provider: candidate.provider,
      source: "favorite",
      usageCount: favoriteUsage.reduce((sum, entry) => sum + entry.count, 0),
      recency: bestUsage?.lastUsedAt ?? 0,
      preferredSelection: bestUsage
        ? selectionFromUsage(bestUsage)
        : {
            model: model.id,
            ...(model.defaultEffort ? { effort: model.defaultEffort } : {}),
            fast: false,
          },
      bucket: 1,
    };
  }

  if (agentUsage.length > 0) {
    return {
      provider: candidate.provider,
      source: "agent-usage",
      usageCount: agentUsage.reduce((sum, entry) => sum + entry.count, 0),
      recency: Math.max(...agentUsage.map((entry) => entry.lastUsedAt)),
      preferredSelection: selectionFromUsage(agentUsage[0]!),
      bucket: 2,
    };
  }

  return {
    provider: candidate.provider,
    source: "built-in",
    usageCount: 0,
    recency: 0,
    preferredSelection: defaultSelection(candidate),
    bucket: 3,
  };
}

function crossagentPreferredSelection(
  candidate: CrossagentRankingCandidate,
  preferences: CrossagentRankingPreferences,
  fallback: RankedCrossagentCandidate["preferredSelection"],
): RankedCrossagentCandidate["preferredSelection"] {
  const contextTags = normalizeCrossagentTags(preferences.contextTags);
  const allEntries = preferences.crossagentSelectionUsage
    .filter((entry) => entry.agentKind === candidate.provider)
    .toSorted(compareUsage);
  const contextualEntries =
    contextTags.length > 0
      ? allEntries
          .filter((entry) => tagOverlap(entry, contextTags).length > 0)
          .toSorted((left, right) => compareContextualUsage(left, right, contextTags))
      : [];
  const entries = contextualEntries.length > 0 ? contextualEntries : allEntries;
  const modelEntry = entries.find(
    (entry) =>
      isExplicitCrossagentField(entry, "model") && modelFor(candidate, entry.modelId) !== undefined,
  );
  const model = modelEntry?.modelId ?? fallback.model;
  const modelOption = modelFor(candidate, model);
  if (!modelOption) return defaultSelection(candidate);

  const effortEntry = entries.find(
    (entry) =>
      entry.modelId === model &&
      isExplicitCrossagentField(entry, "effort") &&
      entry.effort !== undefined &&
      modelOption.efforts.includes(entry.effort),
  );
  const fastEntry = entries.find(
    (entry) =>
      entry.modelId === model &&
      isExplicitCrossagentField(entry, "fast") &&
      (entry.fast !== true || modelOption.fastAvailable),
  );
  const fallbackEffort =
    fallback.model === model && fallback.effort && modelOption.efforts.includes(fallback.effort)
      ? fallback.effort
      : modelOption.defaultEffort;
  return {
    model,
    ...(effortEntry?.effort
      ? { effort: effortEntry.effort }
      : fallbackEffort
        ? { effort: fallbackEffort }
        : {}),
    fast: fastEntry?.fast ?? (fallback.model === model ? fallback.fast : false),
  };
}

function selectionWithOverride(
  candidate: CrossagentRankingCandidate,
  base: RankedCrossagentCandidate["preferredSelection"],
  override: SharedSettings["crossagentRoutingOverrides"][number],
): RankedCrossagentCandidate["preferredSelection"] | undefined {
  const modelIds = override.modelId
    ? [override.modelId]
    : [
        ...new Set([
          base.model,
          candidate.defaultModel,
          ...candidate.models.map((model) => model.id),
        ]),
      ];
  const model = modelIds
    .map((modelId) => modelFor(candidate, modelId))
    .find(
      (option) =>
        option !== undefined &&
        (!override.effort || option.efforts.includes(override.effort)) &&
        (override.fast !== true || option.fastAvailable),
    );
  if (!model) return undefined;
  const usesBase = model.id === base.model;
  const effort = override.effort ?? (usesBase ? base.effort : undefined) ?? model.defaultEffort;
  const fast = override.fast ?? (usesBase ? base.fast : false);
  return {
    model: model.id,
    ...(effort ? { effort } : {}),
    fast,
  };
}

function matchingManualOverride(
  candidate: CrossagentRankingCandidate,
  preferences: CrossagentRankingPreferences,
  base: RankedCrossagentCandidate["preferredSelection"],
):
  | {
      override: SharedSettings["crossagentRoutingOverrides"][number];
      selection: RankedCrossagentCandidate["preferredSelection"];
      tags: string[];
    }
  | undefined {
  const contextTags = new Set(normalizeCrossagentTags(preferences.contextTags));
  if (contextTags.size === 0) return undefined;
  return (preferences.routingOverrides ?? [])
    .filter((override) => override.agentKind === candidate.provider)
    .map((override) => ({
      override,
      tags: normalizeCrossagentTags(override.tags),
    }))
    .filter((entry) => entry.tags.length > 0 && entry.tags.every((tag) => contextTags.has(tag)))
    .toSorted(
      (left, right) =>
        right.tags.length - left.tags.length || right.override.updatedAt - left.override.updatedAt,
    )
    .map((entry) => ({
      ...entry,
      selection: selectionWithOverride(candidate, base, entry.override),
    }))
    .find(
      (
        entry,
      ): entry is typeof entry & {
        selection: RankedCrossagentCandidate["preferredSelection"];
      } => entry.selection !== undefined,
    );
}

function providerPreference(
  candidate: CrossagentRankingCandidate,
  preferences: CrossagentRankingPreferences,
): Omit<RankedCrossagentCandidate, "rank"> & {
  bucket: number;
  recency: number;
  tagScore: number;
} {
  const contextTags = normalizeCrossagentTags(preferences.contextTags);
  const fallback = fallbackProviderPreference(candidate, preferences);
  const providerUsage = preferences.crossagentSelectionUsage
    .filter(
      (entry) =>
        entry.agentKind === candidate.provider && isExplicitCrossagentField(entry, "provider"),
    )
    .toSorted(compareUsage);
  const contextualProviderUsage =
    contextTags.length > 0
      ? providerUsage
          .filter((entry) => tagOverlap(entry, contextTags).length > 0)
          .toSorted((left, right) => compareContextualUsage(left, right, contextTags))
      : [];
  const preferredSelection = crossagentPreferredSelection(
    candidate,
    preferences,
    fallback.preferredSelection,
  );
  const learnedTags = learnedTagsFor(candidate, preferences.crossagentSelectionUsage);
  const manualOverride = matchingManualOverride(candidate, preferences, preferredSelection);
  if (manualOverride) {
    return {
      provider: candidate.provider,
      source: "manual-override",
      usageCount: 0,
      recency: manualOverride.override.updatedAt,
      preferredSelection: manualOverride.selection,
      matchedTags: manualOverride.tags,
      learnedTags,
      tagScore: 0,
      bucket: -2,
    };
  }
  if (contextualProviderUsage.length > 0) {
    return {
      provider: candidate.provider,
      source: "tag-affinity",
      usageCount: contextualProviderUsage.reduce((sum, entry) => sum + entry.count, 0),
      recency: Math.max(...contextualProviderUsage.map((entry) => entry.lastUsedAt)),
      preferredSelection,
      matchedTags: [
        ...new Set(contextualProviderUsage.flatMap((entry) => tagOverlap(entry, contextTags))),
      ],
      learnedTags,
      tagScore: contextualProviderUsage.reduce(
        (sum, entry) => sum + contextualUsageScore(entry, contextTags),
        0,
      ),
      bucket: -1,
    };
  }
  if (providerUsage.length === 0) {
    return {
      ...fallback,
      preferredSelection,
      matchedTags: [],
      learnedTags,
      tagScore: 0,
    };
  }
  return {
    provider: candidate.provider,
    source: "crossagent-usage",
    usageCount: providerUsage.reduce((sum, entry) => sum + entry.count, 0),
    recency: Math.max(...providerUsage.map((entry) => entry.lastUsedAt)),
    preferredSelection,
    matchedTags: [],
    learnedTags,
    tagScore: 0,
    bucket: 0,
  };
}

/**
 * Rank only the candidates supplied by the live caller. Persisted preferences
 * for unavailable providers, removed models, unsupported effort values, or
 * unavailable Fast modes are deliberately ignored.
 */
export function rankCrossagentCandidates(
  candidates: readonly CrossagentRankingCandidate[],
  preferences: CrossagentRankingPreferences,
): RankedCrossagentCandidate[] {
  return candidates
    .map((candidate, builtInIndex) => ({
      ...providerPreference(candidate, preferences),
      builtInIndex,
    }))
    .toSorted(
      (left, right) =>
        left.bucket - right.bucket ||
        right.matchedTags.length - left.matchedTags.length ||
        right.tagScore - left.tagScore ||
        right.usageCount - left.usageCount ||
        right.recency - left.recency ||
        left.builtInIndex - right.builtInIndex,
    )
    .map(
      (
        {
          bucket: _bucket,
          recency: _recency,
          tagScore: _tagScore,
          builtInIndex: _builtInIndex,
          ...entry
        },
        index,
      ) => ({ ...entry, rank: index + 1 }),
    );
}
