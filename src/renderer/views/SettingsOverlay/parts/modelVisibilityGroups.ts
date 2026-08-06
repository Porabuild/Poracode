import type { ProviderModelItem } from "@/renderer/components/common/ProviderModelMenu";

export type ModelVisibilityCheckState = "all" | "some" | "none";

export interface ModelVisibilityEntry {
  /** Settings key this model's hidden list is persisted under. */
  hiddenModelsKey: string;
  modelId: string;
}

/**
 * Models under each provider and sub-provider header, in list order. Both
 * model-visibility popovers derive their group checkbox state from this: a model
 * row belongs to its provider header and, when it sits in one, its sub-provider
 * header. Shortcut sections (`header-plain`) group nothing — they duplicate rows
 * that already appear under their provider.
 */
export function collectHeaderModelGroups(
  items: readonly ProviderModelItem[],
): Map<string, ModelVisibilityEntry[]> {
  const groups = new Map<string, ModelVisibilityEntry[]>();
  let providerHeaderId: string | null = null;
  let subHeaderId: string | null = null;
  for (const item of items) {
    if (item.type === "header-provider") {
      providerHeaderId = item.id;
      subHeaderId = null;
      if (!groups.has(item.id)) groups.set(item.id, []);
    } else if (item.type === "header-sub") {
      subHeaderId = item.id;
      if (!groups.has(item.id)) groups.set(item.id, []);
    } else if (item.type === "header-plain") {
      subHeaderId = null;
    } else {
      const entry: ModelVisibilityEntry = {
        hiddenModelsKey: item.hiddenModelsKey,
        modelId: item.modelId,
      };
      if (providerHeaderId) groups.get(providerHeaderId)?.push(entry);
      if (subHeaderId) groups.get(subHeaderId)?.push(entry);
    }
  }
  return groups;
}

/** Checkbox state for one header group: every model visible, none, or mixed. */
export function headerGroupState(
  entries: readonly ModelVisibilityEntry[],
  isHidden: (hiddenModelsKey: string, modelId: string) => boolean,
): ModelVisibilityCheckState {
  if (entries.length === 0) return "all";
  const hidden = entries.filter((entry) => isHidden(entry.hiddenModelsKey, entry.modelId)).length;
  return hidden === 0 ? "all" : hidden === entries.length ? "none" : "some";
}
