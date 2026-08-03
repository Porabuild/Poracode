import {
  MAX_CROSSAGENT_ROUTING_OVERRIDES,
  type AgentSelectionUsageEntry,
  type CrossagentRoutingOverride,
  type CrossagentSelectionUsageEntry,
  type CrossagentSelectionUsageEntryKey,
  type SharedSettings,
} from "./settings";

export type { CrossagentSelectionUsageEntryKey } from "./settings";

export type CrossagentRankSource =
  | "manual-override"
  | "tag-affinity"
  | "crossagent-usage"
  | "favorite"
  | "agent-usage"
  | "built-in";

export type CrossagentExecution = "structured" | "one-shot";

export const MAX_CROSSAGENT_TAGS = 5;
const MAX_LEARNED_TAGS = 8;

/**
 * Ranking tiers, strongest first. Favorites and ordinary composer usage share
 * `composerUsage` on purpose: a favorite picks which model represents its
 * provider, but real usage counts decide the order, so a zero-use favorite
 * cannot outrank a heavily used selection. Only the relative order matters.
 */
const RANK_BUCKET = {
  manualOverride: -2,
  tagAffinity: -1,
  crossagentUsage: 0,
  composerUsage: 2,
  builtIn: 3,
} as const;
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

/**
 * Ranking inputs read from shared settings. One mapping shared by the live MCP
 * roster and the settings snapshot so both rank on the same signals.
 */
export function crossagentRankingPreferences(
  settings: Partial<
    Pick<
      SharedSettings,
      | "crossagentSelectionUsage"
      | "crossagentRoutingOverrides"
      | "agentSelectionUsage"
      | "favoriteModels"
    >
  >,
  contextTags: readonly string[] = [],
): CrossagentRankingPreferences {
  return {
    crossagentSelectionUsage: settings.crossagentSelectionUsage ?? [],
    routingOverrides: settings.crossagentRoutingOverrides ?? [],
    agentSelectionUsage: settings.agentSelectionUsage ?? [],
    favoriteModels: settings.favoriteModels ?? [],
    contextTags,
  };
}

export interface CrossagentRoutingSnapshotEntry {
  provider: string;
  label: string;
  execution: CrossagentExecution;
  rank: number;
  source: CrossagentRankSource;
  usageCount: number;
  model: { id: string; label: string };
  reasoning?: string;
  fast: boolean;
  learnedTags: Array<{ tag: string; count: number }>;
}

/**
 * One Crossagents-eligible provider, ignoring the Crossagents-only pause and
 * model filters. Feeds the settings filter UI, which must keep listing
 * providers the user has unchecked so they can be re-enabled.
 */
export interface CrossagentRoutingProviderEntry {
  kind: string;
  label: string;
  execution: CrossagentExecution;
}

