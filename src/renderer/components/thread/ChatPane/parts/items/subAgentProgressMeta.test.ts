import { describe, expect, it } from "vitest";
import {
  buildSubAgentProgressParts,
  formatSubAgentModelLabel,
  hasSubAgentProgressMeta,
} from "./subAgentProgressMeta";

describe("subAgentProgressMeta", () => {
  it("builds model, token, live, and step labels from provider-reported progress", () => {
    expect(
      buildSubAgentProgressParts({
        progress: { model: "opus", tokens: 336_000 },
        liveLabel: "Bash",
        stepCount: 21,
        includeStepCount: true,
      }),
    ).toEqual([
      { kind: "model", label: "Opus" },
      { kind: "tokens", label: "336k tok" },
      { kind: "live", label: "Bash" },
      { kind: "steps", label: "21 steps" },
    ]);
  });

  it("does not claim model metadata when the provider did not report a subagent model", () => {
    expect(hasSubAgentProgressMeta({ tokens: 42 })).toBe(true);
    expect(hasSubAgentProgressMeta({ stepCount: 3 })).toBe(false);
    expect(formatSubAgentModelLabel(undefined)).toBeUndefined();
  });

  it("formats common provider model ids compactly", () => {
    expect(formatSubAgentModelLabel("gpt-5.4-mini")).toBe("GPT-5.4 Mini");
    expect(formatSubAgentModelLabel("gemini-2.5-pro")).toBe("Gemini 2.5 Pro");
    expect(formatSubAgentModelLabel("claude-opus-4-8")).toBe("Opus 4.8");
  });
});
