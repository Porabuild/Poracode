import type { LabeledOption } from "../../../shared/contracts";

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
