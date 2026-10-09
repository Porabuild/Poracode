/**
 * Provider-neutral usage breakdown metadata for the ACP `usage_update`.
 *
 * The standard ACP usage update carries only `used`/`size`; some providers can
 * decompose `used` into input/output tokens. A provider transform may annotate
 * the update with a breakdown under the neutral meta key below, and the shared
 * mapper enriches the existing `context.updated` breakdown with it. The
 * annotation never changes occupancy: `usedTokens`/`maxTokens` stay
 * authoritative, and a missing or inconsistent annotation leaves the prior
 * event shape byte-identical.
 */

export const PORACODE_ACP_USAGE_BREAKDOWN_META_KEY = "poracodeUsageBreakdown";

export interface AcpUsageBreakdown {
  inputTokens: number;
  outputTokens: number;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Read the annotated breakdown, rejecting any malformed metadata. */
export function readAcpUsageBreakdownMeta(meta: unknown): AcpUsageBreakdown | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const breakdown = (meta as Record<string, unknown>)[PORACODE_ACP_USAGE_BREAKDOWN_META_KEY];
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return undefined;
  const { inputTokens, outputTokens } = breakdown as Record<string, unknown>;
  if (!isNonNegativeSafeInteger(inputTokens) || !isNonNegativeSafeInteger(outputTokens)) {
    return undefined;
  }
  return { inputTokens, outputTokens };
}

/**
 * Breakdown counts for a usage update whose authoritative token count is
 * `usedTokens`. Returns undefined when the annotation is missing, malformed,
 * or does not sum exactly to `usedTokens` (zero included) — a mismatched
 * annotation must be dropped, never fabricated into the canonical breakdown,
 * and it must never backfill `usedTokens` via the sum fallback.
 */
export function acpUsageBreakdownForUsedTokens(
  meta: unknown,
  usedTokens: number | undefined,
): AcpUsageBreakdown | undefined {
  const breakdown = readAcpUsageBreakdownMeta(meta);
  if (!breakdown || usedTokens === undefined) return undefined;
  return breakdown.inputTokens + breakdown.outputTokens === usedTokens ? breakdown : undefined;
}
