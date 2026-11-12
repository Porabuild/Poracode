import { baseAgentKind, type ProfileStatsRequest } from "@/shared/contracts";
import type {
  ProfileCostStats,
  ProfileCostTotals,
  UsageCostRecord,
} from "@/shared/contracts/costHistory";
import type { UsageEventRow } from "../db/usageEvents";
import { dayKeyFromIndex, localDayIndex, statsWindowDays, windowStartIndex } from "./heatmap";
import { accountLabel, modelKey, modelLabel, providerLabel } from "./labels";

export type ProfileCostPricing = ProfileCostStats["pricing"][number];

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

export function addCostSample(
  totals: ProfileCostTotals,
  value: number,
  details: UsageCostRecord | undefined,
): void {
  totals.tokens += value;
  if (!details?.observed && !details?.estimate) totals.unpricedTokens += value;
  if (details?.tokens) {
    totals.categorizedTokens += value;
    for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
      totals.categories[key] += details.tokens[key];
    }
  }
  if (details?.observed) {
    const money = totals.observed.find((entry) => entry.currency === details.observed!.currency);
    if (money) money.amount += details.observed.amount;
    else totals.observed.push({ ...details.observed });
    totals.observedSamples += 1;
    totals.observedTokens += value;
  }
  if (details?.estimate) {
    totals.estimatedUsd += details.estimate.amount;
    totals.estimatedSamples += 1;
    totals.estimatedTokens += value;
  }
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

export interface ProfileCostAggregator {
  addBucket(
    dayIndex: number,
    provider: string | null,
    costModelKey: string,
    bucketTotals: ProfileCostTotals,
    bucketPricing: readonly ProfileCostPricing[],
  ): void;
  addSample(
    dayIndex: number,
    provider: string | null,
    costModelKey: string,
    value: number,
    details: UsageCostRecord | undefined,
  ): void;
  finish(): ProfileCostStats;
}

export function createProfileCostAggregator(
  req: ProfileStatsRequest,
  todayIndex: number,
): ProfileCostAggregator {
  const totals = emptyCostTotals();
  const days = new Map<string, ProfileCostTotals>();
  const providers = new Map<string, ProfileCostTotals>();
  const models = new Map<string, ProfileCostTotals>();
  const accounts = new Map<string, ProfileCostTotals>();
  const pricing = new Map<string, ProfileCostPricing>();
  const windowDays = statsWindowDays(req.window);
  let firstDayIndex = windowStartIndex(todayIndex, windowDays ?? 30);

  const getOrCreate = (map: Map<string, ProfileCostTotals>, key: string): ProfileCostTotals => {
    let entry = map.get(key);
    if (!entry) {
      entry = emptyCostTotals();
      map.set(key, entry);
    }
    return entry;
  };

  return {
    addBucket(dayIndex, provider, costModelKey, bucketTotals, bucketPricing) {
      if (windowDays === undefined) firstDayIndex = Math.min(firstDayIndex, dayIndex);
      mergeCostTotals(totals, bucketTotals);
      mergeCostTotals(getOrCreate(days, dayKeyFromIndex(dayIndex)), bucketTotals);
      mergeCostTotals(
        getOrCreate(providers, provider ? baseAgentKind(provider) : ""),
        bucketTotals,
      );
      mergeCostTotals(getOrCreate(accounts, provider ?? ""), bucketTotals);
      mergeCostTotals(getOrCreate(models, costModelKey), bucketTotals);
      for (const price of bucketPricing) {
        pricing.set(price.id, price);
      }
    },
    addSample(dayIndex, provider, costModelKey, value, details) {
      if (windowDays === undefined) firstDayIndex = Math.min(firstDayIndex, dayIndex);
      addCostSample(totals, value, details);
      addCostSample(getOrCreate(days, dayKeyFromIndex(dayIndex)), value, details);
      addCostSample(
        getOrCreate(providers, provider ? baseAgentKind(provider) : ""),
        value,
        details,
      );
      addCostSample(getOrCreate(accounts, provider ?? ""), value, details);
      addCostSample(getOrCreate(models, costModelKey), value, details);
      if (details?.estimate) {
        const price = details.estimate.pricing;
        pricing.set(price.id, price);
      }
    },
    finish() {
      const breakdown = (map: Map<string, ProfileCostTotals>, label: (key: string) => string) =>
        [...map]
          .map(([key, value]) => ({ key, label: key ? label(key) : "", totals: value }))
          .sort((a, b) => b.totals.tokens - a.totals.tokens || a.key.localeCompare(b.key));
      return {
        totals,
        days: Array.from({ length: todayIndex - firstDayIndex + 1 }, (_, i) => {
          const day = dayKeyFromIndex(firstDayIndex + i);
          return { day, totals: days.get(day) ?? emptyCostTotals() };
        }),
        providers: breakdown(providers, providerLabel),
        models: breakdown(models, modelLabel),
        accounts: breakdown(accounts, accountLabel),
        pricing: [...pricing.values()].sort((a, b) => a.id.localeCompare(b.id)),
      };
    },
  };
}

/** Uses only the filtered, durable token rows already read by tokenStats. No transcript rescans or account snapshots. */
export function aggregateProfileCosts(
  rows: readonly UsageEventRow[],
  req: ProfileStatsRequest,
  todayIndex: number,
): ProfileCostStats {
  const aggregator = createProfileCostAggregator(req, todayIndex);
  for (const row of rows) {
    const dayIndex = localDayIndex(row.ts, req.utcOffsetMinutes);
    const attributedModel = row.costDetails ? row.costDetails.model : row.model;
    const costModelKey = attributedModel ? modelKey(row.provider, attributedModel) : "";
    aggregator.addSample(dayIndex, row.provider, costModelKey, row.value, row.costDetails);
  }
  return aggregator.finish();
}
