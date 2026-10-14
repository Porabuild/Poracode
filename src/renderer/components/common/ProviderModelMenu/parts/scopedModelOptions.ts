import type { LabeledOption } from "@/shared/contracts";
import type { ProviderModelRow } from "./types";

/** Exact choices within one model selector, independent of model preferences. */
export interface ScopedModelOption extends LabeledOption {
  hint?: string;
}

export function scopedModelOptionDisplay(
  options: readonly ScopedModelOption[],
  value: string,
): string {
  const option = options.find((candidate) => candidate.id === value);
  if (!option) return value;
  return option.hint ? `${option.label} · ${option.hint}` : option.label;
}

/** No fallback rows, global shortcuts, or favorite actions for selector coordinates. */
export function buildScopedModelItems(
  options: readonly ScopedModelOption[],
  search: string,
  providerKind: string,
  label: string,
): ProviderModelRow[] {
  const query = search.trim().toLocaleLowerCase();
  return options
    .filter((option) => `${option.label} ${option.hint ?? ""}`.toLocaleLowerCase().includes(query))
    .map((option) => ({
      type: "model",
      id: `model:${providerKind}:${option.id}`,
      providerKind,
      providerKey: providerKind,
      hiddenModelsKey: providerKind,
      providerLabel: label,
      modelId: option.id,
      label: option.label,
      ...(option.hint ? { optionHint: option.hint } : {}),
      isFavorite: false,
      hideFavoriteToggle: true,
    }));
}
