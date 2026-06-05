import type { AgentCapability, AgentStatus, ThreadPresentationMode } from "@/shared/contracts";
import { deriveSubProvider, listSubProviderOrder } from "./deriveSubProvider";
import {
  formatShortcutFallbackLabel,
  formatShortcutModelLabel,
  modelLookupAliases,
  stripBracketParams,
} from "./modelShortcutLabel";
import {
  providerLabelForPresentation,
  providerMenuKey,
  providerVisibilityKey,
} from "./providerIdentity";
import type { ProviderModelItem } from "./types";

export interface ProviderModelMenuProvider {
  /** Real adapter kind used for launch/favorites. */
  kind: string;
  label: string;
  icon?: string;
  presentationMode?: ThreadPresentationMode;
  /** Unique UI identity when one adapter exposes multiple model surfaces. */
  modelPickerKey?: string;
  /** Settings key used for hidden-model persistence. */
  hiddenModelsKey?: string;
  capabilities: AgentCapability;
}

export function statusToMenuProvider(agent: AgentStatus): ProviderModelMenuProvider {
  return {
    kind: agent.kind,
    label: agent.label,
    ...(agent.icon ? { icon: agent.icon } : {}),
    capabilities: agent.capabilities,
  };
}

export interface ModelRef {
  agentKind: string;
  modelId: string;
  presentationMode?: ThreadPresentationMode;
}

export interface BuildProviderModelItemsInput {
  providers: ProviderModelMenuProvider[];
  search: string;
  lockedAgentKind?: string;
  /** Current selection — surfaced even if absent from `providers[*].capabilities.models`. */
  currentAgentKind?: string;
  currentModel?: string;
  /** Persisted favorites (provider/model pairs). Surfaced as a sticky section. */
  favorites?: readonly ModelRef[];
  /** Favorite state used for row stars without affecting section ordering. */
  favoriteStateRefs?: readonly ModelRef[];
  /** Persisted recents (provider/model pairs). Capped to `recentsLimit` and de-duped against favorites. */
  recents?: readonly ModelRef[];
  /** Display cap for recents (default 5). */
  recentsLimit?: number;
  /**
   * User-defined provider display order. Kinds in this list win over the built-in
   * `PROVIDER_ORDER` default; anything missing falls to the default order at the tail.
   */
  providerOrder?: readonly string[];
}

const DEFAULT_LABEL = (id: string) =>
  id
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");

/** Default display order for provider sections. Unknown kinds fall to the end. */
const PROVIDER_ORDER: readonly string[] = [
  "claude",
  "codex",
  "gemini",
  "antigravity",
  "commandcode",
  "opencode",
  "cursor",
  "copilot",
];

function makeProviderSortKey(userOrder: readonly string[] | undefined): (kind: string) => number {
  const trimmed = userOrder?.filter((k) => k.length > 0) ?? [];
  if (trimmed.length === 0) {
    return (kind) => {
      const idx = PROVIDER_ORDER.indexOf(kind);
      return idx < 0 ? PROVIDER_ORDER.length : idx;
    };
  }
  const userIndex = new Map<string, number>();
  trimmed.forEach((kind, i) => {
    if (!userIndex.has(kind)) userIndex.set(kind, i);
  });
  const userTailBase = trimmed.length;
  return (kind) => {
    const fromUser = userIndex.get(kind);
    if (fromUser !== undefined) return fromUser;
    const fromDefault = PROVIDER_ORDER.indexOf(kind);
    return userTailBase + (fromDefault < 0 ? PROVIDER_ORDER.length : fromDefault);
  };
}

interface ModelEntry {
  id: string;
  label: string;
  subId?: string;
  subLabel?: string;
  contextDescription?: string;
  modelDescription?: string;
  tooltipDescription?: string;
  searchText: string;
}

