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

  it("detects needs_approval from permission prompt with parsed options", () => {
    const text =
      "Do you want to proceed?\n> 1. Yes\n  2. Yes, and don't ask again\n  3. No\n\nEsc to cancel · Tab to amend · ctrl+e to explain";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("needs_approval");
    expect(result?.prompt?.title).toBe("Do you want to proceed?");
    expect(result?.prompt?.options).toEqual([
      { key: "1", label: "Yes" },
      { key: "2", label: "Yes, and don't ask again" },
      { key: "3", label: "No" },
    ]);
  });

  it("detects needs_reply from question prompt with parsed options", () => {
    const text =
      "What would you like to work on?\n> 1. Fix a bug\n  2. Add a feature\n\nEnter to select · ↑/↓ to navigate · Esc to cancel";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.prompt?.title).toBe("What would you like to work on?");
    expect(result?.prompt?.options).toHaveLength(2);
  });

  it("keeps a split task menu together when Claude inserts divider rows", () => {
    const text = [
      "hi",
      "User declined to answer questions",
      "",
      "hi",
      "────────────────────────────────────",
      "",
      "[ Task ]",
      "",
      "What would you like to work on today?",
      "",
      "> 1. New feature",
      "    Implement something new in the codebase",
      "  2. Bug fix",
      "    Diagnose and fix an existing issue",
      "  3. Code review",
      "    Review current changes or a PR",
      "  4. Explore codebase",
      "    Understand how something works.",
      "  5. Type something.",
      "",
      "────────────────────────────────────",
      "",
      "  6. Chat about this",
      "  7. Skip interview and plan immediately",
      "",
      "Enter to select · ↑/↓ to navigate · Esc to cancel",
    ].join("\n");
    const result = detectClaudeTerminalStatus(text);

    expect(result?.status).toBe("needs_reply");
    expect(result?.prompt?.title).toBe("What would you like to work on today?");
    expect(result?.prompt?.options).toEqual([
      {
        key: "1",
        label: "New feature",
        description: "Implement something new in the codebase",
      },
      {
        key: "2",
        label: "Bug fix",
        description: "Diagnose and fix an existing issue",
      },
      {
        key: "3",
        label: "Code review",
        description: "Review current changes or a PR",
      },
      {
        key: "4",
        label: "Explore codebase",
        description: "Understand how something works.",
      },
      { key: "5", label: "Type something.", isTextInput: true },
      { key: "6", label: "Chat about this" },
      { key: "7", label: "Skip interview and plan immediately" },
    ]);
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
    expect(result?.prompt?.title).toBe(
      "Claude has written up a plan and is ready to execute. Would you like to proceed?",
    );
    expect(result?.prompt?.options).toEqual([
      { key: "1", label: "Yes, auto-accept edits" },
      { key: "2", label: "Yes, manually approve edits" },
      { key: "3", label: "Type here to tell Claude what to change", isTextInput: true },
    ]);
  });

  it("marks 'Type here' option as text input", () => {
    const text = "Pick one:\n> 1. Accept\n  2. Type here to provide feedback\n\nctrl-g to edit";
    const result = detectClaudeTerminalStatus(text);
    expect(result?.prompt?.options?.[1]).toEqual({
      key: "2",
      label: "Type here to provide feedback",
      isTextInput: true,
    });
  });

  it("ignores stale numbered items from earlier output", () => {
    const text = [
      "4. Confirm logs show SIGTERM received",
      "5. Restart the server",
      "6. Run npm run lint and npm run typecheck",
      "",
      "Do you want to proceed?",
      "❯ 1. Yes",
      "  2. No",
      "",
      "Esc to cancel · Tab to amend · ctrl+e to explain",
    ].join("\n");
    const result = detectClaudeTerminalStatus(text);
    expect(result?.status).toBe("needs_approval");
    expect(result?.prompt?.title).toBe("Do you want to proceed?");
    expect(result?.prompt?.options).toEqual([
      { key: "1", label: "Yes" },
      { key: "2", label: "No" },
    ]);
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

  it("returns null when no pattern matches", () => {
    expect(detectClaudeTerminalStatus("some random text")).toBeNull();
  });

  it("prioritizes needs_approval over working", () => {
    const text = "esc to interrupt\nEsc to cancel · Tab to amend · ctrl+e to explain";
    expect(detectClaudeTerminalStatus(text)?.status).toBe("needs_approval");
  });
});
