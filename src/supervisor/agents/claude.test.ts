import { describe, expect, it } from "vitest";
import { detectClaudeTerminalStatus } from "./claude";

describe("detectClaudeTerminalStatus", () => {
  it("detects working state when 'esc to interrupt' is in the last lines", () => {
    const text =
      "● Forging...\n❯ \n\nesc to interrupt                                   ○ low · /effort";
    expect(detectClaudeTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
    });
  });

  it("detects idle state from '? for shortcuts' in the last lines", () => {
    const text = "● Hey! What can I help you with?\n❯ \n? for shortcuts";
    expect(detectClaudeTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
    });
  });

  it("detects idle even when buffer contains stale 'esc to interrupt' above", () => {
    const lines = [
      "esc to interrupt",
      "● Some old working output",
      "",
      "● More output",
      "",
      "",
      "",
      "● Hey! What can I help you with?",
      "❯ ",
      "? for shortcuts",
    ];
    expect(detectClaudeTerminalStatus(lines.join("\n"))).toEqual({
      status: "idle",
      attention: "none",
    });
  });

  it("detects needs_approval from permission prompt", () => {
    const text =
      "Do you want to proceed?\n> 1. Yes\n  2. Yes, and don't ask again\n  3. No\n\nEsc to cancel · Tab to amend · ctrl+e to explain";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("needs_approval");
    expect(result?.attention).toBe("needs_approval");
  });

  it("detects needs_reply from question prompt", () => {
    const text =
      "What would you like to work on?\n> 1. Fix a bug\n  2. Add a feature\n\nEnter to select · ↑/↓ to navigate · Esc to cancel";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects plan approval prompt with ctrl-g footer", () => {
    const text = [
      "Claude has written up a plan and is ready to execute. Would you like to proceed?",
      "",
      "❯ 1. Yes, auto-accept edits",
      "  2. Yes, manually approve edits",
      "  3. Type here to tell Claude what to change",
      "",
      "ctrl-g to edit in Vim · ~/.claude/plans/binary-enchanting-goose.md",
    ].join("\n");
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects plan approval prompt with shift+tab footer", () => {
    const text = [
      "Claude has written up a plan and is ready to execute. Would you like to proceed?",
      "",
      "> 1  Yes, and bypass permissions",
      "  2  Yes, making a question after each step",
      "  3  No, refine with Ultrace on Claude Code or the web",
      "",
      "shift+tab to approve with this feedback",
      "",
      "ctrl-g to edit in Notepad  ~/.claude/plans/inbuilt-nesting-rout.md",
    ].join("\n");
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects plan question via shift+tab even without ctrl-g", () => {
    const text = [
      "Claude has written up a plan. Would you like to proceed?",
      "",
      "> 1  Yes, and bypass permissions",
      "  2  No",
      "",
      "shift-tab to approve with this feedback",
    ].join("\n");
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("sets planMode on 'plan mode on' hint", () => {
    const text =
      "● Plan mode\n❯ \n\nplan mode on                                       ○ high · /plan";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.planMode).toBe(true);
  });

  it("does not set planMode on normal idle hints", () => {
    const text = "● Hey! What can I help you with?\n❯ \n? for shortcuts";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.planMode).toBeUndefined();
  });

  it("does not detect working from slash command menu with * selection marker", () => {
    const text = [
      "❯ /",
      "",
      "  /heroui-react                  HeroUI v3 React component library...",
      "* /agent-md-refactor — Refactor bloated AGENTS.md, CLAUDE.md, or similar agent instruction files to follow progress...",
      "  /review                        Review a pull request",
    ].join("\n");
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
  });

  it("returns null when no pattern matches", () => {
    expect(detectClaudeTerminalStatus("some random text")).toBeNull();
  });

  it("prioritizes needs_approval over working", () => {
    const text = "esc to interrupt\nEsc to cancel · Tab to amend · ctrl+e to explain";
    expect(detectClaudeTerminalStatus(text)?.status).toBe("needs_approval");
  });
});
