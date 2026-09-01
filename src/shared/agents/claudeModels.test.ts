import { describe, expect, it } from "vitest";
import {
  claudeDefaultHiddenModels,
  formatClaudeModelLabel,
  isClaudeAutoCapable,
  isLegacyClaudeModel,
  parseClaudeModel,
  sortClaudeModels,
  CLAUDE_FABLE_51_MODEL_ID,
  CLAUDE_FABLE_5_MODEL_ID,
  CLAUDE_OPUS_5_MODEL_ID,
  CLAUDE_OPUS_48_MODEL_ID,
  CLAUDE_OPUS_47_MODEL_ID,
  CLAUDE_OPUS_46_MODEL_ID,
  CLAUDE_SONNET_5_MODEL_ID,
  CLAUDE_HAIKU_MODEL_ID,
} from "./claudeModels";

describe("parseClaudeModel", () => {
  it("parses Fable models correctly", () => {
    expect(parseClaudeModel("claude-fable-5-1")).toEqual({
      family: "fable",
      version: 5.1,
      major: 5,
      minor: 1,
    });
    expect(parseClaudeModel("claude-fable-5-2")).toEqual({
      family: "fable",
      version: 5.2,
      major: 5,
      minor: 2,
    });
    expect(parseClaudeModel("claude-fable-5")).toEqual({
      family: "fable",
      version: 5.0,
      major: 5,
      minor: 0,
    });
    expect(parseClaudeModel("Fable 5.1")).toEqual({
      family: "fable",
      version: 5.1,
      major: 5,
      minor: 1,
    });
  });

  it("parses Opus models correctly", () => {
    expect(parseClaudeModel("claude-opus-5")).toEqual({
      family: "opus",
      version: 5.0,
      major: 5,
      minor: 0,
    });
    expect(parseClaudeModel("claude-opus-5-1")).toEqual({
      family: "opus",
      version: 5.1,
      major: 5,
      minor: 1,
    });
    expect(parseClaudeModel("claude-opus-4-8")).toEqual({
      family: "opus",
      version: 4.8,
      major: 4,
      minor: 8,
    });
    expect(parseClaudeModel("claude-opus-4-6")).toEqual({
      family: "opus",
      version: 4.6,
      major: 4,
      minor: 6,
    });
  });

  it("parses Sonnet and Haiku models", () => {
    expect(parseClaudeModel("claude-sonnet-5")).toEqual({
      family: "sonnet",
      version: 5.0,
      major: 5,
      minor: 0,
    });
    expect(parseClaudeModel("sonnet")).toEqual({
      family: "sonnet",
      version: 0,
      major: 0,
      minor: 0,
    });
    expect(parseClaudeModel("haiku")).toEqual({
      family: "haiku",
      version: 0,
      major: 0,
      minor: 0,
    });
  });
});

describe("formatClaudeModelLabel", () => {
  it("formats known and unknown model labels", () => {
    expect(formatClaudeModelLabel("claude-fable-5-1")).toBe("Fable 5.1");
    expect(formatClaudeModelLabel("claude-fable-5-2")).toBe("Fable 5.2");
    expect(formatClaudeModelLabel("claude-opus-5-1")).toBe("Opus 5.1");
    expect(formatClaudeModelLabel("claude-opus-5-1", "Claude Opus 5.1 (Thinking)")).toBe(
      "Opus 5.1",
    );
    expect(formatClaudeModelLabel("claude-sonnet-5-1")).toBe("Sonnet 5.1");
  });
});

describe("isClaudeAutoCapable", () => {
  it("returns true for default model and modern >=4.6 / >=5.0 models", () => {
    expect(isClaudeAutoCapable()).toBe(true);
    expect(isClaudeAutoCapable("claude-fable-5-1")).toBe(true);
    expect(isClaudeAutoCapable("claude-fable-5-2")).toBe(true);
    expect(isClaudeAutoCapable("claude-fable-5")).toBe(true);
    expect(isClaudeAutoCapable("claude-opus-5")).toBe(true);
    expect(isClaudeAutoCapable("claude-opus-5-1")).toBe(true);
    expect(isClaudeAutoCapable("claude-opus-4-8")).toBe(true);
    expect(isClaudeAutoCapable("claude-opus-4-7")).toBe(true);
    expect(isClaudeAutoCapable("claude-opus-4-6")).toBe(true);
    expect(isClaudeAutoCapable("claude-sonnet-5")).toBe(true);
    expect(isClaudeAutoCapable("sonnet")).toBe(true);
  });

  it("returns false for Haiku and legacy <4.6 models", () => {
    expect(isClaudeAutoCapable("haiku")).toBe(false);
    expect(isClaudeAutoCapable("claude-3-5-haiku-20241022")).toBe(false);
  });
});

