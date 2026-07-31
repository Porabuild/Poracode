import { describe, expect, it } from "vitest";
import { applyClaudeContextSuffix } from "./argv";

describe("applyClaudeContextSuffix", () => {
  it("derives the suffix from contextSize for built-in models", () => {
    expect(applyClaudeContextSuffix("claude-opus-5", "1m")).toBe("claude-opus-5[1m]");
    expect(applyClaudeContextSuffix("claude-opus-4-8", "1m")).toBe("claude-opus-4-8[1m]");
    expect(applyClaudeContextSuffix("claude-opus-4-8", "200k")).toBe("claude-opus-4-8");
    expect(applyClaudeContextSuffix("claude-opus-4-8")).toBe("claude-opus-4-8");
  });

  it("strips a stale suffix on built-in models so the chosen contextSize wins", () => {
    expect(applyClaudeContextSuffix("claude-opus-4-8[1m]", "200k")).toBe("claude-opus-4-8");
    expect(applyClaudeContextSuffix("claude-opus-4-8[1m]", "1m")).toBe("claude-opus-4-8[1m]");
  });

  it("passes custom / external-provider model ids through verbatim", () => {
    // z.ai's real model name carries the [1m] suffix (1M context). Stripping it
    // would send "glm-5.2", which z.ai does not resolve — so it must round-trip.
    expect(applyClaudeContextSuffix("glm-5.2[1m]", "200k")).toBe("glm-5.2[1m]");
    expect(applyClaudeContextSuffix("glm-5.2[1m]", "1m")).toBe("glm-5.2[1m]");
    expect(applyClaudeContextSuffix("glm-5.2[1m]")).toBe("glm-5.2[1m]");
    expect(applyClaudeContextSuffix("glm-4.5-air", "200k")).toBe("glm-4.5-air");
  });
});
