import { msg } from "@lingui/core/macro";
import { msg as sharedMessage } from "@/shared/messages";
import type { MessageDescriptor } from "@lingui/core";
import { i18n } from "@/renderer/i18n/i18n";
import {
  baseAgentKind,
  type AgentCapability,
  type AgentStatus,
  type ThreadPresentationMode,
} from "@/shared/contracts";
import { canonicalProviderModelId } from "@/renderer/components/providers/modelConfig";
import { stripBracketParams } from "@/shared/modelLabels";
import { deriveSubProvider, listSubProviderOrder } from "./deriveSubProvider";
import {
  formatShortcutFallbackLabel,
  formatShortcutModelLabel,
  modelLookupAliases,
} from "./modelShortcutLabel";
import {
  providerLabelForPresentation,
  providerMenuKey,
  providerVisibilityKey,
} from "./providerIdentity";
import { getProviderModelPickerRank } from "@/renderer/components/providers/providerManifest";
import { primaryModelChoices } from "@/renderer/components/providers/modelPickerLayout";
import { separatePrimaryModelRows } from "./primaryModelRows";
import {
  aggregateModelPriceTerms,
  formatModelPriceHint,
  formatProviderModelDescription,
} from "@/renderer/components/providers/modelDescription";
import { cachedProjectedFamilies, modelFamilyMemberCompactLabel } from "./modelFamilyDisplay";
import type { ProviderModelItem } from "./types";

export interface ProviderModelMenuProvider {
  /** Real adapter kind used for launch/favorites. */
  kind: string;
  label: string;
  icon?: string;
  presentationMode?: ThreadPresentationMode;
  runtimeVariant?: string;
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
   * Hidden model ids keyed by provider visibility key. Callers already strip
   * these from `providers[*].capabilities.models`; this keeps them out of the
   * favorites/recents sections too, which resolve from persisted refs.
   */
  hiddenModels?: Readonly<Record<string, readonly string[] | undefined>>;
  /**
   * User-defined provider display order. Kinds in this list win over the built-in
   * provider-manifest default; anything missing falls to the tail.
   */
  providerOrder?: readonly string[];
}

const DEFAULT_LABEL = (id: string) =>
  id
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");

