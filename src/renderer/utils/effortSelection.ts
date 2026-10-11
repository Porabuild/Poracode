import type { AgentCapability } from "@/shared/contracts";
import { modelSelectionFor } from "@/shared/agentSelection";
import { sortEffortsByCanonicalOrder } from "@/shared/effortOrder";

/** User model picks prefer the strongest tier unless a valid choice was saved. */
export function resolvePreferredEffort(
  capabilities: AgentCapability,
  model: string,
  preferred?: string,
): string {
  const reasoning = modelSelectionFor(capabilities, model).reasoning;
  const { values } = reasoning;
  if (preferred && values.includes(preferred)) return preferred;
  // Untiered defaults and disabled reasoning are not stronger than explicit tiers.
  const tiers = values.filter(
    (value) => !["", "none", "off", "default", "auto"].includes(value.trim().toLowerCase()),
  );
  return sortEffortsByCanonicalOrder(tiers).at(-1) ?? reasoning.default ?? "";
}
