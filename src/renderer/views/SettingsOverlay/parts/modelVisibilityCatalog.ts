import { baseAgentKind, type AgentCapability, type AgentStatus } from "@/shared/contracts";
import {
  buildProviderModelItems,
  type ProviderModelItem,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu";
import { makeProviderSortKey } from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import {
  deriveSubProvider,
  listSubProviderOrder,
} from "@/renderer/components/common/ProviderModelMenu/parts/deriveSubProvider";
import {
  providerMenuKey,
  providerVisibilityKey,
} from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { expandAgentToVisibilityProviders } from "@/renderer/components/thread/buildModelPickerControls";
import { type ModelVisibilityCheckState, type ModelVisibilityEntry } from "./modelVisibilityGroups";
import type { NativeAgentRuntimeSlots } from "./nativeAgentRuntimes";
import { modelSurfaceShortLabel } from "./SingleAgentSettings/parts/modelSurfaceLabel";

export interface VisibilityModelRow {
  readonly type: "model";
  readonly id: string;
  readonly label: string;
  readonly contextDescription?: string;
  readonly supportsFast?: boolean;
  readonly subId?: string;
  readonly subLabel?: string;
  /**
   * Surface badges shown only when a model belongs to a strict subset of a
   * multi-surface provider's surfaces (e.g. `["Terminal"]` or `["CLI", "ACP"]`).
   */
  readonly surfaceBadges: readonly string[];
  readonly searchText: string;
  readonly targets: readonly ModelVisibilityEntry[];
}

export interface VisibilitySubHeaderRow {
  readonly type: "header-sub";
  readonly id: string;
  readonly subKey: string;
  readonly label: string;
  readonly modelRows: readonly VisibilityModelRow[];
}

export type VisibilityListItem = VisibilitySubHeaderRow | VisibilityModelRow;

export interface ProviderVisibilitySurface {
  readonly id: string;
  readonly label: string;
  readonly hiddenModelsKey: string;
  readonly items: readonly VisibilityListItem[];
  readonly models: readonly VisibilityModelRow[];
}

export interface ProviderVisibilityGroup {
  readonly kind: string;
  readonly label: string;
  readonly icon?: string;
  readonly searchText: string;
  readonly surfaces: readonly ProviderVisibilitySurface[];
  /** Deduplicated items across every surface of this provider. */
  readonly unifiedItems: readonly VisibilityListItem[];
  /** Deduplicated model rows across every surface of this provider. */
  readonly unifiedModels: readonly VisibilityModelRow[];
}

export interface ProviderVisibilityCatalog {
  readonly groups: ProviderVisibilityGroup[];
  readonly surfaceProviders: ProviderModelMenuProvider[];
}

/**
 * Resolve effective hidden IDs per persistence key across every surface.
 *
 * Multiple surfaces of one provider can share a `hiddenModelsKey` (e.g. an
 * unnamed Terminal + Chat pair where the GUI override carries only negotiated
 * defaults). When the user has not saved an explicit override yet, unioning
 * `defaultHiddenModels` across all surfaces sharing `key` — excluding any ID
 * another surface lists as default-visible — keeps sibling default-hidden
 * models hidden instead of letting the last surface overwrite them.
 */
export function resolveEffectiveHiddenIdsByKey(
  providers: readonly ProviderModelMenuProvider[],
  savedHiddenModels: Readonly<Record<string, readonly string[] | undefined>>,
): Record<string, readonly string[]> {
  const surfacesByKey = new Map<string, ProviderModelMenuProvider[]>();
  for (const provider of providers) {
    const key = providerVisibilityKey(provider);
    const list = surfacesByKey.get(key);
    if (list) list.push(provider);
    else surfacesByKey.set(key, [provider]);
  }

  const out: Record<string, readonly string[]> = {};
  for (const [key, surfaces] of surfacesByKey) {
    const saved = savedHiddenModels[key];
    if (saved !== undefined) {
      out[key] = saved;
      continue;
    }
    const defaultVisible = new Set<string>();
    const defaultHidden = new Set<string>();
    for (const surface of surfaces) {
      const surfaceDefaults = new Set(surface.capabilities.defaultHiddenModels ?? []);
      for (const id of surfaceDefaults) defaultHidden.add(id);
      for (const model of surface.capabilities.models) {
        if (!surfaceDefaults.has(model.id)) defaultVisible.add(model.id);
      }
    }
    out[key] = [...defaultHidden].filter((id) => !defaultVisible.has(id));
  }
  return out;
}

interface ExtractedSurfaceModel {
  readonly modelId: string;
  readonly familyModelIds?: readonly string[];
  readonly label: string;
  readonly contextDescription?: string;
  readonly supportsFast?: boolean;
  readonly subId?: string;
  readonly subLabel?: string;
  readonly isPrimary?: boolean;
}

function extractSurfaceModels(
  items: readonly ProviderModelItem[],
  capabilities: AgentCapability,
): ExtractedSurfaceModel[] {
  const models: ExtractedSurfaceModel[] = [];
  const hasModelsDivider = items.some(
    (item) => item.type === "header-plain" && item.id.startsWith("models:"),
  );
  let beforeModelsDivider = hasModelsDivider;
  for (const item of items) {
    if (item.type === "header-plain") {
      if (item.id.startsWith("models:")) beforeModelsDivider = false;
    } else if (item.type === "model" && item.modelId !== "auto") {
      const sub = beforeModelsDivider ? undefined : deriveSubProvider(item.modelId, capabilities);
      models.push({
        modelId: item.modelId,
        ...(item.familyModelIds ? { familyModelIds: item.familyModelIds } : {}),
        label: item.label,
        ...(item.contextDescription ? { contextDescription: item.contextDescription } : {}),
        ...(item.supportsFast ? { supportsFast: true } : {}),
        ...(sub ? { subId: sub.id, subLabel: sub.label } : {}),
        ...(beforeModelsDivider ? { isPrimary: true } : {}),
      });
    }
  }
  return models;
}

function distinctGroupLabel(modelLabel: string, groupLabel: string | undefined): boolean {
  if (!groupLabel) return false;
  return groupLabel.trim().toLowerCase() !== modelLabel.trim().toLowerCase();
}

function buildGroupedItems(
  idPrefix: string,
  models: readonly VisibilityModelRow[],
  capabilities: readonly AgentCapability[],
): VisibilityListItem[] {
  const ungrouped: VisibilityModelRow[] = [];
  const grouped = new Map<string, { rawId: string; label: string; rows: VisibilityModelRow[] }>();
  const explicitSubLabels = new Map<string, string>();
  for (const cap of capabilities) {
    for (const sp of cap.subProviders ?? []) {
      const lower = sp.id.toLowerCase();
      if (!explicitSubLabels.has(lower)) explicitSubLabels.set(lower, sp.label);
    }
  }

  for (const row of models) {
    if (row.subId && row.subLabel) {
      const subKey = row.subId.toLowerCase();
      let entry = grouped.get(subKey);
      if (!entry) {
        entry = {
          rawId: row.subId,
          label: explicitSubLabels.get(subKey) ?? row.subLabel,
          rows: [],
        };
        grouped.set(subKey, entry);
      }
      entry.rows.push(row);
    } else {
      ungrouped.push(row);
    }
  }

  const out: VisibilityListItem[] = [...ungrouped];
  if (grouped.size === 0) return out;

  const mergedCap: AgentCapability | undefined = capabilities[0]
    ? {
        ...capabilities[0],
        subProviders: capabilities.flatMap((cap) => cap.subProviders ?? []),
      }
    : undefined;
  const derivedRawIds = [...grouped.values()].map((entry) => entry.rawId);
  const orderedSubProviders = mergedCap
    ? listSubProviderOrder(mergedCap, derivedRawIds)
    : [...grouped.values()].map((entry) => ({ id: entry.rawId, label: entry.label }));

  const seenSubKeys = new Set<string>();
  for (const sp of orderedSubProviders) {
    const subKey = sp.id.toLowerCase();
    if (seenSubKeys.has(subKey)) continue;
    seenSubKeys.add(subKey);
    const entry = grouped.get(subKey);
    if (!entry || entry.rows.length === 0) continue;
    const label = entry.label || sp.label;
    if (entry.rows.length !== 1 || distinctGroupLabel(entry.rows[0]!.label, label)) {
      out.push({
        type: "header-sub",
        id: `${idPrefix}:sub:${subKey}`,
        subKey,
        label,
        modelRows: entry.rows,
      });
    }
    out.push(...entry.rows);
  }
  return out;
}

function normalizeLabelKey(label: string, contextDescription: string | undefined): string {
  return `${label.trim().toLowerCase()}\n${(contextDescription ?? "").trim().toLowerCase()}`;
}

function disambiguateSurfaceLabels(
  surfaces: readonly { provider: ProviderModelMenuProvider; rawLabel: string }[],
): string[] {
  const counts = new Map<string, number>();
  for (const s of surfaces) counts.set(s.rawLabel, (counts.get(s.rawLabel) ?? 0) + 1);
  return surfaces.map((s, index) => {
    if ((counts.get(s.rawLabel) ?? 0) <= 1) return s.rawLabel;
    const suffix = s.provider.runtimeVariant?.toUpperCase() ?? `${index + 1}`;
    return s.rawLabel.endsWith(suffix) ? s.rawLabel : `${s.rawLabel} ${suffix}`;
  });
}

export function buildProviderVisibilityCatalog(input: {
  agents: readonly AgentStatus[];
  providerOrder?: readonly string[];
  runtimeSlotsByBaseKind?: ReadonlyMap<string, NativeAgentRuntimeSlots>;
}): ProviderVisibilityCatalog {
  const sortKey = makeProviderSortKey(input.providerOrder);
  const orderedAgents = input.agents
    .slice()
    .sort((left, right) => sortKey(left.kind) - sortKey(right.kind));

  const groups: ProviderVisibilityGroup[] = [];
  const surfaceProviders: ProviderModelMenuProvider[] = [];

  for (const agent of orderedAgents) {
    const rawSurfaces = expandAgentToVisibilityProviders(agent);
    if (rawSurfaces.length === 0) continue;
    surfaceProviders.push(...rawSurfaces);

    const runtimeSlots = input.runtimeSlotsByBaseKind?.get(baseAgentKind(agent.kind));
    const labeled = rawSurfaces.map((provider) => ({
      provider,
      rawLabel: modelSurfaceShortLabel(provider, agent, runtimeSlots),
    }));
    const surfaceLabels = disambiguateSurfaceLabels(labeled);

    const builtSurfaces = rawSurfaces.map((surfaceProvider, index) => {
      const surfaceId = providerMenuKey(surfaceProvider);
      const surfaceLabel = surfaceLabels[index]!;
      const hiddenModelsKey = providerVisibilityKey(surfaceProvider);
      const rawItems = buildProviderModelItems({
        providers: [surfaceProvider],
        search: "",
      });
      const extracted = extractSurfaceModels(rawItems, surfaceProvider.capabilities);
      const models: VisibilityModelRow[] = extracted.map((m) => {
        const modelIds = m.familyModelIds ?? [m.modelId];
        const searchParts = [
          agent.kind,
          agent.label,
          surfaceLabel,
          m.modelId,
          ...modelIds,
          m.label,
          m.subLabel ?? "",
          m.contextDescription ?? "",
          m.supportsFast ? "fast" : "",
        ];
        return {
          type: "model",
          id: `surface:${surfaceId}:model:${m.modelId}`,
          label: m.label,
          ...(m.contextDescription ? { contextDescription: m.contextDescription } : {}),
          ...(m.supportsFast ? { supportsFast: true } : {}),
          ...(!m.isPrimary && m.subId ? { subId: m.subId } : {}),
          ...(!m.isPrimary && m.subLabel ? { subLabel: m.subLabel } : {}),
          surfaceBadges: [],
          searchText: searchParts.join("\n").toLowerCase(),
          targets: [{ hiddenModelsKey, modelIds }],
        };
      });
      const surface: ProviderVisibilitySurface = {
        id: surfaceId,
        label: surfaceLabel,
        hiddenModelsKey,
        items: buildGroupedItems(`surface:${surfaceId}`, models, [surfaceProvider.capabilities]),
        models,
      };
      return { provider: surfaceProvider, surface, extracted, index };
    });

    const surfaces = builtSurfaces.map((entry) => entry.surface);

    if (builtSurfaces.length === 1) {
      const only = surfaces[0]!;
      groups.push({
        kind: agent.kind,
        label: agent.label,
        ...(agent.icon ? { icon: agent.icon } : {}),
        searchText: `${agent.kind}\n${agent.label}`.toLowerCase(),
        surfaces,
        unifiedItems: only.items,
        unifiedModels: only.models,
      });
      continue;
    }

    // Merge surfaces into one deduplicated catalog for the provider. Prefer GUI
    // surfaces first so native GUI display casing and sub-provider sections win
    // when a CLI surface prints lower-case IDs or flat catalogs, while never
    // collapsing two distinct models that came from the same surface.
    const mergeOrder = builtSurfaces.slice().sort((a, b) => {
      const aGui = a.provider.presentationMode === "gui" ? 0 : 1;
      const bGui = b.provider.presentationMode === "gui" ? 0 : 1;
      return aGui - bGui || a.index - b.index;
    });

    interface MutableUnifiedModel {
      id: string;
      label: string;
      isFamily: boolean;
      isPrimary: boolean;
      labelKey: string;
      contextDescription?: string;
      supportsFast?: boolean;
      subId?: string;
      subLabel?: string;
      knownLowerIds: Set<string>;
      surfaceIds: Set<string>;
      searchTokens: Set<string>;
      targets: ModelVisibilityEntry[];
    }

    const usedUnifiedIds = new Set<string>();
    const unifiedList: MutableUnifiedModel[] = [];
    for (const { surface, extracted } of mergeOrder) {
      for (const m of extracted) {
        const modelIds = m.familyModelIds ?? [m.modelId];
        const lowerIds = [m.modelId, ...modelIds].map((id) => id.toLowerCase());
        const isFamily = Boolean(m.familyModelIds?.length);
        const labelKey = normalizeLabelKey(m.label, m.contextDescription);

        let match = unifiedList.find(
          (candidate) =>
            !candidate.surfaceIds.has(surface.id) &&
            candidate.isFamily === isFamily &&
            lowerIds.some((id) => candidate.knownLowerIds.has(id)),
        );
        if (!match) {
          match = unifiedList.find(
            (candidate) =>
              !candidate.surfaceIds.has(surface.id) &&
              candidate.isFamily === isFamily &&
              candidate.labelKey === labelKey &&
              (!candidate.subId ||
                !m.subId ||
                candidate.subId.toLowerCase() === m.subId.toLowerCase()),
          );
        }

        if (match) {
          match.surfaceIds.add(surface.id);
          for (const id of lowerIds) match.knownLowerIds.add(id);
          match.targets.push({
            hiddenModelsKey: surface.hiddenModelsKey,
            modelIds,
          });
          if (m.isPrimary) {
            match.isPrimary = true;
            delete match.subId;
            delete match.subLabel;
          } else if (!match.isPrimary && !match.subId && m.subId && m.subLabel) {
            match.subId = m.subId;
            match.subLabel = m.subLabel;
          }
          if (!match.contextDescription && m.contextDescription) {
            match.contextDescription = m.contextDescription;
          }
          if (!match.supportsFast && m.supportsFast) {
            match.supportsFast = true;
          }
          match.searchTokens.add(surface.label.toLowerCase());
          match.searchTokens.add(m.modelId.toLowerCase());
          match.searchTokens.add(m.label.toLowerCase());
          for (const id of modelIds) match.searchTokens.add(id.toLowerCase());
          if (m.subLabel) match.searchTokens.add(m.subLabel.toLowerCase());
          if (m.contextDescription) match.searchTokens.add(m.contextDescription.toLowerCase());
          if (m.supportsFast) match.searchTokens.add("fast");
        } else {
          const baseRowId = `unified:${agent.kind}:${isFamily ? "family" : "model"}:${m.modelId}`;
          let rowId = baseRowId;
          let disambiguator = 2;
          while (usedUnifiedIds.has(rowId)) {
            rowId = `${baseRowId}:${disambiguator++}`;
          }
          usedUnifiedIds.add(rowId);

          const searchTokens = new Set<string>(
            [
              agent.kind,
              agent.label,
              surface.label,
              m.modelId,
              ...modelIds,
              m.label,
              m.subLabel ?? "",
              m.contextDescription ?? "",
              m.supportsFast ? "fast" : "",
            ]
              .filter(Boolean)
              .map((token) => token.toLowerCase()),
          );
          unifiedList.push({
            id: rowId,
            label: m.label,
            isFamily,
            isPrimary: m.isPrimary === true,
            labelKey,
            ...(m.contextDescription ? { contextDescription: m.contextDescription } : {}),
            ...(m.supportsFast ? { supportsFast: true } : {}),
            ...(!m.isPrimary && m.subId ? { subId: m.subId } : {}),
            ...(!m.isPrimary && m.subLabel ? { subLabel: m.subLabel } : {}),
            knownLowerIds: new Set(lowerIds),
            surfaceIds: new Set([surface.id]),
            searchTokens,
            targets: [
              {
                hiddenModelsKey: surface.hiddenModelsKey,
                modelIds,
              },
            ],
          });
        }
      }
    }

    const unifiedModels: VisibilityModelRow[] = unifiedList.map((u) => {
      const surfaceBadges =
        u.surfaceIds.size < surfaces.length
          ? surfaces.filter((s) => u.surfaceIds.has(s.id)).map((s) => s.label)
          : [];
      return {
        type: "model",
        id: u.id,
        label: u.label,
        ...(u.contextDescription ? { contextDescription: u.contextDescription } : {}),
        ...(u.supportsFast ? { supportsFast: true } : {}),
        ...(u.subId ? { subId: u.subId } : {}),
        ...(u.subLabel ? { subLabel: u.subLabel } : {}),
        surfaceBadges,
        searchText: [...u.searchTokens].join("\n"),
        targets: u.targets,
      };
    });

    const mergedCapabilities = mergeOrder.map((entry) => entry.provider.capabilities);
    groups.push({
      kind: agent.kind,
      label: agent.label,
      ...(agent.icon ? { icon: agent.icon } : {}),
      searchText: `${agent.kind}\n${agent.label}`.toLowerCase(),
      surfaces,
      unifiedItems: buildGroupedItems(`unified:${agent.kind}`, unifiedModels, mergedCapabilities),
      unifiedModels,
    });
  }

  return { groups, surfaceProviders };
}

export function modelRowCheckState(
  row: VisibilityModelRow,
  hiddenByKey: ReadonlyMap<string, ReadonlySet<string>>,
): ModelVisibilityCheckState {
  if (row.targets.length === 0) return "all";
  let hiddenTargets = 0;
  for (const target of row.targets) {
    const hiddenSet = hiddenByKey.get(target.hiddenModelsKey);
    if (hiddenSet && target.modelIds.every((id) => hiddenSet.has(id))) {
      hiddenTargets++;
    }
  }
  if (hiddenTargets === 0) return "all";
  if (hiddenTargets === row.targets.length) return "none";
  return "some";
}

export function modelGroupCheckState(
  rows: readonly VisibilityModelRow[],
  hiddenByKey: ReadonlyMap<string, ReadonlySet<string>>,
): ModelVisibilityCheckState {
  if (rows.length === 0) return "all";
  let allCount = 0;
  let noneCount = 0;
  for (const row of rows) {
    const state = modelRowCheckState(row, hiddenByKey);
    if (state === "all") allCount++;
    else if (state === "none") noneCount++;
  }
  if (allCount === rows.length) return "all";
  if (noneCount === rows.length) return "none";
  return "some";
}

export function countVisibleModels(
  rows: readonly VisibilityModelRow[],
  hiddenByKey: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  let visible = 0;
  for (const row of rows) {
    if (modelRowCheckState(row, hiddenByKey) !== "none") visible++;
  }
  return visible;
}

export function computeTargetToggleUpdates(
  targets: readonly ModelVisibilityEntry[],
  nextHidden: boolean,
  hiddenByKey: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const target of targets) {
    let set = byKey.get(target.hiddenModelsKey);
    if (!set) {
      set = new Set(hiddenByKey.get(target.hiddenModelsKey) ?? []);
      byKey.set(target.hiddenModelsKey, set);
    }
    for (const modelId of target.modelIds) {
      if (nextHidden) set.add(modelId);
      else set.delete(modelId);
    }
  }
  const updates = new Map<string, string[]>();
  for (const [key, set] of byKey) {
    updates.set(key, [...set]);
  }
  return updates;
}

export function computeSetAllVisibilityUpdates(
  groups: readonly ProviderVisibilityGroup[],
  hideAll: boolean,
): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const surface of group.surfaces) {
      let set = byKey.get(surface.hiddenModelsKey);
      if (!set) {
        set = new Set<string>();
        byKey.set(surface.hiddenModelsKey, set);
      }
      if (hideAll) {
        for (const model of surface.models) {
          for (const target of model.targets) {
            for (const id of target.modelIds) set.add(id);
          }
        }
      }
    }
  }
  const updates = new Map<string, string[]>();
  for (const [key, set] of byKey) {
    updates.set(key, hideAll ? [...set] : []);
  }
  return updates;
}
