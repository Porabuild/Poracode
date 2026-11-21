import type {
  AiActionType,
  ProfileAiAction,
  ProfileBreakdownEntry,
  ProfileCoreStats,
  ProfileDevice,
  ProfileHeatmap,
  ProfileHeatmapCell,
  ProfileHourBucket,
  ProfileIdentity,
  ProfileInsights,
  ProfilePeriodSnapshot,
  ProfileRecentActivity,
  ProfileRecentTokenActivity,
  ProfileSkillUsage,
  ProfileTokenPeriodSnapshot,
  ProfileTokenProvider,
  ProfileTokenStats,
} from "../contracts";
import type { ProfileCostStats, ProfileCostTotals } from "../contracts/costHistory";
import { computeStreaks, intensityFor } from "./activity";
import { emptyCostTotals, mergeCostTotals } from "./costTotals";

export interface MergedProfileCoreStats extends ProfileCoreStats {
  incompleteDetails?: { skills: boolean; mcps: boolean; streaks: boolean };
}

export interface MergedProfileTokenStats extends ProfileTokenStats {
  incompletePeak?: boolean;
}

const MAX_SKILLS = 8;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

function mergeHeatmaps(heatmaps: readonly ProfileHeatmap[]): {
  heatmap: ProfileHeatmap;
  activeDays: number;
  activeDayStrings: string[];
} {
  const first = heatmaps[0]!;
  const countsByDay = new Map<string, number>();
  const orderedDays: string[] = [];

  for (const hm of heatmaps) {
    for (const cell of hm.cells) {
      if (!countsByDay.has(cell.day)) orderedDays.push(cell.day);
      countsByDay.set(cell.day, (countsByDay.get(cell.day) ?? 0) + cell.count);
    }
  }
  orderedDays.sort((a, b) => a.localeCompare(b));

  let max = 0;
  let activeDays = 0;
  const activeDayStrings: string[] = [];
  for (const day of orderedDays) {
    const count = countsByDay.get(day) ?? 0;
    if (count > max) max = count;
    if (count > 0) {
      activeDays++;
      activeDayStrings.push(day);
    }
  }

  const cells: ProfileHeatmapCell[] = orderedDays.map((day) => {
    const count = countsByDay.get(day) ?? 0;
    return {
      day,
      count,
      intensity: intensityFor(count, max),
    };
  });

  return {
    heatmap: {
      metric: first.metric,
      windowDays: Math.max(...heatmaps.map((hm) => hm.windowDays)),
      cells,
      max,
    },
    activeDays,
    activeDayStrings,
  };
}

