import {
  baseAgentKind,
  type ProfileBreakdownEntry,
  type ProfileStatsRequest,
  type ProfileTokenProvider,
  type ProfileTokenStats,
} from "@/shared/contracts";
import type { ProfileCostTotals, UsageCostRecord } from "@/shared/contracts/costHistory";
import { getProfileDataGeneration } from "../db";
import { dbIterateTokenUsageScanRows, parseUsageCostRecord } from "../db/usageEvents";
import {
  buildHeatmap,
  dayKeyFromIndex,
  HEATMAP_WINDOW_DAYS,
  localDayIndex,
  statsWindowDays,
  windowStartIndex,
} from "./heatmap";
import { recordCurrentDevice, resolveProfileDevice } from "./identity";
import { accountLabel, modelKey, modelLabel, providerLabel } from "./labels";
import {
  addCostSample,
  aggregateProfileCosts,
  createProfileCostAggregator,
  emptyCostTotals,
  type ProfileCostPricing,
} from "./costStats";

/**
 * Token usage from Poracode's own activity, read from the durable `usage_events`
 * log. Two row kinds feed the sums: kind="tokens_v2" (exact spend counted by the
 * main-process usage ledger from provider-reported counters) and kind="tokens"
 * (legacy per-turn deltas captured at the canonical-event layer — approximate
 * occupancy growth, kept for historical continuity). No external transcript
 * scanning, and no dependency on threads (survives delete/archive). Reported
 * both globally (folded to the base provider) and per account (each profile
 * separately).
 */

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyTokenStats(
  device: ProfileTokenStats["device"],
  req: ProfileStatsRequest,
  nowMs: number,
  todayIndex: number,
): ProfileTokenStats {
  const windowDays = statsWindowDays(req.window) ?? HEATMAP_WINDOW_DAYS;
  const { heatmap } = buildHeatmap(new Map(), todayIndex, "tokens", windowDays);
  return {
    available: false,
    costs: aggregateProfileCosts([], req, todayIndex),
    scope: req.scope ?? "device",
    device,
    generatedAt: nowMs,
    timezoneOffsetMinutes: req.utcOffsetMinutes,
    windowDays,
    lifetimeTokens: 0,
    peakDayTokens: 0,
    providers: [],
    accounts: [],
    models: [],
    tokenHeatmap: heatmap,
    unavailableProviders: [],
  };
}

interface HistoricalTokenBucket {
  dayIndex: number;
  provider: string | null;
  tokenModelKey: string;
  costModelKey: string;
  totals: ProfileCostTotals;
  pricing: ProfileCostPricing[];
}

interface RecentTokenSample {
  ts: number;
  dayIndex: number;
  provider: string | null;
  tokenModelKey: string;
  costModelKey: string;
  value: number;
  costDetails?: UsageCostRecord;
}

interface TokenRollupCache {
  generation: number;
  offset: number;
  scanTodayIndex: number;
  unavailableProviders: string[];
  historicalBuckets: HistoricalTokenBucket[];
  recentSamples: RecentTokenSample[];
}

let tokenRollupCache: TokenRollupCache | undefined;
let tokenCacheGeneration = -1;
const tokenCache = new Map<
  string,
  { generation: number; validUntil: number; result: ProfileTokenStats }
>();

function* iterateTokenRollupSourceRows(): IterableIterator<{
  ts: number;
  kind: string;
  provider: string | null;
  model: string | null;
  value: number;
  costDetails: UsageCostRecord | undefined;
}> {
  for (const row of dbIterateTokenUsageScanRows()) {
    const costDetails = row.cost_details ? parseUsageCostRecord(row.cost_details) : undefined;
    yield {
      ts: row.ts,
      kind: row.kind,
      provider: row.provider,
      model: row.model,
      value: row.value,
      costDetails,
    };
  }
}

