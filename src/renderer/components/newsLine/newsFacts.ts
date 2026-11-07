import type { ProfileCoreStats } from "@/shared/contracts";
import type { UsageSnapshot, UsageWindow } from "@poracode/agents-usage/types";

/**
 * Personal highlights derived from the host's profile stats. Facts carry data
 * only; the news line renders the localized sentence. Each fact appears only
 * when it is encouraging and meaningful — never "0 prompts this week".
 */
export type InsightFact =
  | { id: "insight:streak"; current: number; longest: number }
  | { id: "insight:week-prompts"; prompts: number; daily: number[]; busiestDay: string | null }
  | { id: "insight:top-model"; label: string; percent: number }
  | { id: "insight:active-hour"; hour: number }
  | { id: "insight:longest-task"; minutes: number };

export const INSIGHT_THRESHOLDS = {
  streakDays: 2,
  weekPrompts: 5,
  topModelPercent: 25,
  topModelMinPrompts: 20,
  activeHourMinPrompts: 10,
  longestTaskMinutes: 10,
} as const;

/** Daily prompt counts for the last seven days, oldest first. */
function lastWeek(stats: ProfileCoreStats): { day: string; count: number }[] {
  return stats.promptHeatmap.metric === "prompts" ? stats.promptHeatmap.cells.slice(-7) : [];
}

export function buildInsightFacts(stats: ProfileCoreStats | null): InsightFact[] {
  if (!stats) return [];
  const facts: InsightFact[] = [];
  const { totals, insights } = stats;

  if (totals.currentStreakDays >= INSIGHT_THRESHOLDS.streakDays) {
    facts.push({
      id: "insight:streak",
      current: totals.currentStreakDays,
      longest: Math.max(totals.longestStreakDays, totals.currentStreakDays),
    });
  }

  const week = lastWeek(stats);
  const weekPrompts = week.reduce((sum, cell) => sum + cell.count, 0);
  if (weekPrompts >= INSIGHT_THRESHOLDS.weekPrompts) {
    let busiest: { day: string; count: number } | null = null;
    for (const cell of week) if (!busiest || cell.count > busiest.count) busiest = cell;
    facts.push({
      id: "insight:week-prompts",
      prompts: weekPrompts,
      daily: week.map((cell) => cell.count),
      busiestDay: busiest && busiest.count > 0 ? busiest.day : null,
    });
  }

  const topModel = insights.topModel;
  if (
    topModel &&
    totals.totalPrompts >= INSIGHT_THRESHOLDS.topModelMinPrompts &&
    topModel.percent >= INSIGHT_THRESHOLDS.topModelPercent
  ) {
    facts.push({
      id: "insight:top-model",
      label: topModel.label,
      percent: Math.round(topModel.percent),
    });
  }

  const activeHour = insights.mostActiveHour;
  if (activeHour && totals.totalPrompts >= INSIGHT_THRESHOLDS.activeHourMinPrompts) {
    facts.push({ id: "insight:active-hour", hour: activeHour.hour });
  }

  const longestMinutes = Math.round(totals.longestTaskMs / 60_000);
  if (longestMinutes >= INSIGHT_THRESHOLDS.longestTaskMinutes) {
    facts.push({ id: "insight:longest-task", minutes: longestMinutes });
  }
  return facts;
}

export interface UsageFact {
  id: string;
  providerId: string;
  providerLabel: string;
  window: UsageWindow;
  /** Nearly exhausted: leads the rotation. */
  urgent: boolean;
}

/** Limits worth a mention start here; at or above `urgent` they lead the rotation. */
export const USAGE_THRESHOLDS = { notable: 50, urgent: 80 } as const;

/**
 * The single most-constrained usage window across enabled providers, when it
 * is at least half used. Providers are named from the usage catalog, so this
 * stays provider-agnostic.
 */
export function pickUsageFact(
  snapshots: Readonly<Record<string, UsageSnapshot>>,
  disabledProviders: readonly string[],
  labelFor: (providerId: string) => string | undefined,
): UsageFact | null {
  let best: UsageFact | null = null;
  for (const snapshot of Object.values(snapshots)) {
    if (snapshot.status !== "ok" || disabledProviders.includes(snapshot.providerId)) continue;
    const providerLabel = labelFor(snapshot.providerId);
    if (!providerLabel) continue;
    for (const window of snapshot.windows) {
      if (window.usedPercent < USAGE_THRESHOLDS.notable) continue;
      if (best && window.usedPercent <= best.window.usedPercent) continue;
      best = {
        id: `usage:${snapshot.providerId}:${window.id}`,
        providerId: snapshot.providerId,
        providerLabel,
        window,
        urgent: window.usedPercent >= USAGE_THRESHOLDS.urgent,
      };
    }
  }
  return best;
}
