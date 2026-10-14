// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildSubAgentProgressParts,
  buildSubAgentRowText,
  formatSubAgentEffortLabel,
  formatSubAgentModelLabel,
  hasSubAgentProgressMeta,
  readSubAgentLiveLabel,
} from "./subAgentProgressMeta";

describe("subAgentProgressMeta", () => {
  it("builds model, effort, token, live, and step labels from provider-reported progress", () => {
    expect(
      buildSubAgentProgressParts({
        progress: { model: "opus", effort: "high", tokens: 336_000 },
        liveLabel: "Bash",
        stepCount: 21,
        includeStepCount: true,
      }),
    ).toEqual([
      { kind: "model", label: "Opus" },
      { kind: "effort", label: "High" },
      { kind: "tokens", label: "336K tok" },
      { kind: "live", label: "Bash" },
      { kind: "steps", label: "21 steps" },
    ]);
  });

  it("does not claim model metadata when the provider did not report a subagent model", () => {
    expect(hasSubAgentProgressMeta({ tokens: 42 })).toBe(true);
    expect(hasSubAgentProgressMeta({ stepCount: 3 })).toBe(false);
    expect(formatSubAgentModelLabel(undefined)).toBeUndefined();
    expect(formatSubAgentEffortLabel(undefined)).toBeUndefined();
  });

  it("omits a live description already present in the agent title", () => {
    expect(
      readSubAgentLiveLabel({ description: "protocol specialist" }, "Agent: protocol specialist"),
    ).toBeUndefined();
    expect(readSubAgentLiveLabel({ lastToolName: "Git" }, "Agent: protocol specialist")).toBe(
      "Git",
    );
  });

  it("formats common provider model ids compactly", () => {
    expect(formatSubAgentModelLabel("gpt-5.4-mini")).toBe("GPT-5.4 Mini");
    expect(formatSubAgentModelLabel("gemini-2.5-pro")).toBe("Gemini 2.5 Pro");
    expect(formatSubAgentModelLabel("claude-opus-4-8")).toBe("Opus 4.8");
  });

  it("uses the shared display label for extra-high reasoning effort", () => {
    expect(formatSubAgentEffortLabel("xhigh")).toBe("Extra High");
    expect(formatSubAgentEffortLabel("xHigh")).toBe("Extra High");
  });

  it("strips the date suffix from Claude release ids reported by child assistant messages", () => {
    expect(formatSubAgentModelLabel("claude-opus-4-8-20250915")).toBe("Opus 4.8");
    expect(formatSubAgentModelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
  });

  it("splits a Crossagent route title and appends live progress without repeating the model", () => {
    expect(
      buildSubAgentRowText({
        rowTitle: "Review CEO deck — Codex · GPT-5.5 · High",
        titleIsDescription: false,
        isCrossagent: true,
        progress: { model: "gpt-5.5", effort: "high", tokens: 12_000 },
        stepCount: 50,
        isRunning: true,
      }),
    ).toEqual({
      title: "Review CEO deck",
      meta: "Codex · GPT-5.5 · High · 12K tok · 50 steps",
    });
  });

  it("splits a name-only Crossagent route into agent and model lines", () => {
    expect(
      buildSubAgentRowText({
        rowTitle: "Codex · GPT-5.5",
        titleIsDescription: false,
        isCrossagent: true,
        progress: undefined,
        isRunning: false,
      }),
    ).toEqual({ title: "Codex", meta: "GPT-5.5" });
  });

  it("keeps a subagent description with a dash on the first line and uses type and model as meta", () => {
    expect(
      buildSubAgentRowText({
        rowTitle: "Review deck — layout pass",
        titleIsDescription: true,
        isCrossagent: false,
        subAgentType: "Explore",
        progress: { model: "opus", effort: "high" },
        isRunning: false,
      }),
    ).toEqual({
      title: "Review deck — layout pass",
      meta: "Explore · Opus · High",
    });
  });

  it("returns no meta line when there is no agent, model, or progress info", () => {
    expect(
      buildSubAgentRowText({
        rowTitle: "protocol specialist",
        titleIsDescription: true,
        isCrossagent: false,
        progress: undefined,
        isRunning: false,
      }),
    ).toEqual({ title: "protocol specialist" });
  });

  it("does not repeat the agent type when it already is the title", () => {
    expect(
      buildSubAgentRowText({
        rowTitle: "Explore",
        titleIsDescription: false,
        isCrossagent: false,
        subAgentType: "Explore",
        progress: { model: "sonnet" },
        isRunning: false,
      }),
    ).toEqual({ title: "Explore", meta: "Sonnet" });
  });
});
