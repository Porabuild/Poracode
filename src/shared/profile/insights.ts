import type {
  ProfileAiAction,
  ProfileBreakdownEntry,
  ProfileCoreStats,
  ProfileHourBucket,
  ProfilePeriodSnapshot,
  ProfileTokenStats,
} from "../contracts";

export type InsightCategory =
  | "switch"
  | "trend"
  | "yesterday"
  | "today"
  | "behavior"
  | "tokens"
  | "tools"
  | "env"
  | "milestone";

export interface ProfileEnvSummary {
  id: string;
  label: string;
  platform: string;
  isCurrent?: boolean;
  core: ProfileCoreStats;
  tokens?: ProfileTokenStats | null;
}

export interface ProfileInsightsInput {
  core: ProfileCoreStats | null;
  tokens?: ProfileTokenStats | null;
  envs?: readonly ProfileEnvSummary[];
}

export type ProfileInsightFact =
  | {
      id: "insight:streak";
      category: "milestone";
      subject: "streak";
      priority: number;
      current: number;
      longest: number;
    }
  | {
      id: "insight:week-prompts";
      category: "trend";
      subject: "week-prompts";
      priority: number;
      prompts: number;
      daily: number[];
      busiestDay: string | null;
    }
  | {
      id: "insight:top-model";
      category: "milestone";
      subject: "top-model";
      priority: number;
      label: string;
      percent: number;
    }
  | {
      id: "insight:active-hour";
      category: "behavior";
      subject: "time";
      priority: number;
      hour: number;
    }
  | {
      id: "insight:longest-task";
      category: "milestone";
      subject: "longest-task";
      priority: number;
      minutes: number;
    }
  | {
      id: "insight:provider-switch";
      category: "switch";
      subject: string;
      priority: number;
      fromLabel: string;
      toLabel: string;
      toPercent: number;
    }
  | {
      id: "insight:model-switch";
      category: "switch";
      subject: string;
      priority: number;
      fromLabel: string;
      toLabel: string;
      toPercent: number;
    }
  | {
      id: `insight:new-model:${string}`;
      category: "switch";
      subject: string;
      priority: number;
      model: string;
      prompts: number;
    }
  | {
      id: `insight:provider-delta:${string}`;
      category: "trend";
      subject: string;
      priority: number;
      provider: string;
      direction: "up" | "down";
      percent: number;
      current: number;
      previous: number;
      period: "7d" | "30d";
    }
  | {
      id: `insight:model-delta:${string}`;
      category: "trend";
      subject: string;
      priority: number;
      model: string;
      direction: "up" | "down";
      percent: number;
      current: number;
      previous: number;
    }
  | {
      id: "insight:week-velocity";
      category: "trend";
      subject: "week-velocity";
      priority: number;
      direction: "up" | "down";
      percent: number;
      current: number;
      previous: number;
    }
  | {
      id: "insight:month-velocity";
      category: "trend";
      subject: "month-velocity";
      priority: number;
      direction: "up" | "down";
      percent: number;
      current: number;
      previous: number;
    }
  | {
      id: "insight:week-active-days";
      category: "behavior";
      subject: "consistency";
      priority: number;
      activeDays: number;
      totalDays: number;
    }
  | {
      id: "insight:tokens-trend";
      category: "tokens";
      subject: "tokens-trend";
      priority: number;
      direction: "up" | "down";
      percent: number;
      tokens: number;
    }
  | {
      id: "insight:weekly-cost";
      category: "tokens";
      subject: "weekly-cost";
      priority: number;
      estimatedUsd: number;
      tokens: number;
    }
  | {
      id: "insight:cache-efficiency";
      category: "tokens";
      subject: "cache";
      priority: number;
      percent: number;
      cacheReadTokens: number;
    }
  | {
      id: "insight:yesterday-summary";
      category: "yesterday";
      subject: "yesterday";
      priority: number;
      prompts: number;
      topProvider?: string;
      topProviderPercent?: number;
      tokens?: number;
    }
  | {
      id: "insight:yesterday-spike";
      category: "yesterday";
      subject: "yesterday-pace";
      priority: number;
      prompts: number;
      multiplier: number;
    }
  | {
      id: "insight:yesterday-model";
      category: "yesterday";
      subject: string;
      priority: number;
      model: string;
      percent: number;
    }
  | {
      id: "insight:yesterday-tokens";
      category: "yesterday";
      subject: "yesterday-tokens";
      priority: number;
      tokens: number;
      estimatedUsd: number;
    }
  | {
      id: "insight:yesterday-longest-task";
      category: "yesterday";
      subject: "yesterday-duration";
      priority: number;
      minutes: number;
    }
  | {
      id: "insight:today-momentum";
      category: "today";
      subject: "today";
      priority: number;
      prompts: number;
      topProvider?: string;
      tokens?: number;
    }
  | {
      id: "insight:chronotype";
      category: "behavior";
      subject: "time";
      priority: number;
      slot: "night" | "early" | "evening";
      percent: number;
    }
  | {
      id: "insight:hour-shift";
      category: "behavior";
      subject: "time";
      priority: number;
      fromHour: number;
      toHour: number;
    }
  | {
      id: "insight:weekend-rhythm";
      category: "behavior";
      subject: "rhythm";
      priority: number;
      focus: "weekend" | "weekday";
      percent: number;
    }
  | {
      id: "insight:mode-behavior";
      category: "behavior";
      subject: "mode";
      priority: number;
      modeLabel: string;
      percent: number;
      prevPercent?: number;
    }
  | {
      id: "insight:fast-mode";
      category: "behavior";
      subject: "fast";
      priority: number;
      percent: number;
      prevPercent?: number;
    }
  | {
      id: "insight:reasoning-habit";
      category: "behavior";
      subject: "effort";
      priority: number;
      effort: string;
      percent: number;
    }
  | {
      id: "insight:turn-pace";
      category: "behavior";
      subject: "duration";
      priority: number;
      avgSeconds: number;
      deltaPercent?: number;
      direction?: "up" | "down";
    }
  | {
      id: "insight:week-top-skill";
      category: "tools";
      subject: "skill";
      priority: number;
      name: string;
      count: number;
    }
  | {
      id: "insight:week-top-mcp";
      category: "tools";
      subject: "mcp";
      priority: number;
      name: string;
      count: number;
    }
  | {
      id: "insight:week-subagents";
      category: "tools";
      subject: "subagents";
      priority: number;
      count: number;
      deltaPercent?: number;
      direction?: "up" | "down";
    }
  | {
      id: "insight:week-workflows";
      category: "tools";
      subject: "workflows";
      priority: number;
      count: number;
    }
  | {
      id: "insight:week-ai-git";
      category: "tools";
      subject: "git";
      priority: number;
      commits: number;
      prs: number;
      conflicts: number;
    }
  | {
      id: "insight:envs-active";
      category: "env";
      subject: "envs";
      priority: number;
      count: number;
      period: "yesterday" | "7d";
    }
  | {
      id: "insight:env-top";
      category: "env";
      subject: string;
      priority: number;
      envLabel: string;
      percent: number;
    }
  | {
      id: "insight:env-specialization";
      category: "env";
      subject: "env-split";
      priority: number;
      envA: string;
      providerA: string;
      envB: string;
      providerB: string;
    }
  | {
      id: `insight:env-surge:${string}`;
      category: "env";
      subject: string;
      priority: number;
      envLabel: string;
      percent: number;
    }
  | {
      id: "insight:total-milestone";
      category: "milestone";
      subject: "total-prompts";
      priority: number;
      totalPrompts: number;
      totalThreads: number;
    };

