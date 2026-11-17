import { resolveHiddenModelIds } from "./agentSelection";
import type { AgentCapability } from "./contracts";
import { classifyModelTier, type ModelTier } from "./modelTier";

export interface MemoryModelCandidate {
  readonly agentKind: string;
  readonly model: string;
  readonly label: string;
  /** Lower is preferred. Providers that omit a rank sort last. */
  readonly rank: number;
}

export interface MemoryModelAgentInput {
  readonly kind: string;
  readonly installed?: boolean;
  readonly authState?: string;
  readonly capabilities: AgentCapability;
}

export function isEligibleMemoryOneShotAgent(
  agent: Pick<MemoryModelAgentInput, "installed" | "authState" | "kind" | "capabilities">,
  disabledAgents: ReadonlySet<string> | readonly string[],
): boolean {
  const isDisabled = Array.isArray(disabledAgents)
    ? disabledAgents.includes(agent.kind)
    : (disabledAgents as ReadonlySet<string>).has(agent.kind);
  return (
    agent.installed !== false &&
    agent.authState !== "missing" &&
    !isDisabled &&
    agent.capabilities.supportsOneShot === true &&
    agent.capabilities.models.length > 0
  );
}

export function collectMemoryModelCandidates(
  agents: readonly MemoryModelAgentInput[],
  options?: {
    hiddenModelsByAgent?: Readonly<Record<string, readonly string[] | undefined>>;
    explicitProvider?: string;
    explicitModel?: string;
    fallbackRank?: (kind: string) => number;
  },
): MemoryModelCandidate[] {
  const hiddenModels = options?.hiddenModelsByAgent ?? {};
  return agents.flatMap((agent) => {
    const hidden = new Set(resolveHiddenModelIds(agent.capabilities, hiddenModels[agent.kind]));
    const models = agent.capabilities.models.filter(
      (entry) =>
        !hidden.has(entry.id) ||
        (options?.explicitProvider === agent.kind && options?.explicitModel === entry.id),
    );
    const rank =
      agent.capabilities.utilityRank ??
      options?.fallbackRank?.(agent.kind) ??
      Number.MAX_SAFE_INTEGER;
    return (models.length > 0 ? models : agent.capabilities.models).map((entry) => ({
      agentKind: agent.kind,
      model: entry.id,
      label: entry.label ?? entry.id,
      rank,
    }));
  });
}

const CAPTURE_TIERS: readonly ModelTier[] = ["fast-cheap", "balanced", "max-capability"];
const DREAM_TIERS: readonly ModelTier[] = ["max-capability", "balanced", "fast-cheap"];

/**
 * Capture uses the cheapest model from the highest-rated provider that has
 * one. Dream uses that provider's strongest model. A provider with no model
 * in the preferred tier yields to the next-rated provider. Within a provider's
 * tier, catalog order is preserved because adapters list newest releases first.
 */
export function pickMemoryModel(
  candidates: readonly MemoryModelCandidate[],
  role: "capture" | "dream",
): MemoryModelCandidate | undefined {
  if (candidates.length === 0) return undefined;
  const tiers = role === "capture" ? CAPTURE_TIERS : DREAM_TIERS;
  const providerRank = new Map<string, number>();
  for (const candidate of candidates) {
    if (!providerRank.has(candidate.agentKind)) {
      providerRank.set(candidate.agentKind, candidate.rank);
    }
  }
  const ordered = [...candidates].sort(
    (left, right) =>
      (providerRank.get(left.agentKind) ?? left.rank) -
      (providerRank.get(right.agentKind) ?? right.rank),
  );
  for (const tier of tiers) {
    const match = ordered.find(
      (candidate) => classifyModelTier(candidate.model, candidate.label) === tier,
    );
    if (match) return match;
  }
  return ordered[0];
}
