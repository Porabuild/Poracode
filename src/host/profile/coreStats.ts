import { computeStreaks } from "@/shared/profile/activity";
import {
  baseAgentKind,
  type AiActionType,
  type ProfileAiAction,
  type ProfileBreakdownEntry,
  type ProfileCoreStats,
  type ProfileDevice,
  type ProfileHourBucket,
  type ProfileInsights,
  type ProfilePeriodSnapshot,
  type ProfileRecentActivity,
  type ProfileSkillUsage,
  type ProfileStatsRequest,
  type ProfileTotals,
} from "@/shared/contracts";
import { getProfileDataGeneration } from "../db";
import { getProfileUsageResetGeneration } from "../db/connection";
import {
  dbIterateCoreUsageEventsInRange,
  dbIterateUsageAccountRowsInRange,
  dbQueryUsageAccountCountsUpTo,
  dbQueryUsageEventsBounds,
  type CoreUsageEventRow,
} from "../db/usageEvents";
import {
  buildHeatmap,
  dayKeyFromIndex,
  localDayIndex,
  localHour,
  statsWindowDays,
  windowStartIndex,
} from "./heatmap";
import { getProfileIdentity, recordCurrentDevice, resolveProfileDevice } from "./identity";
import {
  accountLabel,
  mcpServerLabel,
  modelKey,
  modelLabel,
  providerLabel,
  titleCase,
} from "./labels";

/**
 * Profile core stats, computed entirely from the durable `usage_events` log
 * (NOT thread-scoped tables) - so the numbers survive thread delete/archive.
 * Every fact was already captured at the canonical-event layer with its
 * provider/model/mode denormalized, so there are no joins and no per-provider
 * splits here.
 */

const MAX_SKILLS = 8;

function hourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function rank(
  counts: Map<string, number>,
  labelFor: (key: string) => string,
  denominator: number,
): ProfileBreakdownEntry[] {
  const entries = [...counts.entries()].map(([key, count]) => ({
    key,
    label: labelFor(key),
    count,
    percent: denominator > 0 ? round1((count / denominator) * 100) : 0,
  }));
  entries.sort((a, b) => b.count - a.count);
  return entries;
}

function topKey(map: Map<string, number>): string | undefined {
  let bestKey: string | undefined;
  let best = -1;
  for (const [key, count] of map) {
    if (count > best) {
      best = count;
      bestKey = key;
    }
  }
  return bestKey;
}

function addCount<K>(map: Map<K, number>, key: K, delta: number): void {
  map.set(key, (map.get(key) ?? 0) + delta);
}

function mergeCountMap(target: Map<string, number>, source: Map<string, number>): void {
  for (const [key, value] of source) {
    target.set(key, (target.get(key) ?? 0) + value);
  }
}

const AI_ACTION_LABELS: Record<AiActionType, string> = {
  commit: "AI commits",
  pr: "AI pull requests",
  conflict: "Conflicts resolved",
};

type AiActionAccumulator = Map<
  AiActionType,
  { count: number; providers: Map<string, number>; models: Map<string, number> }
>;

function accumulateAiActionRow(byType: AiActionAccumulator, row: CoreUsageEventRow): void {
  if (!row.kind.startsWith("ai_")) return;
  const type = row.kind.slice(3) as AiActionType;
  if (type !== "commit" && type !== "pr" && type !== "conflict") return;
  let entry = byType.get(type);
  if (!entry) {
    entry = { count: 0, providers: new Map(), models: new Map() };
    byType.set(type, entry);
  }
  entry.count += 1;
  if (row.provider) addCount(entry.providers, row.provider, 1);
  if (row.model) addCount(entry.models, row.model, 1);
}

function mergeAiActions(target: AiActionAccumulator, source: AiActionAccumulator): void {
  for (const [type, srcEntry] of source) {
    let entry = target.get(type);
    if (!entry) {
      entry = { count: 0, providers: new Map(), models: new Map() };
      target.set(type, entry);
    }
    entry.count += srcEntry.count;
    mergeCountMap(entry.providers, srcEntry.providers);
    mergeCountMap(entry.models, srcEntry.models);
  }
}