// Surface the model's reported context window(s) as a muted secondary hint in
// the row. Cursor models with multiple selectable sizes show "272K / 1M";
// OpenCode models with a single registry context show "128K". Filters out the
// abstract "Default" id so we don't pollute rows with non-informative text.
function pickContextDescription(modelId: string, capability: AgentCapability): string | undefined {
  const ids = capability.modelContextSizes?.[modelId];
  if (!ids || ids.length === 0) return undefined;
  const labels: string[] = [];
  for (const id of ids) {
    if (id.toLowerCase() === "default") continue;
    // Prefer the explicit `contextSizes` label when present; otherwise fall
    // back to the id itself uppercased so Cursor's "200k" / "1m" ids render
    // as "200K" / "1M" without the provider having to publish a label entry
    // (which would otherwise spawn a single-option context picker).
    const label =
      capability.contextSizes?.find((option) => option.id === id)?.label ?? id.toUpperCase();
    if (!label) continue;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.length > 0 ? labels.join(" / ") : undefined;
}

function formatModelDescription(description: string | undefined): string | undefined {
  const trimmed = description?.trim();
  if (!trimmed) return undefined;
  const rawRate = /^(\d+(?:\.\d+)?)x$/iu.exec(trimmed);
  return rawRate ? `${rawRate[1]}x` : undefined;
}

function joinHints(...hints: Array<string | undefined>): string | undefined {
  const parts = hints.filter((hint): hint is string => Boolean(hint));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function modelHintProps(model: {
  modelDescription?: string;
  contextDescription?: string;
}): { contextDescription: string } | {} {
  const contextDescription = joinHints(model.modelDescription, model.contextDescription);
  return contextDescription ? { contextDescription } : {};
}

function formatTooltipDescription(input: {
  description?: string;
  modelDescription?: string;
  tooltipDescription?: string;
}): string | undefined {
  const explicit = input.tooltipDescription?.trim();
  if (explicit) return explicit;
  const description = input.description?.trim();
  if (!description || description === input.modelDescription) return undefined;
  return description;
}

interface ProviderModelCache {
  models: ModelEntry[];
  modelById: Map<string, ModelEntry>;
}

const providerModelCache = new WeakMap<AgentCapability, ProviderModelCache>();

/**
 * Build a flat list of header + model rows for the virtualized listbox.
 *
 * Browse mode (no search): provider header + optional sub-provider headers + models.
 * Search mode: provider header + flat models matching the query, with sub-provider
 * label promoted to a per-row right-rail hint.
 *
 * When `lockedAgentKind` is set, only that provider's rows appear and the provider
 * header is omitted (there is no other provider to disambiguate against).
 */
function refKey(ref: ModelRef): string {
  return `${ref.agentKind}:${ref.modelId}`;
}

interface ResolvedModelRef {
  ref: ModelRef;
  label: string;
  providerLabel: string;
  subProviderLabel?: string;
  contextDescription?: string;
  modelDescription?: string;
  tooltipDescription?: string;
  searchText: string;
  providerSearchText: string;
}

function makeModelEntry(
  id: string,
  label: string,
  capability: AgentCapability,
  description?: string,
  tooltipDescription?: string,
): ModelEntry {
  const sub = deriveSubProvider(id, capability);
  const searchParts = [id, label];
  const entry: ModelEntry = { id, label, searchText: "" };
  if (sub) {
    entry.subId = sub.id;
    entry.subLabel = sub.label;
    searchParts.push(sub.id, sub.label);
  }
  const contextDescription = pickContextDescription(id, capability);
  if (contextDescription) {
    entry.contextDescription = contextDescription;
    searchParts.push(contextDescription);
  }
  const modelDescription = formatModelDescription(description);
  if (modelDescription) {
    entry.modelDescription = modelDescription;
    searchParts.push(modelDescription);
  }
  const tooltip = formatTooltipDescription({
    ...(description ? { description } : {}),
    ...(modelDescription ? { modelDescription } : {}),
    ...(tooltipDescription ? { tooltipDescription } : {}),
  });
  if (tooltip) {
    entry.tooltipDescription = tooltip;
  }
  entry.searchText = searchParts.join("\n").toLowerCase();
  return entry;
}

function getProviderModelCache(capability: AgentCapability): ProviderModelCache {
  const cached = providerModelCache.get(capability);
  if (cached) return cached;

  const models: ModelEntry[] = [];
  const modelById = new Map<string, ModelEntry>();
  for (const model of capability.models) {
    const entry = makeModelEntry(
      model.id,
      model.label,
      capability,
      model.description,
      model.tooltipDescription,
    );
    models.push(entry);
    modelById.set(entry.id, entry);
  }

  const next: ProviderModelCache = { models, modelById };
  providerModelCache.set(capability, next);
  return next;
}

interface VisibleProvider {
  provider: ProviderModelMenuProvider;
  key: string;
  visibilityKey: string;
  cache: ProviderModelCache;
  searchText: string;
}

function findModelEntry(cache: ProviderModelCache, modelId: string): ModelEntry | undefined {
  for (const alias of modelLookupAliases(modelId)) {
    const direct = cache.modelById.get(alias);
    if (direct) return direct;
  }

  const baseId = stripBracketParams(modelId);
  for (const candidate of cache.models) {
    if (modelLookupAliases(candidate.id).includes(baseId)) {
      return candidate;
    }
  }

  return undefined;
}

function resolveModelRef(
  ref: ModelRef,
  visibleProviders: readonly VisibleProvider[],
): ResolvedModelRef | undefined {
  const visibleProvider = visibleProviders.find((entry) => {
    if (entry.provider.kind !== ref.agentKind) return false;
    if (!ref.presentationMode) return true;
    if (!entry.provider.presentationMode) return true;
    return entry.provider.presentationMode === ref.presentationMode;
  });
  if (!visibleProvider) return undefined;
  const { provider, cache } = visibleProvider;
  const model =
    findModelEntry(cache, ref.modelId) ??
    makeModelEntry(
      ref.modelId,
      formatShortcutFallbackLabel(ref.agentKind, ref.modelId),
      provider.capabilities,
    );
  const resolved: ResolvedModelRef = {
    ref,
    label: formatShortcutModelLabel(ref.agentKind, ref.modelId, model.label),
    providerLabel: provider.label,
    searchText: model.searchText,
    providerSearchText: visibleProvider.searchText,
  };
  if (model.subLabel) resolved.subProviderLabel = model.subLabel;
  if (model.contextDescription) resolved.contextDescription = model.contextDescription;
  if (model.modelDescription) resolved.modelDescription = model.modelDescription;
  if (model.tooltipDescription) resolved.tooltipDescription = model.tooltipDescription;
  return resolved;
}

export function buildProviderModelItems(input: BuildProviderModelItemsInput): ProviderModelItem[] {
  const {
    providers,
    search,
    lockedAgentKind,
    currentAgentKind,
    currentModel,
    favorites,
    favoriteStateRefs,
    recents,
    recentsLimit = 5,
    providerOrder,
  } = input;
  const providerSortKey = makeProviderSortKey(providerOrder);
  const visibleProviders = (
    lockedAgentKind ? providers.filter((p) => p.kind === lockedAgentKind) : providers
  )
    .slice()
    .sort((a, b) => providerSortKey(a.kind) - providerSortKey(b.kind));
  const visibleProviderEntries: VisibleProvider[] = visibleProviders.map((provider) => ({
    provider,
    key: providerMenuKey(provider),
    visibilityKey: providerVisibilityKey(provider),
    cache: getProviderModelCache(provider.capabilities),
    searchText:
      `${provider.kind}\n${provider.label}\n${providerLabelForPresentation(provider)}`.toLowerCase(),
  }));
  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;
  const out: ProviderModelItem[] = [];
  const singleProviderMode = visibleProviders.length === 1;
  const showProviderHeaders = visibleProviders.length > 1;
  const visibleKinds = new Set(visibleProviders.map((p) => p.kind));
  const sectionFavoriteSet = new Set((favorites ?? []).map(refKey));
  const favoriteStateSet = new Set((favoriteStateRefs ?? favorites ?? []).map(refKey));

  // In single-provider mode the standalone Favorites/Recent sections would just
  // duplicate rows from the provider's own model list (and a provider icon column
  // makes no sense with only one provider). Surface favorites by sorting them to
  // the top of each natural section instead. Use the frozen-at-open `favorites`
  // snapshot for ordering so toggling a star mid-session doesn't reshuffle rows.
  function sortFavoritesFirst(models: readonly ModelEntry[], providerKind: string): ModelEntry[] {
    if (!singleProviderMode) return [...models];
    const favs: ModelEntry[] = [];
    const rest: ModelEntry[] = [];
    for (const m of models) {
      if (sectionFavoriteSet.has(`${providerKind}:${m.id}`)) favs.push(m);
      else rest.push(m);
    }
    return [...favs, ...rest];
  }

  function pushShortcutSection(
    sectionId: string,
    headerLabel: string,
    refs: readonly ModelRef[],
  ): void {
    // Favorites/recents store one entry per (agentKind, modelId, presentationMode).
    // When the caller doesn't filter by presentationMode (e.g. settings pages),
    // the same model can appear multiple times — collapse to one row.
    const seenRefKeys = new Set<string>();
    const dedupedRefs = refs.filter((ref) => {
      const key = refKey(ref);
      if (seenRefKeys.has(key)) return false;
      seenRefKeys.add(key);
      return true;
    });
    const items = dedupedRefs
      .filter((ref) => visibleKinds.has(ref.agentKind))
      .map((ref) => resolveModelRef(ref, visibleProviderEntries))
      .filter((m): m is ResolvedModelRef => m !== undefined)
      .filter((m) => {
        if (!isSearching) return true;
        return m.searchText.includes(query) || m.providerSearchText.includes(query);
      });
    if (items.length === 0) return;
    out.push({ type: "header-plain", id: `header:${sectionId}`, label: headerLabel });
    for (const m of items) {
      const visibleProvider = visibleProviderEntries.find(
        (entry) =>
          entry.provider.kind === m.ref.agentKind &&
          (!m.ref.presentationMode ||
            !entry.provider.presentationMode ||
            entry.provider.presentationMode === m.ref.presentationMode),
      );
      const providerIcon = visibleProvider?.provider.icon;
      out.push({
        type: "model",
        id: `${sectionId}:${m.ref.agentKind}:${m.ref.modelId}`,
        providerKind: m.ref.agentKind,
        providerKey: visibleProvider?.key ?? m.ref.agentKind,
        hiddenModelsKey: visibleProvider?.visibilityKey ?? m.ref.agentKind,
        modelId: m.ref.modelId,
        label: m.label,
        ...(m.ref.presentationMode ? { presentationMode: m.ref.presentationMode } : {}),
        ...(providerIcon ? { providerIcon } : {}),
        ...(m.subProviderLabel ? { subProviderLabel: m.subProviderLabel } : {}),
        ...modelHintProps(m),
        ...(m.tooltipDescription ? { tooltipDescription: m.tooltipDescription } : {}),
        showProviderIcon: true,
        isFavorite: favoriteStateSet.has(refKey(m.ref)),
      });
    }
  }

  if (!singleProviderMode) {
    if (favorites?.length) {
      pushShortcutSection("fav", "Favorites", favorites);
    }
    if (recents?.length) {
      const filteredRecents = recents
        .filter((r) => !sectionFavoriteSet.has(refKey(r)))
        .slice(0, recentsLimit);
      if (filteredRecents.length > 0) {
        pushShortcutSection("recent", "Recent", filteredRecents);
      }
    }
  }

  for (const { provider, key, visibilityKey, cache, searchText } of visibleProviderEntries) {
    const cap = provider.capabilities;
    const providerHit = isSearching && searchText.includes(query);
    const currentEntry =
      currentAgentKind === provider.kind && currentModel && !cache.modelById.has(currentModel)
        ? makeModelEntry(currentModel, DEFAULT_LABEL(currentModel), cap)
        : undefined;
    const sourceModelCount = cache.models.length + (currentEntry ? 1 : 0);

    const filtered: ModelEntry[] = [];
    for (let index = 0; index < sourceModelCount; index += 1) {
      const model = index < cache.models.length ? cache.models[index]! : currentEntry!;
      if (!isSearching || providerHit || model.searchText.includes(query)) {
        filtered.push(model);
      }
    }

    if (filtered.length === 0) continue;

    if (showProviderHeaders) {
      out.push({
        type: "header-provider",
        id: `provider:${key}`,
        providerKind: provider.kind,
        providerKey: key,
        hiddenModelsKey: visibilityKey,
        ...(provider.icon ? { providerIcon: provider.icon } : {}),
        label: providerLabelForPresentation(provider),
      });
    }

    if (isSearching) {
      // Flat under the provider; sub-provider promoted to right-rail label.
      for (const m of sortFavoritesFirst(filtered, provider.kind)) {
        out.push({
          type: "model",
          id: `model:${key}:${m.id}`,
          providerKind: provider.kind,
          providerKey: key,
          hiddenModelsKey: visibilityKey,
          modelId: m.id,
          label: m.label,
          ...(provider.presentationMode ? { presentationMode: provider.presentationMode } : {}),
          ...(provider.icon ? { providerIcon: provider.icon } : {}),
          ...(m.subLabel ? { subProviderLabel: m.subLabel } : {}),
          ...modelHintProps(m),
          ...(m.tooltipDescription ? { tooltipDescription: m.tooltipDescription } : {}),
          showProviderIcon: true,
          isFavorite: favoriteStateSet.has(`${provider.kind}:${m.id}`),
        });
      }
      continue;
    }

    const grouped = new Map<string, ModelEntry[]>();
    const ungrouped: ModelEntry[] = [];
    for (const m of filtered) {
      if (m.subId) {
        let bucket = grouped.get(m.subId);
        if (!bucket) {
          bucket = [];
          grouped.set(m.subId, bucket);
        }
        bucket.push(m);
      } else {
        ungrouped.push(m);
      }
    }

    for (const m of sortFavoritesFirst(ungrouped, provider.kind)) {
      out.push({
        type: "model",
        id: `model:${key}:${m.id}`,
        providerKind: provider.kind,
        providerKey: key,
        hiddenModelsKey: visibilityKey,
        modelId: m.id,
        label: m.label,
        ...(provider.presentationMode ? { presentationMode: provider.presentationMode } : {}),
        ...(provider.icon ? { providerIcon: provider.icon } : {}),
        ...modelHintProps(m),
        ...(m.tooltipDescription ? { tooltipDescription: m.tooltipDescription } : {}),
        isFavorite: favoriteStateSet.has(`${provider.kind}:${m.id}`),
      });
    }

    if (grouped.size === 0) continue;

    for (const sp of listSubProviderOrder(cap, grouped.keys())) {
      const models = grouped.get(sp.id);
      if (!models?.length) continue;
      out.push({
        type: "header-sub",
        id: `sub:${key}:${sp.id}`,
        providerKind: provider.kind,
        providerKey: key,
        hiddenModelsKey: visibilityKey,
        subId: sp.id,
        label: sp.label,
      });
      for (const m of sortFavoritesFirst(models, provider.kind)) {
        out.push({
          type: "model",
          id: `model:${key}:${m.id}`,
          providerKind: provider.kind,
          providerKey: key,
          hiddenModelsKey: visibilityKey,
          modelId: m.id,
          label: m.label,
          ...(provider.presentationMode ? { presentationMode: provider.presentationMode } : {}),
          ...(provider.icon ? { providerIcon: provider.icon } : {}),
          ...modelHintProps(m),
          ...(m.tooltipDescription ? { tooltipDescription: m.tooltipDescription } : {}),
          isFavorite: favoriteStateSet.has(`${provider.kind}:${m.id}`),
        });
      }
    }
  }

  return out;
}
