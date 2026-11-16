import { emptyCostTotals } from "@/shared/profile/costTotals";
import {
  baseAgentKind,
  type ProfileBreakdownEntry,
  type ProfileStatsRequest,
  type ProfileTokenProvider,
  type ProfileTokenStats,
} from "@/shared/contracts";
import type { ProfileCostTotals, UsageCostRecord } from "@/shared/contracts/costHistory";
import { getProfileDataGeneration } from "../db";
import { getProfileUsageResetGeneration } from "../db/connection";
import {
  dbIterateTokenUsageScanRowsInRange,
  dbQueryUsageEventsBounds,
  parseUsageCostRecord,
  type TokenUsageScanRow,
} from "../db/usageEvents";
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

export interface TokenRollupSnapshot {
  offset: number;
  scanTodayIndex: number;
  firstRowId: number;
  lastRowId: number;
  firstExactTs: number | undefined;
  activityFirstTs: Array<[string, number]>;
  exactTokenProviders: string[];
  historicalBuckets: HistoricalTokenBucket[];
  recentSamples: RecentTokenSample[];
}

interface TokenRollupCache {
  resetGeneration: number;
  offset: number;
  scanTodayIndex: number;
  firstRowId: number;
  lastRowId: number;
  firstExactTs: number | undefined;
  activityFirstTs: Map<string, number>;
  exactTokenProviders: Set<string>;
  bucketMap: Map<string, HistoricalTokenBucket>;
  recentSamples: RecentTokenSample[];
  unavailableProviders: string[];
}

let tokenRollupCache: TokenRollupCache | undefined;

export function hasWarmTokenRollup(
  offset: number,
  todayIndex: number,
  resetGeneration: number,
): boolean {
  return (
    tokenRollupCache !== undefined &&
    tokenRollupCache.resetGeneration === resetGeneration &&
    tokenRollupCache.offset === offset &&
    tokenRollupCache.scanTodayIndex <= todayIndex
  );
}

export function installTokenRollupSnapshotIfCold(
  snapshot: TokenRollupSnapshot,
  todayIndex: number,
  resetGeneration: number,
): void {
  if (
    getProfileUsageResetGeneration() === resetGeneration &&
    !hasWarmTokenRollup(snapshot.offset, todayIndex, resetGeneration)
  ) {
    tokenRollupCache = cacheFromTokenSnapshot(snapshot, resetGeneration);
  }
}
let tokenCacheGeneration = -1;
const tokenCache = new Map<
  string,
  { generation: number; maxId: number; validUntil: number; result: ProfileTokenStats }
>();

function bucketKeyFor(
  dayIndex: number,
  provider: string | null,
  tokenModelKey: string,
  costModelKey: string,
): string {
  return `${dayIndex}\0${provider ?? ""}\0${provider === null ? "0" : "1"}\0${tokenModelKey}\0${costModelKey}`;
}

function foldBucketSample(
  bucketMap: Map<string, HistoricalTokenBucket>,
  dayIndex: number,
  provider: string | null,
  tokenModelKey: string,
  costModelKey: string,
  value: number,
  costDetails: UsageCostRecord | undefined,
): void {
  const bucketKey = bucketKeyFor(dayIndex, provider, tokenModelKey, costModelKey);
  let bucket = bucketMap.get(bucketKey);
  if (!bucket) {
    bucket = {
      dayIndex,
      provider,
      tokenModelKey,
      costModelKey,
      totals: emptyCostTotals(),
      pricing: [],
    };
    bucketMap.set(bucketKey, bucket);
  }
  addCostSample(bucket.totals, value, costDetails);
  if (costDetails?.estimate) {
    const price = costDetails.estimate.pricing;
    const existingIndex = bucket.pricing.findIndex((entry) => entry.id === price.id);
    if (existingIndex >= 0) bucket.pricing[existingIndex] = price;
    else bucket.pricing.push(price);
  }
}

function computeUnavailableProviders(
  firstExactTs: number | undefined,
  activityFirstTs: Map<string, number>,
  exactTokenProviders: Set<string>,
): string[] {
  if (firstExactTs === undefined) return [];
  return [...activityFirstTs]
    .filter(
      ([provider, firstActivityTs]) =>
        firstActivityTs >= firstExactTs && !exactTokenProviders.has(provider),
    )
    .map(([provider]) => provider)
    .sort();
}