function finalizeAiActions(byType: AiActionAccumulator): ProfileAiAction[] {
  const out: ProfileAiAction[] = [];
  for (const type of ["commit", "pr", "conflict"] as AiActionType[]) {
    const entry = byType.get(type);
    if (!entry) continue;
    const topProvider = topKey(entry.providers);
    const topModel = topKey(entry.models);
    out.push({
      type,
      label: AI_ACTION_LABELS[type],
      count: entry.count,
      ...(topProvider ? { topProvider: providerLabel(baseAgentKind(topProvider)) } : {}),
      ...(topModel ? { topModel } : {}),
    });
  }
  return out;
}

function isGenericMcpName(name: string): boolean {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return normalized === "mcp" || normalized === "mcptoolcall";
}

function topSkillsByCount(
  counts: Map<string, number>,
  kind: ProfileSkillUsage["kind"],
  display: (name: string) => string,
): ProfileSkillUsage[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SKILLS)
    .map(([name, runCount]) => ({ name, displayName: display(name), kind, runCount }));
}

// -- Incremental core rollup ------------------------------------------

interface CoreDailyProviderBucket {
  dayIndex: number;
  provider: string | null;
  totalThreads: number;
  modeCounts: Map<string, number>;
  messagesSent: number;
  goalsSet: number;
  totalTurns: number;
  longestTaskMs: number;
  totalTurnMs: number;
  hourCounts: Map<number, number>;
  modelCounts: Map<string, number>;
  fastTurns: number;
  effortTurns: number;
  effortCounts: Map<string, number>;
  skillCounts: Map<string, number>;
  totalSkillsUsed: number;
  workflowRuns: number;
  subagentRuns: number;
  mcpToolCalls: number;
  mcpCounts: Map<string, number>;
  aiActions: AiActionAccumulator;
}

function emptyDailyBucket(dayIndex: number, provider: string | null): CoreDailyProviderBucket {
  return {
    dayIndex,
    provider,
    totalThreads: 0,
    modeCounts: new Map(),
    messagesSent: 0,
    goalsSet: 0,
    totalTurns: 0,
    longestTaskMs: 0,
    totalTurnMs: 0,
    hourCounts: new Map(),
    modelCounts: new Map(),
    fastTurns: 0,
    effortTurns: 0,
    effortCounts: new Map(),
    skillCounts: new Map(),
    totalSkillsUsed: 0,
    workflowRuns: 0,
    subagentRuns: 0,
    mcpToolCalls: 0,
    mcpCounts: new Map(),
    aiActions: new Map(),
  };
}

export interface CoreRollupSnapshot {
  offset: number;
  firstRowId: number;
  lastRowId: number;
  accountStats: Array<[string, { count: number; firstId: number }]>;
  buckets: CoreDailyProviderBucket[];
}

interface CoreRollupCache {
  resetGeneration: number;
  offset: number;
  firstRowId: number;
  lastRowId: number;
  accountStats: Map<string, { count: number; firstId: number }>;
  buckets: Map<string, CoreDailyProviderBucket>;
}

let coreRollupCache: CoreRollupCache | undefined;

export function hasWarmCoreRollup(offset: number, resetGeneration: number): boolean {
  return (
    coreRollupCache !== undefined &&
    coreRollupCache.resetGeneration === resetGeneration &&
    coreRollupCache.offset === offset
  );
}

export function installCoreRollupSnapshotIfCold(
  snapshot: CoreRollupSnapshot,
  resetGeneration: number,
): void {
  if (
    getProfileUsageResetGeneration() === resetGeneration &&
    !hasWarmCoreRollup(snapshot.offset, resetGeneration)
  ) {
    coreRollupCache = cacheFromCoreSnapshot(snapshot, resetGeneration);
  }
}

