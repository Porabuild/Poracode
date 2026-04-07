import { describe, expect, it } from "vitest";
import { detectGeminiInvalidSessionRef } from "./adapter";
import { detectGeminiTerminalStatus } from "./terminal";

describe("detectGeminiTerminalStatus", () => {
  it("detects idle from ◇ Ready title bar indicator", () => {
    const text = "0;◇  Ready (my-project)";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("detects working from ✦ Working title bar indicator", () => {
    const text = "0;✦  Working… (my-project)";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("detects needs_reply from ✋ Action Required title bar indicator", () => {
    const text = "0;✋  Action Required (my-project)";
    const result = detectGeminiTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects needs_reply from Enter to select footer", () => {
    const text = "Enter to select · ↑/↓ to navigate · Esc to cancel";
    const result = detectGeminiTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects working from esc-to-cancel prompt", () => {
    const text = "⠋ Thinking about your request... (esc to cancel, 2s)";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("ignores stale spinner without esc-to-cancel context", () => {
    const text = "⠋ Resuming session...\n>   Type your message or @path/to/file";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("detects approval prompt from [y/n] pattern", () => {
    const text = "Allow gemini to write to file.ts? [y/n]";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
      corroborated: true,
    });
  });

  it("returns null when no pattern matches", () => {
    expect(detectGeminiTerminalStatus("random text with no indicators")).toBeNull();
  });

  it("Ready wins over earlier Working when closer to end", () => {
    const text = "0;✦  Working… (my-project)\nsome output\n0;◇  Ready (my-project)";
    expect(detectGeminiTerminalStatus(text)?.status).toBe("idle");
  });

  it("Action Required wins over Working when closer to end", () => {
    const text = "0;✦  Working… (my-project)\nsome output\n0;✋  Action Required (my-project)";
    expect(detectGeminiTerminalStatus(text)?.status).toBe("needs_reply");
  });

  it("keeps working when the input prompt is still visible below the spinner", () => {
    const text = [
      "0;✦  Working… (my-project)",
      "⠋ Thinking... Moving Towards the Goal (esc to cancel, 4s)",
      ">   Type your message or @path/to/file",
      "? for shortcuts",
    ].join("\n");

    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("returns to idle when Ready appears after earlier working output", () => {
    const text = [
      "⠋ Thinking... Moving Towards the Goal (esc to cancel, 4s)",
      ">   Type your message or @path/to/file",
      "0;◇  Ready (my-project)",
      ">   Type your message or @path/to/file",
    ].join("\n");

    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: true,
    });
  });

  it("keeps working when spinner is present but no title bar signal exists", () => {
    const text = [
      "⠋ This is taking a bit longer, we're still on it. (esc to cancel, 2m 13s)",
      ">   Type your message or @path/to/file",
      "? for shortcuts",
    ].join("\n");

    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
      corroborated: true,
    });
  });

  it("still uses the input prompt as an idle fallback when no stronger signal exists", () => {
    const text = ">   Type your message or @path/to/file";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
      corroborated: false,
    });
  });

  it("detects needs_reply from Action Required with numbered options", () => {
    const text = [
      "Which modules would you like to update?",
      "",
      "● 1.  All npm modules",
      "  2.  Specific packages",
      "  3.  Other",
      "",
      "Enter to select · ↑/↓ to navigate · Esc to cancel",
      "",
      "0;✋  Action Required (my-project)",
    ].join("\n");

    const result = detectGeminiTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });

  it("detects needs_reply from plan approval with Action Required", () => {
    const text = [
      "Ready to start implementation?",
      "",
      "● 1.  Yes, automatically accept edits",
      "  2.  Yes, manually accept edits",
      "",
      "Enter to select",
      "",
      "0;✋  Action Required (my-project)",
    ].join("\n");

    const result = detectGeminiTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.attention).toBe("needs_reply");
  });
});

describe("detectGeminiInvalidSessionRef", () => {
  it("detects Gemini invalid resume session errors", () => {
    expect(
      detectGeminiInvalidSessionRef(
        'Error resuming session: Invalid session identifier "db8b5cb1-4cb6-46c1-abcb-71d35e18006a".',
      ),
    ).toBe(true);
  });

  it("ignores unrelated output", () => {
    expect(detectGeminiInvalidSessionRef("Loaded cached credentials.")).toBe(false);
  });
});
