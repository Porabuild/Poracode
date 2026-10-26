import type { PrLabel } from "@/shared/contracts";

/** Names to add and remove so `current` becomes `selected`; nothing for a label that stays. */
export function netLabelChange(
  current: readonly PrLabel[],
  selected: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  const currentNames = new Set(current.map((label) => label.name));
  return {
    add: [...selected].filter((name) => !currentNames.has(name)),
    remove: [...currentNames].filter((name) => !selected.has(name)),
  };
}

/** Host candidates plus the review's own labels (a truncated read may omit them), by name. */
export function mergeLabelOptions(
  candidates: readonly PrLabel[],
  current: readonly PrLabel[],
): PrLabel[] {
  const seen = new Set<string>();
  const merged: PrLabel[] = [];
  for (const label of [...current, ...candidates]) {
    if (seen.has(label.name)) continue;
    seen.add(label.name);
    merged.push(label);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}