export interface CrossagentRoutingState {
  /** Live ranked order after all visibility filters. */
  ranked: CrossagentRoutingSnapshotEntry[];
  /** Every eligible provider, including paused/fully-filtered ones. */
  providers: CrossagentRoutingProviderEntry[];
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
      (entry) => selectionUsageEntryKeyOf(entry) === selectionUsageEntryKey(selection),
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

/**
 * Identity of one learned-memory entry, as supplied by the settings UI. Two
 * entries with the same key are the same learned fact; matching mirrors the
 * identity comparison used by `incrementCrossagentSelectionUsage`.
 */
export function crossagentSelectionUsageEntryKey(
  entry: CrossagentSelectionUsageEntry,
): CrossagentSelectionUsageEntryKey {
  return {
    agentKind: entry.agentKind,
    modelId: entry.modelId,
    ...(entry.effort !== undefined ? { effort: entry.effort } : {}),
    fast: entry.fast,
    ...(entry.tags ? { tags: entry.tags } : {}),
    ...(entry.explicitFields ? { explicitFields: entry.explicitFields } : {}),
  };
}

function selectionUsageEntryKey(key: CrossagentSelectionUsageEntryKey): string {
  return [
    key.agentKind,
    key.modelId,
    key.effort ?? "",
    key.fast ? "1" : "0",
    normalizeCrossagentTags(key.tags).join("\0"),
    (key.explicitFields?.provider ?? true) ? "1" : "0",
    (key.explicitFields?.model ?? true) ? "1" : "0",
    (key.explicitFields?.effort ?? true) ? "1" : "0",
    (key.explicitFields?.fast ?? true) ? "1" : "0",
  ].join("\0");
}

function selectionUsageEntryKeyOf(entry: CrossagentSelectionUsageEntry): string {
  return selectionUsageEntryKey(crossagentSelectionUsageEntryKey(entry));
}

/** Drop one learned-memory entry (the settings UI's "remove memory item"). */
export function removeCrossagentSelectionUsageEntry(
  entries: readonly CrossagentSelectionUsageEntry[],
  key: CrossagentSelectionUsageEntryKey,
): CrossagentSelectionUsageEntry[] {
  const target = selectionUsageEntryKey(key);
  return entries.filter((entry) => selectionUsageEntryKeyOf(entry) !== target);
}

/**
 * Replace the task tags of one learned-memory entry (the settings UI's tag
 * editor). Normalized like any learned entry; if the retagged entry collides
 * with an existing one, their counts merge and the most recent use wins.
 */
export function retagCrossagentSelectionUsageEntry(
  entries: readonly CrossagentSelectionUsageEntry[],
  key: CrossagentSelectionUsageEntryKey,
  tags: readonly string[],
): CrossagentSelectionUsageEntry[] {
  const target = selectionUsageEntryKey(key);
  const matched = entries.find((entry) => selectionUsageEntryKeyOf(entry) === target);
  if (!matched) return [...entries];
  const normalizedTags = normalizeCrossagentTags(tags);
  const updated: CrossagentSelectionUsageEntry = {
    ...matched,
    ...(normalizedTags.length > 0 ? { tags: normalizedTags } : {}),
  };
  if (normalizedTags.length === 0) delete updated.tags;
  const updatedKey = selectionUsageEntryKeyOf(updated);
  let merged = updated;
  const rest: CrossagentSelectionUsageEntry[] = [];
  for (const entry of entries) {
    const entryKey = selectionUsageEntryKeyOf(entry);
    if (entryKey === target) continue;
    if (entryKey === updatedKey) {
      merged = {
        ...merged,
        count: merged.count + entry.count,
        lastUsedAt: Math.max(merged.lastUsedAt, entry.lastUsedAt),
      };
      continue;
    }
    rest.push(entry);
  }
  return [merged, ...rest].slice(0, SELECTION_USAGE_LIMIT);
}

function modelFor(
  candidate: CrossagentRankingCandidate,
  modelId: string,
): CrossagentRankingModel | undefined {
  return candidate.models.find((model) => model.id === modelId);
}

const EMPTY_CROSSAGENT_USAGE: readonly CrossagentSelectionUsageEntry[] = [];
const EMPTY_AGENT_USAGE: readonly AgentSelectionUsageEntry[] = [];
const EMPTY_MODEL_IDS: readonly string[] = [];

function usageKey(provider: string, modelId: string): string {
  return `${provider} ${modelId}`;
}

function pushBucket<K, V>(buckets: Map<K, V[]>, key: K, value: V): void {
  const bucket = buckets.get(key);
  if (bucket) bucket.push(value);
  else buckets.set(key, [value]);
}

/**
 * Persisted preferences bucketed by provider and by provider+model, built once
 * per ranking run. Ranking scores every (provider, model) pair, so filtering
 * the full usage lists per pair is O(pairs × entries); these buckets make each
 * lookup O(1). Buckets keep source-array order, so the stable sorts downstream
 * produce exactly the same result as filtering the original arrays.
 */
interface CrossagentRankingIndex {
  crossByProvider: Map<string, CrossagentSelectionUsageEntry[]>;
  crossByModel: Map<string, CrossagentSelectionUsageEntry[]>;
  agentByProvider: Map<string, AgentSelectionUsageEntry[]>;
  agentByModel: Map<string, AgentSelectionUsageEntry[]>;
  favoriteModelsByProvider: Map<string, string[]>;
  favoritePairs: Set<string>;
}

function buildRankingIndex(preferences: CrossagentRankingPreferences): CrossagentRankingIndex {
  const index: CrossagentRankingIndex = {
    crossByProvider: new Map(),
    crossByModel: new Map(),
    agentByProvider: new Map(),
    agentByModel: new Map(),
    favoriteModelsByProvider: new Map(),
    favoritePairs: new Set(),
  };
  for (const entry of preferences.crossagentSelectionUsage) {
    pushBucket(index.crossByProvider, entry.agentKind, entry);
    pushBucket(index.crossByModel, usageKey(entry.agentKind, entry.modelId), entry);
  }
  for (const entry of preferences.agentSelectionUsage) {
    pushBucket(index.agentByProvider, entry.agentKind, entry);
    pushBucket(index.agentByModel, usageKey(entry.agentKind, entry.modelId), entry);
  }
  for (const entry of preferences.favoriteModels) {
    pushBucket(index.favoriteModelsByProvider, entry.agentKind, entry.modelId);
    index.favoritePairs.add(usageKey(entry.agentKind, entry.modelId));
  }
  return index;
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

/**
 * Normalized tags of one persisted entry, cached against the entry's identity.
 * Ranking compares tags inside sort comparators, so the same entry is
 * normalized many times per run; entries are always replaced rather than
 * mutated in place, so caching on identity is safe.
 */
const normalizedEntryTags = new WeakMap<CrossagentSelectionUsageEntry, string[]>();

function entryTags(entry: CrossagentSelectionUsageEntry): string[] {
  const cached = normalizedEntryTags.get(entry);
  if (cached) return cached;
  const tags = normalizeCrossagentTags(entry.tags);
  normalizedEntryTags.set(entry, tags);
  return tags;
}

function tagOverlap(
  entry: CrossagentSelectionUsageEntry,
  contextTags: readonly string[],
): string[] {
  if (contextTags.length === 0) return [];
  const requested = new Set(contextTags);
  return entryTags(entry).filter((tag) => requested.has(tag));
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

/** Entries whose tags overlap the context, ordered by contextual affinity. */
function contextuallyRanked(
  entries: readonly CrossagentSelectionUsageEntry[],
  contextTags: readonly string[],
): CrossagentSelectionUsageEntry[] {
  if (contextTags.length === 0) return [];
  return entries
    .filter((entry) => tagOverlap(entry, contextTags).length > 0)
    .toSorted((left, right) => compareContextualUsage(left, right, contextTags));
}

/** Weight of a non-empty set of usage votes (Crossagents or composer). */
function usageAggregate(entries: readonly { count: number; lastUsedAt: number }[]): {
  usageCount: number;
  recency: number;
} {
  return {
    usageCount: entries.reduce((sum, entry) => sum + entry.count, 0),
    recency: Math.max(...entries.map((entry) => entry.lastUsedAt)),
  };
}

/** Score fields shared by every tag-affinity ranking entry. Requires `entries` to be non-empty. */
function tagAffinityScore(
  entries: readonly CrossagentSelectionUsageEntry[],
  contextTags: readonly string[],
): { usageCount: number; recency: number; matchedTags: string[]; tagScore: number } {
  return {
    ...usageAggregate(entries),
    matchedTags: [...new Set(entries.flatMap((entry) => tagOverlap(entry, contextTags)))],
    tagScore: entries.reduce((sum, entry) => sum + contextualUsageScore(entry, contextTags), 0),
  };
}

/**
 * Shared ranking comparator: tier, then tag specificity, then usage weight.
 * Both rankers use it so the model-level order stays consistent with the
 * provider-level order they must agree on; callers append their own
 * tie-breakers.
 */
function compareRankedScores(
  left: { bucket: number; matchedTags: string[]; tagScore: number } & {
    usageCount: number;
    recency: number;
  },
  right: typeof left,
): number {
  return (
    left.bucket - right.bucket ||
    right.matchedTags.length - left.matchedTags.length ||
    right.tagScore - left.tagScore ||
    right.usageCount - left.usageCount ||
    right.recency - left.recency
  );
}

function learnedTagsForEntries(
  entries: readonly CrossagentSelectionUsageEntry[],
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of normalizeCrossagentTags(entry.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + entry.count);
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .toSorted((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, MAX_LEARNED_TAGS);
}

function providerLearnedTags(
  provider: string,
  index: CrossagentRankingIndex,
): Array<{ tag: string; count: number }> {
  return learnedTagsForEntries(index.crossByProvider.get(provider) ?? EMPTY_CROSSAGENT_USAGE);
}

function modelLearnedTags(
  provider: string,
  modelId: string,
  index: CrossagentRankingIndex,
): Array<{ tag: string; count: number }> {
  return learnedTagsForEntries(
    index.crossByModel.get(usageKey(provider, modelId)) ?? EMPTY_CROSSAGENT_USAGE,
  );
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
  index: CrossagentRankingIndex,
): Omit<RankedCrossagentCandidate, "rank" | "matchedTags" | "learnedTags"> & {
  bucket: number;
  recency: number;
} {
  const providerFavorites =
    index.favoriteModelsByProvider.get(candidate.provider) ?? EMPTY_MODEL_IDS;
  const favoriteModelIds = new Set(
    providerFavorites.filter((modelId) => modelFor(candidate, modelId) !== undefined),
  );
  const agentUsage = (index.agentByProvider.get(candidate.provider) ?? EMPTY_AGENT_USAGE)
    .filter((entry) => isValidUsage(candidate, entry))
    .toSorted(compareUsage);
  if (favoriteModelIds.size > 0) {
    const favoriteUsage = agentUsage.filter((entry) => favoriteModelIds.has(entry.modelId));
    const favoriteModel =
      favoriteUsage[0]?.modelId ??
      providerFavorites.find((modelId) => favoriteModelIds.has(modelId))!;
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
      bucket: RANK_BUCKET.composerUsage,
    };
  }

  if (agentUsage.length > 0) {
    return {
      provider: candidate.provider,
      source: "agent-usage",
      ...usageAggregate(agentUsage),
      preferredSelection: selectionFromUsage(agentUsage[0]!),
      bucket: RANK_BUCKET.composerUsage,
    };
  }

  return {
    provider: candidate.provider,
    source: "built-in",
    usageCount: 0,
    recency: 0,
    preferredSelection: defaultSelection(candidate),
    bucket: RANK_BUCKET.builtIn,
  };
}

function crossagentPreferredSelection(
  candidate: CrossagentRankingCandidate,
  fallback: RankedCrossagentCandidate["preferredSelection"],
  index: CrossagentRankingIndex,
  contextTags: readonly string[],
): RankedCrossagentCandidate["preferredSelection"] {
  const allEntries = (
    index.crossByProvider.get(candidate.provider) ?? EMPTY_CROSSAGENT_USAGE
  ).toSorted(compareUsage);
  const contextual = contextuallyRanked(allEntries, contextTags);
  const entries = contextual.length > 0 ? contextual : allEntries;
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
  index: CrossagentRankingIndex,
  contextTags: readonly string[],
): Omit<RankedCrossagentCandidate, "rank" | "learnedTags"> & {
  bucket: number;
  recency: number;
  tagScore: number;
} {
  const fallback = fallbackProviderPreference(candidate, index);
  const providerUsage = (index.crossByProvider.get(candidate.provider) ?? EMPTY_CROSSAGENT_USAGE)
    .filter((entry) => isExplicitCrossagentField(entry, "provider"))
    .toSorted(compareUsage);
  const contextualProviderUsage = contextuallyRanked(providerUsage, contextTags);
  const preferredSelection = crossagentPreferredSelection(
    candidate,
    fallback.preferredSelection,
    index,
    contextTags,
  );
  const manualOverride = matchingManualOverride(candidate, preferences, preferredSelection);
  if (manualOverride) {
    return {
      provider: candidate.provider,
      source: "manual-override",
      usageCount: 0,
      recency: manualOverride.override.updatedAt,
      preferredSelection: manualOverride.selection,
      matchedTags: manualOverride.tags,
      tagScore: 0,
      bucket: RANK_BUCKET.manualOverride,
    };
  }
  if (contextualProviderUsage.length > 0) {
    return {
      provider: candidate.provider,
      source: "tag-affinity",
      ...tagAffinityScore(contextualProviderUsage, contextTags),
      preferredSelection,
      bucket: RANK_BUCKET.tagAffinity,
    };
  }
  if (providerUsage.length === 0) {
    return {
      ...fallback,
      preferredSelection,
      matchedTags: [],
      tagScore: 0,
    };
  }
  return {
    provider: candidate.provider,
    source: "crossagent-usage",
    ...usageAggregate(providerUsage),
    preferredSelection,
    matchedTags: [],
    tagScore: 0,
    bucket: RANK_BUCKET.crossagentUsage,
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
  const usageIndex = buildRankingIndex(preferences);
  const contextTags = normalizeCrossagentTags(preferences.contextTags);
  return candidates
    .map((candidate, builtInIndex) => ({
      ...providerPreference(candidate, preferences, usageIndex, contextTags),
      learnedTags: providerLearnedTags(candidate.provider, usageIndex),
      builtInIndex,
    }))
    .toSorted(
      (left, right) => compareRankedScores(left, right) || left.builtInIndex - right.builtInIndex,
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

/** One globally ranked (provider, model) pair. */
export interface RankedCrossagentModel {
  provider: string;
  model: string;
  rank: number;
  source: CrossagentRankSource;
  usageCount: number;
  matchedTags: string[];
  learnedTags: Array<{ tag: string; count: number }>;
  effort?: string;
  fast: boolean;
  /** Carries the provider's preferred selection — what an untagged spawn resolves to. */
  preferred: boolean;
}

interface ScoredCrossagentModel extends Omit<RankedCrossagentModel, "rank"> {
  bucket: number;
  recency: number;
  tagScore: number;
  builtInIndex: number;
  /** -1 for the preferred entry; per-provider position otherwise (round-robin ties). */
  positionIndex: number;
}

/** Score one non-preferred model by its own model-explicit signals. */
function secondaryModelPreference(
  candidate: CrossagentRankingCandidate,
  model: CrossagentRankingModel,
  index: CrossagentRankingIndex,
  contextTags: readonly string[],
): Pick<
  ScoredCrossagentModel,
  | "source"
  | "bucket"
  | "usageCount"
  | "recency"
  | "matchedTags"
  | "tagScore"
  | "effort"
  | "fast"
  | "learnedTags"
> {
  const modelKey = usageKey(candidate.provider, model.id);
  const votes = (index.crossByModel.get(modelKey) ?? EMPTY_CROSSAGENT_USAGE)
    .filter((entry) => isExplicitCrossagentField(entry, "model"))
    .toSorted(compareUsage);
  const contextual = contextuallyRanked(votes, contextTags);
  const best = contextual[0] ?? votes[0];
  const effort =
    best?.effort && model.efforts.includes(best.effort) ? best.effort : model.defaultEffort;
  const fast = best?.fast === true && model.fastAvailable;
  const learnedTags = modelLearnedTags(candidate.provider, model.id, index);
  const base = {
    ...(effort ? { effort } : {}),
    fast,
    learnedTags,
  };
  if (contextual.length > 0) {
    return {
      ...base,
      source: "tag-affinity",
      bucket: RANK_BUCKET.tagAffinity,
      ...tagAffinityScore(contextual, contextTags),
    };
  }
  if (votes.length > 0) {
    return {
      ...base,
      source: "crossagent-usage",
      bucket: RANK_BUCKET.crossagentUsage,
      ...usageAggregate(votes),
      matchedTags: [],
      tagScore: 0,
    };
  }
  // The bucket already pins provider and model; `isValidUsage` re-checks the
  // effort/Fast values against that model's current capabilities.
  const agentUsage = (index.agentByModel.get(modelKey) ?? EMPTY_AGENT_USAGE)
    .filter((entry) => isValidUsage(candidate, entry))
    .toSorted(compareUsage);
  const bestAgentUsage = agentUsage[0];
  const usageSelection = bestAgentUsage
    ? {
        ...(bestAgentUsage.effort ? { effort: bestAgentUsage.effort } : {}),
        fast: bestAgentUsage.fast,
      }
    : {};
  const isFavorite = index.favoritePairs.has(modelKey);
  if (isFavorite || agentUsage.length > 0) {
    return {
      ...base,
      ...usageSelection,
      source: isFavorite ? "favorite" : "agent-usage",
      bucket: RANK_BUCKET.composerUsage,
      // Not `usageAggregate`: a favorite with no usage at all lands here, and
      // `Math.max()` of no entries is -Infinity.
      usageCount: agentUsage.reduce((sum, entry) => sum + entry.count, 0),
      recency: bestAgentUsage?.lastUsedAt ?? 0,
      matchedTags: [],
      tagScore: 0,
    };
  }
  return {
    ...base,
    source: "built-in",
    bucket: RANK_BUCKET.builtIn,
    usageCount: 0,
    recency: 0,
    matchedTags: [],
    tagScore: 0,
  };
}

/**
 * Rank every (provider, model) pair globally, interleaving models across
 * providers. Each provider's preferred selection keeps exactly its
 * provider-level score (so the global #1 is always the selection an untagged
 * spawn resolves to); its remaining models rank by their own model-explicit
 * usage, favorites, and normal usage. A provider's preferred entry always
 * precedes its other models.
 */
export function rankCrossagentModels(
  candidates: readonly CrossagentRankingCandidate[],
  preferences: CrossagentRankingPreferences,
): RankedCrossagentModel[] {
  const usageIndex = buildRankingIndex(preferences);
  const contextTags = normalizeCrossagentTags(preferences.contextTags);
  const scored: ScoredCrossagentModel[] = [];
  candidates.forEach((candidate, builtInIndex) => {
    const primary = providerPreference(candidate, preferences, usageIndex, contextTags);
    scored.push({
      provider: candidate.provider,
      model: primary.preferredSelection.model,
      source: primary.source,
      usageCount: primary.usageCount,
      matchedTags: primary.matchedTags,
      learnedTags: modelLearnedTags(
        candidate.provider,
        primary.preferredSelection.model,
        usageIndex,
      ),
      ...(primary.preferredSelection.effort ? { effort: primary.preferredSelection.effort } : {}),
      fast: primary.preferredSelection.fast,
      preferred: true,
      bucket: primary.bucket,
      recency: primary.recency,
      tagScore: primary.tagScore,
      builtInIndex,
      positionIndex: -1,
    });
    let positionIndex = 0;
    for (const model of candidate.models) {
      if (model.id === primary.preferredSelection.model) continue;
      scored.push({
        provider: candidate.provider,
        model: model.id,
        ...secondaryModelPreference(candidate, model, usageIndex, contextTags),
        preferred: false,
        builtInIndex,
        positionIndex: positionIndex++,
      });
    }
  });
  const sorted = scored.toSorted(
    (left, right) =>
      compareRankedScores(left, right) ||
      left.positionIndex - right.positionIndex ||
      left.builtInIndex - right.builtInIndex,
  );
  // A provider's preferred entry must precede its other models: hold back any
  // secondary that sorts above its own primary until the primary is emitted.
  const ordered: ScoredCrossagentModel[] = [];
  const deferred = new Map<string, ScoredCrossagentModel[]>();
  const primaryEmitted = new Set<string>();
  for (const entry of sorted) {
    if (entry.preferred) {
      primaryEmitted.add(entry.provider);
      ordered.push(entry, ...(deferred.get(entry.provider) ?? []));
      deferred.delete(entry.provider);
    } else if (primaryEmitted.has(entry.provider)) {
      ordered.push(entry);
    } else {
      const queue = deferred.get(entry.provider) ?? [];
      queue.push(entry);
      deferred.set(entry.provider, queue);
    }
  }
  return ordered.map(
    (
      {
        bucket: _bucket,
        recency: _recency,
        tagScore: _tagScore,
        builtInIndex: _builtInIndex,
        positionIndex: _positionIndex,
        ...entry
      },
      index,
    ) => ({ ...entry, rank: index + 1 }),
  );
}
