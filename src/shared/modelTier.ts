/**
 * Coarse capability/cost hint for a model, so calling agents can route without
 * guessing from labels alone: fast-cheap for light tasks, max-capability for
 * the hardest ones, balanced as the default.
 */
export type ModelTier = "fast-cheap" | "balanced" | "max-capability";

const FAST_CHEAP_KEYWORDS = ["haiku", "mini", "nano", "lite", "flash", "small", "spark", "fast"];
const MAX_CAPABILITY_KEYWORDS = ["opus", "fable", "pro", "max", "ultra", "big"];

/** Whether `keyword` appears in `haystack` as a whole word (not as a substring of a larger word). */
function hasWholeWordMatch(haystack: string, keyword: string): boolean {
  return new RegExp(`\\b${keyword}\\b`, "i").test(haystack);
}

/**
 * Classify a model into a coarse cost/capability tier from its id/label,
 * keyword-matched case-insensitively and provider-agnostic (no per-provider
 * special-casing). Matches whole words only, so e.g. "gemini" doesn't
 * false-positive on the "mini" keyword.
 */
export function classifyModelTier(modelId: string, modelLabel: string): ModelTier {
  const haystack = `${modelId} ${modelLabel}`;
  if (FAST_CHEAP_KEYWORDS.some((keyword) => hasWholeWordMatch(haystack, keyword)))
    return "fast-cheap";
  if (MAX_CAPABILITY_KEYWORDS.some((keyword) => hasWholeWordMatch(haystack, keyword)))
    return "max-capability";
  return "balanced";
}

/** Cheapest first: the order a crew helper's default model is searched in. */
const HELPER_TIER_ORDER: readonly ModelTier[] = ["fast-cheap", "balanced", "max-capability"];

export interface HelperModelCandidate {
  readonly agentKind: string;
  readonly model: string;
  readonly label?: string | undefined;
}

/** The lead a crew helper's default model is picked against. */
export interface HelperModelLead {
  readonly agentKind: string;
  readonly model?: string | undefined;
}

/**
 * Picks a crew helper's default model from `candidates` (in preference order):
 * the cheapest tier available, never the lead's exact model, and within a tier
 * the lead's own provider before any other. Falls back to the lead's model when
 * it is the only candidate, so a single-model install can still form a crew.
 */
export function pickCheaperHelperModel<T extends HelperModelCandidate>(
  candidates: readonly T[],
  lead: HelperModelLead,
): T | undefined {
  const eligible = candidates
    .filter(
      (candidate) => !(candidate.agentKind === lead.agentKind && candidate.model === lead.model),
    )
    .map((candidate) => ({
      candidate,
      tier: classifyModelTier(candidate.model, candidate.label ?? ""),
    }));
  for (const tier of HELPER_TIER_ORDER) {
    const inTier = eligible.filter((entry) => entry.tier === tier);
    const pick = inTier.find((entry) => entry.candidate.agentKind === lead.agentKind) ?? inTier[0];
    if (pick) return pick.candidate;
  }
  return candidates[0];
}
