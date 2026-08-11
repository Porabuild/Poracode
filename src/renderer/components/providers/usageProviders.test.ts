import { describe, expect, it } from "vitest";
import type { UsageSnapshot, UsageStatus, UsageWindow } from "@poracode/agents-usage";
import type { AgentInstanceConfigMap } from "@/shared/contracts";
import {
  hasRailUsage,
  isClaudeUsageProvider,
  needsBrowserSessionForUsage,
  pickUsageRings,
  resolveDisplayedProviders,
  supportsApiKeyLogin,
  supportsBrowserLogin,
  usageProvidersForAgentInstances,
  usageRingGroups,
} from "./usageProviders";

const agentInstances: AgentInstanceConfigMap = {
  work: {
    id: "work",
    driver: "claude",
    displayName: "Work",
    config: { configDir: "~/.poracode/claude-profiles/work" },
  },
  home: {
    id: "home",
    driver: "claude",
    displayName: "Home",
    config: { configDir: "~/.poracode/claude-profiles/home" },
  },
  disabled: {
    id: "disabled",
    driver: "claude",
    displayName: "Disabled",
    enabled: false,
    config: { configDir: "~/.poracode/claude-profiles/disabled" },
  },
};

describe("usageProviders", () => {
  it("recognizes base Claude and Claude profile usage providers", () => {
    expect(isClaudeUsageProvider("claude")).toBe(true);
    expect(isClaudeUsageProvider("claude:work")).toBe(true);
    expect(isClaudeUsageProvider("codex")).toBe(false);
  });

  it("derives API-key login support from provider descriptors", () => {
    expect(supportsApiKeyLogin("zai")).toBe(true);
    expect(supportsApiKeyLogin("kimi")).toBe(true);
    expect(supportsApiKeyLogin("qwen")).toBe(true);
    expect(supportsApiKeyLogin("grok")).toBe(false);
    expect(supportsBrowserLogin("qwen")).toBe(true);
  });

  it("identifies providers whose empty local snapshot still needs browser usage auth", () => {
    expect(needsBrowserSessionForUsage("opencode")).toBe(true);
    expect(needsBrowserSessionForUsage("grok")).toBe(false);
  });

  it("adds Claude profile providers after the base Claude provider", () => {
    const providers = usageProvidersForAgentInstances(agentInstances);
    const claudeIndex = providers.findIndex((provider) => provider.id === "claude");

    expect(providers.slice(claudeIndex, claudeIndex + 3).map((provider) => provider.id)).toEqual([
      "claude",
      "claude:home",
      "claude:work",
    ]);
    expect(providers.find((provider) => provider.id === "claude:home")?.label).toBe("Claude Home");
  });

  it("orders, disables, and rings Claude profiles like Claude", () => {
    const providers = resolveDisplayedProviders(
      ["claude:work", "claude"],
      ["claude:home"],
      agentInstances,
    );
    expect(providers.slice(0, 2).map((provider) => provider.id)).toEqual(["claude:work", "claude"]);
    expect(providers.some((provider) => provider.id === "claude:home")).toBe(false);

    const windows: UsageWindow[] = [
      { id: "weekly", label: "Weekly", usedPercent: 20, unit: "percent" },
      { id: "session-5h", label: "Session", usedPercent: 60, unit: "percent" },
    ];
    expect(pickUsageRings("claude:work", windows)).toEqual({
      outer: windows[1],
      inner: windows[0],
    });
  });

  it("uses the Fable weekly window as a Claude inner ring when present", () => {
    const windows: UsageWindow[] = [
      { id: "session-5h", label: "Session", usedPercent: 80, unit: "percent" },
      { id: "weekly-fable", label: "Weekly (Fable)", usedPercent: 25, unit: "percent" },
    ];
    expect(pickUsageRings("claude", windows)).toEqual({
      outer: windows[0],
      inner: windows[1],
    });
  });

  it("rings z.ai with the 5h window only when there is no weekly (MCP/monthly stays off the ring)", () => {
    const windows: UsageWindow[] = [
      { id: "session-5h", label: "Session (5h)", usedPercent: 0 },
      { id: "monthly", label: "MCP", usedPercent: 2 },
    ];
    const rings = pickUsageRings("zai", windows);
    expect(rings.outer?.id).toBe("session-5h");
    expect(rings.inner).toBeUndefined();
  });

  it("rings z.ai with 5h + weekly when a weekly window is present, never the monthly MCP window", () => {
    const windows: UsageWindow[] = [
      { id: "session-5h", label: "Session (5h)", usedPercent: 25 },
      { id: "weekly", label: "Weekly", usedPercent: 9 },
      { id: "monthly", label: "MCP", usedPercent: 22 },
    ];
    const rings = pickUsageRings("zai", windows);
    expect(rings.outer?.id).toBe("session-5h");
    expect(rings.inner?.id).toBe("weekly");
  });

  it("rings Kimi with the 5h rate limit outside and the weekly quota inside", () => {
    const windows: UsageWindow[] = [
      { id: "weekly", label: "Weekly", usedPercent: 10 },
      { id: "session-5h", label: "Session (5h)", usedPercent: 70 },
    ];
    const rings = pickUsageRings("kimi", windows);
    expect(rings.outer?.id).toBe("session-5h");
    expect(rings.inner?.id).toBe("weekly");
  });

  it("rings Alibaba Token Plan with the 5h quota outside and weekly quota inside", () => {
    const windows: UsageWindow[] = [
      { id: "monthly", label: "Monthly", usedPercent: 5 },
      { id: "weekly", label: "Weekly", usedPercent: 10 },
      { id: "session-5h", label: "Session (5h)", usedPercent: 70 },
    ];
    const rings = pickUsageRings("qwen", windows);
    expect(rings.outer?.id).toBe("session-5h");
    expect(rings.inner?.id).toBe("weekly");
  });

  describe("Antigravity ring groups", () => {
    const windows: UsageWindow[] = [
      { id: "antigravity:gemini:session-5h", label: "Gemini · 5h", usedPercent: 60 },
      { id: "antigravity:gemini:weekly", label: "Gemini · Weekly", usedPercent: 11 },
      { id: "antigravity:claude:session-5h", label: "Claude · 5h", usedPercent: 0 },
      { id: "antigravity:claude:weekly", label: "Claude · Weekly", usedPercent: 0 },
    ];

    it("exposes the Gemini and Claude+GPT swap groups", () => {
      expect(usageRingGroups("antigravity").map((g) => g.key)).toEqual(["gemini", "claude"]);
      expect(usageRingGroups("claude")).toEqual([]);
    });

    it("defaults to the Gemini group (5h outer, weekly inner)", () => {
      const rings = pickUsageRings("antigravity", windows);
      expect(rings.outer?.id).toBe("antigravity:gemini:session-5h");
      expect(rings.inner?.id).toBe("antigravity:gemini:weekly");
    });

    it("swaps to the Claude group when selected", () => {
      const rings = pickUsageRings("antigravity", windows, "claude");
      expect(rings.outer?.id).toBe("antigravity:claude:session-5h");
      expect(rings.inner?.id).toBe("antigravity:claude:weekly");
    });

    it("falls back to the most-constrained window when the selected group is absent", () => {
      const onlyClaude = windows.filter((w) => w.id.startsWith("antigravity:claude"));
      // Selecting the Gemini group but only Claude windows are present.
      const rings = pickUsageRings("antigravity", onlyClaude, "gemini");
      expect(rings.outer?.id).toBe("antigravity:claude:session-5h");
      expect(rings.inner).toBeUndefined();
    });
  });
});

describe("hasRailUsage", () => {
  const snapshot = (status: UsageStatus): UsageSnapshot => ({
    providerId: "kimi",
    status,
    windows: [],
    fetchedAt: 0,
  });

  // Signed-out and usage-less providers belong in Settings, not the rail;
  // everything else is readable now or recovers on its own. `undefined` keeps a
  // cold start from painting an empty rail.
  it.each<[UsageStatus | "pending", boolean]>([
    ["ok", true],
    ["app-not-running", true],
    ["rate-limited", true],
    ["quota-hit", true],
    ["error", true],
    ["pending", true],
    ["auth-missing", false],
    ["unsupported", false],
  ])("keeps %s in the rail: %s", (status, expected) => {
    expect(hasRailUsage(status === "pending" ? undefined : snapshot(status))).toBe(expected);
  });
});
