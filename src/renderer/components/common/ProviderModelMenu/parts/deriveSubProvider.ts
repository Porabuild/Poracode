import type { AgentCapability, LabeledOption } from "@/shared/contracts";

export interface DerivedSubProvider {
  id: string;
  label: string;
}

function humanize(id: string): string {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Resolve a model's sub-provider. Explicit `modelSubProvider` mapping takes
 * precedence; otherwise we fall back to a namespace prefix split on `/` or `:`.
 */
export function deriveSubProvider(
  modelId: string,
  capability: AgentCapability,
): DerivedSubProvider | undefined {
  const explicitId = capability.modelSubProvider?.[modelId];
  if (typeof explicitId === "string" && explicitId) {
    const labeled = capability.subProviders?.find((p) => p.id === explicitId);
    return { id: explicitId, label: labeled?.label ?? humanize(explicitId) };
  }
  const sep = /[/:]/.exec(modelId);
  if (sep && sep.index > 0) {
    const id = modelId.slice(0, sep.index);
    const labeled = capability.subProviders?.find((p) => p.id === id);
    return { id, label: labeled?.label ?? humanize(id) };
  }
  return undefined;
}

/**
 * Sub-provider label for a model, dropped when it merely restates any label
 * already visible beside the model (the provider, or the model/family name the
 * picker shows). Comparison trims and normalizes case. Use this wherever a
 * provider or model name is already shown so the label only adds information.
 */
export function distinctSubProviderLabel(
  modelId: string,
  capability: AgentCapability,
  ...visibleLabels: string[]
): string | undefined {
  const label = deriveSubProvider(modelId, capability)?.label;
  if (!label) return undefined;
  const normalized = label.trim().toLocaleLowerCase();
  return visibleLabels.some((visible) => visible.trim().toLocaleLowerCase() === normalized)
    ? undefined
    : label;
}

/**
 * Order sub-providers using the explicit list first, then any derived ids
 * that weren't pre-declared. Stable across renders.
 */
export function listSubProviderOrder(
  capability: AgentCapability,
  derivedIds: Iterable<string>,
): LabeledOption[] {
  const result: LabeledOption[] = [];
  const seen = new Set<string>();
  for (const sp of capability.subProviders ?? []) {
    if (!seen.has(sp.id)) {
      seen.add(sp.id);
      result.push(sp);
    }
  }
  for (const id of derivedIds) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push({ id, label: humanize(id) });
    }
  }
  return result;
}
