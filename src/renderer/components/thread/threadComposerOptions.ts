import type { AgentCapability, LabeledOption } from "../../../shared/contracts";

const DEFAULT_LABEL = (id: string) => id.replace(/\b\w/g, (c) => c.toUpperCase());

export function withCurrentModel(
  options: readonly LabeledOption[],
  currentValue: string,
): LabeledOption[] {
  if (!currentValue || options.some((o) => o.id === currentValue)) {
    return [...options];
  }
  return [{ id: currentValue, label: DEFAULT_LABEL(currentValue) }, ...options];
}

/** Return capabilities with hidden models filtered out. */
export function filterHiddenModels(
  capabilities: AgentCapability,
  hiddenIds: readonly string[] | undefined,
): AgentCapability {
  if (!hiddenIds || hiddenIds.length === 0) return capabilities;
  const hidden = new Set(hiddenIds);
  return { ...capabilities, models: capabilities.models.filter((m) => !hidden.has(m.id)) };
}
