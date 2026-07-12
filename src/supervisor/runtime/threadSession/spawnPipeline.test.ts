import { describe, expect, it } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import { effectiveLaunchConfig } from "./spawnPipeline";

const baseConfig: ThreadConfig = {
  model: "test-model",
  browserMcp: true,
  subagentMcp: true,
  computerUse: true,
  chromeMcp: true,
};

describe("effectiveLaunchConfig — single gate for built-in MCP disables", () => {
  it("returns the config unchanged when nothing is disabled", () => {
    expect(effectiveLaunchConfig(baseConfig, [])).toBe(baseConfig);
  });

  it("clears only the flags whose built-in server is disabled", () => {
    const result = effectiveLaunchConfig(baseConfig, ["browser", "computer-use"]);
    expect(result).toEqual({
      ...baseConfig,
      browserMcp: false,
      computerUse: false,
    });
  });

  it("clears every flag-mapped server when all are disabled", () => {
    const result = effectiveLaunchConfig(baseConfig, [
      "browser",
      "subagents",
      "computer-use",
      "chrome",
      "app-controls",
    ]);
    expect(result).toEqual({
      ...baseConfig,
      browserMcp: false,
      subagentMcp: false,
      computerUse: false,
      chromeMcp: false,
    });
  });

  it("does not mutate the original config", () => {
    effectiveLaunchConfig(baseConfig, ["browser"]);
    expect(baseConfig.browserMcp).toBe(true);
  });
});