function makeProviderSortKey(userOrder: readonly string[] | undefined): (kind: string) => number {
  const trimmed = userOrder?.filter((k) => k.length > 0) ?? [];
  if (trimmed.length === 0) {
    return (kind) => {
      return getProviderModelPickerRank(baseAgentKind(kind));
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
    return userTailBase + getProviderModelPickerRank(baseAgentKind(kind));
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

// Surface a fixed context window as a muted row hint when the model has
// exactly one concrete size and no Context picker. Selectable multi-size
// models omit the chip — the composer control is the source of truth.
// Filters out the abstract "Default" id so we don't pollute rows with
// non-informative text.
function pickContextDescription(modelId: string, capability: AgentCapability): string | undefined {
  const ids = capability.modelContextSizes?.[modelId];
  if (!ids || ids.length === 0) return undefined;
  const concrete = ids.filter((id) => id.toLowerCase() !== "default");
  if (concrete.length !== 1) return undefined;
  const id = concrete[0]!;
  // Prefer the explicit `contextSizes` label when present; otherwise fall
  // back to the id itself uppercased so Cursor's "200k" / "1m" ids render
  // as "200K" / "1M" without the provider having to publish a label entry
  // (which would otherwise spawn a single-option context picker).
  const label =
    capability.contextSizes?.find((option) => option.id === id)?.label ?? id.toUpperCase();
  return label || undefined;
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

function distinctGroupLabel(
  modelLabel: string,
  groupLabel: string | undefined,
): string | undefined {
  return groupLabel?.trim().toLowerCase() !== modelLabel.trim().toLowerCase()
    ? groupLabel
    : undefined;
}

/**
 * The model supports fast mode AND the account can actually use it. Mirrors
 * `supportsUsableFastMode` in the thread helpers, inlined here to keep the
 * `common/` menu free of a dependency on `components/thread`. Derived from the
 * same capability object at row-build time, so it can never go stale against
 * the per-capability `ModelEntry` cache.
 */
function supportsFastModel(capability: AgentCapability, modelId: string): boolean {
  return (capability.fastModels?.includes(modelId) ?? false) && !capability.fastDisabledReason;
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

/**
 * Muted right-hand price text for one row. An exact row shows its own
 * provider-parsed price; a projected family row aggregates the complete
 * relation member inventory into an honest input/output range — rendered only
 * when EVERY member's price is known, never fabricated over partial terms.
 * The vendor cost text is parsed exclusively by the provider leaf formatter
 * through the description seam; this side only consumes parsed terms.
 */
function rowPriceLine(
  providerKind: string,
  entry: ModelEntry,
  cache: ProviderModelCache,
  intent: "projected" | "exact" = "projected",
): string | undefined {
  const memberIds = intent === "exact" ? undefined : cache.familyMemberIds.get(entry.id);
  if (memberIds) {
    const terms = aggregateModelPriceTerms(
      memberIds.map((id) =>
        formatProviderModelDescription(providerKind, cache.modelById.get(id)?.tooltipDescription),
      ),
    );
    return terms ? formatModelPriceHint(terms) : undefined;
  }
  return formatProviderModelDescription(providerKind, entry.tooltipDescription)?.hint;
}

interface ProviderModelCache {
  /** Locale of the translated selector search tokens and compact member labels. */
  locale: string;
  /** The raw, backwards-compatible selection inventory (every exact member keeps its row data). */
  models: ModelEntry[];
  modelById: Map<string, ModelEntry>;
  /**
   * The visible main list: projected family rows (one per relation, labeled with
   * the family name) replacing their member rows, every other raw choice kept.
   * Absent when the surface declares no relation.
   */
  pickRows: ModelEntry[];
  /** Compact family label per member UID, for favorites/recents rows that keep exact ids. */
  memberLabels: Map<string, string>;
  /** Representative UID → every exact member id its projected row stands for. */
  familyMemberIds: Map<string, readonly string[]>;
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
  if (cached?.locale === i18n.locale) return cached;

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

  // Project the optional family relations into the visible list only: one row
  // per relation at the representative's catalog position, member rows dropped,
  // raw `models` untouched. Members stay resolvable for favorites/recents with
  // a compact family label instead of the giant native pair label.
  const families = cachedProjectedFamilies(capability);
  const memberLabels = new Map<string, string>();
  const familyMemberIds = new Map<string, readonly string[]>();
  let pickRows = models;
  if (families.length > 0) {
    const members = new Set(families.flatMap((family) => family.members.map((m) => m.model)));
    const representativeByModel = new Map(families.map((family) => [family.model, family]));
    const rows: ModelEntry[] = [];
    for (const entry of models) {
      const family = representativeByModel.get(entry.id);
      if (family) {
        const sub = deriveSubProvider(entry.id, capability);
        const searchParts = [entry.id, family.label];
        for (const selector of family.selectors) {
          // The localized selector label is what the menus display, so it is
          // searchable too.
          searchParts.push(sharedMessage(selector.labelKey));
          for (const option of selector.options) {
            searchParts.push(option.id, option.label);
          }
        }
        // The Fast coordinate is part of the family's reachability even though
        // no selector option carries it.
        if (family.bindings.fast === "model") searchParts.push("fast");
        if (sub) searchParts.push(sub.id, sub.label);
        rows.push({
          id: entry.id,
          label: family.label,
          ...(sub ? { subId: sub.id, subLabel: sub.label } : {}),
          searchText: searchParts.join("\n").toLowerCase(),
        });
        continue;
      }
      if (!members.has(entry.id)) rows.push(entry);
    }
    pickRows = rows;
    for (const family of families) {
      familyMemberIds.set(
        family.model,
        family.members.map((member) => member.model),
      );
      for (const member of family.members) {
        memberLabels.set(member.model, modelFamilyMemberCompactLabel(family, member));
      }
    }
  }

  const next: ProviderModelCache = {
    locale: i18n.locale,
    models,
    modelById,
    pickRows,
    memberLabels,
    familyMemberIds,
  };
  providerModelCache.set(capability, next);
  return next;
}

/** Optional spread carrying a projected family row's exact member ids. */
function familyModelIdsField(
  cache: ProviderModelCache,
  modelId: string,
): {} | { familyModelIds: readonly string[] } {
  const ids = cache.familyMemberIds.get(modelId);
  return ids ? { familyModelIds: ids } : {};
}

interface VisibleProvider {
  provider: ProviderModelMenuProvider;
  key: string;
  visibilityKey: string;
  cache: ProviderModelCache;
  searchText: string;
}

function findModelEntry(
  cache: ProviderModelCache,
  modelId: string,
  agentKind: string,
): ModelEntry | undefined {
  for (const alias of modelLookupAliases(
    canonicalProviderModelId(agentKind, modelId, cache.models),
  )) {
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

// A favorites/recents ref carries an optional presentationMode. It matches a
// visible provider of the same kind when neither side pins a mode, or when both
// pin the same one. Used both to resolve refs and to look up their icons.
function findVisibleProvider(
  byKind: ReadonlyMap<string, VisibleProvider[]>,
  agentKind: string,
  presentationMode: ThreadPresentationMode | undefined,
): VisibleProvider | undefined {
  const candidates = byKind.get(agentKind);
  if (!candidates) return undefined;
  return candidates.find(
    (entry) =>
      !presentationMode ||
      !entry.provider.presentationMode ||
      entry.provider.presentationMode === presentationMode,
  );
}

const EMPTY_HIDDEN_ALIASES: ReadonlySet<string> = new Set();
const hiddenAliasCache = new WeakMap<readonly string[], ReadonlySet<string>>();

// Expand a provider's hidden ids into every alias form once and cache it against
// the settings array identity, so repeated builds (each keystroke re-runs this
// while the menu is open) reuse the same set instead of re-deriving aliases.
function getHiddenAliases(hiddenIds: readonly string[] | undefined): ReadonlySet<string> {
  if (!hiddenIds || hiddenIds.length === 0) return EMPTY_HIDDEN_ALIASES;
  const cached = hiddenAliasCache.get(hiddenIds);
  if (cached) return cached;
  const aliases = new Set<string>();
  for (const id of hiddenIds) {
    for (const alias of modelLookupAliases(id)) aliases.add(alias);
  }
  hiddenAliasCache.set(hiddenIds, aliases);
  return aliases;
}

function resolveModelRef(
  ref: ModelRef,
  providersByKind: ReadonlyMap<string, VisibleProvider[]>,
  hiddenModels: BuildProviderModelItemsInput["hiddenModels"],
): ResolvedModelRef | undefined {
  const visibleProvider = findVisibleProvider(providersByKind, ref.agentKind, ref.presentationMode);
  if (!visibleProvider) return undefined;
  const { provider, cache } = visibleProvider;
  let model = findModelEntry(cache, ref.modelId, ref.agentKind);
  if (!model) {
    // Missing from the visible catalog means the caller either hid this model or
    // never offered it. Hidden ones drop out of the section; genuinely unknown
    // ids (stale recents, custom models) still get a synthesized row. Only this
    // miss path pays for the hidden lookup — a resolvable id can't be hidden.
    const hidden = getHiddenAliases(hiddenModels?.[visibleProvider.visibilityKey]);
    if (hidden.size > 0) {
      for (const alias of modelLookupAliases(ref.modelId)) {
        if (hidden.has(alias)) return undefined;
      }
    }
    model = makeModelEntry(
      ref.modelId,
      formatShortcutFallbackLabel(ref.agentKind, ref.modelId),
      provider.capabilities,
    );
  }
  const resolved: ResolvedModelRef = {
    ref,
    // Family members keep their exact persisted id but read as the compact
    // family + selector summary; the group label would only repeat the family.
    label:
      cache.memberLabels.get(ref.modelId) ??
      formatShortcutModelLabel(ref.agentKind, ref.modelId, model.label),
    providerLabel: provider.label,
    searchText: model.searchText,
    providerSearchText: visibleProvider.searchText,
  };
  if (model.subLabel && !cache.memberLabels.has(ref.modelId))
    resolved.subProviderLabel = model.subLabel;
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
    hiddenModels,
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
  const visibleProvidersByKind = new Map<string, VisibleProvider[]>();
  for (const entry of visibleProviderEntries) {
    const list = visibleProvidersByKind.get(entry.provider.kind);
    if (list) list.push(entry);
    else visibleProvidersByKind.set(entry.provider.kind, [entry]);
  }
  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;
  // While searching, every provider's rows flatten into one list under
  // identical-looking headers. When the same model id is offered by more than
  // one provider (e.g. two agents selling the same upstream model), the rows
  // are indistinguishable — decorate those rows with the provider label so the
  // picker stays self-explanatory.
  const ambiguousModelIds = new Set<string>();
  if (isSearching && visibleProviders.length > 1) {
    const seenModelIds = new Set<string>();
    for (const { cache } of visibleProviderEntries) {
      for (const model of cache.models) {
        if (seenModelIds.has(model.id)) ambiguousModelIds.add(model.id);
        else seenModelIds.add(model.id);
      }
    }
  }
  /** Append the provider label to rows whose model id alone is ambiguous. */
  const disambiguatedSubLabel = (
    modelId: string,
    subLabel: string | undefined,
    providerLabel: string | undefined,
  ): string | undefined => {
    if (!ambiguousModelIds.has(modelId) || !providerLabel) return subLabel;
    return [subLabel, providerLabel].filter(Boolean).join(" · ");
  };
  const out: ProviderModelItem[] = [];
  const singleProviderMode = visibleProviders.length === 1;
  const showProviderHeaders = visibleProviders.length > 1;
  const visibleKinds = new Set(visibleProviders.map((p) => p.kind));
  function canonicalRefKey(ref: ModelRef): string {
    const provider = findVisibleProvider(
      visibleProvidersByKind,
      ref.agentKind,
      ref.presentationMode,
    );
    const modelId = canonicalProviderModelId(
      ref.agentKind,
      ref.modelId,
      provider?.provider.capabilities.models ?? [],
    );
    return `${ref.agentKind}:${modelId}`;
  }
  const sectionFavoriteSet = new Set((favorites ?? []).map(canonicalRefKey));
  const favoriteStateSet = new Set((favoriteStateRefs ?? favorites ?? []).map(canonicalRefKey));

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
    headerLabel: MessageDescriptor,
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
      .map((ref) => resolveModelRef(ref, visibleProvidersByKind, hiddenModels))
      .filter((m): m is ResolvedModelRef => m !== undefined)
      .filter((m) => {
        if (!isSearching) return true;
        return m.searchText.includes(query) || m.providerSearchText.includes(query);
      });
    if (items.length === 0) return;
    out.push({ type: "header-plain", id: `header:${sectionId}`, label: headerLabel });
    const seenCanonical = new Set<string>();
    for (const m of items) {
      const visibleProvider = findVisibleProvider(
        visibleProvidersByKind,
        m.ref.agentKind,
        m.ref.presentationMode,
      );
      const catalog = visibleProvider?.provider.capabilities.models ?? [];
      const modelId = canonicalProviderModelId(m.ref.agentKind, m.ref.modelId, catalog);
      const canonicalKey = `${m.ref.agentKind}:${modelId}`;
      if (seenCanonical.has(canonicalKey)) continue;
      seenCanonical.add(canonicalKey);
      const providerIcon = visibleProvider?.provider.icon;
      const shortcutSubLabel = disambiguatedSubLabel(
        modelId,
        distinctGroupLabel(m.label, m.subProviderLabel),
        visibleProvider?.provider.label,
      );
      // Shortcut rows are always exact rows, so the price is the member's own.
      const shortcutPriceLine = formatProviderModelDescription(
        m.ref.agentKind,
        m.tooltipDescription,
      )?.hint;
      out.push({
        type: "model",
        id: `${sectionId}:${m.ref.agentKind}:${modelId}`,
        providerKind: m.ref.agentKind,
        providerKey: visibleProvider?.key ?? m.ref.agentKind,
        hiddenModelsKey: visibleProvider?.visibilityKey ?? m.ref.agentKind,
        providerLabel: m.providerLabel,
        modelId: m.ref.modelId,
        label: m.label,
        ...(m.ref.presentationMode ? { presentationMode: m.ref.presentationMode } : {}),
        ...(providerIcon ? { providerIcon } : {}),
        ...(shortcutSubLabel ? { subProviderLabel: shortcutSubLabel } : {}),
        ...modelHintProps(m),
        ...(m.tooltipDescription ? { tooltipDescription: m.tooltipDescription } : {}),
        ...(shortcutPriceLine ? { priceLine: shortcutPriceLine } : {}),
        showProviderIcon: true,
        ...(visibleProvider && supportsFastModel(visibleProvider.provider.capabilities, modelId)
          ? { supportsFast: true }
          : {}),
        isFavorite: favoriteStateSet.has(canonicalRefKey(m.ref)),
      });
    }
  }

  if (!singleProviderMode) {
    if (favorites?.length) {
      pushShortcutSection("fav", msg`Favorites`, favorites);
    }
    if (recents?.length) {
      const filteredRecents = recents
        .filter((r) => !sectionFavoriteSet.has(canonicalRefKey(r)))
        .slice(0, recentsLimit);
      if (filteredRecents.length > 0) {
        pushShortcutSection("recent", msg`Recent`, filteredRecents);
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
    // The projected main list: family rows stand in for their members; a
    // current model the catalog doesn't know at all keeps its synthesized row.
    const sourceRows = currentEntry ? [...cache.pickRows, currentEntry] : cache.pickRows;

    const filtered: ModelEntry[] = [];
    for (const model of sourceRows) {
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

    const providerRowsStart = out.length;
    const finishProviderRows = () => {
      const rows = out.splice(providerRowsStart);
      out.push(...separatePrimaryModelRows(rows, key, primaryModelChoices(provider.kind, cap)));
    };

    // Favorited family members keep explicit exact rows in single-provider
    // mode: the member's ordinary row collapsed into the projected family
    // row, but the favorite is persisted against the exact member id and must
    // stay selectable as is — including the representative, whose only visible
    // row is the family row itself. Exact rows carry no family metadata, so a
    // click selects the exact UID (`selectionIntent: "exact"`) instead of
    // retaining the family's current member.
    if (singleProviderMode) {
      const familyMembers = new Set([...cache.familyMemberIds.values()].flat());
      for (const m of cache.models) {
        if (!familyMembers.has(m.id) || !sectionFavoriteSet.has(`${provider.kind}:${m.id}`)) {
          continue;
        }
        const hasExactRow = filtered.some(
          (row) => row.id === m.id && !cache.familyMemberIds.has(row.id),
        );
        if (hasExactRow) continue;
        const exactFavoritePriceLine = rowPriceLine(provider.kind, m, cache, "exact");
        out.push({
          type: "model",
          id: `model-exact:${key}:${m.id}`,
          providerKind: provider.kind,
          providerKey: key,
          hiddenModelsKey: visibilityKey,
          providerLabel: provider.label,
          modelId: m.id,
          label: cache.memberLabels.get(m.id) ?? m.label,
          ...(provider.presentationMode ? { presentationMode: provider.presentationMode } : {}),
          ...(provider.icon ? { providerIcon: provider.icon } : {}),
          ...modelHintProps(m),
          ...(m.tooltipDescription ? { tooltipDescription: m.tooltipDescription } : {}),
          ...(exactFavoritePriceLine ? { priceLine: exactFavoritePriceLine } : {}),
          ...(supportsFastModel(cap, m.id) ? { supportsFast: true } : {}),
          isFavorite: true,
        });
      }
    }

    if (isSearching) {
      // Flat under the provider; sub-provider promoted to right-rail label.
      for (const m of sortFavoritesFirst(filtered, provider.kind)) {
        const subProviderLabel = disambiguatedSubLabel(
          m.id,
          distinctGroupLabel(m.label, m.subLabel),
          provider.label,
        );
        const searchPriceLine = rowPriceLine(provider.kind, m, cache);
        out.push({
          type: "model",
          id: `model:${key}:${m.id}`,
          providerKind: provider.kind,
          providerKey: key,
          hiddenModelsKey: visibilityKey,
          providerLabel: provider.label,
          modelId: m.id,
          label: m.label,
          ...(provider.presentationMode ? { presentationMode: provider.presentationMode } : {}),
          ...(provider.icon ? { providerIcon: provider.icon } : {}),
          ...(subProviderLabel ? { subProviderLabel } : {}),
          ...modelHintProps(m),
          ...(m.tooltipDescription ? { tooltipDescription: m.tooltipDescription } : {}),
          ...(searchPriceLine ? { priceLine: searchPriceLine } : {}),
          showProviderIcon: true,
          ...(supportsFastModel(cap, m.id) ? { supportsFast: true } : {}),
          ...familyModelIdsField(cache, m.id),
          isFavorite: favoriteStateSet.has(`${provider.kind}:${m.id}`),
        });
      }
      finishProviderRows();
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
      const ungroupedPriceLine = rowPriceLine(provider.kind, m, cache);
      out.push({
        type: "model",
        id: `model:${key}:${m.id}`,
        providerKind: provider.kind,
        providerKey: key,
        hiddenModelsKey: visibilityKey,
        providerLabel: provider.label,
        modelId: m.id,
        label: m.label,
        ...(provider.presentationMode ? { presentationMode: provider.presentationMode } : {}),
        ...(provider.icon ? { providerIcon: provider.icon } : {}),
        ...modelHintProps(m),
        ...(m.tooltipDescription ? { tooltipDescription: m.tooltipDescription } : {}),
        ...(ungroupedPriceLine ? { priceLine: ungroupedPriceLine } : {}),
        ...(supportsFastModel(cap, m.id) ? { supportsFast: true } : {}),
        ...familyModelIdsField(cache, m.id),
        isFavorite: favoriteStateSet.has(`${provider.kind}:${m.id}`),
      });
    }

    if (grouped.size === 0) {
      finishProviderRows();
      continue;
    }

    for (const sp of listSubProviderOrder(cap, grouped.keys())) {
      const models = grouped.get(sp.id);
      if (!models?.length) continue;
      if (models.length !== 1 || distinctGroupLabel(models[0]!.label, sp.label))
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
        const groupedPriceLine = rowPriceLine(provider.kind, m, cache);
        out.push({
          type: "model",
          id: `model:${key}:${m.id}`,
          providerKind: provider.kind,
          providerKey: key,
          hiddenModelsKey: visibilityKey,
          providerLabel: provider.label,
          modelId: m.id,
          label: m.label,
          ...(provider.presentationMode ? { presentationMode: provider.presentationMode } : {}),
          ...(provider.icon ? { providerIcon: provider.icon } : {}),
          ...modelHintProps(m),
          ...(m.tooltipDescription ? { tooltipDescription: m.tooltipDescription } : {}),
          ...(groupedPriceLine ? { priceLine: groupedPriceLine } : {}),
          ...(supportsFastModel(cap, m.id) ? { supportsFast: true } : {}),
          ...familyModelIdsField(cache, m.id),
          isFavorite: favoriteStateSet.has(`${provider.kind}:${m.id}`),
        });
      }
    }
    finishProviderRows();
  }

  return out;
}