export const PROFILE_INSIGHT_THRESHOLDS = {
  streakDays: 2,
  weekPrompts: 5,
  topModelPercent: 25,
  topModelMinPrompts: 20,
  activeHourMinPrompts: 10,
  longestTaskMinutes: 10,
  switchMinPrompts: 8,
  switchMinShare: 30,
  deltaMinBaseline: 5,
  deltaMinDiff: 3,
  deltaMinPercent: 15,
  yesterdayMinPrompts: 3,
  todayMinPrompts: 3,
  tokensMinNotable: 10_000,
  costMinUsd: 0.5,
  cacheMinInput: 10_000,
  cacheMinPercent: 30,
} as const;

const MODEL_KEY_SEPARATOR = String.fromCharCode(0x1f);

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function rawModelName(entry: ProfileBreakdownEntry): string {
  const sep = entry.key.indexOf(MODEL_KEY_SEPARATOR);
  if (sep !== -1) return entry.key.slice(sep + MODEL_KEY_SEPARATOR.length);
  return entry.label;
}

function displayModelName(
  entry: ProfileBreakdownEntry,
  allModels: readonly ProfileBreakdownEntry[],
): string {
  const bare = rawModelName(entry);
  if (!bare || bare === entry.label) return entry.label;
  const distinctKeysForBare = new Set(
    allModels.filter((m) => rawModelName(m) === bare).map((m) => m.key),
  );
  return distinctKeysForBare.size > 1 ? entry.label : bare;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function circularHourDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 24;
  return Math.min(diff, 24 - diff);
}

function peakHourOf(hours: readonly ProfileHourBucket[]): ProfileHourBucket | null {
  let best: ProfileHourBucket | null = null;
  for (const bucket of hours) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  return best && best.count > 0 ? best : null;
}

