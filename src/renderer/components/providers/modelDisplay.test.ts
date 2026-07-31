// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { formatModelConfigLabel, resolveModelLabel } from "./modelDisplay";

function agentWithModels(models: Array<{ id: string; label: string }>): AgentStatus {
  return {
    capabilities: { models },
  } as unknown as AgentStatus;
}

describe("resolveModelLabel", () => {
  it("returns undefined when no model is provided", () => {
    expect(resolveModelLabel(undefined, undefined)).toBeUndefined();
  });

  it("maps a model id to its friendly label", () => {
    const agent = agentWithModels([{ id: "claude-opus-4-8", label: "Opus 4.8" }]);
    expect(resolveModelLabel(agent, "claude-opus-4-8")).toBe("Opus 4.8");
  });

  it("falls back to the raw model id when no capability matches", () => {
    expect(resolveModelLabel(undefined, "claude-opus-4-8")).toBe("claude-opus-4-8");
    const agent = agentWithModels([{ id: "other", label: "Other" }]);
    expect(resolveModelLabel(agent, "claude-opus-4-8")).toBe("claude-opus-4-8");
  });
});

describe("formatModelConfigLabel", () => {
  const agent = agentWithModels([{ id: "claude-opus-4-8", label: "Opus 4.8" }]);

  it("joins the friendly model label with the effort label", () => {
    expect(formatModelConfigLabel(agent, { model: "claude-opus-4-8", effort: "low" })).toBe(
      "Opus 4.8 · Low",
    );
  });

  it("appends the Fast marker when fast mode is on", () => {
    expect(
      formatModelConfigLabel(agent, { model: "claude-opus-4-8", effort: "high", fast: true }),
    ).toBe("Opus 4.8 · High · Fast");
  });

  it("omits missing parts and falls back to the raw model id", () => {
    expect(formatModelConfigLabel(undefined, { model: "gpt-5.4" })).toBe("gpt-5.4");
    expect(formatModelConfigLabel(undefined, {})).toBe("");
  });
});
