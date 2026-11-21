import type { ProfileCostTotals, UsageCategoryCost } from "../contracts/costHistory";

export const TOKEN_CATEGORY_KEYS = ["input", "output", "cacheRead", "cacheWrite"] as const;

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

export function addCategoryCostUsd(target: ProfileCostTotals, source: UsageCategoryCost): void {
  const dest = target.categoryCostUsd ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const key of TOKEN_CATEGORY_KEYS) {
    dest[key] += source[key];
  }
  target.categoryCostUsd = dest;
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
  for (const key of TOKEN_CATEGORY_KEYS) {
    target.categories[key] += source.categories[key];
  }
  if (source.cacheSavingsUsd !== undefined && source.cacheSavingsUsd > 0) {
    target.cacheSavingsUsd = (target.cacheSavingsUsd ?? 0) + source.cacheSavingsUsd;
  }
  if (source.categoryCostUsd) {
    addCategoryCostUsd(target, source.categoryCostUsd);
  }
  for (const money of source.observed) {
    const existing = target.observed.find((entry) => entry.currency === money.currency);
    if (existing) existing.amount += money.amount;
    else target.observed.push({ ...money });
  }
}
