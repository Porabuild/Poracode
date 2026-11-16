import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  ProfileCoreStats,
  ProfilePeriodSnapshot,
  ProfileTokenStats,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ActivityInsights } from "./ActivityInsights";

function period(
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

describe("ActivityInsights", () => {
  it("renders period pulse cards, trend/switch/behavior highlights, and core metrics in one view", () => {
    const core: ProfileCoreStats = {
      scope: "all",
      device: { id: "dev-1", label: "MacBook Pro", platform: "darwin", isCurrent: true },
      generatedAt: 1000,
      timezoneOffsetMinutes: 0,
      identity: { name: "Ada", handle: "ada", avatarColor: "#663399" },
      totals: {
        totalThreads: 40,
        totalPrompts: 150,
        messagesSent: 180,
        goalsSet: 12,
        longestTaskMs: 35 * 60_000,
        currentStreakDays: 6,
        longestStreakDays: 10,
        activeDays: 20,
      },
      promptHeatmap: {
        metric: "prompts",
        windowDays: 364,
        max: 12,
        cells: [
          { day: "2026-10-11", count: 4, intensity: 1 },
          { day: "2026-10-12", count: 6, intensity: 2 },
          { day: "2026-10-13", count: 5, intensity: 2 },
          { day: "2026-10-14", count: 8, intensity: 3 },
          { day: "2026-10-15", count: 3, intensity: 1 },
          { day: "2026-10-16", count: 12, intensity: 4 },
          { day: "2026-10-17", count: 4, intensity: 1 },
        ],
      },
      insights: {
        topProvider: { key: "beta", label: "Beta", count: 90, percent: 60 },
        topModel: { key: "beta\x1fmodel-b", label: "model-b (Beta)", count: 80, percent: 53.3 },
        topReasoning: { key: "high", label: "High", count: 100, percent: 66.7 },
        fastModePercent: 40,
        mostActiveHour: { hour: 23, label: "11 PM", count: 45 },
        skillsExplored: 3,
        totalSkillsUsed: 14,
        workflowRuns: 5,
        subagentRuns: 9,
        mcpToolCalls: 22,
      },
      providers: [],
      accounts: [],
      models: [],
      modes: [],
      skills: [],
      mcps: [],
      aiActions: [],
      availableAccounts: [],
      recent: {
        today: period(1, {
          prompts: 4,
          providers: [{ key: "beta", label: "Beta", count: 4, percent: 100 }],
        }),
        yesterday: period(1, {
          prompts: 12,
          providers: [{ key: "beta", label: "Beta", count: 10, percent: 83.3 }],
          models: [{ key: "beta\x1fmodel-b", label: "model-b (Beta)", count: 10, percent: 83.3 }],
        }),
        last7d: period(7, {
          prompts: 42,
          threads: 12,
          activeDays: 6,
          totalTurnMs: 2_520_000,
          fastTurns: 18,
          effortTurns: 20,
          weekdayPrompts: 30,
          weekendPrompts: 12,
          providers: [
            { key: "beta", label: "Beta", count: 30, percent: 71.4 },
            { key: "alpha", label: "Alpha", count: 12, percent: 28.6 },
          ],
          models: [
            { key: "beta\x1fmodel-b", label: "model-b (Beta)", count: 30, percent: 71.4 },
            { key: "alpha\x1fmodel-a", label: "model-a (Alpha)", count: 12, percent: 28.6 },
          ],
          modes: [
            { key: "chat", label: "Chat", count: 10, percent: 83.3 },
            { key: "cli", label: "CLI", count: 2, percent: 16.7 },
          ],
          efforts: [{ key: "high", label: "High", count: 16, percent: 80 }],
          hours: [{ hour: 23, count: 25 }],
          skills: [{ name: "verify", displayName: "verify", kind: "skill", runCount: 5 }],
          mcps: [{ name: "browser", displayName: "Browser", kind: "mcp", runCount: 4 }],
          aiActions: [{ type: "commit", label: "AI commits", count: 3 }],
          subagentRuns: 6,
          workflowRuns: 3,
        }),
        prev7d: period(7, {
          prompts: 30,
          threads: 10,
          activeDays: 5,
          totalTurnMs: 1_500_000,
          fastTurns: 2,
          providers: [
            { key: "alpha", label: "Alpha", count: 22, percent: 73.3 },
            { key: "beta", label: "Beta", count: 8, percent: 26.7 },
          ],
          models: [
            { key: "alpha\x1fmodel-a", label: "model-a (Alpha)", count: 22, percent: 73.3 },
            { key: "beta\x1fmodel-b", label: "model-b (Beta)", count: 8, percent: 26.7 },
          ],
          modes: [{ key: "cli", label: "CLI", count: 7, percent: 70 }],
          hours: [{ hour: 10, count: 15 }],
        }),
        last30d: period(30, {
          prompts: 90,
          activeDays: 15,
          weekdayPrompts: 70,
          weekendPrompts: 20,
        }),
        prev30d: period(30, { prompts: 60, activeDays: 12 }),
      },
    };

    const tokens: ProfileTokenStats = {
      available: true,
      scope: "all",
      device: core.device,
      generatedAt: 1000,
      timezoneOffsetMinutes: 0,
      windowDays: 364,
      lifetimeTokens: 500_000,
      peakDayTokens: 100_000,
      providers: [],
      accounts: [],
      models: [],
      tokenHeatmap: { metric: "tokens", windowDays: 364, max: 0, cells: [] },
      unavailableProviders: [],
      recent: {
        today: {
          tokens: 10_000,
          estimatedUsd: 0.2,
          observed: [],
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          providers: [],
          models: [],
        },
        yesterday: {
          tokens: 45_000,
          estimatedUsd: 0.8,
          observed: [],
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          providers: [],
          models: [],
        },
        last7d: {
          tokens: 150_000,
          estimatedUsd: 2.5,
          observed: [],
          inputTokens: 30_000,
          outputTokens: 20_000,
          cacheReadTokens: 60_000,
          cacheWriteTokens: 10_000,
          providers: [],
          models: [],
        },
        prev7d: {
          tokens: 100_000,
          estimatedUsd: 1.5,
          observed: [],
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          providers: [],
          models: [],
        },
        last30d: {
          tokens: 300_000,
          estimatedUsd: 5,
          observed: [],
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          providers: [],
          models: [],
        },
        prev30d: {
          tokens: 200_000,
          estimatedUsd: 3,
          observed: [],
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          providers: [],
          models: [],
        },
      },
    };

    render(<ActivityInsights core={core} tokens={tokens} window="all" />);

    expect(screen.getByText("Activity insights")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("12 prompts")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("42 prompts")).toBeInTheDocument();
    expect(screen.getByText("Work rhythm")).toBeInTheDocument();
    expect(
      document.querySelector('[data-profile-insight="insight:provider-switch"]'),
    ).toHaveTextContent(/switched from Alpha to Beta/i);
    expect(
      document.querySelector('[data-profile-insight="insight:provider-delta:alpha"]'),
    ).toHaveTextContent(/used Alpha 45% less/i);
    expect(screen.getByText("Most used provider")).toBeInTheDocument();

    // Expands hidden highlights beyond the initial 8.
    const expandButton = screen.getByRole("button", { name: /Show all \d+ insights/ });
    fireEvent.click(expandButton);
    expect(screen.getByRole("button", { name: /Show fewer insights/ })).toBeInTheDocument();
  });
});
