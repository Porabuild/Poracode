import { describe, expect, it } from "vitest";
import {
  deriveCodexStructuredState,
  detectCodexReadyForInitialPrompt,
  detectCodexTerminalStatus,
  detectCodexUpdatePrompt,
  parseCodexSocketMessage,
} from "./codex";

describe("deriveCodexStructuredState", () => {
  it("maps active approval state to needs_approval", () => {
    expect(
      deriveCodexStructuredState({
        type: "active",
        activeFlags: ["waitingOnApproval"],
      }),
    ).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
    });
  });

  it("maps active user input state to needs_reply", () => {
    expect(
      deriveCodexStructuredState({
        type: "active",
        activeFlags: ["waitingOnUserInput"],
      }),
    ).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
    });
  });

  it("maps active work with no flags to idle", () => {
    expect(
      deriveCodexStructuredState({
        type: "active",
        activeFlags: [],
      }),
    ).toEqual({
      status: "idle",
      attention: "none",
    });
  });

  it("maps idle state to idle", () => {
    expect(deriveCodexStructuredState({ type: "idle" })).toEqual({
      status: "idle",
      attention: "none",
    });
  });

  it("maps system errors to error", () => {
    expect(deriveCodexStructuredState({ type: "systemError" })).toEqual({
      status: "error",
      attention: "error",
    });
  });

  it("treats method messages with ids as server requests, not client responses", () => {
    expect(
      parseCodexSocketMessage({
        jsonrpc: "2.0",
        id: "req-1",
        method: "item/tool/requestUserInput",
        params: {
          questions: [],
        },
      }),
    ).toEqual({
      kind: "request",
      id: "req-1",
      method: "item/tool/requestUserInput",
      params: {
        questions: [],
      },
    });
  });

  it("treats id-only messages as JSON-RPC responses", () => {
    expect(
      parseCodexSocketMessage({
        jsonrpc: "2.0",
        id: "lightcode-1",
        result: {
          ok: true,
        },
      }),
    ).toEqual({
      kind: "response",
      id: "lightcode-1",
      result: {
        ok: true,
      },
    });
  });
});

describe("detectCodexUpdatePrompt", () => {
  const SAMPLE_TEXT = [
    "🎉Update available! 0.116.0 -> 0.117.0",
    "",
    "Release notes: https://github.com/openai/codex/releases/latest",
    "",
    "> 1. Update now (runs `npm install -g @openai/codex`)",
    "  2. Skip",
    "  3. Skip until next version",
    "",
    "Press enter to continue",
  ].join("\n");

  it("detects the update prompt", () => {
    expect(detectCodexUpdatePrompt(SAMPLE_TEXT)).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(detectCodexUpdatePrompt("hello world")).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(detectCodexUpdatePrompt("")).toBe(false);
  });

  it("detects without emoji prefix", () => {
    expect(detectCodexUpdatePrompt("Update available! 0.116.0 -> 0.117.0")).toBe(true);
  });
});

describe("detectCodexReadyForInitialPrompt", () => {
  it("returns true for the normal Codex home screen", () => {
    const text = [
      "OpenAI Codex (v0.116.0)",
      "model: gpt-5.4-mini high /model to change",
      "directory: ~/work/site-search-ui",
    ].join("\n");

    expect(detectCodexReadyForInitialPrompt(text)).toBe(true);
  });

  it("returns false while the update prompt is visible", () => {
    const text = [
      "Update available! 0.116.0 -> 0.117.0",
      "OpenAI Codex (v0.116.0)",
      "directory: ~/work/site-search-ui",
      "model: gpt-5.4-mini high /model to change",
    ].join("\n");

    expect(detectCodexReadyForInitialPrompt(text)).toBe(false);
  });
});

describe("detectCodexTerminalStatus", () => {
  it("treats the Codex home screen as idle", () => {
    const text = [
      "OpenAI Codex (v0.116.0)",
      "model: gpt-5.4-mini high /model to change",
      "directory: ~/work/site-search-ui",
    ].join("\n");

    expect(detectCodexTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("treats the update prompt as needs_reply", () => {
    const text = [
      "Update available! 0.116.0 -> 0.117.0",
      "> 1. Update now",
      "  2. Skip",
      "Press enter to continue",
    ].join("\n");

    expect(detectCodexTerminalStatus(text)).toEqual({
      status: "needs_reply",
      attention: "needs_reply",
      corroborated: true,
    });
  });

  it("treats confirmation prompts as needs_approval", () => {
    const text = "Allow codex to run this command? [y/n]";

    expect(detectCodexTerminalStatus(text)).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("detects working from the visible Codex status line", () => {
    const text = [
      "• Hi.",
      "",
      "• Working (1s • esc to interrupt)",
      "",
      "› Explain this codebase",
      "",
      "gpt-5.4 medium · ~\\work\\lightcode · master",
    ].join("\n");

    expect(detectCodexTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("treats the prompt as idle when no strong Codex hint is present", () => {
    const text = [
      "• Here. What do you want to test?",
      "",
      "› Explain this codebase",
      "",
      "gpt-5.4 medium · ~\\work\\lightcode · master",
    ].join("\n");

    expect(detectCodexTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("prioritizes working over the prompt when both are visible", () => {
    const text = [
      "• Working (1s • esc to interrupt)",
      "",
      "› Explain this codebase",
      "",
      "gpt-5.4 medium · ~\\work\\lightcode · master",
    ].join("\n");

    expect(detectCodexTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects idle after a plain title update and prompt redraw", () => {
    const text = [
      "• Fine. What do you need?",
      "",
      "• Working (2s • esc to interrupt)",
      "",
      "› Run /review on my current changes",
      "",
      "gpt-5.4 medium · ~\\work\\lightcode · master",
      "",
      "0;lightcode",
      "",
      "› Run /review on my current changes",
      "",
      "gpt-5.4 medium · ~\\work\\lightcode · master",
    ].join("\n");

    expect(detectCodexTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });
});
