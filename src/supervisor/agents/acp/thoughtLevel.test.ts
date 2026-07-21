import { describe, expect, it } from "vitest";
import { THOUGHT_LEVEL_CONFIG_OPTION_IDS, findThoughtLevelConfigOption } from "./thoughtLevel";

describe("findThoughtLevelConfigOption", () => {
  it("returns undefined for non-array input", () => {
    expect(findThoughtLevelConfigOption(undefined)).toBeUndefined();
    expect(findThoughtLevelConfigOption(null)).toBeUndefined();
    expect(findThoughtLevelConfigOption("thought_level")).toBeUndefined();
    expect(findThoughtLevelConfigOption({ id: "thought_level" })).toBeUndefined();
    expect(findThoughtLevelConfigOption(42)).toBeUndefined();
  });

  it("returns undefined for an empty array", () => {
    expect(findThoughtLevelConfigOption([])).toBeUndefined();
  });

  it("matches the spec-shaped thought_level category first", () => {
    const options = [
      { id: "reasoning_effort", category: "model", type: "select", options: ["low", "high"] },
      { id: "thought_level", category: "thought_level", type: "select", options: ["low", "high"] },
    ];
    const result = findThoughtLevelConfigOption(options);
    expect(result?.category).toBe("thought_level");
  });

  it("falls back to known option ids when no thought_level category exists", () => {
    const options = [
      { id: "model", category: "model", type: "select", options: ["gpt-4", "gpt-3"] },
      { id: "reasoning_effort", category: "model", type: "select", options: ["low", "high"] },
    ];
    const result = findThoughtLevelConfigOption(options);
    expect(result?.id).toBe("reasoning_effort");
  });

  it("never matches the model selector even though it shares category model", () => {
    const options = [
      { id: "model", category: "model", type: "select", options: ["gpt-4", "gpt-3"] },
    ];
    expect(findThoughtLevelConfigOption(options)).toBeUndefined();
  });

  it("ignores non-select options even with a matching id", () => {
    const options = [
      { id: "thought_level", category: "thought_level", type: "text" },
      { id: "reasoning_effort", category: "model", type: "toggle" },
    ];
    expect(findThoughtLevelConfigOption(options)).toBeUndefined();
  });

  it("ignores null and non-object entries", () => {
    const options = [
      null,
      undefined,
      42,
      "thought_level",
      { id: "thought_level", type: "select", category: "thought_level" },
    ];
    const result = findThoughtLevelConfigOption(options);
    expect(result?.id).toBe("thought_level");
  });

  it("handles options with missing id gracefully", () => {
    const options = [{ category: "model", type: "select" }, { type: "select" }];
    expect(findThoughtLevelConfigOption(options)).toBeUndefined();
  });

  it("matches thought_level category regardless of id", () => {
    const options = [
      { id: "custom_name", category: "thought_level", type: "select", options: ["low"] },
    ];
    const result = findThoughtLevelConfigOption(options);
    expect(result?.id).toBe("custom_name");
    expect(result?.category).toBe("thought_level");
  });

  it("exposes the known ids for external consumers", () => {
    expect(THOUGHT_LEVEL_CONFIG_OPTION_IDS).toContain("thought_level");
    expect(THOUGHT_LEVEL_CONFIG_OPTION_IDS).toContain("reasoning_effort");
  });
});