function applyTokenScanRows(cache: TokenRollupCache, rows: Iterable<TokenUsageScanRow>): void {
  for (const row of rows) {
    if (row.provider) {
      const base = baseAgentKind(row.provider);
      if (row.kind === "tokens_v2") {
        cache.exactTokenProviders.add(base);
        if (cache.firstExactTs === undefined || row.ts < cache.firstExactTs) {
          cache.firstExactTs = row.ts;
        }
      } else if (row.kind === "thread_started" || row.kind === "turn") {
        const prev = cache.activityFirstTs.get(base);
        if (prev === undefined || row.ts < prev) cache.activityFirstTs.set(base, row.ts);
      }
    }
    if ((row.kind !== "tokens" && row.kind !== "tokens_v2") || row.value < 0) {
      continue;
    }
    const costDetails = row.cost_details ? parseUsageCostRecord(row.cost_details) : undefined;
    if (row.value === 0 && !costDetails?.observed) {
      continue;
    }

    const dayIndex = localDayIndex(row.ts, cache.offset);
    const tokenModelKey = row.model ? modelKey(row.provider, row.model) : "";
    const attributedModel = costDetails ? costDetails.model : row.model;
    const costModelKey = attributedModel ? modelKey(row.provider, attributedModel) : "";

    // Any row on a local calendar day strictly before scanTodayIndex satisfies ts < nowMs
    // for all timestamps >= todayIndex's start, so historical days fold immediately
    // into compact per-(day, provider, model) buckets without retaining per-row objects.
    if (dayIndex < cache.scanTodayIndex) {
      foldBucketSample(
        cache.bucketMap,
        dayIndex,
        row.provider,
        tokenModelKey,
        costModelKey,
        row.value,
        costDetails,
      );
    } else {
      cache.recentSamples.push({
        ts: row.ts,
        dayIndex,
        provider: row.provider,
        tokenModelKey,
        costModelKey,
        value: row.value,
        ...(costDetails ? { costDetails } : {}),
      });
    }
  }
}

function rollTokenTodayForward(cache: TokenRollupCache, todayIndex: number): void {
  if (todayIndex <= cache.scanTodayIndex) return;
  const remaining: RecentTokenSample[] = [];
  for (const sample of cache.recentSamples) {
    if (sample.dayIndex < todayIndex) {
      foldBucketSample(
        cache.bucketMap,
        sample.dayIndex,
        sample.provider,
        sample.tokenModelKey,
        sample.costModelKey,
        sample.value,
        sample.costDetails,
      );
    } else {
      remaining.push(sample);
    }
  }
  cache.recentSamples = remaining;
  cache.scanTodayIndex = todayIndex;
}

function buildTokenRollupInRange(
  offset: number,
  todayIndex: number,
  resetGeneration: number,
  existing?: TokenRollupCache,
): TokenRollupCache {
  const bounds = dbQueryUsageEventsBounds();
  const canAppend =
    existing !== undefined &&
    existing.resetGeneration === resetGeneration &&
    existing.offset === offset &&
    existing.scanTodayIndex <= todayIndex &&
    bounds.maxId >= existing.lastRowId &&
    !(existing.firstRowId > 0 && bounds.minId > 0 && bounds.minId !== existing.firstRowId) &&
    !(existing.lastRowId > 0 && bounds.maxId === 0);

  if (canAppend) {
    if (todayIndex > existing.scanTodayIndex) {
      rollTokenTodayForward(existing, todayIndex);
    }
    if (bounds.maxId > existing.lastRowId) {
      applyTokenScanRows(
        existing,
        dbIterateTokenUsageScanRowsInRange(existing.lastRowId, bounds.maxId),
      );
      if (existing.firstRowId === 0 && bounds.minId > 0) {
        existing.firstRowId = bounds.minId;
      }
      existing.lastRowId = bounds.maxId;
      existing.unavailableProviders = computeUnavailableProviders(
        existing.firstExactTs,
        existing.activityFirstTs,
        existing.exactTokenProviders,
      );
    }
    return existing;
  }

  const fresh: TokenRollupCache = {
    resetGeneration,
    offset,
    scanTodayIndex: todayIndex,
    firstRowId: bounds.minId,
    lastRowId: bounds.maxId,
    firstExactTs: undefined,
    activityFirstTs: new Map(),
    exactTokenProviders: new Set(),
    bucketMap: new Map(),
    recentSamples: [],
    unavailableProviders: [],
  };
  if (bounds.maxId > 0) {
    applyTokenScanRows(fresh, dbIterateTokenUsageScanRowsInRange(0, bounds.maxId));
    fresh.unavailableProviders = computeUnavailableProviders(
      fresh.firstExactTs,
      fresh.activityFirstTs,
      fresh.exactTokenProviders,
    );
  }
  return fresh;
}

