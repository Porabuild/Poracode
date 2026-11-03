import { describe, expect, it } from "vitest";
import type { ProfileCoreStats } from "@/shared/contracts";
import type { UsageSnapshot } from "@poracode/agents-usage/types";
import { buildInsightFacts, pickUsageFact } from "./newsFacts";

function makeStats(overrides: {
  totals?: Partial<ProfileCoreStats["totals"]>;
  insights?: Partial<ProfileCoreStats["insights"]>;
  daily?: number[];
}): ProfileCoreStats {
  const daily = overrides.daily ?? [0, 0, 0, 0, 0, 0, 0];
  return {
    totals: {
      totalThreads: 0,
      totalPrompts: 0,
      messagesSent: 0,
      goalsSet: 0,
      longestTaskMs: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      activeDays: 0,
      ...overrides.totals,
    },
    insights: {
      fastModePercent: 0,
      skillsExplored: 0,
      totalSkillsUsed: 0,
      workflowRuns: 0,
      subagentRuns: 0,
      mcpToolCalls: 0,
      ...overrides.insights,
    },
    promptHeatmap: {
      metric: "prompts",
      windowDays: 365,
      max: Math.max(...daily),
      cells: [
        { day: "2026-10-26", count: 99, intensity: 4 },
        ...daily.map((count, index) => ({
          day: `2026-10-${String(27 + index).padStart(2, "0")}`,
          count,
          intensity: 1,
        })),
      ],
    },
  } as unknown as ProfileCoreStats;
}

describe("buildInsightFacts", () => {
  it("returns nothing without stats or when nothing is worth celebrating", () => {
    expect(buildInsightFacts(null)).toEqual([]);
    expect(buildInsightFacts(makeStats({ totals: { currentStreakDays: 1 } }))).toEqual([]);
  });

  it("reports the streak, this week's prompts from the last seven days, and the busiest day", () => {
    const facts = buildInsightFacts(
      makeStats({
        totals: { currentStreakDays: 6, longestStreakDays: 11 },
        daily: [1, 2, 9, 0, 3, 4, 5],
      }),
    );
    expect(facts).toContainEqual({ id: "insight:streak", current: 6, longest: 11 });
    expect(facts).toContainEqual({
      id: "insight:week-prompts",
      prompts: 24,
      daily: [1, 2, 9, 0, 3, 4, 5],
      busiestDay: "2026-10-29",
    });
  });

  it("needs enough history before naming a top model or active hour", () => {
    const insights = {
      topModel: { key: "m", label: "Model X", count: 9, percent: 64.4 },
      mostActiveHour: { hour: 22, label: "10 PM", count: 9 },
    };
    expect(
      buildInsightFacts(makeStats({ totals: { totalPrompts: 5 }, insights })).map(
        (fact) => fact.id,
      ),
    ).toEqual([]);
    expect(buildInsightFacts(makeStats({ totals: { totalPrompts: 40 }, insights }))).toEqual([
      { id: "insight:top-model", label: "Model X", percent: 64 },
      { id: "insight:active-hour", hour: 22 },
    ]);
  });

  it("mentions the longest task only when it ran at least ten minutes", () => {
    expect(buildInsightFacts(makeStats({ totals: { longestTaskMs: 9 * 60_000 } }))).toEqual([]);
    expect(buildInsightFacts(makeStats({ totals: { longestTaskMs: 47 * 60_000 } }))).toEqual([
      { id: "insight:longest-task", minutes: 47 },
    ]);
  });
});

function snapshot(
  providerId: string,
  windows: { id: string; usedPercent: number }[],
): UsageSnapshot {
  return {
    providerId,
    status: "ok",
    windows: windows.map((window) => ({ ...window, label: window.id })),
    fetchedAt: 0,
  } as UsageSnapshot;
}

describe("pickUsageFact", () => {
  const labels = (id: string) => ({ one: "One", two: "Two" })[id];

  it("picks the most-used window at or above half, marking 80% as urgent", () => {
    const fact = pickUsageFact(
      {
        one: snapshot("one", [{ id: "weekly", usedPercent: 55 }]),
        two: snapshot("two", [
          { id: "session-5h", usedPercent: 30 },
          { id: "weekly", usedPercent: 85 },
        ]),
      },
      [],
      labels,
    );
    expect(fact).toMatchObject({ id: "usage:two:weekly", providerLabel: "Two", urgent: true });
  });

  it("ignores disabled, unknown, failed, and lightly used providers", () => {
    expect(
      pickUsageFact(
        {
          one: snapshot("one", [{ id: "weekly", usedPercent: 90 }]),
          unknown: snapshot("unknown", [{ id: "weekly", usedPercent: 90 }]),
          two: {
            ...snapshot("two", [{ id: "weekly", usedPercent: 90 }]),
            status: "error",
          } as UsageSnapshot,
        },
        ["one"],
        labels,
      ),
    ).toBeNull();
    expect(
      pickUsageFact({ one: snapshot("one", [{ id: "weekly", usedPercent: 49 }]) }, [], labels),
    ).toBeNull();
  });
});
