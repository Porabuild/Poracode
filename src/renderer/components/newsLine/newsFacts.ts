import type { ProfileCoreStats } from "@/shared/contracts";
import {
  buildProfileInsightFacts,
  PROFILE_INSIGHT_THRESHOLDS,
  type ProfileInsightFact,
  type ProfileInsightsInput,
} from "@/shared/profile/insights";
import type { UsageSnapshot, UsageWindow } from "@poracode/agents-usage/types";

export { buildProfileInsightFacts, type ProfileInsightFact, type ProfileInsightsInput };

/**
 * Legacy five-fact projection retained for existing unit tests; rich trend,
 * switch, behavior, and cross-environment insights come from
 * {@link buildProfileInsightFacts}.
 */
export type InsightFact =
  | { id: "insight:streak"; current: number; longest: number }
  | { id: "insight:week-prompts"; prompts: number; daily: number[]; busiestDay: string | null }
  | { id: "insight:top-model"; label: string; percent: number }
  | { id: "insight:active-hour"; hour: number }
  | { id: "insight:longest-task"; minutes: number };

export const INSIGHT_THRESHOLDS = {
  streakDays: PROFILE_INSIGHT_THRESHOLDS.streakDays,
  weekPrompts: PROFILE_INSIGHT_THRESHOLDS.weekPrompts,
  topModelPercent: PROFILE_INSIGHT_THRESHOLDS.topModelPercent,
  topModelMinPrompts: PROFILE_INSIGHT_THRESHOLDS.topModelMinPrompts,
  activeHourMinPrompts: PROFILE_INSIGHT_THRESHOLDS.activeHourMinPrompts,
  longestTaskMinutes: PROFILE_INSIGHT_THRESHOLDS.longestTaskMinutes,
} as const;

export function buildInsightFacts(stats: ProfileCoreStats | null): InsightFact[] {
  const rich = buildProfileInsightFacts({ core: stats });
  const out: InsightFact[] = [];
  for (const fact of rich) {
    switch (fact.id) {
      case "insight:streak":
        out.push({ id: fact.id, current: fact.current, longest: fact.longest });
        break;
      case "insight:week-prompts":
        out.push({
          id: fact.id,
          prompts: fact.prompts,
          daily: fact.daily,
          busiestDay: fact.busiestDay,
        });
        break;
      case "insight:top-model":
        out.push({ id: fact.id, label: fact.label, percent: fact.percent });
        break;
      case "insight:active-hour":
        out.push({ id: fact.id, hour: fact.hour });
        break;
      case "insight:longest-task":
        out.push({ id: fact.id, minutes: fact.minutes });
        break;
      default:
        break;
    }
  }
  return out;
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
