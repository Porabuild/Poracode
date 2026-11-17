import { classifyModelTier, type ModelTier } from "./modelTier";

export interface MemoryModelCandidate {
  readonly agentKind: string;
  readonly model: string;
  readonly label: string;
  /** Lower is preferred. Providers that omit a rank sort last. */
  readonly rank: number;
}

const CAPTURE_TIERS: readonly ModelTier[] = ["fast-cheap", "balanced", "max-capability"];
const DREAM_TIERS: readonly ModelTier[] = ["max-capability", "balanced", "fast-cheap"];

function byRank(left: MemoryModelCandidate, right: MemoryModelCandidate): number {
  return left.rank - right.rank || left.label.localeCompare(right.label);
}

/**
 * Capture uses the cheapest model from the highest-rated provider that has
 * one. Dream uses that provider's strongest model. A provider with no model
 * in the preferred tier yields to the next-rated provider.
 */
export function pickMemoryModel(
  candidates: readonly MemoryModelCandidate[],
  role: "capture" | "dream",
): MemoryModelCandidate | undefined {
  if (candidates.length === 0) return undefined;
  const tiers = role === "capture" ? CAPTURE_TIERS : DREAM_TIERS;
  const providers = [...new Set(candidates.map((candidate) => candidate.agentKind))].sort(
    (left, right) => {
      const leftRank = candidates.find((candidate) => candidate.agentKind === left)?.rank ?? 0;
      const rightRank = candidates.find((candidate) => candidate.agentKind === right)?.rank ?? 0;
      return leftRank - rightRank;
    },
  );
  for (const tier of tiers) {
    for (const agentKind of providers) {
      const match = candidates
        .filter(
          (candidate) =>
            candidate.agentKind === agentKind &&
            classifyModelTier(candidate.model, candidate.label) === tier,
        )
        .sort(byRank)[0];
      if (match) return match;
    }
  }
  return [...candidates].sort(byRank)[0];
}
