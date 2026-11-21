import {
  estimateCacheSavingsUsd,
  estimateCategoryCosts,
} from "@poracode/agents-usage/historical-pricing";
import {
  addCategoryCostUsd,
  emptyCostTotals,
  mergeCostTotals,
  TOKEN_CATEGORY_KEYS,
} from "@/shared/profile/costTotals";
import { baseAgentKind, type ProfileStatsRequest } from "@/shared/contracts";
import type {
  ProfileCostStats,
  ProfileCostTotals,
  UsageCategoryCost,
  UsageCostRecord,
} from "@/shared/contracts/costHistory";
import type { UsageEventRow } from "../db/usageEvents";
import { dayKeyFromIndex, localDayIndex, statsWindowDays, windowStartIndex } from "./heatmap";
import { accountLabel, modelKey, modelLabel, providerLabel } from "./labels";

export type ProfileCostPricing = ProfileCostStats["pricing"][number];

interface ComputedSampleEconomics {
  categoryCost: UsageCategoryCost;
  cacheSavingsUsd: number;
}

function computeSampleEconomics(
  details: UsageCostRecord | undefined,
): ComputedSampleEconomics | undefined {
  if (!details?.estimate || !details.tokens) return undefined;
  return {
    categoryCost: estimateCategoryCosts(details.estimate.pricing, details.tokens),
    cacheSavingsUsd: estimateCacheSavingsUsd(details.estimate.pricing, details.tokens),
  };
}

export function addCostSample(
  totals: ProfileCostTotals,
  value: number,
  details: UsageCostRecord | undefined,
  precomputed?: ComputedSampleEconomics,
): void {
  totals.tokens += value;
  if (!details?.observed && !details?.estimate) totals.unpricedTokens += value;
  if (details?.tokens) {
    totals.categorizedTokens += value;
    for (const key of TOKEN_CATEGORY_KEYS) {
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
    const economics = precomputed ?? computeSampleEconomics(details);
    if (economics) {
      addCategoryCostUsd(totals, economics.categoryCost);
      if (economics.cacheSavingsUsd > 0) {
        totals.cacheSavingsUsd = (totals.cacheSavingsUsd ?? 0) + economics.cacheSavingsUsd;
      }
    }
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
  const dayProviders = new Map<
    string,
    { day: string; provider: string; totals: ProfileCostTotals }
  >();
  const dayModels = new Map<string, { day: string; model: string; totals: ProfileCostTotals }>();
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

  const getOrCreateDayProvider = (day: string, baseProvider: string): ProfileCostTotals => {
    const key = `${day}\0${baseProvider}`;
    let entry = dayProviders.get(key);
    if (!entry) {
      entry = { day, provider: baseProvider, totals: emptyCostTotals() };
      dayProviders.set(key, entry);
    }
    return entry.totals;
  };

  const getOrCreateDayModel = (day: string, costModelKey: string): ProfileCostTotals => {
    const key = `${day}\0${costModelKey}`;
    let entry = dayModels.get(key);
    if (!entry) {
      entry = { day, model: costModelKey, totals: emptyCostTotals() };
      dayModels.set(key, entry);
    }
    return entry.totals;
  };

  return {
    addBucket(dayIndex, provider, costModelKey, bucketTotals, bucketPricing) {
      if (windowDays === undefined) firstDayIndex = Math.min(firstDayIndex, dayIndex);
      const day = dayKeyFromIndex(dayIndex);
      const baseProvider = provider ? baseAgentKind(provider) : "";
      mergeCostTotals(totals, bucketTotals);
      mergeCostTotals(getOrCreate(days, day), bucketTotals);
      mergeCostTotals(getOrCreate(providers, baseProvider), bucketTotals);
      mergeCostTotals(getOrCreate(accounts, provider ?? ""), bucketTotals);
      mergeCostTotals(getOrCreate(models, costModelKey), bucketTotals);
      if (baseProvider) {
        mergeCostTotals(getOrCreateDayProvider(day, baseProvider), bucketTotals);
      }
      if (costModelKey) {
        mergeCostTotals(getOrCreateDayModel(day, costModelKey), bucketTotals);
      }
      for (const price of bucketPricing) {
        pricing.set(price.id, price);
      }
    },
    addSample(dayIndex, provider, costModelKey, value, details) {
      if (windowDays === undefined) firstDayIndex = Math.min(firstDayIndex, dayIndex);
      const day = dayKeyFromIndex(dayIndex);
      const baseProvider = provider ? baseAgentKind(provider) : "";
      const economics = computeSampleEconomics(details);
      addCostSample(totals, value, details, economics);
      addCostSample(getOrCreate(days, day), value, details, economics);
      addCostSample(getOrCreate(providers, baseProvider), value, details, economics);
      addCostSample(getOrCreate(accounts, provider ?? ""), value, details, economics);
      addCostSample(getOrCreate(models, costModelKey), value, details, economics);
      if (baseProvider) {
        addCostSample(getOrCreateDayProvider(day, baseProvider), value, details, economics);
      }
      if (costModelKey) {
        addCostSample(getOrCreateDayModel(day, costModelKey), value, details, economics);
      }
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
        dayProviders: [...dayProviders.values()].sort(
          (a, b) => a.day.localeCompare(b.day) || a.provider.localeCompare(b.provider),
        ),
        dayModels: [...dayModels.values()].sort(
          (a, b) => a.day.localeCompare(b.day) || a.model.localeCompare(b.model),
        ),
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
