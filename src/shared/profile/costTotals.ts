import type { ProfileCostTotals } from "../contracts/costHistory";

export function emptyCostTotals(): ProfileCostTotals {
  return {
    tokens: 0,
    unpricedTokens: 0,
    categorizedTokens: 0,
    observedTokens: 0,
    estimatedTokens: 0,
    observedSamples: 0,
    estimatedSamples: 0,
    observed: [],
    estimatedUsd: 0,
    categories: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

export function mergeCostTotals(target: ProfileCostTotals, source: ProfileCostTotals): void {
  target.tokens += source.tokens;
  target.unpricedTokens += source.unpricedTokens;
  target.categorizedTokens += source.categorizedTokens;
  target.observedTokens += source.observedTokens;
  target.estimatedTokens += source.estimatedTokens;
  target.observedSamples += source.observedSamples;
  target.estimatedSamples += source.estimatedSamples;
  target.estimatedUsd += source.estimatedUsd;
  for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
    target.categories[key] += source.categories[key];
  }
  for (const money of source.observed) {
    const existing = target.observed.find((entry) => entry.currency === money.currency);
    if (existing) existing.amount += money.amount;
    else target.observed.push({ ...money });
  }
}
