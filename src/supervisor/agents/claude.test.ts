import { describe, expect, it } from "vitest";
import { detectClaudeTerminalStatus, detectClaudeModelEffort } from "./claude";

describe("detectClaudeTerminalStatus", () => {
  it("detects working state when 'esc to interrupt' is in the last lines", () => {
    const text =
      "● Forging...\n❯ \n\nesc to interrupt                                   ○ low · /effort";
    expect(detectClaudeTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects idle state from '? for shortcuts' in the last lines", () => {
    const text = "● Hey! What can I help you with?\n❯ \n? for shortcuts";
    expect(detectClaudeTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      approvalPolicy: "default",
      corroborated: true,
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
      approvalPolicy: "default",
      corroborated: true,
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

  it("detects exit plan mode confirmation as needs_reply", () => {
    const text = [
      "Exit plan mode?",
      "",
      "  Claude wants to exit plan mode",
      "",
      "❯ 1. Yes",
      "  2. No",
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
    expect(result?.corroborated).toBe(true);
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

  // ── Approval policy detection ──────────────────────────

  it("detects accept edits mode from status line", () => {
    const text = "● Ready\n❯ \n\n▶▶ accept edits on (shift+tab to cycle)";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.approvalPolicy).toBe("acceptEdits");
  });

  it("detects bypass permissions mode from status line", () => {
    const text = "● Ready\n❯ \n\n▶▶ bypass permissions on (shift+tab to cycle)";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.approvalPolicy).toBe("bypassPermissions");
  });

  it("detects default mode from '? for shortcuts'", () => {
    const text = "● Ready\n❯ \n? for shortcuts";
    expect(detectClaudeTerminalStatus(text)?.approvalPolicy).toBe("default");
  });

  it("does not set approvalPolicy on prompt cursor idle", () => {
    const text = "❯ ";
    expect(detectClaudeTerminalStatus(text)?.approvalPolicy).toBeUndefined();
  });
});

// ── Model / effort detection ──────────────────────────────

describe("detectClaudeModelEffort", () => {
  it("detects Opus model with max effort", () => {
    const text = "Set model to Opus 4.6 (1M context) (default) with max effort";
    expect(detectClaudeModelEffort(text)).toEqual({
      model: "claude-opus-4-6[1m]",
      effort: "max",
    });
  });

  it("detects Haiku model without effort", () => {
    const text = "Set model to Haiku 4.5";
    expect(detectClaudeModelEffort(text)).toEqual({ model: "haiku" });
  });

  it("detects Sonnet model without effort", () => {
    const text = "Set model to Sonnet 4.6";
    expect(detectClaudeModelEffort(text)).toEqual({ model: "sonnet" });
  });

  it("detects Sonnet model with medium effort", () => {
    const text = "Set model to Sonnet 4.6 (1M context) with medium effort";
    expect(detectClaudeModelEffort(text)).toEqual({
      model: "sonnet",
      effort: "medium",
    });
  });

  it("uses last model line when multiple exist", () => {
    const text = [
      "Set model to Opus 4.6 (1M context) (default) with max effort",
      "some output",
      "Set model to Haiku 4.5",
    ].join("\n");
    expect(detectClaudeModelEffort(text)).toEqual({ model: "haiku" });
  });

  it("returns null when no model line present", () => {
    expect(detectClaudeModelEffort("some random text")).toBeNull();
  });

  it("ignores unknown effort values", () => {
    const text = "Set model to Sonnet 4.6 with extreme effort";
    expect(detectClaudeModelEffort(text)).toEqual({ model: "sonnet" });
  });

  it("strips (default) from model name", () => {
    const text = "Set model to Haiku 4.5 (default)";
    expect(detectClaudeModelEffort(text)).toEqual({ model: "haiku" });
  });
});

// ── Integration: status + model in combined buffer ────────

describe("detectClaudeTerminalStatus with model/effort", () => {
  it("includes model and effort from buffer alongside status", () => {
    const text = [
      "Set model to Sonnet 4.6 with medium effort",
      "● Ready",
      "❯ ",
      "? for shortcuts",
    ].join("\n");
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.approvalPolicy).toBe("default");
    expect(result?.model).toBe("sonnet");
    expect(result?.effort).toBe("medium");
  });

  it("includes model from buffer with accept edits mode", () => {
    const text = [
      "Set model to Opus 4.6 (1M context) (default) with max effort",
      "● Ready",
      "❯ ",
      "▶▶ accept edits on (shift+tab to cycle)",
    ].join("\n");
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.approvalPolicy).toBe("acceptEdits");
    expect(result?.model).toBe("claude-opus-4-6[1m]");
    expect(result?.effort).toBe("max");
  });
});

// ── Dual-pattern corroboration ──────────────────────────

describe("detectClaudeTerminalStatus corroboration", () => {
  it("marks strong idle patterns as corroborated", () => {
    const text = "? for shortcuts";
    expect(detectClaudeTerminalStatus(text)?.corroborated).toBe(true);
  });

  it("marks prompt-only idle as uncorroborated when no strong idle present", () => {
    // Only the ❯ prompt cursor, no status bar indicator
    const text = "❯ ";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.corroborated).toBe(false);
  });

  it("marks prompt idle as corroborated when strong idle also present", () => {
    // ❯ is the best match (closer to end), but "? for shortcuts" is also present
    const text = "? for shortcuts\n\n\n❯ ";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.corroborated).toBe(true);
  });

  it("marks 'type your message' as corroborated when status bar present", () => {
    const text = "? for shortcuts\ntype your message";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.corroborated).toBe(true);
  });

  it("marks 'type your message' alone as uncorroborated", () => {
    const text = "type your message";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
    expect(result?.corroborated).toBe(false);
  });

  it("marks spinner-only working as uncorroborated", () => {
    const text = "⠋ Reading files…";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("working");
    expect(result?.corroborated).toBe(false);
  });

  it("marks spinner working as corroborated when 'esc to interrupt' also present", () => {
    const text = "esc to interrupt\n⠋ Reading files…";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("working");
    expect(result?.corroborated).toBe(true);
  });

  it("marks 'esc to interrupt' as self-corroborated", () => {
    const text = "esc to interrupt";
    expect(detectClaudeTerminalStatus(text)?.corroborated).toBe(true);
  });

  it("marks needs_approval as corroborated (specific multi-word pattern)", () => {
    const text = "Esc to cancel · Tab to amend";
    expect(detectClaudeTerminalStatus(text)?.corroborated).toBe(true);
  });

  it("marks needs_reply patterns as corroborated", () => {
    const text = "Enter to select";
    expect(detectClaudeTerminalStatus(text)?.corroborated).toBe(true);
  });

  it("ignores historical ❯ deep in chat scrollback during large screen repaints", () => {
    // Simulates a large frame where a previous user message's ❯ prompt
    // appears far from the end, while the status bar hasn't been painted yet.
    // The ❯ from chat history should NOT trigger idle detection.
    const chatHistory = "❯ do the thing please\n";
    const codeOutput = "x".repeat(500) + "\n  function foo() {}\n";
    const text = chatHistory + codeOutput;
    // The historical ❯ is >500 chars from the end — should be ignored
    expect(detectClaudeTerminalStatus(text)).toBeNull();
  });

  it("still detects ❯ prompt near the end of the buffer", () => {
    // The real prompt cursor at the bottom of the screen
    const text =
      "Some output\n" + "─".repeat(80) + "\n❯ \n" + "─".repeat(80) + "\n  ⏵⏵ bypass permissions on";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("idle");
  });
});