function applyCoreEventRows(
  buckets: Map<string, CoreDailyProviderBucket>,
  rows: Iterable<CoreUsageEventRow>,
  offset: number,
): void {
  for (const row of rows) {
    const dayIndex = localDayIndex(row.ts, offset);
    const key = `${dayIndex}\0${row.provider ?? ""}\0${row.provider === null ? "0" : "1"}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = emptyDailyBucket(dayIndex, row.provider);
      buckets.set(key, bucket);
    }

    switch (row.kind) {
      case "thread_started": {
        bucket.totalThreads++;
        const mode = row.mode === "chat" ? "chat" : "cli";
        addCount(bucket.modeCounts, mode, 1);
        break;
      }
      case "message": {
        bucket.messagesSent++;
        break;
      }
      case "goal": {
        bucket.goalsSet++;
        break;
      }
      case "turn": {
        bucket.totalTurns++;
        const turnMs = Math.max(0, row.value);
        if (turnMs > bucket.longestTaskMs) bucket.longestTaskMs = turnMs;
        bucket.totalTurnMs += turnMs;
        addCount(bucket.hourCounts, localHour(row.ts, offset), 1);
        if (row.model) {
          addCount(bucket.modelCounts, modelKey(row.provider, row.model), 1);
        }
        if (row.fast) bucket.fastTurns++;
        if (row.effort) {
          bucket.effortTurns++;
          addCount(bucket.effortCounts, row.effort, 1);
        }
        break;
      }
      case "skill": {
        const name = row.name?.trim();
        if (!name || name.toLowerCase() === "skill") break;
        addCount(bucket.skillCounts, name, 1);
        bucket.totalSkillsUsed++;
        break;
      }
      case "workflow": {
        bucket.workflowRuns++;
        break;
      }
      case "subagent": {
        if ((row.name ?? "").trim().toLowerCase() === "workflow") bucket.workflowRuns++;
        else bucket.subagentRuns++;
        break;
      }
      case "mcp": {
        const name = row.name?.trim();
        if (!name || isGenericMcpName(name) || isGenericMcpName(mcpServerLabel(name))) break;
        bucket.mcpToolCalls++;
        if (name.toLowerCase() === "codex_apps") break;
        addCount(bucket.mcpCounts, name, 1);
        break;
      }
      default: {
        accumulateAiActionRow(bucket.aiActions, row);
        break;
      }
    }
  }
}

function buildCoreRollupInRange(
  offset: number,
  resetGeneration: number,
  existing?: CoreRollupCache,
): CoreRollupCache {
  const bounds = dbQueryUsageEventsBounds();
  const canAppend =
    existing !== undefined &&
    existing.resetGeneration === resetGeneration &&
    existing.offset === offset &&
    bounds.maxId >= existing.lastRowId &&
    !(existing.firstRowId > 0 && bounds.minId > 0 && bounds.minId !== existing.firstRowId) &&
    !(existing.lastRowId > 0 && bounds.maxId === 0);

  if (canAppend && bounds.maxId === existing.lastRowId) {
    return existing;
  }

  if (canAppend) {
    if (bounds.maxId > existing.lastRowId) {
      for (const row of dbIterateUsageAccountRowsInRange(existing.lastRowId, bounds.maxId)) {
        const prev = existing.accountStats.get(row.provider);
        if (prev) {
          prev.count += 1;
        } else {
          existing.accountStats.set(row.provider, { count: 1, firstId: row.id });
        }
      }
      applyCoreEventRows(
        existing.buckets,
        dbIterateCoreUsageEventsInRange(existing.lastRowId, bounds.maxId),
        offset,
      );
      if (existing.firstRowId === 0 && bounds.minId > 0) {
        existing.firstRowId = bounds.minId;
      }
      existing.lastRowId = bounds.maxId;
    }
    return existing;
  }

  const accountStats = new Map<string, { count: number; firstId: number }>();
  const buckets = new Map<string, CoreDailyProviderBucket>();
  if (bounds.maxId > 0) {
    for (const row of dbQueryUsageAccountCountsUpTo(bounds.maxId)) {
      accountStats.set(row.provider, { count: row.count, firstId: row.firstId });
    }
    applyCoreEventRows(buckets, dbIterateCoreUsageEventsInRange(0, bounds.maxId), offset);
  }
  return {
    resetGeneration,
    offset,
    firstRowId: bounds.minId,
    lastRowId: bounds.maxId,
    accountStats,
    buckets,
  };
}

/** Cold worker-safe snapshot builder (runs inside AsyncDatabaseReads or inline). */
export function buildCoreRollupSnapshot(offset: number): CoreRollupSnapshot {
  const rollup = buildCoreRollupInRange(offset, getProfileUsageResetGeneration());
  return {
    offset: rollup.offset,
    firstRowId: rollup.firstRowId,
    lastRowId: rollup.lastRowId,
    accountStats: [...rollup.accountStats.entries()],
    buckets: [...rollup.buckets.values()],
  };
}

function cacheFromCoreSnapshot(
  snapshot: CoreRollupSnapshot,
  resetGeneration: number,
): CoreRollupCache {
  const buckets = new Map<string, CoreDailyProviderBucket>();
  for (const bucket of snapshot.buckets) {
    const key = `${bucket.dayIndex}\0${bucket.provider ?? ""}\0${bucket.provider === null ? "0" : "1"}`;
    buckets.set(key, bucket);
  }
  return {
    resetGeneration,
    offset: snapshot.offset,
    firstRowId: snapshot.firstRowId,
    lastRowId: snapshot.lastRowId,
    accountStats: new Map(snapshot.accountStats),
    buckets,
  };
}

function getOrUpdateCoreRollupSync(offset: number): CoreRollupCache {
  const resetGeneration = getProfileUsageResetGeneration();
  coreRollupCache = buildCoreRollupInRange(offset, resetGeneration, coreRollupCache);
  return coreRollupCache;
}

// -- Entry point ------------------------------------------------------

function emptyTotals(): ProfileTotals {
  return {
    totalThreads: 0,
    totalPrompts: 0,
    messagesSent: 0,
    goalsSet: 0,
    longestTaskMs: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    activeDays: 0,
  };
}

function emptyCoreStats(
  device: ProfileDevice,
  req: ProfileStatsRequest,
  generatedAt: number,
  todayIndex: number,
): ProfileCoreStats {
  const { heatmap } = buildHeatmap(new Map(), todayIndex, "prompts", statsWindowDays(req.window));
  return {
    scope: req.scope ?? "device",
    device,
    generatedAt,
    timezoneOffsetMinutes: req.utcOffsetMinutes,
    identity: getProfileIdentity(),
    totals: emptyTotals(),
    promptHeatmap: heatmap,
    insights: {
      fastModePercent: 0,
      skillsExplored: 0,
      totalSkillsUsed: 0,
      workflowRuns: 0,
      subagentRuns: 0,
      mcpToolCalls: 0,
    },
    modes: [],
    providers: [],
    accounts: [],
    models: [],
    skills: [],
    mcps: [],
    aiActions: [],
    availableAccounts: [],
  };
}

interface CoreCacheEntry {
  generation: number;
  maxId: number;
  result: ProfileCoreStats;
}
let coreCacheGeneration = -1;
const coreCache = new Map<string, CoreCacheEntry>();

function isWeekendDayIndex(dayIndex: number): boolean {
  const dayOfWeek = new Date(dayIndex * 86_400_000).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function sparseHours(hourCounts: Map<number, number>): ProfileHourBucket[] {
  return [...hourCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([hour, count]) => ({ hour, count }));
}

interface CorePeriodAccumulator {
  days: number;
  startIndex: number;
  endIndex: number;
  activeDays: Set<number>;
  threads: number;
  prompts: number;
  messages: number;
  goals: number;
  longestTaskMs: number;
  totalTurnMs: number;
  fastTurns: number;
  effortTurns: number;
  skillsUsed: number;
  workflowRuns: number;
  subagentRuns: number;
  mcpToolCalls: number;
  weekdayPrompts: number;
  weekendPrompts: number;
  providerCounts: Map<string, number>;
  modelCounts: Map<string, number>;
  modeCounts: Map<string, number>;
  effortCounts: Map<string, number>;
  hourCounts: Map<number, number>;
  skillCounts: Map<string, number>;
  mcpCounts: Map<string, number>;
  aiActions: AiActionAccumulator;
}

function createPeriodAccumulator(startIndex: number, endIndex: number): CorePeriodAccumulator {
  return {
    days: endIndex - startIndex + 1,
    startIndex,
    endIndex,
    activeDays: new Set(),
    threads: 0,
    prompts: 0,
    messages: 0,
    goals: 0,
    longestTaskMs: 0,
    totalTurnMs: 0,
    fastTurns: 0,
    effortTurns: 0,
    skillsUsed: 0,
    workflowRuns: 0,
    subagentRuns: 0,
    mcpToolCalls: 0,
    weekdayPrompts: 0,
    weekendPrompts: 0,
    providerCounts: new Map(),
    modelCounts: new Map(),
    modeCounts: new Map(),
    effortCounts: new Map(),
    hourCounts: new Map(),
    skillCounts: new Map(),
    mcpCounts: new Map(),
    aiActions: new Map(),
  };
}

function addBucketToPeriod(acc: CorePeriodAccumulator, bucket: CoreDailyProviderBucket): void {
  if (bucket.dayIndex < acc.startIndex || bucket.dayIndex > acc.endIndex) return;
  acc.threads += bucket.totalThreads;
  mergeCountMap(acc.modeCounts, bucket.modeCounts);
  acc.messages += bucket.messagesSent;
  acc.goals += bucket.goalsSet;
  if (bucket.totalTurns > 0) {
    acc.prompts += bucket.totalTurns;
    if (bucket.longestTaskMs > acc.longestTaskMs) acc.longestTaskMs = bucket.longestTaskMs;
    acc.totalTurnMs += bucket.totalTurnMs;
    acc.activeDays.add(bucket.dayIndex);
    if (isWeekendDayIndex(bucket.dayIndex)) acc.weekendPrompts += bucket.totalTurns;
    else acc.weekdayPrompts += bucket.totalTurns;
    for (const [hour, count] of bucket.hourCounts) {
      acc.hourCounts.set(hour, (acc.hourCounts.get(hour) ?? 0) + count);
    }
    if (bucket.provider) {
      addCount(acc.providerCounts, baseAgentKind(bucket.provider), bucket.totalTurns);
    }
    mergeCountMap(acc.modelCounts, bucket.modelCounts);
    acc.fastTurns += bucket.fastTurns;
    acc.effortTurns += bucket.effortTurns;
    mergeCountMap(acc.effortCounts, bucket.effortCounts);
  }
  mergeCountMap(acc.skillCounts, bucket.skillCounts);
  acc.skillsUsed += bucket.totalSkillsUsed;
  acc.workflowRuns += bucket.workflowRuns;
  acc.subagentRuns += bucket.subagentRuns;
  acc.mcpToolCalls += bucket.mcpToolCalls;
  mergeCountMap(acc.mcpCounts, bucket.mcpCounts);
  mergeAiActions(acc.aiActions, bucket.aiActions);
}

function finalizePeriodSnapshot(acc: CorePeriodAccumulator): ProfilePeriodSnapshot {
  return {
    days: acc.days,
    activeDays: acc.activeDays.size,
    threads: acc.threads,
    prompts: acc.prompts,
    messages: acc.messages,
    goals: acc.goals,
    longestTaskMs: acc.longestTaskMs,
    totalTurnMs: acc.totalTurnMs,
    fastTurns: acc.fastTurns,
    effortTurns: acc.effortTurns,
    skillsUsed: acc.skillsUsed,
    workflowRuns: acc.workflowRuns,
    subagentRuns: acc.subagentRuns,
    mcpToolCalls: acc.mcpToolCalls,
    weekdayPrompts: acc.weekdayPrompts,
    weekendPrompts: acc.weekendPrompts,
    providers: rank(acc.providerCounts, providerLabel, acc.prompts),
    models: rank(acc.modelCounts, modelLabel, acc.prompts),
    modes: rank(acc.modeCounts, (m) => (m === "chat" ? "Chat" : "CLI"), acc.threads),
    efforts: rank(acc.effortCounts, (e) => titleCase(e), acc.effortTurns),
    hours: sparseHours(acc.hourCounts),
    skills: topSkillsByCount(acc.skillCounts, "skill", (n) => n),
    mcps: topSkillsByCount(acc.mcpCounts, "mcp", mcpServerLabel),
    aiActions: finalizeAiActions(acc.aiActions),
  };
}

function assembleCoreStatsFromRollup(
  rollup: CoreRollupCache,
  currentDevice: ProfileDevice,
  req: ProfileStatsRequest,
  generatedAt: number,
  todayIndex: number,
): ProfileCoreStats {
  const offset = req.utcOffsetMinutes;

  // The account picker lists every account ever seen, independent of the active
  // filter, so selecting one account doesn't collapse the picker to itself.
  const availableAccounts = [...rollup.accountStats.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].firstId - b[1].firstId)
    .map(([provider]) => ({
      key: provider,
      label: accountLabel(provider),
    }));

  const windowDays = statsWindowDays(req.window);
  const startIndex = windowDays ? windowStartIndex(todayIndex, windowDays) : undefined;
  const recentCutoff = todayIndex - 59;
  const periodToday = createPeriodAccumulator(todayIndex, todayIndex);
  const periodYesterday = createPeriodAccumulator(todayIndex - 1, todayIndex - 1);
  const periodLast7d = createPeriodAccumulator(todayIndex - 6, todayIndex);
  const periodPrev7d = createPeriodAccumulator(todayIndex - 13, todayIndex - 7);
  const periodLast30d = createPeriodAccumulator(todayIndex - 29, todayIndex);
  const periodPrev30d = createPeriodAccumulator(todayIndex - 59, todayIndex - 30);

  const modeCounts = new Map<string, number>();
  let totalThreads = 0;

  const countsByDay = new Map<string, number>();
  const activeDayIndices = new Set<number>();
  const hourCounts = new Map<number, number>();
  const providerCounts = new Map<string, number>();
  const accountCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();
  const effortCounts = new Map<string, number>();
  let totalTurns = 0;
  let longestTaskMs = 0;
  let fastTurns = 0;
  let effortTurns = 0;
  let messagesSent = 0;
  let goalsSet = 0;

  const skillCounts = new Map<string, number>();
  const mcpCounts = new Map<string, number>();
  let totalSkillsUsed = 0;
  let workflowRuns = 0;
  let subagentRuns = 0;
  let mcpToolCalls = 0;

  const aiActionsByType: AiActionAccumulator = new Map();

  for (const bucket of rollup.buckets.values()) {
    if (req.provider && bucket.provider !== req.provider) continue;
    if (bucket.dayIndex >= recentCutoff && bucket.dayIndex <= todayIndex) {
      addBucketToPeriod(periodToday, bucket);
      addBucketToPeriod(periodYesterday, bucket);
      addBucketToPeriod(periodLast7d, bucket);
      addBucketToPeriod(periodPrev7d, bucket);
      addBucketToPeriod(periodLast30d, bucket);
      addBucketToPeriod(periodPrev30d, bucket);
    }
    if (
      startIndex !== undefined &&
      (bucket.dayIndex < startIndex || bucket.dayIndex > todayIndex)
    ) {
      continue;
    }

    totalThreads += bucket.totalThreads;
    mergeCountMap(modeCounts, bucket.modeCounts);
    messagesSent += bucket.messagesSent;
    goalsSet += bucket.goalsSet;
    if (bucket.totalTurns > 0) {
      totalTurns += bucket.totalTurns;
      if (bucket.longestTaskMs > longestTaskMs) longestTaskMs = bucket.longestTaskMs;
      const day = dayKeyFromIndex(bucket.dayIndex);
      addCount(countsByDay, day, bucket.totalTurns);
      activeDayIndices.add(bucket.dayIndex);
      for (const [hour, count] of bucket.hourCounts) {
        hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + count);
      }
      if (bucket.provider) {
        addCount(providerCounts, baseAgentKind(bucket.provider), bucket.totalTurns);
        addCount(accountCounts, bucket.provider, bucket.totalTurns);
      }
      mergeCountMap(modelCounts, bucket.modelCounts);
      fastTurns += bucket.fastTurns;
      effortTurns += bucket.effortTurns;
      mergeCountMap(effortCounts, bucket.effortCounts);
    }
    mergeCountMap(skillCounts, bucket.skillCounts);
    totalSkillsUsed += bucket.totalSkillsUsed;
    workflowRuns += bucket.workflowRuns;
    subagentRuns += bucket.subagentRuns;
    mcpToolCalls += bucket.mcpToolCalls;
    mergeCountMap(mcpCounts, bucket.mcpCounts);
    mergeAiActions(aiActionsByType, bucket.aiActions);
  }

  const modes = rank(modeCounts, (m) => (m === "chat" ? "Chat" : "CLI"), totalThreads);
  const { heatmap: promptHeatmap, activeDays } = buildHeatmap(
    countsByDay,
    todayIndex,
    "prompts",
    windowDays,
  );
  const { current: currentStreakDays, longest: longestStreakDays } = computeStreaks(
    activeDayIndices,
    todayIndex,
  );

  const providers = rank(providerCounts, providerLabel, totalTurns);
  const accounts = rank(accountCounts, accountLabel, totalTurns);
  const models = rank(modelCounts, modelLabel, totalTurns);
  const reasoning = rank(effortCounts, (e) => titleCase(e), effortTurns);

  let mostActiveHour: ProfileInsights["mostActiveHour"];
  let bestHourCount = 0;
  for (const [hour, count] of hourCounts) {
    if (count > bestHourCount) {
      bestHourCount = count;
      mostActiveHour = { hour, label: hourLabel(hour), count };
    }
  }

  const skills = topSkillsByCount(skillCounts, "skill", (n) => n);
  const mcps = topSkillsByCount(mcpCounts, "mcp", mcpServerLabel);

  const totals: ProfileTotals = {
    totalThreads,
    totalPrompts: totalTurns,
    messagesSent,
    goalsSet,
    longestTaskMs,
    currentStreakDays,
    longestStreakDays,
    activeDays,
  };

  const insights: ProfileInsights = {
    ...(providers[0] ? { topProvider: providers[0] } : {}),
    ...(models[0] ? { topModel: models[0] } : {}),
    ...(reasoning[0] ? { topReasoning: reasoning[0] } : {}),
    fastModePercent: totalTurns > 0 ? round1((fastTurns / totalTurns) * 100) : 0,
    ...(mostActiveHour ? { mostActiveHour } : {}),
    skillsExplored: skillCounts.size,
    totalSkillsUsed,
    workflowRuns,
    subagentRuns,
    mcpToolCalls,
  };

  const recent: ProfileRecentActivity = {
    today: finalizePeriodSnapshot(periodToday),
    yesterday: finalizePeriodSnapshot(periodYesterday),
    last7d: finalizePeriodSnapshot(periodLast7d),
    prev7d: finalizePeriodSnapshot(periodPrev7d),
    last30d: finalizePeriodSnapshot(periodLast30d),
    prev30d: finalizePeriodSnapshot(periodPrev30d),
    windowHours: sparseHours(hourCounts),
  };

  return {
    scope: req.scope ?? "device",
    device: currentDevice,
    generatedAt,
    timezoneOffsetMinutes: offset,
    identity: getProfileIdentity(),
    totals,
    promptHeatmap,
    insights,
    providers,
    accounts,
    models,
    modes,
    skills,
    mcps,
    aiActions: finalizeAiActions(aiActionsByType),
    availableAccounts,
    recent,
  };
}

function coreResultKey(req: ProfileStatsRequest, todayIndex: number): string {
  return `${req.utcOffsetMinutes}|${todayIndex}|${req.scope ?? "device"}|${req.deviceId ?? "current"}|${req.provider ?? "all"}|${req.window ?? "all"}`;
}

export function getCachedProfileCoreStats(req: ProfileStatsRequest): ProfileCoreStats | undefined {
  const cached = coreCache.get(coreResultKey(req, localDayIndex(Date.now(), req.utcOffsetMinutes)));
  return cached?.generation === getProfileDataGeneration() ? cached.result : undefined;
}

export function computeProfileCoreStats(req: ProfileStatsRequest): ProfileCoreStats {
  const existing = getCachedProfileCoreStats(req);
  if (existing) return existing;
  const offset = req.utcOffsetMinutes;
  const generatedAt = Date.now();
  const todayIndex = localDayIndex(generatedAt, offset);

  const generation = getProfileDataGeneration();
  if (coreCacheGeneration !== generation) {
    coreCache.clear();
    coreCacheGeneration = generation;
  }
  const cacheKey = coreResultKey(req, todayIndex);
  const currentDevice = recordCurrentDevice();
  const targetDeviceId =
    req.scope === "all" ? currentDevice.id : (req.deviceId ?? currentDevice.id);
  if (targetDeviceId !== currentDevice.id) {
    const cached = coreCache.get(cacheKey);
    if (cached && cached.generation === generation) return cached.result;
    const empty = emptyCoreStats(
      resolveProfileDevice(targetDeviceId),
      req,
      generatedAt,
      todayIndex,
    );
    coreCache.set(cacheKey, { generation, maxId: 0, result: empty });
    return empty;
  }

  const rollup = getOrUpdateCoreRollupSync(offset);
  const cached = coreCache.get(cacheKey);
  if (cached && cached.generation === generation && cached.maxId === rollup.lastRowId) {
    return cached.result;
  }

  const result = assembleCoreStatsFromRollup(rollup, currentDevice, req, generatedAt, todayIndex);
  coreCache.set(cacheKey, { generation, maxId: rollup.lastRowId, result });
  return result;
}