describe("isLegacyClaudeModel & claudeDefaultHiddenModels", () => {
  it("marks older versions as legacy", () => {
    expect(isLegacyClaudeModel({ id: CLAUDE_FABLE_51_MODEL_ID, label: "Fable 5.1" })).toBe(false);
    expect(isLegacyClaudeModel({ id: CLAUDE_FABLE_5_MODEL_ID, label: "Fable 5" })).toBe(true);
    expect(isLegacyClaudeModel({ id: CLAUDE_OPUS_5_MODEL_ID, label: "Opus 5" })).toBe(false);
    expect(isLegacyClaudeModel({ id: CLAUDE_OPUS_48_MODEL_ID, label: "Opus 4.8" })).toBe(true);
    expect(isLegacyClaudeModel({ id: CLAUDE_OPUS_47_MODEL_ID, label: "Opus 4.7" })).toBe(true);
    expect(isLegacyClaudeModel({ id: CLAUDE_OPUS_46_MODEL_ID, label: "Opus 4.6" })).toBe(true);
    expect(isLegacyClaudeModel({ id: CLAUDE_SONNET_5_MODEL_ID, label: "Sonnet 5" })).toBe(false);
    expect(isLegacyClaudeModel({ id: CLAUDE_HAIKU_MODEL_ID, label: "Haiku" })).toBe(false);
  });

  it("filters built-in models to hide legacy versions by default", () => {
    const models = [
      { id: CLAUDE_FABLE_51_MODEL_ID, label: "Fable 5.1" },
      { id: CLAUDE_FABLE_5_MODEL_ID, label: "Fable 5" },
      { id: CLAUDE_OPUS_5_MODEL_ID, label: "Opus 5" },
      { id: CLAUDE_OPUS_48_MODEL_ID, label: "Opus 4.8" },
      { id: CLAUDE_OPUS_47_MODEL_ID, label: "Opus 4.7" },
      { id: CLAUDE_OPUS_46_MODEL_ID, label: "Opus 4.6" },
      { id: CLAUDE_SONNET_5_MODEL_ID, label: "Sonnet 5" },
      { id: CLAUDE_HAIKU_MODEL_ID, label: "Haiku" },
    ];
    expect(claudeDefaultHiddenModels(models)).toEqual([
      CLAUDE_FABLE_5_MODEL_ID,
      CLAUDE_OPUS_48_MODEL_ID,
      CLAUDE_OPUS_47_MODEL_ID,
      CLAUDE_OPUS_46_MODEL_ID,
    ]);
  });
});

describe("sortClaudeModels", () => {
  it("sorts models by family and descending version", () => {
    const input = [
      { id: "claude-opus-5", label: "Opus 5" },
      { id: "claude-fable-5", label: "Fable 5" },
      { id: "claude-fable-5-1", label: "Fable 5.1" },
      { id: "claude-opus-4-8", label: "Opus 4.8" },
      { id: "claude-opus-4-6", label: "Opus 4.6" },
      { id: "claude-sonnet-5", label: "Sonnet 5" },
      { id: "haiku", label: "Haiku" },
    ];

    const sorted = sortClaudeModels(input);
    expect(sorted.map((m) => m.id)).toEqual([
      "claude-fable-5-1",
      "claude-fable-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-6",
      "claude-sonnet-5",
      "haiku",
    ]);
  });

  it("places new Fable 5.2 at the very top and Opus 5.1 before Opus 5", () => {
    const input = [
      { id: "claude-opus-5", label: "Opus 5" },
      { id: "claude-fable-5", label: "Fable 5" },
      { id: "claude-fable-5-1", label: "Fable 5.1" },
      { id: "claude-fable-5-2", label: "Fable 5.2" },
      { id: "claude-opus-5-1", label: "Opus 5.1" },
      { id: "claude-sonnet-5", label: "Sonnet 5" },
      { id: "haiku", label: "Haiku" },
    ];

    const sorted = sortClaudeModels(input);
    expect(sorted.map((m) => m.id)).toEqual([
      "claude-fable-5-2",
      "claude-fable-5-1",
      "claude-fable-5",
      "claude-opus-5-1",
      "claude-opus-5",
      "claude-sonnet-5",
      "haiku",
    ]);
  });
});
