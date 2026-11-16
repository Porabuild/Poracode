import { describe, expect, it } from "vitest";
import type {
  ProfileCoreStats,
  ProfilePeriodSnapshot,
  ProfileTokenPeriodSnapshot,
  ProfileTokenStats,
} from "../contracts";
import { buildProfileInsightFacts } from "./insights";

function emptyPeriod(
  days: number,
  overrides: Partial<ProfilePeriodSnapshot> = {},
): ProfilePeriodSnapshot {
  return {
    days,
    activeDays: 0,
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
    providers: [],
    models: [],
    modes: [],
    efforts: [],
    hours: [],
    skills: [],
    mcps: [],
    aiActions: [],
    ...overrides,
  };
}

function emptyTokenPeriod(
  overrides: Partial<ProfileTokenPeriodSnapshot> = {},
): ProfileTokenPeriodSnapshot {
  return {
    tokens: 0,
    estimatedUsd: 0,
    observed: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    providers: [],
    models: [],
    ...overrides,
  };
}

function makeCore(overrides: Partial<ProfileCoreStats> = {}): ProfileCoreStats {
  return {
    scope: "device",
    device: { id: "dev-1", label: "Workstation", platform: "darwin", isCurrent: true },
    generatedAt: 1000,
    timezoneOffsetMinutes: 0,
    identity: { name: "Test", handle: "test", avatarColor: "#663399" },
    totals: {
      totalThreads: 0,
      totalPrompts: 0,
      messagesSent: 0,
      goalsSet: 0,
      longestTaskMs: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      activeDays: 0,
    },
    promptHeatmap: { metric: "prompts", windowDays: 364, max: 0, cells: [] },
    insights: {
      fastModePercent: 0,
      skillsExplored: 0,
      totalSkillsUsed: 0,
      workflowRuns: 0,
      subagentRuns: 0,
      mcpToolCalls: 0,
    },
    providers: [],
    accounts: [],
    models: [],
    modes: [],
    skills: [],
    mcps: [],
    aiActions: [],
    availableAccounts: [],
    ...overrides,
  };
}

