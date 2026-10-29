import { describe, expect, it } from "vitest";
import { claudeContextSizeCapabilities, resolveClaudeContextWindowTokens } from "./contextWindow";

describe("Claude working-window limits", () => {
  it.each([
    ["200k", 200_000],
    ["400k", 400_000],
    ["1m", 1_000_000],
    ["400000", 400_000],
  ])("resolves %s to the CLI token count", (size, tokens) => {
    expect(resolveClaudeContextWindowTokens(size)).toBe(tokens);
  });

  it.each([undefined, "", "auto", "99k", "2m", "-400k"])(
    "leaves an absent or unsupported window %s to the CLI default",
    (size) => expect(resolveClaudeContextWindowTokens(size)).toBeUndefined(),
  );
});

describe("Claude custom context-window catalog", () => {
  const models = {
    modelContextSizes: {
      "claude-fable-5-1": ["1m", "400k"],
      haiku: ["200k"],
      "custom[1m]": ["1m"],
    },
  };

  it("applies saved custom sizes to configurable models and keeps 400k as their default", () => {
    const capabilities = claudeContextSizeCapabilities(models, {
      contextWindows: '["400k","512k","1m"]',
    });
    expect(capabilities.modelContextSizes).toEqual({
      "claude-fable-5-1": ["400k", "512k", "1m"],
      haiku: ["200k"],
      "custom[1m]": ["1m"],
    });
    expect(capabilities.contextSizes).toContainEqual({ id: "512k", label: "512k" });
  });

  it("reads old settings without a window list and falls back from invalid saved values", () => {
    for (const settings of [undefined, { unrelated: true }, { contextWindows: '["99k","2m"]' }]) {
      expect(
        claudeContextSizeCapabilities(models, settings).modelContextSizes?.["claude-fable-5-1"],
      ).toEqual(["400k", "1m"]);
    }
  });

  it("supports a custom-only list without reintroducing a removed preset", () => {
    const capabilities = claudeContextSizeCapabilities(models, { contextWindows: '["768k"]' });
    expect(capabilities.modelContextSizes?.["claude-fable-5-1"]).toEqual(["768k"]);
    expect(capabilities.modelContextSizes?.["custom[1m]"]).toEqual(["1m"]);
    for (const sizes of Object.values(capabilities.modelContextSizes ?? {})) {
      for (const id of sizes) {
        expect(capabilities.contextSizes?.map((window) => window.id)).toContain(id);
      }
    }
  });
});
