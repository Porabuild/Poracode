import { describe, it, expect } from "vitest";
import { parseCursorModelId, migrateCursorBaseId } from "./cursorModelId";

describe("parseCursorModelId", () => {
  it("parses a plain model id with no modifiers", () => {
    expect(parseCursorModelId("claude-3-5-sonnet")).toEqual({
      baseId: "claude-3-5-sonnet",
      fast: false,
      thinking: false,
    });
  });

  it("parses model with -fast suffix", () => {
    expect(parseCursorModelId("claude-3-5-sonnet-fast")).toEqual({
      baseId: "claude-3-5-sonnet",
      fast: true,
      thinking: false,
    });
  });

  it("parses model with -thinking suffix", () => {
    expect(parseCursorModelId("claude-3-7-sonnet-thinking")).toEqual({
      baseId: "claude-3-7-sonnet",
      fast: false,
      thinking: true,
    });
  });

  it("parses model with effort level", () => {
    expect(parseCursorModelId("claude-3-7-sonnet-high-thinking")).toEqual({
      baseId: "claude-3-7-sonnet",
      effort: "high",
      fast: false,
      thinking: true,
    });
  });

  it("parses model with effort and fast", () => {
    expect(parseCursorModelId("claude-3-7-sonnet-high-thinking-fast")).toEqual({
      baseId: "claude-3-7-sonnet",
      effort: "high",
      fast: true,
      thinking: true,
    });
  });

  it("normalizes extra-high to xhigh", () => {
    expect(parseCursorModelId("claude-3-7-sonnet-extra-high-thinking")).toEqual({
      baseId: "claude-3-7-sonnet",
      effort: "xhigh",
      fast: false,
      thinking: true,
    });
  });

  it("parses low effort", () => {
    const result = parseCursorModelId("claude-3-7-sonnet-low-thinking");
    expect(result.effort).toBe("low");
    expect(result.baseId).toBe("claude-3-7-sonnet");
  });

  it("parses max effort", () => {
    const result = parseCursorModelId("claude-3-7-sonnet-max-thinking");
    expect(result.effort).toBe("max");
  });

  it("parses none effort", () => {
    const result = parseCursorModelId("gpt-4o-none");
    expect(result.effort).toBe("none");
    expect(result.baseId).toBe("gpt-4o");
  });

  it("parses ACP bracket parameters into separate controls", () => {
    expect(parseCursorModelId("gpt-5.5[context=272k,reasoning=medium,fast=false]")).toEqual({
      baseId: "gpt-5.5",
      effort: "medium",
      contextSize: "272k",
      fast: false,
      thinking: false,
    });
    expect(
      parseCursorModelId("claude-opus-4-7[thinking=true,context=300k,effort=xhigh,fast=false]"),
    ).toEqual({
      baseId: "claude-opus-4-7",
      effort: "xhigh",
      contextSize: "300k",
      fast: false,
      thinking: true,
    });
    expect(parseCursorModelId("grok-4.6[effort=high,fast=true]")).toEqual({
      baseId: "grok-4.6",
      effort: "high",
      fast: true,
      thinking: false,
    });
  });
});

describe("migrateCursorBaseId", () => {
  it("migrates gpt-5.1-codex to gpt-5.1-codex-max", () => {
    expect(migrateCursorBaseId("gpt-5.1-codex")).toBe("gpt-5.1-codex-max");
  });

  it("does not change other model ids", () => {
    expect(migrateCursorBaseId("claude-3-5-sonnet")).toBe("claude-3-5-sonnet");
  });

  it("does not change gpt-5.1-codex-max (already migrated)", () => {
    expect(migrateCursorBaseId("gpt-5.1-codex-max")).toBe("gpt-5.1-codex-max");
  });
});