function getOrBuildTokenRollup(
  generation: number,
  offset: number,
  todayIndex: number,
): TokenRollupCache {
  if (
    tokenRollupCache &&
    tokenRollupCache.generation === generation &&
    tokenRollupCache.offset === offset &&
    tokenRollupCache.scanTodayIndex <= todayIndex
  ) {
    return tokenRollupCache;
  }

  // Coverage sets for the honesty list: providers that ran threads or turns vs
  // providers with at least one exact (tokens_v2) token row. A zero-value
  // tokens_v2 row still proves the provider reports exact usage. Computed over
  // the whole device log (ignoring the active account/window filters), but
  // activity only counts once the exact-telemetry era started on this device
  // (first tokens_v2 row) — otherwise every provider would flash "unavailable"
  // right after upgrade until it next records exact rows.
  const activityFirstTs = new Map<string, number>();
  const exactTokenProviders = new Set<string>();
  let firstExactTs: number | undefined;

  const bucketMap = new Map<string, HistoricalTokenBucket>();
  const recentSamples: RecentTokenSample[] = [];

  for (const row of iterateTokenRollupSourceRows()) {
    if (row.provider) {
      const base = baseAgentKind(row.provider);
      if (row.kind === "tokens_v2") {
        exactTokenProviders.add(base);
        if (firstExactTs === undefined || row.ts < firstExactTs) firstExactTs = row.ts;
      } else if (row.kind === "thread_started" || row.kind === "turn") {
        const prev = activityFirstTs.get(base);
        if (prev === undefined || row.ts < prev) activityFirstTs.set(base, row.ts);
      }
    }
    if (
      (row.kind !== "tokens" && row.kind !== "tokens_v2") ||
      row.value < 0 ||
      (row.value === 0 && !row.costDetails?.observed)
    ) {
      continue;
    }

    const dayIndex = localDayIndex(row.ts, offset);
    const tokenModelKey = row.model ? modelKey(row.provider, row.model) : "";
    const attributedModel = row.costDetails ? row.costDetails.model : row.model;
    const costModelKey = attributedModel ? modelKey(row.provider, attributedModel) : "";

    // Any row on a local calendar day strictly before todayIndex satisfies ts < nowMs
    // for all timestamps >= todayIndex's start, so historical days fold immediately
    // into compact per-(day, provider, model) buckets without retaining per-row objects.
    if (dayIndex < todayIndex) {
      const bucketKey = `${dayIndex}\0${row.provider ?? ""}\0${row.provider === null ? "0" : "1"}\0${tokenModelKey}\0${costModelKey}`;
      let bucket = bucketMap.get(bucketKey);
      if (!bucket) {
        bucket = {
          dayIndex,
          provider: row.provider,
          tokenModelKey,
          costModelKey,
          totals: emptyCostTotals(),
          pricing: [],
        };
        bucketMap.set(bucketKey, bucket);
      }
      addCostSample(bucket.totals, row.value, row.costDetails);
      if (row.costDetails?.estimate) {
        const price = row.costDetails.estimate.pricing;
        const existingIndex = bucket.pricing.findIndex((entry) => entry.id === price.id);
        if (existingIndex >= 0) bucket.pricing[existingIndex] = price;
        else bucket.pricing.push(price);
      }
    } else {
      recentSamples.push({
        ts: row.ts,
        dayIndex,
        provider: row.provider,
        tokenModelKey,
        costModelKey,
        value: row.value,
        ...(row.costDetails ? { costDetails: row.costDetails } : {}),
      });
    }
  }

  const unavailableProviders =
    firstExactTs === undefined
      ? []
      : [...activityFirstTs]
          .filter(
            ([provider, firstActivityTs]) =>
              firstActivityTs >= firstExactTs && !exactTokenProviders.has(provider),
          )
          .map(([provider]) => provider)
          .sort();

  tokenRollupCache = {
    generation,
    offset,
    scanTodayIndex: todayIndex,
    unavailableProviders,
    historicalBuckets: [...bucketMap.values()],
    recentSamples,
  };
  return tokenRollupCache;
}