function dayEpochIndex(day: string): number {
  const [y, m, d] = day.split("-").map((part) => Number.parseInt(part, 10));
  return Math.floor(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

function streaksFromHeatmapDays(
  activeDays: readonly string[],
  allOrderedDays: readonly ProfileHeatmapCell[],
): { current: number; longest: number } {
  if (activeDays.length === 0 || allOrderedDays.length === 0) {
    return { current: 0, longest: 0 };
  }
  const activeSet = new Set(activeDays.map(dayEpochIndex));
  const todayIndex = dayEpochIndex(allOrderedDays[allOrderedDays.length - 1]!.day);
  return computeStreaks(activeSet, todayIndex);
}

function mergeBreakdowns(
  lists: readonly (readonly ProfileBreakdownEntry[])[],
  denominator: number,
): ProfileBreakdownEntry[] {
  const byKey = new Map<string, { label: string; count: number }>();
  for (const list of lists) {
    for (const entry of list) {
      const existing = byKey.get(entry.key);
      if (existing) existing.count += entry.count;
      else byKey.set(entry.key, { label: entry.label, count: entry.count });
    }
  }
  return [...byKey.entries()]
    .map(([key, { label, count }]) => ({
      key,
      label,
      count,
      percent: denominator > 0 ? round1((count / denominator) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function mergeSkills(lists: readonly (readonly ProfileSkillUsage[])[]): ProfileSkillUsage[] {
  const byKey = new Map<string, ProfileSkillUsage>();
  for (const list of lists) {
    for (const item of list) {
      const mapKey = `${item.kind}:${item.name}`;
      const existing = byKey.get(mapKey);
      if (existing) existing.runCount += item.runCount;
      else byKey.set(mapKey, { ...item });
    }
  }
  return [...byKey.values()].sort((a, b) => b.runCount - a.runCount).slice(0, MAX_SKILLS);
}

function mergeAiActions(lists: readonly (readonly ProfileAiAction[])[]): ProfileAiAction[] {
  const byType = new Map<AiActionType, ProfileAiAction>();
  for (const list of lists) {
    for (const item of list) {
      const existing = byType.get(item.type);
      if (existing) {
        existing.count += item.count;
        delete existing.topProvider;
        delete existing.topModel;
      } else {
        byType.set(item.type, {
          type: item.type,
          label: item.label,
          count: item.count,
          ...(item.topProvider ? { topProvider: item.topProvider } : {}),
          ...(item.topModel ? { topModel: item.topModel } : {}),
        });
      }
    }
  }
  return (["commit", "pr", "conflict"] as const).flatMap((type) => {
    const found = byType.get(type);
    return found ? [found] : [];
  });
}

function mergeHours(lists: readonly (readonly ProfileHourBucket[])[]): ProfileHourBucket[] {
  const byHour = new Map<number, number>();
  for (const list of lists) {
    for (const bucket of list) {
      if (bucket.count <= 0) continue;
      byHour.set(bucket.hour, (byHour.get(bucket.hour) ?? 0) + bucket.count);
    }
  }
  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, count]) => ({ hour, count }));
}

function topActiveHourFromBuckets(
  hours: readonly ProfileHourBucket[],
): ProfileInsights["mostActiveHour"] {
  let best: ProfileHourBucket | undefined;
  for (const entry of hours) {
    if (!best || entry.count > best.count) best = entry;
  }
  if (!best || best.count <= 0) return undefined;
  return { hour: best.hour, label: formatHourLabel(best.hour), count: best.count };
}

export function mergePeriodSnapshots(
  snapshots: readonly ProfilePeriodSnapshot[],
): ProfilePeriodSnapshot {
  const first = snapshots[0]!;
  if (snapshots.length === 1) return first;

  let activeDays = 0;
  let threads = 0;
  let prompts = 0;
  let messages = 0;
  let goals = 0;
  let longestTaskMs = 0;
  let totalTurnMs = 0;
  let fastTurns = 0;
  let effortTurns = 0;
  let skillsUsed = 0;
  let workflowRuns = 0;
  let subagentRuns = 0;
  let mcpToolCalls = 0;
  let weekdayPrompts = 0;
  let weekendPrompts = 0;

  for (const s of snapshots) {
    if (s.activeDays > activeDays) activeDays = s.activeDays;
    threads += s.threads;
    prompts += s.prompts;
    messages += s.messages;
    goals += s.goals;
    if (s.longestTaskMs > longestTaskMs) longestTaskMs = s.longestTaskMs;
    totalTurnMs += s.totalTurnMs;
    fastTurns += s.fastTurns;
    effortTurns += s.effortTurns;
    skillsUsed += s.skillsUsed;
    workflowRuns += s.workflowRuns;
    subagentRuns += s.subagentRuns;
    mcpToolCalls += s.mcpToolCalls;
    weekdayPrompts += s.weekdayPrompts;
    weekendPrompts += s.weekendPrompts;
  }

  return {
    days: first.days,
    activeDays,
    threads,
    prompts,
    messages,
    goals,
    longestTaskMs,
    totalTurnMs,
    fastTurns,
    effortTurns,
    skillsUsed,
    workflowRuns,
    subagentRuns,
    mcpToolCalls,
    weekdayPrompts,
    weekendPrompts,
    providers: mergeBreakdowns(
      snapshots.map((s) => s.providers),
      prompts,
    ),
    models: mergeBreakdowns(
      snapshots.map((s) => s.models),
      prompts,
    ),
    modes: mergeBreakdowns(
      snapshots.map((s) => s.modes),
      threads,
    ),
    efforts: mergeBreakdowns(
      snapshots.map((s) => s.efforts),
      effortTurns,
    ),
    hours: mergeHours(snapshots.map((s) => s.hours)),
    skills: mergeSkills(snapshots.map((s) => s.skills)),
    mcps: mergeSkills(snapshots.map((s) => s.mcps)),
    aiActions: mergeAiActions(snapshots.map((s) => s.aiActions)),
  };
}

/**
 * Recompute period activeDays across devices using the combined heatmap cells
 * whenever available so a union of active days across hosts is accurate even
 * when hosts ran on disjoint days.
 */
function activeDaysInWindow(heatmap: ProfileHeatmap, days: number, offsetEndDays = 0): number {
  const end = heatmap.cells.length - offsetEndDays;
  const start = Math.max(0, end - days);
  let active = 0;
  for (let i = start; i < end; i++) {
    if ((heatmap.cells[i]?.count ?? 0) > 0) active++;
  }
  return active;
}

function mergeRecentActivity(
  blobs: readonly ProfileCoreStats[],
  mergedHeatmap: ProfileHeatmap,
): ProfileRecentActivity | undefined {
  const recents = blobs.map((b) => b.recent).filter((r): r is ProfileRecentActivity => Boolean(r));
  if (recents.length === 0) return undefined;

  const mergePeriod = (
    pick: (r: ProfileRecentActivity) => ProfilePeriodSnapshot,
    heatmapDays?: { days: number; offsetEnd: number },
  ): ProfilePeriodSnapshot => {
    const merged = mergePeriodSnapshots(recents.map(pick));
    if (heatmapDays && mergedHeatmap.cells.length >= heatmapDays.days + heatmapDays.offsetEnd) {
      return {
        ...merged,
        activeDays: activeDaysInWindow(mergedHeatmap, heatmapDays.days, heatmapDays.offsetEnd),
      };
    }
    return merged;
  };

  const windowHourLists = recents
    .map((r) => r.windowHours)
    .filter((h): h is ProfileHourBucket[] => Array.isArray(h));

  return {
    today: mergePeriod((r) => r.today),
    yesterday: mergePeriod((r) => r.yesterday),
    last7d: mergePeriod((r) => r.last7d, { days: 7, offsetEnd: 0 }),
    prev7d: mergePeriod((r) => r.prev7d, { days: 7, offsetEnd: 7 }),
    last30d: mergePeriod((r) => r.last30d, { days: 30, offsetEnd: 0 }),
    prev30d: mergePeriod((r) => r.prev30d, { days: 30, offsetEnd: 30 }),
    ...(windowHourLists.length === blobs.length
      ? { windowHours: mergeHours(windowHourLists) }
      : {}),
  };
}

/** Merge core stats blobs from multiple devices into one unified "All devices" view. */
export function mergeProfileCoreStats(
  blobs: readonly ProfileCoreStats[],
  identityOverride?: ProfileIdentity | null,
  deviceOverride?: ProfileDevice,
): MergedProfileCoreStats {
  const primary = blobs[0]!;
  if (blobs.length === 1) {
    return {
      ...primary,
      scope: "all",
      ...(identityOverride ? { identity: identityOverride } : {}),
      ...(deviceOverride ? { device: deviceOverride } : {}),
    };
  }

  let totalThreads = 0;
  let totalPrompts = 0;
  let messagesSent = 0;
  let goalsSet = 0;
  let longestTaskMs = 0;
  let maxCurrentStreak = 0;
  let maxLongestStreak = 0;
  let fastWeightedSum = 0;
  let totalSkillsUsed = 0;
  let workflowRuns = 0;
  let subagentRuns = 0;
  let mcpToolCalls = 0;

  const availableAccountsMap = new Map<string, string>();
  const skillKeys = new Set<string>();

  for (const blob of blobs) {
    totalThreads += blob.totals.totalThreads;
    totalPrompts += blob.totals.totalPrompts;
    messagesSent += blob.totals.messagesSent;
    goalsSet += blob.totals.goalsSet;
    if (blob.totals.longestTaskMs > longestTaskMs) longestTaskMs = blob.totals.longestTaskMs;
    if (blob.totals.currentStreakDays > maxCurrentStreak) {
      maxCurrentStreak = blob.totals.currentStreakDays;
    }
    if (blob.totals.longestStreakDays > maxLongestStreak) {
      maxLongestStreak = blob.totals.longestStreakDays;
    }
    fastWeightedSum += blob.insights.fastModePercent * blob.totals.totalPrompts;
    totalSkillsUsed += blob.insights.totalSkillsUsed;
    workflowRuns += blob.insights.workflowRuns;
    subagentRuns += blob.insights.subagentRuns;
    mcpToolCalls += blob.insights.mcpToolCalls;

    for (const acc of blob.availableAccounts) {
      if (!availableAccountsMap.has(acc.key)) availableAccountsMap.set(acc.key, acc.label);
    }
    for (const s of blob.skills) skillKeys.add(s.name);
  }

  const {
    heatmap: promptHeatmap,
    activeDays,
    activeDayStrings,
  } = mergeHeatmaps(blobs.map((b) => b.promptHeatmap));
  const computedStreaks = streaksFromHeatmapDays(activeDayStrings, promptHeatmap.cells);
  const currentStreakDays = Math.max(maxCurrentStreak, computedStreaks.current);
  const longestStreakDays = Math.max(maxLongestStreak, computedStreaks.longest);

  const providers = mergeBreakdowns(
    blobs.map((b) => b.providers),
    totalPrompts,
  );
  const accounts = mergeBreakdowns(
    blobs.map((b) => b.accounts),
    totalPrompts,
  );
  const models = mergeBreakdowns(
    blobs.map((b) => b.models),
    totalPrompts,
  );
  const modes = mergeBreakdowns(
    blobs.map((b) => b.modes),
    totalThreads,
  );
  const skills = mergeSkills(blobs.map((b) => b.skills));
  const mcps = mergeSkills(blobs.map((b) => b.mcps));
  const aiActions = mergeAiActions(blobs.map((b) => b.aiActions));
  const recent = mergeRecentActivity(blobs, promptHeatmap);
  const mostActiveHour = recent?.windowHours
    ? topActiveHourFromBuckets(recent.windowHours)
    : undefined;
  const allHaveRecent = blobs.every((b) => Boolean(b.recent));
  const topReasoning: ProfileBreakdownEntry | undefined = (() => {
    if (allHaveRecent && recent) {
      if (promptHeatmap.windowDays <= 7) return recent.last7d.efforts[0];
      if (promptHeatmap.windowDays <= 30) return recent.last30d.efforts[0];
      if (blobs.every((b) => b.recent!.last30d.prompts === b.totals.totalPrompts)) {
        return recent.last30d.efforts[0];
      }
    }
    const activeBlobs = blobs.filter((b) => b.totals.totalPrompts > 0 || b.insights.topReasoning);
    return activeBlobs.length === 1 ? activeBlobs[0]?.insights.topReasoning : undefined;
  })();
  const accountRank = new Map(accounts.map((entry, idx) => [entry.key, idx]));
  const availableAccounts = [...availableAccountsMap.entries()]
    .map(([key, label], order) => ({ key, label, order }))
    .sort(
      (a, b) =>
        (accountRank.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
          (accountRank.get(b.key) ?? Number.MAX_SAFE_INTEGER) || a.order - b.order,
    )
    .map(({ key, label }) => ({ key, label }));

  const incompleteDetails = {
    skills: blobs.some(
      (b) => b.skills.reduce((n, entry) => n + entry.runCount, 0) !== b.insights.totalSkillsUsed,
    ),
    mcps: blobs.some(
      (b) => b.mcps.reduce((n, entry) => n + entry.runCount, 0) !== b.insights.mcpToolCalls,
    ),
    streaks: blobs.some(
      (b) => b.promptHeatmap.cells.reduce((n, cell) => n + cell.count, 0) !== b.totals.totalPrompts,
    ),
  };

  return {
    scope: "all",
    incompleteDetails,
    device: deviceOverride ?? primary.device,
    generatedAt: Math.max(...blobs.map((b) => b.generatedAt)),
    timezoneOffsetMinutes: primary.timezoneOffsetMinutes,
    identity: identityOverride ?? primary.identity,
    totals: {
      totalThreads,
      totalPrompts,
      messagesSent,
      goalsSet,
      longestTaskMs,
      currentStreakDays,
      longestStreakDays,
      activeDays,
    },
    promptHeatmap,
    insights: {
      ...(providers[0] ? { topProvider: providers[0] } : {}),
      ...(models[0] ? { topModel: models[0] } : {}),
      ...(topReasoning ? { topReasoning } : {}),
      ...(mostActiveHour ? { mostActiveHour } : {}),
      fastModePercent: totalPrompts > 0 ? round1(fastWeightedSum / totalPrompts) : 0,
      skillsExplored: incompleteDetails.skills ? 0 : skillKeys.size,
      totalSkillsUsed,
      workflowRuns,
      subagentRuns,
      mcpToolCalls,
    },
    providers,
    accounts,
    models,
    modes,
    skills: incompleteDetails.skills ? [] : skills,
    mcps: incompleteDetails.mcps ? [] : mcps,
    aiActions,
    availableAccounts,
    ...(recent ? { recent } : {}),
  };
}

function mergeCostBreakdowns(
  lists: readonly (readonly ProfileCostStats["providers"][number][])[],
): ProfileCostStats["providers"] {
  const byKey = new Map<string, { label: string; totals: ProfileCostTotals }>();
  for (const list of lists) {
    for (const entry of list) {
      let target = byKey.get(entry.key);
      if (!target) {
        target = { label: entry.label, totals: emptyCostTotals() };
        byKey.set(entry.key, target);
      }
      mergeCostTotals(target.totals, entry.totals);
    }
  }
  return [...byKey.entries()]
    .map(([key, { label, totals }]) => ({ key, label, totals }))
    .sort((a, b) => b.totals.tokens - a.totals.tokens || a.key.localeCompare(b.key));
}

function hasAttributedUsage(entries: readonly ProfileCostStats["providers"][number][]): boolean {
  return entries.some(
    (entry) =>
      entry.key !== "" &&
      (entry.totals.tokens > 0 ||
        entry.totals.observedSamples > 0 ||
        entry.totals.estimatedSamples > 0),
  );
}

function mergeProfileCostStats(costStats: readonly ProfileCostStats[]): ProfileCostStats {
  const totals = emptyCostTotals();
  const daysMap = new Map<string, ProfileCostTotals>();
  const dayProvidersMap = new Map<
    string,
    { day: string; provider: string; totals: ProfileCostTotals }
  >();
  const dayModelsMap = new Map<string, { day: string; model: string; totals: ProfileCostTotals }>();
  const pricingMap = new Map<string, ProfileCostStats["pricing"][number]>();
  // Only emit cross-host daily breakdowns when every host with attributed usage
  // supplied them; mixing upgraded + pre-upgrade hosts falls back to aggregate `days`.
  let hasAnyDayProviders = false;
  let allActiveHaveDayProviders = true;
  let hasAnyDayModels = false;
  let allActiveHaveDayModels = true;

  for (const cost of costStats) {
    mergeCostTotals(totals, cost.totals);
    for (const dayEntry of cost.days) {
      let target = daysMap.get(dayEntry.day);
      if (!target) {
        target = emptyCostTotals();
        daysMap.set(dayEntry.day, target);
      }
      mergeCostTotals(target, dayEntry.totals);
    }
    if (cost.dayProviders !== undefined) {
      hasAnyDayProviders = true;
      for (const entry of cost.dayProviders) {
        const key = `${entry.day}\0${entry.provider}`;
        let target = dayProvidersMap.get(key);
        if (!target) {
          target = { day: entry.day, provider: entry.provider, totals: emptyCostTotals() };
          dayProvidersMap.set(key, target);
        }
        mergeCostTotals(target.totals, entry.totals);
      }
    } else if (hasAttributedUsage(cost.providers)) {
      allActiveHaveDayProviders = false;
    }
    if (cost.dayModels !== undefined) {
      hasAnyDayModels = true;
      for (const entry of cost.dayModels) {
        const key = `${entry.day}\0${entry.model}`;
        let target = dayModelsMap.get(key);
        if (!target) {
          target = { day: entry.day, model: entry.model, totals: emptyCostTotals() };
          dayModelsMap.set(key, target);
        }
        mergeCostTotals(target.totals, entry.totals);
      }
    } else if (hasAttributedUsage(cost.models)) {
      allActiveHaveDayModels = false;
    }
    for (const price of cost.pricing) {
      pricingMap.set(price.id, price);
    }
  }

  const days = [...daysMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayTotals]) => ({ day, totals: dayTotals }));

  return {
    totals,
    days,
    providers: mergeCostBreakdowns(costStats.map((c) => c.providers)),
    models: mergeCostBreakdowns(costStats.map((c) => c.models)),
    accounts: mergeCostBreakdowns(costStats.map((c) => c.accounts)),
    pricing: [...pricingMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    ...(hasAnyDayProviders && allActiveHaveDayProviders
      ? {
          dayProviders: [...dayProvidersMap.values()].sort(
            (a, b) => a.day.localeCompare(b.day) || a.provider.localeCompare(b.provider),
          ),
        }
      : {}),
    ...(hasAnyDayModels && allActiveHaveDayModels
      ? {
          dayModels: [...dayModelsMap.values()].sort(
            (a, b) => a.day.localeCompare(b.day) || a.model.localeCompare(b.model),
          ),
        }
      : {}),
  };
}

function mergeTokenProviders(
  lists: readonly (readonly ProfileTokenProvider[])[],
  lifetimeTokens: number,
): ProfileTokenProvider[] {
  const byKey = new Map<string, { label: string; tokens: number; estimatedCostUsd?: number }>();
  for (const list of lists) {
    for (const entry of list) {
      const existing = byKey.get(entry.provider);
      if (existing) {
        existing.tokens += entry.tokens;
        if (entry.estimatedCostUsd !== undefined) {
          existing.estimatedCostUsd = (existing.estimatedCostUsd ?? 0) + entry.estimatedCostUsd;
        }
      } else {
        byKey.set(entry.provider, {
          label: entry.label,
          tokens: entry.tokens,
          ...(entry.estimatedCostUsd !== undefined
            ? { estimatedCostUsd: entry.estimatedCostUsd }
            : {}),
        });
      }
    }
  }
  return [...byKey.entries()]
    .map(([provider, value]) => ({
      provider,
      label: value.label,
      tokens: value.tokens,
      percent: lifetimeTokens > 0 ? round1((value.tokens / lifetimeTokens) * 100) : 0,
      ...(value.estimatedCostUsd !== undefined ? { estimatedCostUsd: value.estimatedCostUsd } : {}),
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

function mergeTokenPeriodSnapshots(
  snapshots: readonly ProfileTokenPeriodSnapshot[],
): ProfileTokenPeriodSnapshot {
  if (snapshots.length === 1) return snapshots[0]!;
  let tokens = 0;
  let estimatedUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  const observedMap = new Map<string, number>();

  for (const s of snapshots) {
    tokens += s.tokens;
    estimatedUsd += s.estimatedUsd;
    inputTokens += s.inputTokens;
    outputTokens += s.outputTokens;
    cacheReadTokens += s.cacheReadTokens;
    cacheWriteTokens += s.cacheWriteTokens;
    for (const money of s.observed) {
      observedMap.set(money.currency, (observedMap.get(money.currency) ?? 0) + money.amount);
    }
  }

  return {
    tokens,
    estimatedUsd,
    observed: [...observedMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount })),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    providers: mergeTokenProviders(
      snapshots.map((s) => s.providers),
      tokens,
    ),
    models: mergeBreakdowns(
      snapshots.map((s) => s.models),
      tokens,
    ),
  };
}

function mergeRecentTokenActivity(
  blobs: readonly ProfileTokenStats[],
): ProfileRecentTokenActivity | undefined {
  const recents = blobs
    .map((b) => b.recent)
    .filter((r): r is ProfileRecentTokenActivity => Boolean(r));
  if (recents.length === 0) return undefined;
  return {
    today: mergeTokenPeriodSnapshots(recents.map((r) => r.today)),
    yesterday: mergeTokenPeriodSnapshots(recents.map((r) => r.yesterday)),
    last7d: mergeTokenPeriodSnapshots(recents.map((r) => r.last7d)),
    prev7d: mergeTokenPeriodSnapshots(recents.map((r) => r.prev7d)),
    last30d: mergeTokenPeriodSnapshots(recents.map((r) => r.last30d)),
    prev30d: mergeTokenPeriodSnapshots(recents.map((r) => r.prev30d)),
  };
}

/** Merge token & cost stats blobs from multiple devices into one unified "All devices" view. */
export function mergeProfileTokenStats(
  blobs: readonly ProfileTokenStats[],
  deviceOverride?: ProfileDevice,
): MergedProfileTokenStats {
  const primary = blobs[0]!;
  if (blobs.length === 1) {
    return {
      ...primary,
      scope: "all",
      ...(deviceOverride ? { device: deviceOverride } : {}),
    };
  }

  let lifetimeTokens = 0;
  const unavailableSet = new Set<string>();
  const costBlobs: ProfileCostStats[] = [];

  for (const blob of blobs) {
    lifetimeTokens += blob.lifetimeTokens;
    for (const key of blob.unavailableProviders) unavailableSet.add(key);
    if (blob.costs) costBlobs.push(blob.costs);
  }

  const { heatmap: tokenHeatmap } = mergeHeatmaps(blobs.map((b) => b.tokenHeatmap));
  const mergedCosts = costBlobs.length > 0 ? mergeProfileCostStats(costBlobs) : undefined;
  const mergedRecent = mergeRecentTokenActivity(blobs);

  let peakDay: string | undefined;
  let peakDayTokens = 0;
  for (const cell of tokenHeatmap.cells) {
    if (cell.count > peakDayTokens) {
      peakDayTokens = cell.count;
      peakDay = cell.day;
    }
  }
  if (mergedCosts) {
    for (const dayEntry of mergedCosts.days) {
      if (dayEntry.totals.tokens > peakDayTokens) {
        peakDayTokens = dayEntry.totals.tokens;
        peakDay = dayEntry.day;
      }
    }
  }
  const incompletePeak = blobs.some((blob) => {
    const knownDays =
      blob.costs?.days.map((day) => day.totals.tokens) ??
      blob.tokenHeatmap.cells.map((cell) => cell.count);
    return knownDays.reduce((sum, count) => sum + count, 0) !== blob.lifetimeTokens;
  });

  return {
    ...(mergedCosts ? { costs: mergedCosts } : {}),
    ...(mergedRecent ? { recent: mergedRecent } : {}),
    available: lifetimeTokens > 0,
    scope: "all",
    device: deviceOverride ?? primary.device,
    generatedAt: Math.max(...blobs.map((b) => b.generatedAt)),
    timezoneOffsetMinutes: primary.timezoneOffsetMinutes,
    windowDays: Math.max(...blobs.map((b) => b.windowDays)),
    lifetimeTokens,
    incompletePeak,
    peakDayTokens: incompletePeak ? 0 : peakDayTokens,
    ...(!incompletePeak && peakDay ? { peakDay } : {}),
    providers: mergeTokenProviders(
      blobs.map((b) => b.providers),
      lifetimeTokens,
    ),
    accounts: mergeTokenProviders(
      blobs.map((b) => b.accounts),
      lifetimeTokens,
    ),
    models: mergeBreakdowns(
      blobs.map((b) => b.models),
      lifetimeTokens,
    ),
    tokenHeatmap,
    unavailableProviders: [...unavailableSet].sort(),
  };
}
