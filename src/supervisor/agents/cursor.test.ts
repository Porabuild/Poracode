import { describe, expect, it } from "vitest";
import {
  createCursorAdapter,
  detectCursorTerminalStatus,
  sortCursorModels,
} from "./cursor";

describe("createCursorAdapter capabilities", () => {
  it("exposes non-empty approvalPolicies for the YOLO toggle", () => {
    const adapter = createCursorAdapter();
    expect(adapter.capabilities.approvalPolicies.length).toBeGreaterThan(0);
    expect(adapter.capabilities.approvalPolicies.some((p) => p.id === "never")).toBe(true);
  });
});

describe("detectCursorTerminalStatus", () => {
  it("detects working from ctrl+c to stop", () => {
    expect(
      detectCursorTerminalStatus("○ Generating.\n→ Add a follow-up                ctrl+c to stop"),
    ).toEqual({ status: "working", attention: "working", corroborated: true });
  });

  it("detects working from Generating", () => {
    expect(detectCursorTerminalStatus("Generating...")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects working from Reading", () => {
    expect(detectCursorTerminalStatus("Reading files...")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects working from Thinking", () => {
    expect(detectCursorTerminalStatus("Thinking...")).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects attention from Run this command?", () => {
    expect(
      detectCursorTerminalStatus(
        'Run this command?\nNot in allowlist: git status\n  → Run (once) (y)',
      ),
    ).toEqual({ status: "needs_approval", attention: "needs_approval", corroborated: true });
  });

  it("detects attention from Suggested Plan", () => {
    expect(detectCursorTerminalStatus("Suggested Plan\n→ Accept (y)")).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("detects attention from Waiting for approval", () => {
    expect(detectCursorTerminalStatus("Waiting for approval...")).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("detects idle from Add a follow-up without working indicators", () => {
    expect(detectCursorTerminalStatus("→ Add a follow-up\n/ commands · @ files")).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("returns null for unrecognized output", () => {
    expect(detectCursorTerminalStatus("some random text")).toBeNull();
  });
});

describe("isReadyForInitialPrompt", () => {
  it("fires when idle prompt is present without working indicators", () => {
    const adapter = createCursorAdapter();
    expect(adapter.isReadyForInitialPrompt?.("→ Add a follow-up\n/ commands")).toBe(true);
  });

  it("does not fire during working state", () => {
    const adapter = createCursorAdapter();
    expect(
      adapter.isReadyForInitialPrompt?.(
        "Generating.\n→ Add a follow-up                ctrl+c to stop",
      ),
    ).toBe(false);
  });
});

describe("sortCursorModels", () => {
  it("auto first, then Composer, then others by version descending", () => {
    const models = [
      { id: "auto", label: "Auto" },
      { id: "gpt-5.4-fast", label: "GPT-5.4 Fast" },
      { id: "composer-2-fast", label: "Composer 2 Fast" },
      { id: "composer-2", label: "Composer 2" },
      { id: "composer-1.5", label: "Composer 1.5" },
      { id: "gpt-5.1-high", label: "GPT-5.1 High" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "Auto",
      "Composer 2 Fast",
      "Composer 2",
      "Composer 1.5",
      "GPT-5.4 Fast",
      "GPT-5.1 High",
    ]);
  });

  it("sorts effort: Extra High > High > Medium/base > Low > None", () => {
    const models = [
      { id: "a", label: "GPT-5.4 Mini" },
      { id: "b", label: "GPT-5.4 Mini Low" },
      { id: "c", label: "GPT-5.4 Mini High" },
      { id: "d", label: "GPT-5.4 Mini Extra High" },
      { id: "e", label: "GPT-5.4 Mini None" },
      { id: "f", label: "GPT-5.4 Mini Medium" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "GPT-5.4 Mini Extra High",
      "GPT-5.4 Mini High",
      "GPT-5.4 Mini Medium", // was "GPT-5.4 Mini" — bare label gets "Medium"
      "GPT-5.4 Mini Medium",
      "GPT-5.4 Mini Low",
      "GPT-5.4 Mini None",
    ]);
  });

  it("1M ranks above non-1M, fast first within same tier, bare labels get Medium", () => {
    const models = [
      { id: "a", label: "GPT-5.4 High Fast" },
      { id: "b", label: "GPT-5.4 1M High" },
      { id: "c", label: "GPT-5.4 Fast" },
      { id: "d", label: "GPT-5.4 1M" },
      { id: "e", label: "GPT-5.4 1M Extra High" },
      { id: "f", label: "GPT-5.4 Extra High Fast" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "GPT-5.4 1M Extra High",
      "GPT-5.4 1M High",
      "GPT-5.4 1M Medium", // was "GPT-5.4 1M"
      "GPT-5.4 Extra High Fast",
      "GPT-5.4 High Fast",
      "GPT-5.4 Medium Fast", // was "GPT-5.4 Fast"
    ]);
  });

  it("Thinking ranks above non-Thinking", () => {
    const models = [
      { id: "a", label: "Sonnet 4" },
      { id: "b", label: "Sonnet 4 1M" },
      { id: "c", label: "Sonnet 4 Thinking" },
      { id: "d", label: "Sonnet 4 1M Thinking" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "Sonnet 4 1M Thinking",
      "Sonnet 4 Thinking",
      "Sonnet 4 1M",
      "Sonnet 4",
    ]);
  });

  it("groups by provider: Opus together, Max above non-Max, Grok not interleaved", () => {
    const models = [
      { id: "a", label: "Opus 4.6 1M Thinking" },
      { id: "b", label: "Opus 4.6 1M" },
      { id: "c", label: "Sonnet 4.6 1M Thinking" },
      { id: "d", label: "Sonnet 4.6 1M" },
      { id: "e", label: "Opus 4.6 1M Max Thinking" },
      { id: "f", label: "Opus 4.6 1M Max" },
      { id: "g", label: "Opus 4.5 Thinking" },
      { id: "h", label: "Opus 4.5" },
      { id: "i", label: "Grok 4.20 Thinking" },
      { id: "j", label: "Grok 4.20" },
      { id: "k", label: "Sonnet 4.5 1M Thinking" },
      { id: "l", label: "Sonnet 4.5 1M" },
      { id: "m", label: "Sonnet 4 Thinking" },
      { id: "n", label: "Sonnet 4" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      // Opus provider (max ver 4.6) — all together
      "Opus 4.6 1M Max Thinking",
      "Opus 4.6 1M Max",
      "Opus 4.6 1M Thinking",
      "Opus 4.6 1M",
      "Opus 4.5 Thinking",
      "Opus 4.5",
      // Sonnet provider (max ver 4.6) — all together
      "Sonnet 4.6 1M Thinking",
      "Sonnet 4.6 1M",
      "Sonnet 4.5 1M Thinking",
      "Sonnet 4.5 1M",
      "Sonnet 4 Thinking",
      "Sonnet 4",
      // Grok provider (max ver 4.20) — not interleaved
      "Grok 4.20 Thinking",
      "Grok 4.20",
    ]);
  });

  it("sorts Codex Max with fast variants correctly", () => {
    const models = [
      { id: "a", label: "GPT-5.1 Codex Max Medium Fast" },
      { id: "b", label: "GPT-5.1 Codex Max High Fast" },
      { id: "c", label: "GPT-5.1 Codex Max Extra High Fast" },
      { id: "d", label: "GPT-5.1 Codex Max Low" },
      { id: "e", label: "GPT-5.1 Codex Max" },
      { id: "f", label: "GPT-5.1 Codex Max High" },
      { id: "g", label: "GPT-5.1 Codex Max Extra High" },
    ];

    expect(sortCursorModels(models).map((m) => m.label)).toEqual([
      "GPT-5.1 Codex Max Extra High Fast",
      "GPT-5.1 Codex Max Extra High",
      "GPT-5.1 Codex Max High Fast",
      "GPT-5.1 Codex Max High",
      "GPT-5.1 Codex Max Medium Fast",
      "GPT-5.1 Codex Max Medium", // was "GPT-5.1 Codex Max"
      "GPT-5.1 Codex Max Low",
    ]);
  });
});

