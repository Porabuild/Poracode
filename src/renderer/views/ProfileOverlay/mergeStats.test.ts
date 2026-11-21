import { describe, expect, it } from "vitest";
import type { ProfileCoreStats, ProfileDevice, ProfileTokenStats } from "@/shared/contracts";
import type { ProfileCostStats, ProfileCostTotals } from "@/shared/contracts/costHistory";
import { mergeProfileCoreStats, mergeProfileTokenStats } from "./mergeStats";

function makeDevice(id: string, label: string, isCurrent = false): ProfileDevice {
  return { id, label, platform: "darwin", isCurrent, lastActiveAt: 1_700_000_000_000 };
}

function makeCore(overrides: Partial<ProfileCoreStats>): ProfileCoreStats {
  const device = overrides.device ?? makeDevice("dev-a", "MacBook", true);
  return {
    scope: "device",
    device,
    generatedAt: 1000,
    timezoneOffsetMinutes: 0,
    identity: {
      name: "Alice",
      handle: "alice",
      avatarColor: "oklch(0.62 0.11 245)",
      plan: "Local",
    },
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
    promptHeatmap: {
      metric: "prompts",
      windowDays: 7,
      max: 0,
      cells: [
        { day: "2026-10-14", count: 0, intensity: 0 },
        { day: "2026-10-15", count: 0, intensity: 0 },
        { day: "2026-10-16", count: 0, intensity: 0 },
        { day: "2026-10-17", count: 0, intensity: 0 },
      ],
    },
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

function makeCostTotals(tokens: number, usd: number, eur = 0): ProfileCostTotals {
  return {
    tokens,
    unpricedTokens: 0,
    categorizedTokens: tokens,
    observedTokens: eur > 0 ? tokens : 0,
    estimatedTokens: usd > 0 ? tokens : 0,
    observedSamples: eur > 0 ? 1 : 0,
    estimatedSamples: usd > 0 ? 1 : 0,
    observed: eur > 0 ? [{ amount: eur, currency: "EUR" }] : [],
    estimatedUsd: usd,
    categories: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

function makeTokens(overrides: Partial<ProfileTokenStats>): ProfileTokenStats {
  const device = overrides.device ?? makeDevice("dev-a", "MacBook", true);
  return {
    available: true,
    scope: "device",
    device,
    generatedAt: 1000,
    timezoneOffsetMinutes: 0,
    windowDays: 7,
    lifetimeTokens: 0,
    peakDayTokens: 0,
    providers: [],
    accounts: [],
    models: [],
    tokenHeatmap: {
      metric: "tokens",
      windowDays: 7,
      max: 0,
      cells: [
        { day: "2026-10-14", count: 0, intensity: 0 },
        { day: "2026-10-15", count: 0, intensity: 0 },
        { day: "2026-10-16", count: 0, intensity: 0 },
        { day: "2026-10-17", count: 0, intensity: 0 },
      ],
    },
    unavailableProviders: [],
    ...overrides,
  };
}

describe("mergeProfileCoreStats", () => {
  it("does not invent global winners or complete plugin rankings from legacy summaries", () => {
    const a = makeCore({});
    const b = makeCore({ device: makeDevice("dev-b", "Remote") });
    a.insights.mostActiveHour = { hour: 10, label: "10 AM", count: 10 };
    b.insights.mostActiveHour = { hour: 11, label: "11 AM", count: 10 };
    a.insights.topReasoning = { key: "high", label: "High", count: 10, percent: 52.6 };
    b.insights.topReasoning = { key: "low", label: "Low", count: 10, percent: 52.6 };
    a.insights.totalSkillsUsed = 100;
    a.insights.skillsExplored = 9;
    a.skills = [{ name: "verify", displayName: "verify", kind: "skill", runCount: 10 }];
    const merged = mergeProfileCoreStats([a, b]);
    expect(merged.insights.mostActiveHour).toBeUndefined();
    expect(merged.insights.topReasoning).toBeUndefined();
    expect(merged.incompleteDetails?.skills).toBe(true);
    expect(merged.skills).toEqual([]);
    expect(merged.insights.totalSkillsUsed).toBe(100);
    expect(mergeProfileCoreStats([a]).insights).toEqual(a.insights);
  });
  it("merges totals, heatmaps, cross-device streaks, breakdowns, and plugins", () => {
    const devA = makeCore({
      device: makeDevice("dev-a", "Local PC", true),
      generatedAt: 1000,
      totals: {
        totalThreads: 3,
        totalPrompts: 4,
        messagesSent: 5,
        goalsSet: 2,
        longestTaskMs: 12_000,
        currentStreakDays: 1,
        longestStreakDays: 1,
        activeDays: 2,
      },
      promptHeatmap: {
        metric: "prompts",
        windowDays: 7,
        max: 3,
        cells: [
          { day: "2026-10-14", count: 1, intensity: 2 },
          { day: "2026-10-15", count: 0, intensity: 0 },
          { day: "2026-10-16", count: 3, intensity: 4 },
          { day: "2026-10-17", count: 0, intensity: 0 },
        ],
      },
      insights: {
        topProvider: { key: "claude", label: "Claude", count: 4, percent: 100 },
        topReasoning: { key: "high", label: "High", count: 2, percent: 50 },
        fastModePercent: 50,
        mostActiveHour: { hour: 14, label: "2 PM", count: 3 },
        skillsExplored: 2,
        totalSkillsUsed: 3,
        workflowRuns: 1,
        subagentRuns: 4,
        mcpToolCalls: 10,
      },
      providers: [{ key: "claude", label: "Claude", count: 4, percent: 100 }],
      accounts: [{ key: "claude:work", label: "Claude - work", count: 4, percent: 100 }],
      models: [
        { key: "claude:work\x1fopus", label: "opus (Claude - work)", count: 4, percent: 100 },
      ],
      modes: [{ key: "chat", label: "Chat", count: 3, percent: 100 }],
      skills: [{ name: "verify", displayName: "verify", kind: "skill", runCount: 3 }],
      mcps: [{ name: "github", displayName: "GitHub", kind: "mcp", runCount: 5 }],
      aiActions: [{ type: "commit", label: "AI commits", count: 2, topProvider: "Claude" }],
      availableAccounts: [{ key: "claude:work", label: "Claude - work" }],
    });

    const devB = makeCore({
      device: makeDevice("dev-b", "Remote Box", false),
      generatedAt: 2000,
      totals: {
        totalThreads: 2,
        totalPrompts: 6,
        messagesSent: 7,
        goalsSet: 1,
        longestTaskMs: 30_000,
        currentStreakDays: 1,
        longestStreakDays: 1,
        activeDays: 2,
      },
      promptHeatmap: {
        metric: "prompts",
        windowDays: 7,
        max: 4,
        cells: [
          { day: "2026-10-14", count: 0, intensity: 0 },
          { day: "2026-10-15", count: 2, intensity: 2 },
          { day: "2026-10-16", count: 0, intensity: 0 },
          { day: "2026-10-17", count: 4, intensity: 4 },
        ],
      },
      insights: {
        topProvider: { key: "codex", label: "Codex", count: 6, percent: 100 },
        topReasoning: { key: "high", label: "High", count: 6, percent: 100 },
        fastModePercent: 0,
        mostActiveHour: { hour: 14, label: "2 PM", count: 5 },
        skillsExplored: 3,
        totalSkillsUsed: 4,
        workflowRuns: 2,
        subagentRuns: 6,
        mcpToolCalls: 20,
      },
      providers: [{ key: "codex", label: "Codex", count: 6, percent: 100 }],
      accounts: [{ key: "codex:default", label: "Codex - default", count: 6, percent: 100 }],
      models: [
        {
          key: "codex:default\x1fgpt-5.3",
          label: "gpt-5.3 (Codex - default)",
          count: 6,
          percent: 100,
        },
      ],
      modes: [{ key: "cli", label: "CLI", count: 2, percent: 100 }],
      skills: [{ name: "verify", displayName: "verify", kind: "skill", runCount: 2 }],
      mcps: [{ name: "linear", displayName: "Linear", kind: "mcp", runCount: 8 }],
      aiActions: [
        { type: "commit", label: "AI commits", count: 5, topProvider: "Codex" },
        { type: "pr", label: "AI pull requests", count: 1 },
      ],
      availableAccounts: [{ key: "codex:default", label: "Codex - default" }],
    });

    const merged = mergeProfileCoreStats([devA, devB]);
    expect(merged.scope).toBe("all");
    expect(merged.totals).toEqual({
      totalThreads: 5,
      totalPrompts: 10,
      messagesSent: 12,
      goalsSet: 3,
      longestTaskMs: 30_000,
      // Alternating days across devices form a continuous 4-day streak!
      currentStreakDays: 4,
      longestStreakDays: 4,
      activeDays: 4,
    });
    expect(merged.providers).toEqual([
      { key: "codex", label: "Codex", count: 6, percent: 60 },
      { key: "claude", label: "Claude", count: 4, percent: 40 },
    ]);
    expect(merged.insights.fastModePercent).toBe(20);
    expect(merged.insights.mostActiveHour).toBeUndefined();
    expect(merged.insights.topReasoning).toBeUndefined();
    expect(merged.skills).toEqual([]);
    expect(merged.incompleteDetails?.skills).toBe(true);
    expect(merged.mcps).toEqual([]);
    expect(merged.incompleteDetails?.mcps).toBe(true);
    expect(merged.aiActions).toEqual([
      { type: "commit", label: "AI commits", count: 7 },
      { type: "pr", label: "AI pull requests", count: 1 },
    ]);
    expect(merged.availableAccounts.map((a) => a.key)).toEqual(["codex:default", "claude:work"]);
  });

  it("merges recent period snapshots and derives mostActiveHour and topReasoning across devices", () => {
    const emptySnapshot = {
      days: 7,
      activeDays: 1,
      threads: 1,
      prompts: 2,
      messages: 2,
      goals: 0,
      longestTaskMs: 1000,
      totalTurnMs: 2000,
      fastTurns: 1,
      effortTurns: 1,
      skillsUsed: 0,
      workflowRuns: 0,
      subagentRuns: 0,
      mcpToolCalls: 0,
      weekdayPrompts: 2,
      weekendPrompts: 0,
      providers: [{ key: "alpha", label: "Alpha", count: 2, percent: 100 }],
      models: [],
      modes: [{ key: "chat", label: "Chat", count: 1, percent: 100 }],
      efforts: [{ key: "high", label: "High", count: 1, percent: 100 }],
      hours: [{ hour: 21, count: 2 }],
      skills: [],
      mcps: [],
      aiActions: [],
    };
    const devA = makeCore({
      recent: {
        today: { ...emptySnapshot, days: 1, prompts: 1 },
        yesterday: { ...emptySnapshot, days: 1, prompts: 2 },
        last7d: emptySnapshot,
        prev7d: { ...emptySnapshot, prompts: 4 },
        last30d: { ...emptySnapshot, days: 30, prompts: 6 },
        prev30d: { ...emptySnapshot, days: 30, prompts: 0 },
        windowHours: [
          { hour: 10, count: 3 },
          { hour: 21, count: 4 },
        ],
      },
    });
    const devB = makeCore({
      device: makeDevice("dev-b", "Remote Box"),
      recent: {
        today: { ...emptySnapshot, days: 1, prompts: 2 },
        yesterday: { ...emptySnapshot, days: 1, prompts: 3 },
        last7d: { ...emptySnapshot, prompts: 3 },
        prev7d: { ...emptySnapshot, prompts: 1 },
        last30d: { ...emptySnapshot, days: 30, prompts: 4 },
        prev30d: { ...emptySnapshot, days: 30, prompts: 0 },
        windowHours: [{ hour: 21, count: 5 }],
      },
    });
    const merged = mergeProfileCoreStats([devA, devB]);
    expect(merged.insights.mostActiveHour).toEqual({ hour: 21, label: "9 PM", count: 9 });
    expect(merged.insights.topReasoning).toEqual({
      key: "high",
      label: "High",
      count: 2,
      percent: 100,
    });
    expect(merged.recent?.yesterday.prompts).toBe(5);
    expect(merged.recent?.last7d.prompts).toBe(5);
    expect(merged.recent?.prev7d.prompts).toBe(5);
  });
});

describe("mergeProfileTokenStats", () => {
  it("marks lifetime peaks unavailable when an older host only supplies a truncated heatmap", () => {
    const a = makeTokens({ lifetimeTokens: 10_000, peakDayTokens: 9000 });
    const b = makeTokens({ device: makeDevice("dev-b", "Remote"), lifetimeTokens: 5000 });
    const merged = mergeProfileTokenStats([a, b]);
    expect(merged.lifetimeTokens).toBe(15_000);
    expect(merged.incompletePeak).toBe(true);
    expect(merged.peakDay).toBeUndefined();
  });
  it("sums token counts, heatmaps, peak day, unavailable providers, and cost stats", () => {
    const costA: ProfileCostStats = {
      totals: {
        ...makeCostTotals(1000, 1.5, 2),
        cacheSavingsUsd: 0.4,
        categoryCostUsd: { input: 1, output: 0.5, cacheRead: 0, cacheWrite: 0 },
      },
      days: [{ day: "2026-10-16", totals: makeCostTotals(1000, 1.5, 2) }],
      providers: [{ key: "claude", label: "Claude", totals: makeCostTotals(1000, 1.5, 2) }],
      models: [],
      accounts: [],
      pricing: [],
      dayProviders: [
        { day: "2026-10-16", provider: "claude", totals: makeCostTotals(1000, 1.5, 2) },
      ],
      dayModels: [
        {
          day: "2026-10-16",
          model: "claude:work\x1fclaude-sonnet-4-6",
          totals: makeCostTotals(1000, 1.5, 2),
        },
      ],
    };
    const costB: ProfileCostStats = {
      totals: {
        ...makeCostTotals(3000, 3.0, 1),
        cacheSavingsUsd: 0.6,
        categoryCostUsd: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0 },
      },
      days: [{ day: "2026-10-16", totals: makeCostTotals(3000, 3.0, 1) }],
      providers: [{ key: "codex", label: "Codex", totals: makeCostTotals(3000, 3.0, 1) }],
      models: [],
      accounts: [],
      pricing: [],
      dayProviders: [
        { day: "2026-10-16", provider: "codex", totals: makeCostTotals(3000, 3.0, 1) },
      ],
      dayModels: [],
    };
    const tokA = makeTokens({
      lifetimeTokens: 1000,
      peakDayTokens: 1000,
      peakDay: "2026-10-16",
      providers: [{ provider: "claude", label: "Claude", tokens: 1000, percent: 100 }],
      tokenHeatmap: {
        metric: "tokens",
        windowDays: 7,
        max: 1000,
        cells: [{ day: "2026-10-16", count: 1000, intensity: 4 }],
      },
      unavailableProviders: ["qwen"],
      costs: costA,
    });
    const tokB = makeTokens({
      device: makeDevice("dev-b", "Remote Box", false),
      lifetimeTokens: 3000,
      peakDayTokens: 3000,
      peakDay: "2026-10-16",
      providers: [{ provider: "codex", label: "Codex", tokens: 3000, percent: 100 }],
      tokenHeatmap: {
        metric: "tokens",
        windowDays: 7,
        max: 3000,
        cells: [{ day: "2026-10-16", count: 3000, intensity: 4 }],
      },
      unavailableProviders: ["deepseek", "qwen"],
      costs: costB,
    });

    const merged = mergeProfileTokenStats([tokA, tokB]);
    expect(merged.lifetimeTokens).toBe(4000);
    expect(merged.peakDay).toBe("2026-10-16");
    expect(merged.peakDayTokens).toBe(4000);
    expect(merged.providers).toEqual([
      { provider: "codex", label: "Codex", tokens: 3000, percent: 75 },
      { provider: "claude", label: "Claude", tokens: 1000, percent: 25 },
    ]);
    expect(merged.unavailableProviders).toEqual(["deepseek", "qwen"]);
    expect(merged.costs?.totals.tokens).toBe(4000);
    expect(merged.costs?.totals.estimatedUsd).toBe(4.5);
    expect(merged.costs?.totals.cacheSavingsUsd).toBeCloseTo(1.0);
    expect(merged.costs?.totals.categoryCostUsd).toEqual({
      input: 3,
      output: 1.5,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(merged.costs?.totals.observed).toEqual([{ amount: 3, currency: "EUR" }]);
    expect(merged.costs?.days[0]?.totals.tokens).toBe(4000);
    expect(merged.costs?.dayProviders?.map((entry) => entry.provider)).toEqual(["claude", "codex"]);
    expect(merged.costs?.dayModels?.map((entry) => entry.model)).toEqual([
      "claude:work\x1fclaude-sonnet-4-6",
    ]);
  });

  it("omits dayProviders and dayModels when merging with a pre-upgrade host that lacks them", () => {
    const upgraded = makeTokens({
      lifetimeTokens: 1000,
      costs: {
        totals: makeCostTotals(1000, 1.5),
        days: [{ day: "2026-10-16", totals: makeCostTotals(1000, 1.5) }],
        providers: [{ key: "claude", label: "Claude", totals: makeCostTotals(1000, 1.5) }],
        models: [
          {
            key: "claude\x1fclaude-sonnet-4-6",
            label: "claude-sonnet-4-6 (Claude)",
            totals: makeCostTotals(1000, 1.5),
          },
        ],
        accounts: [],
        pricing: [],
        dayProviders: [
          { day: "2026-10-16", provider: "claude", totals: makeCostTotals(1000, 1.5) },
        ],
        dayModels: [
          {
            day: "2026-10-16",
            model: "claude\x1fclaude-sonnet-4-6",
            totals: makeCostTotals(1000, 1.5),
          },
        ],
      },
    });
    const preUpgrade = makeTokens({
      device: makeDevice("dev-legacy", "Older Host", false),
      lifetimeTokens: 2000,
      costs: {
        totals: makeCostTotals(2000, 3.0),
        days: [{ day: "2026-10-16", totals: makeCostTotals(2000, 3.0) }],
        providers: [{ key: "codex", label: "Codex", totals: makeCostTotals(2000, 3.0) }],
        models: [
          {
            key: "codex\x1fgpt-5.3-codex",
            label: "gpt-5.3-codex (Codex)",
            totals: makeCostTotals(2000, 3.0),
          },
        ],
        accounts: [],
        pricing: [],
      },
    });

    const merged = mergeProfileTokenStats([upgraded, preUpgrade]);
    expect(merged.costs?.totals.estimatedUsd).toBe(4.5);
    expect(merged.costs?.dayProviders).toBeUndefined();
    expect(merged.costs?.dayModels).toBeUndefined();
  });
});
