import { describe, expect, it } from "vitest";
import {
  deriveCodexStructuredState,
  detectCodexReadyForInitialPrompt,
  detectCodexStartupPrompt,
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

describe("detectCodexStartupPrompt", () => {
  const SAMPLE_TEXT = [
    "✨ Update available! 0.116.0 -> 0.117.0",
    "",
    "Release notes: https://github.com/openai/codex/releases/latest",
    "",
    "> 1. Update now (runs `npm install -g @openai/codex`)",
    "  2. Skip",
    "  3. Skip until next version",
  ].join("\n");

  it("returns prompt options with terminal submit input", () => {
    expect(detectCodexStartupPrompt(SAMPLE_TEXT)).toEqual({
      title: "Update available! 0.116.0 -> 0.117.0",
      options: [
        {
          key: "1",
          label: "Update now",
          description: "Runs npm install -g @openai/codex",
          submitInput: "1",
        },
        {
          key: "2",
          label: "Skip",
          submitInput: "2",
          continueQueuedPrompt: true,
        },
        {
          key: "3",
          label: "Skip until next version",
          submitInput: "3",
          continueQueuedPrompt: true,
        },
      ],
    });
  });

  it("returns null for non-update output", () => {
    expect(detectCodexStartupPrompt("OpenAI Codex")).toBeNull();
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
