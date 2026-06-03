import type { UsageTokens } from "./types";

/**
 * Per-model USD prices per 1,000,000 tokens, used only when the opt-in "estimated
 * cost" setting is on. These are PUBLIC API list rates and produce a fictional
 * number for subscription/OAuth users (who are billed by quota windows, not
 * tokens) — always surface cost as "estimated".
 *
 * The table rots; treat it as a dated snapshot. The host/log-scanner (Lightcode
 * phase 2) can also source rates dynamically (e.g. models.dev). Matching is by
 * longest substring of the model id.
 *
 * Last reviewed: 2026-05-29.
 */
export interface ModelRate {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
}

export const PRICING_TABLE_REVIEWED = "2026-05-29";

const RATES: Record<string, ModelRate> = {
  "claude-opus": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku": { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  "gpt-5": { input: 1.25, output: 10, cacheRead: 0.125 },
  "gpt-4.1": { input: 2, output: 8, cacheRead: 0.5 },
};

/** Resolve the rate for a model id by longest matching key, or undefined. */
export function rateForModel(modelId: string | undefined): ModelRate | undefined {
  if (!modelId) return undefined;
  const id = modelId.toLowerCase();
  let best: { key: string; rate: ModelRate } | undefined;
  for (const [key, rate] of Object.entries(RATES)) {
    if (id.includes(key) && (!best || key.length > best.key.length)) {
      best = { key, rate };
    }
  }
  return best?.rate;
}

/** Estimate USD cost for a token breakdown at the given model's list rates. */
export function priceTokens(modelId: string | undefined, tokens: UsageTokens): number {
  const rate = rateForModel(modelId);
  if (!rate) return 0;
  const perMillion = (count: number | undefined, price: number | undefined): number =>
    count && price ? (count / 1_000_000) * price : 0;
  return (
    perMillion(tokens.input, rate.input) +
    perMillion(tokens.output, rate.output) +
    perMillion(tokens.cacheWrite, rate.cacheWrite) +
    perMillion(tokens.cacheRead, rate.cacheRead)
  );
}
