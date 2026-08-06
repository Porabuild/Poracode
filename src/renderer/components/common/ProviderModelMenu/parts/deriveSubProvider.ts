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
  if (explicitId) {
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
 * Sub-provider label for a model, dropped when it merely restates the provider
 * it belongs to (Kimi's `kimi-code/…` ids derive a "Kimi Code" sub-provider).
 * Use this wherever the provider name is already shown beside the model, so the
 * label only appears when it adds information.
 */
export function distinctSubProviderLabel(
  modelId: string,
  capability: AgentCapability,
  providerLabel: string,
): string | undefined {
  const label = deriveSubProvider(modelId, capability)?.label;
  return label && label.toLowerCase() !== providerLabel.toLowerCase() ? label : undefined;
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