export function computeProfileTokenStats(req: ProfileStatsRequest): ProfileTokenStats {
  const offset = req.utcOffsetMinutes;
  const nowMs = Date.now();
  const todayIndex = localDayIndex(nowMs, offset);

  // Reuse totals until a write, day change or excluded future sample becomes current.
  const generation = getProfileDataGeneration();
  if (tokenCacheGeneration !== generation) {
    tokenCache.clear();
    tokenCacheGeneration = generation;
  }
  const cacheKey = `${offset}|${todayIndex}|${req.scope ?? "device"}|${req.deviceId ?? "current"}|${req.provider ?? "all"}|${req.window ?? "all"}`;
  const cached = tokenCache.get(cacheKey);
  if (
    cached &&
    cached.generation === generation &&
    nowMs >= cached.result.generatedAt &&
    nowMs < cached.validUntil
  )
    return cached.result;

  const currentDevice = recordCurrentDevice();
  const targetDeviceId =
    req.scope === "all" ? currentDevice.id : (req.deviceId ?? currentDevice.id);
  if (targetDeviceId !== currentDevice.id) {
    const empty = emptyTokenStats(resolveProfileDevice(targetDeviceId), req, nowMs, todayIndex);
    tokenCache.set(cacheKey, { generation, validUntil: Infinity, result: empty });
    return empty;
  }

  const rollup = getOrBuildTokenRollup(generation, offset, todayIndex);
  const perDay = new Map<string, number>();
  const perProvider = new Map<string, number>();
  const perAccount = new Map<string, number>();
  const perModel = new Map<string, number>();
  let lifetimeTokens = 0;
  let validUntil = Infinity;
  const windowDays = statsWindowDays(req.window);
  const startDayIndex = windowDays ? windowStartIndex(todayIndex, windowDays) : undefined;
  const costAggregator = createProfileCostAggregator(req, todayIndex);

  const accumulatePositiveTokens = (
    dayIndex: number,
    provider: string | null,
    tokenModelKey: string,
    tokens: number,
  ): void => {
    lifetimeTokens += tokens;
    const day = dayKeyFromIndex(dayIndex);
    perDay.set(day, (perDay.get(day) ?? 0) + tokens);
    if (provider) {
      const base = baseAgentKind(provider);
      perProvider.set(base, (perProvider.get(base) ?? 0) + tokens);
      perAccount.set(provider, (perAccount.get(provider) ?? 0) + tokens);
    }
    if (tokenModelKey) {
      perModel.set(tokenModelKey, (perModel.get(tokenModelKey) ?? 0) + tokens);
    }
  };

  for (const bucket of rollup.historicalBuckets) {
    // Scope to the selected account (exact account-kind match) when filtering.
    if (req.provider && bucket.provider !== req.provider) continue;
    if (
      startDayIndex !== undefined &&
      (bucket.dayIndex < startDayIndex || bucket.dayIndex > todayIndex)
    ) {
      continue;
    }
    costAggregator.addBucket(
      bucket.dayIndex,
      bucket.provider,
      bucket.costModelKey,
      bucket.totals,
      bucket.pricing,
    );
    if (bucket.totals.tokens > 0) {
      accumulatePositiveTokens(
        bucket.dayIndex,
        bucket.provider,
        bucket.tokenModelKey,
        bucket.totals.tokens,
      );
    }
  }

  for (const sample of rollup.recentSamples) {
    if (req.provider && sample.provider !== req.provider) continue;
    if (sample.ts > nowMs) {
      validUntil = Math.min(validUntil, sample.ts);
      continue;
    }
    if (
      startDayIndex !== undefined &&
      (sample.dayIndex < startDayIndex || sample.dayIndex > todayIndex)
    ) {
      continue;
    }
    costAggregator.addSample(
      sample.dayIndex,
      sample.provider,
      sample.costModelKey,
      sample.value,
      sample.costDetails,
    );
    if (sample.value > 0) {
      accumulatePositiveTokens(
        sample.dayIndex,
        sample.provider,
        sample.tokenModelKey,
        sample.value,
      );
    }
  }

  const { heatmap: tokenHeatmap } = buildHeatmap(perDay, todayIndex, "tokens", windowDays);

  let peakDay: string | undefined;
  let peakDayTokens = 0;
  for (const [day, tokens] of perDay) {
    if (tokens > peakDayTokens) {
      peakDayTokens = tokens;
      peakDay = day;
    }
  }

  const providers: ProfileTokenProvider[] = [...perProvider.entries()]
    .filter(([, tokens]) => tokens > 0)
    .map(([provider, tokens]) => ({
      provider,
      label: providerLabel(provider),
      tokens,
      percent: lifetimeTokens > 0 ? round1((tokens / lifetimeTokens) * 100) : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const accounts: ProfileTokenProvider[] = [...perAccount.entries()]
    .filter(([, tokens]) => tokens > 0)
    .map(([account, tokens]) => ({
      provider: account,
      label: accountLabel(account),
      tokens,
      percent: lifetimeTokens > 0 ? round1((tokens / lifetimeTokens) * 100) : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const models: ProfileBreakdownEntry[] = [...perModel.entries()]
    .map(([key, tokens]) => ({
      key,
      label: modelLabel(key),
      count: tokens,
      percent: lifetimeTokens > 0 ? round1((tokens / lifetimeTokens) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const result: ProfileTokenStats = {
    costs: costAggregator.finish(),
    available: lifetimeTokens > 0,
    scope: req.scope ?? "device",
    device: currentDevice,
    generatedAt: nowMs,
    timezoneOffsetMinutes: offset,
    windowDays: windowDays ?? HEATMAP_WINDOW_DAYS,
    lifetimeTokens,
    peakDayTokens,
    ...(peakDay ? { peakDay } : {}),
    providers,
    accounts,
    models,
    tokenHeatmap,
    unavailableProviders: rollup.unavailableProviders,
  };
  tokenCache.set(cacheKey, { generation, validUntil, result });
  return result;
}
