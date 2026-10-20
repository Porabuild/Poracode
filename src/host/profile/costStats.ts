import { baseAgentKind } from "@/shared/contracts";
import type { ProfileCostStats, ProfileCostTotals } from "@/shared/contracts/costHistory";
import type { UsageEventRow } from "../db/usageEvents";
import { dayKeyFromIndex, localDayIndex, statsWindowDays, windowStartIndex } from "./heatmap";
import { accountLabel, modelKey, modelLabel, providerLabel } from "./labels";
import type { ProfileStatsRequest } from "@/shared/contracts";

function emptyTotals(): ProfileCostTotals {
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

function addRow(totals: ProfileCostTotals, row: UsageEventRow): void {
  const details = row.costDetails;
  totals.tokens += row.value;
  if (!details?.observed && !details?.estimate) totals.unpricedTokens += row.value;
  if (details?.tokens) {
    totals.categorizedTokens += row.value;
    for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
      totals.categories[key] += details.tokens[key];
    }
  }
  if (details?.observed) {
    const money = totals.observed.find((entry) => entry.currency === details.observed!.currency);
    if (money) money.amount += details.observed.amount;
    else totals.observed.push({ ...details.observed });
    totals.observedSamples += 1;
    totals.observedTokens += row.value;
  }
  if (details?.estimate) {
    totals.estimatedUsd += details.estimate.amount;
    totals.estimatedSamples += 1;
    totals.estimatedTokens += row.value;
  }
}

/** Uses only the filtered, durable token rows already read by tokenStats. No transcript rescans or account snapshots. */
export function aggregateProfileCosts(
  rows: readonly UsageEventRow[],
  req: ProfileStatsRequest,
  todayIndex: number,
): ProfileCostStats {
  const totals = emptyTotals();
  const days = new Map<string, ProfileCostTotals>();
  const providers = new Map<string, ProfileCostTotals>();
  const models = new Map<string, ProfileCostTotals>();
  const accounts = new Map<string, ProfileCostTotals>();
  const pricing = new Map<string, ProfileCostStats["pricing"][number]>();
  const windowDays = statsWindowDays(req.window);
  let firstDayIndex = windowStartIndex(todayIndex, windowDays ?? 30);
  const add = (map: Map<string, ProfileCostTotals>, key: string, row: UsageEventRow) => {
    const entry = map.get(key) ?? emptyTotals();
    addRow(entry, row);
    map.set(key, entry);
  };
  for (const row of rows) {
    const dayIndex = localDayIndex(row.ts, req.utcOffsetMinutes);
    if (windowDays === undefined) firstDayIndex = Math.min(firstDayIndex, dayIndex);
    addRow(totals, row);
    add(days, dayKeyFromIndex(dayIndex), row);
    add(providers, row.provider ? baseAgentKind(row.provider) : "", row);
    add(accounts, row.provider ?? "", row);
    const attributedModel = row.costDetails ? row.costDetails.model : row.model;
    add(models, attributedModel ? modelKey(row.provider, attributedModel) : "", row);
    if (row.costDetails?.estimate) {
      const price = row.costDetails.estimate.pricing;
      pricing.set(price.id, price);
    }
  }
  const breakdown = (map: Map<string, ProfileCostTotals>, label: (key: string) => string) =>
    [...map]
      .map(([key, value]) => ({ key, label: key ? label(key) : "", totals: value }))
      .sort((a, b) => b.totals.tokens - a.totals.tokens || a.key.localeCompare(b.key));
  return {
    totals,
    days: Array.from({ length: todayIndex - firstDayIndex + 1 }, (_, i) => {
      const day = dayKeyFromIndex(firstDayIndex + i);
      return { day, totals: days.get(day) ?? emptyTotals() };
    }),
    providers: breakdown(providers, providerLabel),
    models: breakdown(models, modelLabel),
    accounts: breakdown(accounts, accountLabel),
    pricing: [...pricing.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
