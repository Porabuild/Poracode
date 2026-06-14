import { describe, expect, it } from "vitest";
import type { UsageWindow } from "@lightcode/agents-usage";
import type { AgentInstanceConfigMap } from "@/shared/contracts";
import {
  pickUsageRings,
  resolveDisplayedProviders,
  usageProvidersForAgentInstances,
} from "./usageProviders";

const agentInstances: AgentInstanceConfigMap = {
  work: {
    id: "work",
    driver: "claude",
    displayName: "Work",
    config: { configDir: "~/.lightcode/claude-profiles/work" },
  },
  home: {
    id: "home",
    driver: "claude",
    displayName: "Home",
    config: { configDir: "~/.lightcode/claude-profiles/home" },
  },
  disabled: {
    id: "disabled",
    driver: "claude",
    displayName: "Disabled",
    enabled: false,
    config: { configDir: "~/.lightcode/claude-profiles/disabled" },
  },
};

describe("usageProviders", () => {
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
});