describe("buildProfileInsightFacts", () => {
  it("detects provider switch, model switch, and percentage usage changes", () => {
    const core = makeCore({
      recent: {
        today: emptyPeriod(1),
        yesterday: emptyPeriod(1, {
          prompts: 12,
          providers: [{ key: "beta", label: "Beta", count: 10, percent: 83.3 }],
          models: [{ key: "beta\x1fmodel-2", label: "model-2 (Beta)", count: 10, percent: 83.3 }],
        }),
        last7d: emptyPeriod(7, {
          prompts: 34,
          activeDays: 5,
          providers: [
            { key: "beta", label: "Beta", count: 24, percent: 70.6 },
            { key: "alpha", label: "Alpha", count: 10, percent: 29.4 },
          ],
          models: [
            { key: "beta\x1fmodel-2", label: "model-2 (Beta)", count: 24, percent: 70.6 },
            { key: "alpha\x1fmodel-1", label: "model-1 (Alpha)", count: 10, percent: 29.4 },
          ],
        }),
        prev7d: emptyPeriod(7, {
          prompts: 30,
          activeDays: 5,
          providers: [
            { key: "alpha", label: "Alpha", count: 22, percent: 73.3 },
            { key: "beta", label: "Beta", count: 8, percent: 26.7 },
          ],
          models: [
            { key: "alpha\x1fmodel-1", label: "model-1 (Alpha)", count: 22, percent: 73.3 },
            { key: "beta\x1fmodel-2", label: "model-2 (Beta)", count: 8, percent: 26.7 },
          ],
        }),
        last30d: emptyPeriod(30, { prompts: 80, activeDays: 10 }),
        prev30d: emptyPeriod(30, { prompts: 40, activeDays: 8 }),
      },
    });

    const facts = buildProfileInsightFacts({ core });
    expect(facts).toContainEqual(
      expect.objectContaining({
        id: "insight:provider-switch",
        fromLabel: "Alpha",
        toLabel: "Beta",
        toPercent: 71,
      }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({
        id: "insight:model-switch",
        fromLabel: "model-1",
        toLabel: "model-2",
      }),
    );
    // Alpha went from 22 -> 10 = -55%
    expect(facts).toContainEqual(
      expect.objectContaining({
        id: "insight:provider-delta:alpha",
        provider: "Alpha",
        direction: "down",
        percent: 55,
      }),
    );
    // Beta went from 8 -> 24 = +200%
    expect(facts).toContainEqual(
      expect.objectContaining({
        id: "insight:provider-delta:beta",
        provider: "Beta",
        direction: "up",
        percent: 200,
      }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({
        id: "insight:yesterday-summary",
        prompts: 12,
        topProvider: "Beta",
      }),
    );
  });

  it("extracts behavioral, token, cache, tooling, and cross-environment insights", () => {
    const coreA = makeCore({
      device: { id: "env-a", label: "MacBook Pro", platform: "darwin", isCurrent: true },
      recent: {
        today: emptyPeriod(1, {
          prompts: 5,
          providers: [{ key: "alpha", label: "Alpha", count: 5, percent: 100 }],
        }),
        yesterday: emptyPeriod(1, { prompts: 10 }),
        last7d: emptyPeriod(7, {
          prompts: 30,
          threads: 10,
          activeDays: 6,
          totalTurnMs: 1_800_000,
          fastTurns: 18,
          effortTurns: 20,
          weekdayPrompts: 15,
          weekendPrompts: 15,
          providers: [{ key: "alpha", label: "Alpha", count: 25, percent: 83.3 }],
          models: [],
          modes: [
            { key: "chat", label: "Chat", count: 8, percent: 80 },
            { key: "cli", label: "CLI", count: 2, percent: 20 },
          ],
          efforts: [{ key: "high", label: "High", count: 16, percent: 80 }],
          hours: [
            { hour: 23, count: 16 },
            { hour: 10, count: 14 },
          ],
          skills: [{ name: "verify", displayName: "verify", kind: "skill", runCount: 6 }],
          mcps: [{ name: "browser", displayName: "Browser", kind: "mcp", runCount: 5 }],
          aiActions: [
            { type: "commit", label: "AI commits", count: 4 },
            { type: "pr", label: "AI pull requests", count: 2 },
          ],
          subagentRuns: 8,
          workflowRuns: 4,
        }),
        prev7d: emptyPeriod(7, {
          prompts: 15,
          threads: 10,
          fastTurns: 2,
          totalTurnMs: 1_500_000,
          providers: [{ key: "alpha", label: "Alpha", count: 15, percent: 100 }],
          modes: [
            { key: "cli", label: "CLI", count: 7, percent: 70 },
            { key: "chat", label: "Chat", count: 3, percent: 30 },
          ],
          hours: [{ hour: 10, count: 15 }],
          subagentRuns: 4,
        }),
        last30d: emptyPeriod(30, {
          prompts: 50,
          activeDays: 10,
          weekdayPrompts: 30,
          weekendPrompts: 20,
        }),
        prev30d: emptyPeriod(30),
      },
    });
    const coreB = makeCore({
      device: { id: "env-b", label: "Linux Server", platform: "linux", isCurrent: false },
      recent: {
        today: emptyPeriod(1),
        yesterday: emptyPeriod(1, { prompts: 4 }),
        last7d: emptyPeriod(7, {
          prompts: 15,
          providers: [{ key: "beta", label: "Beta", count: 12, percent: 80 }],
        }),
        prev7d: emptyPeriod(7, { prompts: 8 }),
        last30d: emptyPeriod(30, { prompts: 20 }),
        prev30d: emptyPeriod(30),
      },
    });
    const tokens: ProfileTokenStats = {
      available: true,
      scope: "all",
      device: coreA.device,
      generatedAt: 1000,
      timezoneOffsetMinutes: 0,
      windowDays: 364,
      lifetimeTokens: 500_000,
      peakDayTokens: 200_000,
      providers: [],
      accounts: [],
      models: [],
      tokenHeatmap: { metric: "tokens", windowDays: 364, max: 0, cells: [] },
      unavailableProviders: [],
      recent: {
        today: emptyTokenPeriod({ tokens: 25_000 }),
        yesterday: emptyTokenPeriod({ tokens: 40_000, estimatedUsd: 1.25 }),
        last7d: emptyTokenPeriod({
          tokens: 180_000,
          estimatedUsd: 4.5,
          inputTokens: 30_000,
          cacheReadTokens: 60_000,
          cacheWriteTokens: 10_000,
          outputTokens: 15_000,
        }),
        prev7d: emptyTokenPeriod({ tokens: 100_000 }),
        last30d: emptyTokenPeriod({ tokens: 250_000 }),
        prev30d: emptyTokenPeriod(),
      },
    };

    const facts = buildProfileInsightFacts({
      core: coreA,
      tokens,
      envs: [
        { id: "env-a", label: "MacBook Pro", platform: "darwin", isCurrent: true, core: coreA },
        { id: "env-b", label: "Linux Server", platform: "linux", isCurrent: false, core: coreB },
      ],
    });

    const ids = facts.map((f) => f.id);
    expect(ids).toContain("insight:chronotype");
    expect(ids).toContain("insight:hour-shift");
    expect(ids).toContain("insight:weekend-rhythm");
    expect(ids).toContain("insight:mode-behavior");
    expect(ids).toContain("insight:fast-mode");
    expect(ids).toContain("insight:reasoning-habit");
    expect(ids).toContain("insight:turn-pace");
    expect(ids).toContain("insight:week-top-skill");
    expect(ids).toContain("insight:week-top-mcp");
    expect(ids).toContain("insight:week-subagents");
    expect(ids).toContain("insight:week-workflows");
    expect(ids).toContain("insight:week-ai-git");
    expect(ids).toContain("insight:tokens-trend");
    expect(ids).toContain("insight:weekly-cost");
    expect(ids).toContain("insight:cache-efficiency");
    expect(ids).toContain("insight:today-momentum");
    expect(ids).toContain("insight:envs-active");
    expect(ids).toContain("insight:env-specialization");
    expect(ids).toContain("insight:env-surge:env-a");
  });
});
