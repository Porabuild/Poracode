import { describe, expect, it } from "vitest";
import { resolveConflictResolverConfig } from "./ProviderIcon";
import "./claude";
import "./codex";
import "./cursor";
import "./gemini";

const claudeStatus = {
  kind: "claude",
  capabilities: {
    models: [
      { id: "claude-opus-4-8", label: "Opus 4.8" },
      { id: "claude-opus-4-7", label: "Opus 4.7" },
      { id: "claude-opus-4-6", label: "Opus 4.6" },
      { id: "sonnet", label: "Sonnet" },
      { id: "haiku", label: "Haiku" },
    ],
    efforts: ["low", "medium", "high", "xHigh", "max"],
    defaultEffort: "high" as string | undefined,
    modelEfforts: {
      "claude-opus-4-6": ["low", "medium", "high", "max"],
      haiku: [] as string[],
      sonnet: ["low", "medium", "high"],
    } as Record<string, string[]>,
  },
};

const codexStatus = {
  kind: "codex",
  capabilities: {
    models: [
      { id: "gpt-5.5", label: "5.5" },
      { id: "gpt-5.4", label: "5.4" },
      { id: "gpt-5.4-mini", label: "5.4 Mini" },
    ],
    efforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high" as string | undefined,
    modelEfforts: {} as Record<string, string[]>,
  },
};

const cursorStatus = {
  kind: "cursor",
  capabilities: {
    models: [
      { id: "composer-2.5", label: "Composer 2.5" },
      { id: "composer-2.5-fast", label: "Composer 2.5 Fast" },
      { id: "gpt-5.5", label: "GPT-5.5" },
    ],
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium" as string | undefined,
    modelEfforts: {
      "composer-2.5": [] as string[],
      "composer-2.5-fast": [] as string[],
      "gpt-5.5": ["none", "low", "medium", "high", "xhigh"],
    } as Record<string, string[]>,
  },
};

describe("resolveConflictResolverConfig", () => {
  it("falls back to registered defaults (Claude → Opus)", () => {
    const result = resolveConflictResolverConfig(claudeStatus, "", "");
    expect(result.model).toBe("claude-opus-4-8");
  });

  it("falls back to registered defaults (Codex → GPT-5.5)", () => {
    const result = resolveConflictResolverConfig(codexStatus, "", "");
    expect(result.model).toBe("gpt-5.5");
  });

  it("falls back to registered defaults (Cursor → Composer 2.5 Fast)", () => {
    const result = resolveConflictResolverConfig(cursorStatus, "", "");
    expect(result).toEqual({ model: "composer-2.5-fast", effort: "", availableEfforts: [] });
  });

  it("preserves user-selected model when it exists in capabilities", () => {
    const result = resolveConflictResolverConfig(claudeStatus, "sonnet", "");
    expect(result.model).toBe("sonnet");
  });

  it("falls back to default when user-selected model is not in capabilities", () => {
    const result = resolveConflictResolverConfig(claudeStatus, "nonexistent", "");
    expect(result.model).toBe("claude-opus-4-8");
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

  it("does not fall back to global efforts when model has empty modelEfforts", () => {
    const result = resolveConflictResolverConfig(claudeStatus, "haiku", "");
    expect(result.availableEfforts).toEqual([]);
  });

  it("does not show efforts for Cursor Composer models without effort variants", () => {
    const result = resolveConflictResolverConfig(cursorStatus, "composer-2.5", "");
    expect(result).toEqual({ model: "composer-2.5", effort: "", availableEfforts: [] });
  });
});
