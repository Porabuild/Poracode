import { describe, expect, it } from "vitest";
import { resolveConflictResolverConfig } from "./ProviderIcon";
import "./claude";
import "./codex";
import "./gemini";

const claudeStatus = {
  kind: "claude",
  capabilities: {
    models: [
      { id: "claude-opus-4-6[1m]", label: "Opus 1M" },
      { id: "sonnet", label: "Sonnet" },
      { id: "haiku", label: "Haiku" },
    ],
    efforts: ["low", "medium", "high", "max"],
    defaultEffort: "high" as string | undefined,
    modelEfforts: {
      haiku: [] as string[],
      sonnet: ["low", "medium", "high"],
    } as Record<string, string[]>,
  },
};

const codexStatus = {
  kind: "codex",
  capabilities: {
    models: [
      { id: "gpt-5.4", label: "5.4" },
      { id: "gpt-5.4-mini", label: "5.4 Mini" },
    ],
    efforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high" as string | undefined,
    modelEfforts: {} as Record<string, string[]>,
  },
};

describe("resolveConflictResolverConfig", () => {
  it("falls back to registered defaults (Claude → Opus)", () => {
    const result = resolveConflictResolverConfig(claudeStatus, "", "");
    expect(result.model).toBe("claude-opus-4-6[1m]");
  });

  it("falls back to registered defaults (Codex → GPT-5.4)", () => {
    const result = resolveConflictResolverConfig(codexStatus, "", "");
    expect(result.model).toBe("gpt-5.4");
  });

  it("preserves user-selected model when it exists in capabilities", () => {
    const result = resolveConflictResolverConfig(claudeStatus, "sonnet", "");
    expect(result.model).toBe("sonnet");
  });

  it("falls back to default when user-selected model is not in capabilities", () => {
    const result = resolveConflictResolverConfig(claudeStatus, "nonexistent", "");
    expect(result.model).toBe("claude-opus-4-6[1m]");
  });

  it("returns empty for undefined agent", () => {
    const result = resolveConflictResolverConfig(undefined, "sonnet", "high");
    expect(result).toEqual({ model: "", effort: "", availableEfforts: [] });
  });

  it("resolves model-specific efforts", () => {
    const result = resolveConflictResolverConfig(claudeStatus, "sonnet", "low");
    expect(result.effort).toBe("low");
    expect(result.availableEfforts).toEqual(["low", "medium", "high"]);
  });

  it("falls back to global efforts when model has empty modelEfforts", () => {
    // haiku has modelEfforts: [] → falls back to global efforts
    const result = resolveConflictResolverConfig(claudeStatus, "haiku", "");
    expect(result.availableEfforts).toEqual(["low", "medium", "high", "max"]);
  });
});
