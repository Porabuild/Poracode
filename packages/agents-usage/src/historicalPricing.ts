import type { UsageTokens } from "./types";

export interface HistoricalPrice {
  id: string;
  model: string;
  source: string;
  reviewedAt: string;
  effectiveFrom: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  /** Input plus cache reads/writes covered by this reviewed standard rate. */
  maxInputTokens?: number;
}

// Append snapshots rather than editing old rates. Exact IDs only: an unrecognized
// release/alias must not inherit a similarly named model's price. The first dated
// snapshot starts on its review date; it makes no claim about earlier prices.
const REVIEWED = "2026-10-16";
const CLAUDE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
const OPENAI_SOURCE = "https://developers.openai.com/api/docs/pricing";
const MODELS: Array<[string, number, number, number, number, number, string, number?]> = [
  ["claude-sonnet-4-20250514", 3, 15, 0.3, 3.75, 6, CLAUDE_SOURCE, 200_000],
  ["claude-sonnet-4-5-20250929", 3, 15, 0.3, 3.75, 6, CLAUDE_SOURCE, 200_000],
  ["claude-sonnet-4-6", 3, 15, 0.3, 3.75, 6, CLAUDE_SOURCE],
  ["claude-opus-4-20250514", 15, 75, 1.5, 18.75, 30, CLAUDE_SOURCE, 200_000],
  ["claude-opus-4-1-20250805", 15, 75, 1.5, 18.75, 30, CLAUDE_SOURCE, 200_000],
  ["claude-opus-4-5-20251101", 5, 25, 0.5, 6.25, 10, CLAUDE_SOURCE, 200_000],
  ["claude-opus-4-6", 5, 25, 0.5, 6.25, 10, CLAUDE_SOURCE],
  ["claude-opus-4-7", 5, 25, 0.5, 6.25, 10, CLAUDE_SOURCE],
  ["claude-haiku-4-5-20251001", 1, 5, 0.1, 1.25, 2, CLAUDE_SOURCE, 200_000],
  ["gpt-5.3-codex", 1.75, 14, 0.175, 0, 0, OPENAI_SOURCE],
];

export const HISTORICAL_PRICES: readonly HistoricalPrice[] = MODELS.map(
  ([model, input, output, cacheRead, cacheWrite, cacheWrite1h, source, maxInputTokens]) => ({
    id: `${model}:${REVIEWED}`,
    model,
    input,
    output,
    cacheRead,
    cacheWrite,
    cacheWrite1h,
    source,
    reviewedAt: REVIEWED,
    effectiveFrom: REVIEWED,
    ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
  }),
);

export function historicalTokenEstimate(
  model: string | undefined,
  tokens: UsageTokens & { cacheWrite1h?: number | undefined },
  occurredAt: number,
  prices: readonly HistoricalPrice[] = HISTORICAL_PRICES,
): { amount: number; pricing: HistoricalPrice } | undefined {
  const day = new Date(occurredAt).toISOString().slice(0, 10);
  const snapshot = prices
    .filter((price) => price.model === model && price.effectiveFrom <= day)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (
    !snapshot ||
    tokens.input === undefined ||
    tokens.output === undefined ||
    tokens.cacheRead === undefined ||
    tokens.cacheWrite === undefined
  )
    return undefined;
  const { maxInputTokens, ...pricing } = snapshot;
  // Do not extrapolate a flat rate into an unqualified context tier. Output and
  // the one-hour subset are not additional prompt tokens.
  if (
    maxInputTokens !== undefined &&
    tokens.input + tokens.cacheRead + tokens.cacheWrite > maxInputTokens
  )
    return undefined;
  // Cache TTL changes the price. An unknown TTL cannot silently become a 5m write.
  if (tokens.cacheWrite > 0 && tokens.cacheWrite1h === undefined) return undefined;
  if ((tokens.cacheWrite1h ?? 0) > tokens.cacheWrite) return undefined;
  // No cache-write product exists in this snapshot; don't assume it is free.
  if (tokens.cacheWrite > 0 && pricing.cacheWrite === 0) return undefined;
  const amount =
    (tokens.input * pricing.input +
      tokens.output * pricing.output +
      tokens.cacheRead * pricing.cacheRead +
      (tokens.cacheWrite - (tokens.cacheWrite1h ?? 0)) * pricing.cacheWrite +
      (tokens.cacheWrite1h ?? 0) * pricing.cacheWrite1h) /
    1_000_000;
  return { amount, pricing };
}
