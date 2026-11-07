// @vitest-environment node

import { describe, expect, it } from "vitest";
import { normalizeProviderModelConfig } from "../modelConfig";

describe("Claude model config normalization", () => {
  it("reads a pre-toggle ultracode effort as xHigh with workflows on", () => {
    expect(
      normalizeProviderModelConfig("claude", { model: "claude-opus-5", effort: "ultracode" }, []),
    ).toEqual({ model: "claude-opus-5", effort: "xHigh", workflows: true });
    expect(
      normalizeProviderModelConfig("claude:work", { model: "opus", effort: "ultracode" }, []),
    ).toMatchObject({ effort: "xHigh", workflows: true });
  });

  it("leaves current configs alone", () => {
    const config = { model: "claude-opus-5", effort: "high", workflows: true };
    expect(normalizeProviderModelConfig("claude", config, [])).toBe(config);
  });
});
