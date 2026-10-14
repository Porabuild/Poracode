import { describe, expect, it } from "vitest";
import { applyClaudeContextSuffix, buildClaudeArgs } from "./argv";
import { createClaudeAdapter } from "./index";

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
    expect(applyClaudeContextSuffix("glm-5.2[1m]", "400k")).toBe("glm-5.2[1m]");
  });

  it("keeps the extended model variant for a 400k working window", () => {
    for (const model of ["claude-opus-4-6", "claude-fable-5-1", "claude-fable-5-2"]) {
      expect(applyClaudeContextSuffix(model, "400k")).toBe(`${model}[1m]`);
      const args = buildClaudeArgs({ model, contextSize: "400k" }, "Continue");
      expect(args.slice(0, 2)).toEqual(["--model", `${model}[1m]`]);
      expect(args).not.toContain("--autocompact");
      expect(args.at(-1)).toBe("Continue");
    }
  });

  it.each([
    ["200k", "200000"],
    ["400k", "400000"],
    ["1m", "1000000"],
  ])(
    "sets the %s working window even for a model with a native 1M window",
    async (contextSize, tokens) => {
      const adapter = createClaudeAdapter();
      const location = { kind: "posix", path: "/tmp/claude-context" } as const;
      const config = { model: "claude-fable-5-1", contextSize };
      const launch = await adapter.buildLaunchArgv(location, config, "");
      const resume = await adapter.buildResumeArgv(location, config, "", {
        providerSessionId: "existing-session",
        discoveredAt: "2026-10-12T00:00:00Z",
      });
      for (const spec of [launch, resume]) {
        expect(spec.env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe(tokens);
        expect(spec.args).not.toContain("--autocompact");
      }
    },
  );
});
