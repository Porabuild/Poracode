/**
 * Canonical low→high ordering for reasoning-effort ladders.
 *
 * Providers advertise their effort levels in whatever order their CLI happens
 * to emit — Qoder's ACP `reasoning_effort` selector, for example, reports
 * `xhigh, low, medium, none`, which draws the picker out of order. Sorting on
 * this ladder keeps every provider's effort menu reading weakest → strongest.
 */
const CANONICAL_EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

const CANONICAL_EFFORT_ALIASES: Record<string, string> = {
  "extra-high": "xhigh",
  extra_high: "xhigh",
  "very-high": "xhigh",
};

function effortRank(effort: string): number {
  const key = effort.trim().toLowerCase();
  const canonical = CANONICAL_EFFORT_ALIASES[key] ?? key;
  const index = CANONICAL_EFFORT_ORDER.indexOf(canonical);
  return index === -1 ? CANONICAL_EFFORT_ORDER.length : index;
}

/**
 * Sort an effort list weakest → strongest. Values outside the canonical ladder
 * (a provider-specific level such as Kimi's untiered `on`) keep their relative
 * discovery order and land after the known tiers, so nothing is ever hidden.
 */
export function sortEffortsByCanonicalOrder(efforts: readonly string[]): string[] {
  return [...efforts].sort((left, right) => effortRank(left) - effortRank(right));
}