function shareInHours(
  hours: readonly ProfileHourBucket[],
  targetHours: ReadonlySet<number>,
): { count: number; total: number; percent: number } {
  let total = 0;
  let count = 0;
  for (const h of hours) {
    total += h.count;
    if (targetHours.has(h.hour)) count += h.count;
  }
  return { count, total, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
}

function aiActionCount(actions: readonly ProfileAiAction[], type: ProfileAiAction["type"]): number {
  return actions.find((a) => a.type === type)?.count ?? 0;
}

function lastWeekCells(stats: ProfileCoreStats): { day: string; count: number }[] {
  return stats.promptHeatmap.metric === "prompts" ? stats.promptHeatmap.cells.slice(-7) : [];
}

function sumHeatmapLastDays(stats: ProfileCoreStats, days: number): number {
  if (stats.promptHeatmap.metric !== "prompts") return 0;
  return stats.promptHeatmap.cells.slice(-days).reduce((sum, cell) => sum + cell.count, 0);
}

function appendSwitchAndTrendFacts(
  facts: ProfileInsightFact[],
  last7d: ProfilePeriodSnapshot,
  prev7d: ProfilePeriodSnapshot,
  last30d: ProfilePeriodSnapshot,
  prev30d: ProfilePeriodSnapshot,
): void {
  const { switchMinPrompts, switchMinShare, deltaMinBaseline, deltaMinDiff, deltaMinPercent } =
    PROFILE_INSIGHT_THRESHOLDS;

  // Provider switch (top provider changed between prev7d and last7d)
  const prevTopProvider = prev7d.providers[0];
  const currTopProvider = last7d.providers[0];
  if (
    prev7d.prompts >= switchMinPrompts &&
    last7d.prompts >= switchMinPrompts &&
    prevTopProvider &&
    currTopProvider &&
    prevTopProvider.key !== currTopProvider.key &&
    prevTopProvider.percent >= switchMinShare &&
    currTopProvider.percent >= switchMinShare
  ) {
    facts.push({
      id: "insight:provider-switch",
      category: "switch",
      subject: `provider:${currTopProvider.key}`,
      priority: 98,
      fromLabel: prevTopProvider.label,
      toLabel: currTopProvider.label,
      toPercent: Math.round(currTopProvider.percent),
    });
  }

  // Model switch (top model changed between prev7d and last7d)
  const allRecentModels = [...last7d.models, ...prev7d.models];
  const prevTopModel = prev7d.models[0];
  const currTopModel = last7d.models[0];
  if (
    prev7d.prompts >= switchMinPrompts &&
    last7d.prompts >= switchMinPrompts &&
    prevTopModel &&
    currTopModel &&
    rawModelName(prevTopModel) !== rawModelName(currTopModel) &&
    prevTopModel.percent >= switchMinShare &&
    currTopModel.percent >= switchMinShare
  ) {
    facts.push({
      id: "insight:model-switch",
      category: "switch",
      subject: `model:${currTopModel.key}`,
      priority: 96,
      fromLabel: displayModelName(prevTopModel, allRecentModels),
      toLabel: displayModelName(currTopModel, allRecentModels),
      toPercent: Math.round(currTopModel.percent),
    });
  }

  // New model adopted this week (not used at all in prev7d)
  const prevModelNames = new Set(prev7d.models.map(rawModelName));
  const newlyAdoptedModel = last7d.models.find(
    (entry) => entry.count >= 5 && !prevModelNames.has(rawModelName(entry)),
  );
  if (newlyAdoptedModel && newlyAdoptedModel.key !== currTopModel?.key) {
    facts.push({
      id: `insight:new-model:${newlyAdoptedModel.key}`,
      category: "switch",
      subject: `model:${newlyAdoptedModel.key}`,
      priority: 82,
      model: displayModelName(newlyAdoptedModel, allRecentModels),
      prompts: newlyAdoptedModel.count,
    });
  }

  // Per-provider percentage deltas (7d vs prev7d, falling back to 30d vs prev30d for providers quiet in prev7d)
  const prevProvidersByKey = new Map(prev7d.providers.map((p) => [p.key, p]));
  const currProvidersByKey = new Map(last7d.providers.map((p) => [p.key, p]));
  const providerKeys = new Set([...prevProvidersByKey.keys(), ...currProvidersByKey.keys()]);
  const providerMovers: Array<{
    key: string;
    label: string;
    current: number;
    previous: number;
    change: number;
    period: "7d" | "30d";
  }> = [];

  for (const key of providerKeys) {
    const prev = prevProvidersByKey.get(key);
    const curr = currProvidersByKey.get(key);
    const prevCount = prev?.count ?? 0;
    const currCount = curr?.count ?? 0;
    const change = pctChange(currCount, prevCount);
    if (
      change !== null &&
      prevCount >= deltaMinBaseline &&
      Math.abs(currCount - prevCount) >= deltaMinDiff &&
      Math.abs(change) >= deltaMinPercent
    ) {
      providerMovers.push({
        key,
        label: curr?.label ?? prev!.label,
        current: currCount,
        previous: prevCount,
        change,
        period: "7d",
      });
    }
  }

  if (providerMovers.length === 0) {
    const prev30ByKey = new Map(prev30d.providers.map((p) => [p.key, p]));
    const curr30ByKey = new Map(last30d.providers.map((p) => [p.key, p]));
    for (const key of new Set([...prev30ByKey.keys(), ...curr30ByKey.keys()])) {
      const prev = prev30ByKey.get(key);
      const curr = curr30ByKey.get(key);
      const prevCount = prev?.count ?? 0;
      const currCount = curr?.count ?? 0;
      const change = pctChange(currCount, prevCount);
      if (
        change !== null &&
        prevCount >= 10 &&
        Math.abs(currCount - prevCount) >= 5 &&
        Math.abs(change) >= deltaMinPercent
      ) {
        providerMovers.push({
          key,
          label: curr?.label ?? prev!.label,
          current: currCount,
          previous: prevCount,
          change,
          period: "30d",
        });
      }
    }
  }

  providerMovers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  for (const mover of providerMovers.slice(0, 3)) {
    facts.push({
      id: `insight:provider-delta:${mover.key}`,
      category: "trend",
      subject: `provider:${mover.key}`,
      priority: 92,
      provider: mover.label,
      direction: mover.change >= 0 ? "up" : "down",
      percent: Math.min(999, Math.round(Math.abs(mover.change))),
      current: mover.current,
      previous: mover.previous,
      period: mover.period,
    });
  }

  // Top model usage delta (when distinct from provider-delta or adds model specificity)
  const prevModelsByKey = new Map(prev7d.models.map((m) => [m.key, m]));
  const currModelsByKey = new Map(last7d.models.map((m) => [m.key, m]));
  let bestModelMover: {
    key: string;
    label: string;
    current: number;
    previous: number;
    change: number;
  } | null = null;
  for (const key of new Set([...prevModelsByKey.keys(), ...currModelsByKey.keys()])) {
    const prev = prevModelsByKey.get(key);
    const curr = currModelsByKey.get(key);
    const prevCount = prev?.count ?? 0;
    const currCount = curr?.count ?? 0;
    const change = pctChange(currCount, prevCount);
    if (
      change !== null &&
      prevCount >= deltaMinBaseline &&
      Math.abs(currCount - prevCount) >= deltaMinDiff &&
      Math.abs(change) >= 20
    ) {
      const candidate = {
        key,
        label: displayModelName(curr ?? prev!, allRecentModels),
        current: currCount,
        previous: prevCount,
        change,
      };
      if (!bestModelMover || Math.abs(candidate.change) > Math.abs(bestModelMover.change)) {
        bestModelMover = candidate;
      }
    }
  }
  if (bestModelMover) {
    facts.push({
      id: `insight:model-delta:${bestModelMover.key}`,
      category: "trend",
      subject: `model:${bestModelMover.key}`,
      priority: 84,
      model: bestModelMover.label,
      direction: bestModelMover.change >= 0 ? "up" : "down",
      percent: Math.min(999, Math.round(Math.abs(bestModelMover.change))),
      current: bestModelMover.current,
      previous: bestModelMover.previous,
    });
  }

  // Overall weekly & monthly velocity
  const weekDelta = pctChange(last7d.prompts, prev7d.prompts);
  if (
    weekDelta !== null &&
    prev7d.prompts >= 6 &&
    Math.abs(last7d.prompts - prev7d.prompts) >= 4 &&
    Math.abs(weekDelta) >= deltaMinPercent
  ) {
    facts.push({
      id: "insight:week-velocity",
      category: "trend",
      subject: "week-velocity",
      priority: 88,
      direction: weekDelta >= 0 ? "up" : "down",
      percent: Math.min(999, Math.round(Math.abs(weekDelta))),
      current: last7d.prompts,
      previous: prev7d.prompts,
    });
  }

  const monthDelta = pctChange(last30d.prompts, prev30d.prompts);
  if (
    monthDelta !== null &&
    prev30d.prompts >= 15 &&
    Math.abs(last30d.prompts - prev30d.prompts) >= 8 &&
    Math.abs(monthDelta) >= deltaMinPercent
  ) {
    facts.push({
      id: "insight:month-velocity",
      category: "trend",
      subject: "month-velocity",
      priority: 72,
      direction: monthDelta >= 0 ? "up" : "down",
      percent: Math.min(999, Math.round(Math.abs(monthDelta))),
      current: last30d.prompts,
      previous: prev30d.prompts,
    });
  }
}

function appendRecencyFacts(
  facts: ProfileInsightFact[],
  today: ProfilePeriodSnapshot,
  yesterday: ProfilePeriodSnapshot,
  last30d: ProfilePeriodSnapshot,
  tokenRecent?: ProfileTokenStats["recent"],
): void {
  const { yesterdayMinPrompts, todayMinPrompts, tokensMinNotable } = PROFILE_INSIGHT_THRESHOLDS;

  if (yesterday.prompts >= yesterdayMinPrompts) {
    const topProv = yesterday.providers[0];
    const yTokens = tokenRecent?.yesterday.tokens;
    facts.push({
      id: "insight:yesterday-summary",
      category: "yesterday",
      subject: "yesterday",
      priority: 90,
      prompts: yesterday.prompts,
      ...(topProv
        ? { topProvider: topProv.label, topProviderPercent: Math.round(topProv.percent) }
        : {}),
      ...(yTokens && yTokens >= tokensMinNotable ? { tokens: yTokens } : {}),
    });

    const avgDaily30 = last30d.prompts / Math.max(1, last30d.activeDays);
    if (
      last30d.activeDays >= 4 &&
      yesterday.prompts >= 8 &&
      yesterday.prompts >= avgDaily30 * 1.4
    ) {
      facts.push({
        id: "insight:yesterday-spike",
        category: "yesterday",
        subject: "yesterday-pace",
        priority: 86,
        prompts: yesterday.prompts,
        multiplier: round1(yesterday.prompts / avgDaily30),
      });
    }

    const yTopModel = yesterday.models[0];
    if (yesterday.prompts >= 5 && yTopModel && yTopModel.percent >= 45) {
      facts.push({
        id: "insight:yesterday-model",
        category: "yesterday",
        subject: `model:${yTopModel.key}`,
        priority: 76,
        model: displayModelName(yTopModel, yesterday.models),
        percent: Math.round(yTopModel.percent),
      });
    }

    const yLongestMinutes = Math.round(yesterday.longestTaskMs / 60_000);
    if (yLongestMinutes >= 10) {
      facts.push({
        id: "insight:yesterday-longest-task",
        category: "yesterday",
        subject: "yesterday-duration",
        priority: 66,
        minutes: yLongestMinutes,
      });
    }
  }

  const yTokens = tokenRecent?.yesterday;
  if (yTokens && yTokens.tokens >= tokensMinNotable) {
    facts.push({
      id: "insight:yesterday-tokens",
      category: "yesterday",
      subject: "yesterday-tokens",
      priority: 74,
      tokens: yTokens.tokens,
      estimatedUsd: yTokens.estimatedUsd,
    });
  }

  if (today.prompts >= todayMinPrompts) {
    const topProv = today.providers[0];
    const tTokens = tokenRecent?.today.tokens;
    facts.push({
      id: "insight:today-momentum",
      category: "today",
      subject: "today",
      priority: 80,
      prompts: today.prompts,
      ...(topProv ? { topProvider: topProv.label } : {}),
      ...(tTokens && tTokens >= tokensMinNotable ? { tokens: tTokens } : {}),
    });
  }
}

function appendBehaviorAndToolFacts(
  facts: ProfileInsightFact[],
  last7d: ProfilePeriodSnapshot,
  prev7d: ProfilePeriodSnapshot,
  last30d: ProfilePeriodSnapshot,
): void {
  if (last7d.activeDays >= 4) {
    facts.push({
      id: "insight:week-active-days",
      category: "behavior",
      subject: "consistency",
      priority: 75,
      activeDays: last7d.activeDays,
      totalDays: 7,
    });
  }

  // Chronotype (night owl / early bird / evening)
  const hourSource =
    last7d.prompts >= 10 ? last7d.hours : last30d.prompts >= 15 ? last30d.hours : [];
  if (hourSource.length > 0) {
    const night = shareInHours(hourSource, new Set([22, 23, 0, 1, 2, 3, 4]));
    const early = shareInHours(hourSource, new Set([5, 6, 7, 8, 9]));
    const evening = shareInHours(hourSource, new Set([18, 19, 20, 21]));
    if (night.percent >= 35) {
      facts.push({
        id: "insight:chronotype",
        category: "behavior",
        subject: "time",
        priority: 79,
        slot: "night",
        percent: night.percent,
      });
    } else if (early.percent >= 35) {
      facts.push({
        id: "insight:chronotype",
        category: "behavior",
        subject: "time",
        priority: 79,
        slot: "early",
        percent: early.percent,
      });
    } else if (evening.percent >= 45) {
      facts.push({
        id: "insight:chronotype",
        category: "behavior",
        subject: "time",
        priority: 73,
        slot: "evening",
        percent: evening.percent,
      });
    }
  }

  // Peak hour shift between prev7d and last7d
  if (last7d.prompts >= 10 && prev7d.prompts >= 10) {
    const currPeak = peakHourOf(last7d.hours);
    const prevPeak = peakHourOf(prev7d.hours);
    if (currPeak && prevPeak && circularHourDistance(currPeak.hour, prevPeak.hour) >= 3) {
      facts.push({
        id: "insight:hour-shift",
        category: "behavior",
        subject: "time",
        priority: 77,
        fromHour: prevPeak.hour,
        toHour: currPeak.hour,
      });
    }
  }

  // Weekday vs weekend rhythm
  const rhythmPeriod = last30d.prompts >= 15 ? last30d : last7d.prompts >= 10 ? last7d : null;
  if (rhythmPeriod) {
    const total = rhythmPeriod.weekdayPrompts + rhythmPeriod.weekendPrompts;
    if (total > 0) {
      const weekendPct = Math.round((rhythmPeriod.weekendPrompts / total) * 100);
      const weekdayPct = Math.round((rhythmPeriod.weekdayPrompts / total) * 100);
      if (weekendPct >= 30 && rhythmPeriod.weekendPrompts >= 6) {
        facts.push({
          id: "insight:weekend-rhythm",
          category: "behavior",
          subject: "rhythm",
          priority: 70,
          focus: "weekend",
          percent: weekendPct,
        });
      } else if (weekdayPct >= 92 && rhythmPeriod.weekdayPrompts >= 20) {
        facts.push({
          id: "insight:weekend-rhythm",
          category: "behavior",
          subject: "rhythm",
          priority: 62,
          focus: "weekday",
          percent: weekdayPct,
        });
      }
    }
  }

  // Chat vs CLI mode preference / shift
  const currMode = last7d.modes[0];
  if (last7d.threads >= 5 && currMode && currMode.percent >= 60) {
    const prevMatch = prev7d.modes.find((m) => m.key === currMode.key);
    const currPct = Math.round(currMode.percent);
    const prevPct = prev7d.threads >= 5 && prevMatch ? Math.round(prevMatch.percent) : undefined;
    facts.push({
      id: "insight:mode-behavior",
      category: "behavior",
      subject: "mode",
      priority: prevPct !== undefined && Math.abs(currPct - prevPct) >= 15 ? 78 : 65,
      modeLabel: currMode.label,
      percent: currPct,
      ...(prevPct !== undefined && Math.abs(currPct - prevPct) >= 15
        ? { prevPercent: prevPct }
        : {}),
    });
  }

  // Fast mode share & shift
  if (last7d.prompts >= 8) {
    const fastPct = Math.round((last7d.fastTurns / last7d.prompts) * 100);
    const prevFastPct =
      prev7d.prompts >= 8 ? Math.round((prev7d.fastTurns / prev7d.prompts) * 100) : undefined;
    const shifted = prevFastPct !== undefined && Math.abs(fastPct - prevFastPct) >= 15;
    if (shifted || fastPct >= 25) {
      facts.push({
        id: "insight:fast-mode",
        category: "behavior",
        subject: "fast",
        priority: shifted ? 74 : 60,
        percent: fastPct,
        ...(shifted ? { prevPercent: prevFastPct } : {}),
      });
    }
  }

  // Reasoning effort habit
  const topEffort = last7d.efforts[0];
  if (last7d.effortTurns >= 8 && topEffort && topEffort.percent >= 35) {
    facts.push({
      id: "insight:reasoning-habit",
      category: "behavior",
      subject: "effort",
      priority: 63,
      effort: topEffort.label,
      percent: Math.round(topEffort.percent),
    });
  }

  // Average turn pace & shift
  if (last7d.prompts >= 8 && last7d.totalTurnMs > 0) {
    const avgSec = Math.round(last7d.totalTurnMs / last7d.prompts / 1000);
    if (avgSec >= 15) {
      let deltaPercent: number | undefined;
      let direction: "up" | "down" | undefined;
      if (prev7d.prompts >= 8 && prev7d.totalTurnMs > 0) {
        const prevAvgSec = prev7d.totalTurnMs / prev7d.prompts / 1000;
        const delta = pctChange(avgSec, prevAvgSec);
        if (delta !== null && Math.abs(delta) >= 25) {
          deltaPercent = Math.min(999, Math.round(Math.abs(delta)));
          direction = delta >= 0 ? "up" : "down";
        }
      }
      facts.push({
        id: "insight:turn-pace",
        category: "behavior",
        subject: "duration",
        priority: deltaPercent ? 71 : 58,
        avgSeconds: avgSec,
        ...(deltaPercent && direction ? { deltaPercent, direction } : {}),
      });
    }
  }

  // Tools & AI git actions this week
  const topSkill = last7d.skills[0];
  if (topSkill && topSkill.runCount >= 3) {
    facts.push({
      id: "insight:week-top-skill",
      category: "tools",
      subject: "skill",
      priority: 64,
      name: topSkill.displayName,
      count: topSkill.runCount,
    });
  }
  const topMcp = last7d.mcps[0];
  if (topMcp && topMcp.runCount >= 3) {
    facts.push({
      id: "insight:week-top-mcp",
      category: "tools",
      subject: "mcp",
      priority: 64,
      name: topMcp.displayName,
      count: topMcp.runCount,
    });
  }
  if (last7d.subagentRuns >= 5) {
    const delta = pctChange(last7d.subagentRuns, prev7d.subagentRuns);
    const hasDelta = prev7d.subagentRuns >= 3 && delta !== null && Math.abs(delta) >= 25;
    facts.push({
      id: "insight:week-subagents",
      category: "tools",
      subject: "subagents",
      priority: 67,
      count: last7d.subagentRuns,
      ...(hasDelta
        ? {
            deltaPercent: Math.min(999, Math.round(Math.abs(delta!))),
            direction: delta! >= 0 ? "up" : "down",
          }
        : {}),
    });
  }
  if (last7d.workflowRuns >= 3) {
    facts.push({
      id: "insight:week-workflows",
      category: "tools",
      subject: "workflows",
      priority: 61,
      count: last7d.workflowRuns,
    });
  }

  const commits = aiActionCount(last7d.aiActions, "commit");
  const prs = aiActionCount(last7d.aiActions, "pr");
  const conflicts = aiActionCount(last7d.aiActions, "conflict");
  if (commits + prs + conflicts >= 2) {
    facts.push({
      id: "insight:week-ai-git",
      category: "tools",
      subject: "git",
      priority: 76,
      commits,
      prs,
      conflicts,
    });
  }
}

function appendTokenFacts(
  facts: ProfileInsightFact[],
  recent: NonNullable<ProfileTokenStats["recent"]>,
): void {
  const { tokensMinNotable, deltaMinPercent, costMinUsd, cacheMinInput, cacheMinPercent } =
    PROFILE_INSIGHT_THRESHOLDS;
  const { last7d, prev7d } = recent;

  const tokenDelta = pctChange(last7d.tokens, prev7d.tokens);
  if (
    prev7d.tokens >= tokensMinNotable &&
    tokenDelta !== null &&
    Math.abs(tokenDelta) >= deltaMinPercent
  ) {
    facts.push({
      id: "insight:tokens-trend",
      category: "tokens",
      subject: "tokens-trend",
      priority: 85,
      direction: tokenDelta >= 0 ? "up" : "down",
      percent: Math.min(999, Math.round(Math.abs(tokenDelta))),
      tokens: last7d.tokens,
    });
  }

  if (last7d.estimatedUsd >= costMinUsd) {
    facts.push({
      id: "insight:weekly-cost",
      category: "tokens",
      subject: "weekly-cost",
      priority: 68,
      estimatedUsd: last7d.estimatedUsd,
      tokens: last7d.tokens,
    });
  }

  const totalInput = last7d.inputTokens + last7d.cacheReadTokens + last7d.cacheWriteTokens;
  if (totalInput >= cacheMinInput && last7d.cacheReadTokens > 0) {
    const cachePct = Math.round((last7d.cacheReadTokens / totalInput) * 100);
    if (cachePct >= cacheMinPercent) {
      facts.push({
        id: "insight:cache-efficiency",
        category: "tokens",
        subject: "cache",
        priority: 69,
        percent: cachePct,
        cacheReadTokens: last7d.cacheReadTokens,
      });
    }
  }
}

function appendCrossEnvFacts(
  facts: ProfileInsightFact[],
  envs: readonly ProfileEnvSummary[],
): void {
  if (envs.length < 2) return;

  const weekActivity = envs.map((env) => ({
    env,
    weekPrompts: env.core.recent?.last7d.prompts ?? sumHeatmapLastDays(env.core, 7),
    yesterdayPrompts: env.core.recent?.yesterday.prompts ?? sumHeatmapLastDays(env.core, 2),
  }));

  const activeWeekEnvs = weekActivity.filter((e) => e.weekPrompts > 0);
  const activeYesterdayEnvs = envs.filter((e) => (e.core.recent?.yesterday.prompts ?? 0) > 0);

  if (activeYesterdayEnvs.length >= 2) {
    facts.push({
      id: "insight:envs-active",
      category: "env",
      subject: "envs",
      priority: 81,
      count: activeYesterdayEnvs.length,
      period: "yesterday",
    });
  } else if (activeWeekEnvs.length >= 2) {
    facts.push({
      id: "insight:envs-active",
      category: "env",
      subject: "envs",
      priority: 81,
      count: activeWeekEnvs.length,
      period: "7d",
    });
  }

  const totalWeekPrompts = activeWeekEnvs.reduce((sum, e) => sum + e.weekPrompts, 0);
  if (activeWeekEnvs.length >= 2 && totalWeekPrompts >= 8) {
    const sorted = [...activeWeekEnvs].sort((a, b) => b.weekPrompts - a.weekPrompts);
    const top = sorted[0]!;
    const share = Math.round((top.weekPrompts / totalWeekPrompts) * 100);
    if (share >= 45 && share < 98) {
      facts.push({
        id: "insight:env-top",
        category: "env",
        subject: `env:${top.env.id}`,
        priority: 75,
        envLabel: top.env.label,
        percent: share,
      });
    }
  }

  // Specialization across two environments using different top providers this week
  const specialized = envs
    .map((env) => ({
      env,
      prompts: env.core.recent?.last7d.prompts ?? 0,
      topProvider: env.core.recent?.last7d.providers[0],
    }))
    .filter((item) => item.prompts >= 5 && item.topProvider && item.topProvider.percent >= 45)
    .sort((a, b) => b.prompts - a.prompts);

  if (specialized.length >= 2) {
    const first = specialized[0]!;
    const second = specialized.find(
      (candidate) => candidate.topProvider!.key !== first.topProvider!.key,
    );
    if (second) {
      facts.push({
        id: "insight:env-specialization",
        category: "env",
        subject: "env-split",
        priority: 83,
        envA: first.env.label,
        providerA: first.topProvider!.label,
        envB: second.env.label,
        providerB: second.topProvider!.label,
      });
    }
  }

  // Per-env weekly activity surge
  let topSurge: { env: ProfileEnvSummary; percent: number } | null = null;
  for (const env of envs) {
    const recent = env.core.recent;
    if (!recent) continue;
    const delta = pctChange(recent.last7d.prompts, recent.prev7d.prompts);
    if (
      delta !== null &&
      recent.prev7d.prompts >= 5 &&
      recent.last7d.prompts - recent.prev7d.prompts >= 4 &&
      delta >= 30
    ) {
      const percent = Math.min(999, Math.round(delta));
      if (!topSurge || percent > topSurge.percent) {
        topSurge = { env, percent };
      }
    }
  }
  if (topSurge) {
    facts.push({
      id: `insight:env-surge:${topSurge.env.id}`,
      category: "env",
      subject: `env:${topSurge.env.id}`,
      priority: 79,
      envLabel: topSurge.env.label,
      percent: topSurge.percent,
    });
  }
}

/**
 * Derive rich, provider-agnostic personal insights from aggregated core + token
 * stats and optional per-environment summaries.
 */
export function buildProfileInsightFacts(input: ProfileInsightsInput): ProfileInsightFact[] {
  const { core, tokens, envs = [] } = input;
  if (!core) return [];

  const facts: ProfileInsightFact[] = [];
  const { totals, insights } = core;

  // Classic core facts (preserved with existing ids and thresholds)
  if (totals.currentStreakDays >= PROFILE_INSIGHT_THRESHOLDS.streakDays) {
    facts.push({
      id: "insight:streak",
      category: "milestone",
      subject: "streak",
      priority: 87,
      current: totals.currentStreakDays,
      longest: Math.max(totals.longestStreakDays, totals.currentStreakDays),
    });
  }

  const week = lastWeekCells(core);
  const weekPrompts = week.reduce((sum, cell) => sum + cell.count, 0);
  if (weekPrompts >= PROFILE_INSIGHT_THRESHOLDS.weekPrompts) {
    let busiest: { day: string; count: number } | null = null;
    for (const cell of week) if (!busiest || cell.count > busiest.count) busiest = cell;
    facts.push({
      id: "insight:week-prompts",
      category: "trend",
      subject: "week-prompts",
      priority: 77,
      prompts: weekPrompts,
      daily: week.map((cell) => cell.count),
      busiestDay: busiest && busiest.count > 0 ? busiest.day : null,
    });
  }

  const topModel = insights.topModel;
  if (
    topModel &&
    totals.totalPrompts >= PROFILE_INSIGHT_THRESHOLDS.topModelMinPrompts &&
    topModel.percent >= PROFILE_INSIGHT_THRESHOLDS.topModelPercent
  ) {
    facts.push({
      id: "insight:top-model",
      category: "milestone",
      subject: "top-model",
      priority: 58,
      label: topModel.label,
      percent: Math.round(topModel.percent),
    });
  }

  const activeHour = insights.mostActiveHour;
  if (activeHour && totals.totalPrompts >= PROFILE_INSIGHT_THRESHOLDS.activeHourMinPrompts) {
    facts.push({
      id: "insight:active-hour",
      category: "behavior",
      subject: "time",
      priority: 56,
      hour: activeHour.hour,
    });
  }

  const longestMinutes = Math.round(totals.longestTaskMs / 60_000);
  if (longestMinutes >= PROFILE_INSIGHT_THRESHOLDS.longestTaskMinutes) {
    facts.push({
      id: "insight:longest-task",
      category: "milestone",
      subject: "longest-task",
      priority: 54,
      minutes: longestMinutes,
    });
  }

  if (core.recent) {
    const { today, yesterday, last7d, prev7d, last30d, prev30d } = core.recent;
    appendSwitchAndTrendFacts(facts, last7d, prev7d, last30d, prev30d);
    appendRecencyFacts(facts, today, yesterday, last30d, tokens?.recent);
    appendBehaviorAndToolFacts(facts, last7d, prev7d, last30d);
  }

  if (tokens?.recent) {
    appendTokenFacts(facts, tokens.recent);
  }

  appendCrossEnvFacts(facts, envs);

  if (totals.totalPrompts >= 100 && totals.totalThreads >= 10) {
    facts.push({
      id: "insight:total-milestone",
      category: "milestone",
      subject: "total-prompts",
      priority: 45,
      totalPrompts: totals.totalPrompts,
      totalThreads: totals.totalThreads,
    });
  }

  return facts;
}