/** Cold worker-safe snapshot builder (runs inside AsyncDatabaseReads or inline). */
export function buildTokenRollupSnapshot(offset: number, todayIndex: number): TokenRollupSnapshot {
  const rollup = buildTokenRollupInRange(offset, todayIndex, getProfileUsageResetGeneration());
  return {
    offset: rollup.offset,
    scanTodayIndex: rollup.scanTodayIndex,
    firstRowId: rollup.firstRowId,
    lastRowId: rollup.lastRowId,
    firstExactTs: rollup.firstExactTs,
    activityFirstTs: [...rollup.activityFirstTs.entries()],
    exactTokenProviders: [...rollup.exactTokenProviders],
    historicalBuckets: [...rollup.bucketMap.values()],
    recentSamples: rollup.recentSamples,
  };
}

function cacheFromTokenSnapshot(
  snapshot: TokenRollupSnapshot,
  resetGeneration: number,
): TokenRollupCache {
  const bucketMap = new Map<string, HistoricalTokenBucket>();
  for (const bucket of snapshot.historicalBuckets) {
    bucketMap.set(
      bucketKeyFor(bucket.dayIndex, bucket.provider, bucket.tokenModelKey, bucket.costModelKey),
      bucket,
    );
  }
  const activityFirstTs = new Map(snapshot.activityFirstTs);
  const exactTokenProviders = new Set(snapshot.exactTokenProviders);
  return {
    resetGeneration,
    offset: snapshot.offset,
    scanTodayIndex: snapshot.scanTodayIndex,
    firstRowId: snapshot.firstRowId,
    lastRowId: snapshot.lastRowId,
    firstExactTs: snapshot.firstExactTs,
    activityFirstTs,
    exactTokenProviders,
    bucketMap,
    recentSamples: snapshot.recentSamples,
    unavailableProviders: computeUnavailableProviders(
      snapshot.firstExactTs,
      activityFirstTs,
      exactTokenProviders,
    ),
  };
}

function getOrBuildTokenRollup(offset: number, todayIndex: number): TokenRollupCache {
  const resetGeneration = getProfileUsageResetGeneration();
  tokenRollupCache = buildTokenRollupInRange(offset, todayIndex, resetGeneration, tokenRollupCache);
  return tokenRollupCache;
}

function tokenResultKey(req: ProfileStatsRequest, todayIndex: number): string {
  return `${req.utcOffsetMinutes}|${todayIndex}|${req.scope ?? "device"}|${req.deviceId ?? "current"}|${req.provider ?? "all"}|${req.window ?? "all"}`;
}

export function getCachedProfileTokenStats(
  req: ProfileStatsRequest,
): ProfileTokenStats | undefined {
  const now = Date.now();
  const cached = tokenCache.get(tokenResultKey(req, localDayIndex(now, req.utcOffsetMinutes)));
  return cached?.generation === getProfileDataGeneration() &&
    now >= cached.result.generatedAt &&
    now < cached.validUntil
    ? cached.result
    : undefined;
}

export function computeProfileTokenStats(req: ProfileStatsRequest): ProfileTokenStats {
  const existing = getCachedProfileTokenStats(req);
  if (existing) return existing;
  const offset = req.utcOffsetMinutes;
  const nowMs = Date.now();
  const todayIndex = localDayIndex(nowMs, offset);

  // Reuse totals until a write, day change or excluded future sample becomes current.
  const generation = getProfileDataGeneration();
  if (tokenCacheGeneration !== generation) {
    tokenCache.clear();
    tokenCacheGeneration = generation;
  }
  const cacheKey = tokenResultKey(req, todayIndex);
  const currentDevice = recordCurrentDevice();
  const targetDeviceId =
    req.scope === "all" ? currentDevice.id : (req.deviceId ?? currentDevice.id);
  if (targetDeviceId !== currentDevice.id) {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.generation === generation) return cached.result;
    const empty = emptyTokenStats(resolveProfileDevice(targetDeviceId), req, nowMs, todayIndex);
    tokenCache.set(cacheKey, { generation, maxId: 0, validUntil: Infinity, result: empty });
    return empty;
  }

  const rollup = getOrBuildTokenRollup(offset, todayIndex);
  const cached = tokenCache.get(cacheKey);
  if (
    cached &&
    cached.generation === generation &&
    cached.maxId === rollup.lastRowId &&
    nowMs >= cached.result.generatedAt &&
    nowMs < cached.validUntil
  ) {
    return cached.result;
  }

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

  for (const bucket of rollup.bucketMap.values()) {
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
  tokenCache.set(cacheKey, { generation, maxId: rollup.lastRowId, validUntil, result });
  return result;
}
