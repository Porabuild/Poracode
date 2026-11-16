import { emptyCostTotals, mergeCostTotals } from "@/shared/profile/costTotals";
import { computeStreaks, intensityFor } from "@/shared/profile/activity";
import type {
  AiActionType,
  ProfileAiAction,
  ProfileBreakdownEntry,
  ProfileCoreStats,
  ProfileDevice,
  ProfileHeatmap,
  ProfileHeatmapCell,
  ProfileIdentity,
  ProfileSkillUsage,
  ProfileTokenProvider,
  ProfileTokenStats,
} from "@/shared/contracts";
import type { ProfileCostStats, ProfileCostTotals } from "@/shared/contracts/costHistory";

// View-only metadata: public host responses and persisted usage remain unchanged.
export interface ProfileCoreViewStats extends ProfileCoreStats {
  incompleteDetails?: { skills: boolean; mcps: boolean; streaks: boolean };
}
export interface ProfileTokenViewStats extends ProfileTokenStats {
  incompletePeak?: boolean;
}

const MAX_SKILLS = 8;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
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
      if (existing) existing.count += item.count;
      else byType.set(item.type, { type: item.type, label: item.label, count: item.count });
    }
  }
  return (["commit", "pr", "conflict"] as const).flatMap((type) => {
    const entry = byType.get(type);
    return entry ? [entry] : [];
  });
}

/** Merge core stats blobs from multiple devices into one unified "All devices" view. */
export function mergeProfileCoreStats(
  blobs: readonly ProfileCoreStats[],
  identityOverride?: ProfileIdentity | null,
  deviceOverride?: ProfileDevice,
): ProfileCoreViewStats {
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

  // Per-host winners and top-eight lists cannot reconstruct global rankings.
  // Keep complete distributions additive; expose unavailable details per device.
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
    availableAccounts: [...availableAccountsMap.entries()].map(([key, label]) => ({ key, label })),
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

function mergeProfileCostStats(costStats: readonly ProfileCostStats[]): ProfileCostStats {
  const totals = emptyCostTotals();
  const daysMap = new Map<string, ProfileCostTotals>();
  const pricingMap = new Map<string, ProfileCostStats["pricing"][number]>();

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

/** Merge token & cost stats blobs from multiple devices into one unified "All devices" view. */
export function mergeProfileTokenStats(
  blobs: readonly ProfileTokenStats[],
  deviceOverride?: ProfileDevice,
): ProfileTokenViewStats {
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
