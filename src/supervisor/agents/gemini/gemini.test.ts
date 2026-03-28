import { describe, expect, it } from "vitest";
import { detectGeminiTerminalStatus } from "./terminal";

describe("detectGeminiTerminalStatus", () => {
  it("detects idle from ◇ Ready title bar indicator", () => {
    const text = "0;◇  Ready (my-project)";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "idle",
      attention: "none",
    });
  });

  it("detects working from ✦ Working title bar indicator", () => {
    const text = "0;✦  Working… (my-project)";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
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

  it("detects working from spinner characters", () => {
    const text = "⠋ Thinking about your request...";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "working",
      attention: "working",
    });
  });

  it("detects approval prompt from [y/n] pattern", () => {
    const text = "Allow gemini to write to file.ts? [y/n]";
    expect(detectGeminiTerminalStatus(text)).toEqual({
      status: "needs_approval",
      attention: "needs_approval",
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

  it("parses numbered options from buffer with Action Required", () => {
    const text = [
      "Which modules would you like to update?",
      "",
      "● 1.  All npm modules",
      "      Update all npm dependencies in all workspaces",
      "  2.  Specific packages",
      "      I will provide the names of specific packages to update",
      "  3.  Other",
      "      Other (please specify)",
      "  4.  Enter a custom value",
      "",
      "Enter to select · ↑/↓ to navigate · Esc to cancel",
      "",
      "0;✋  Action Required (my-project)",
    ].join("\n");

    const result = detectGeminiTerminalStatus(text);
    expect(result?.status).toBe("needs_reply");
    expect(result?.prompt).toBeDefined();
    expect(result?.prompt?.options).toHaveLength(4);
    expect(result?.prompt?.options[0]).toEqual({
      key: "1",
      label: "All npm modules",
      description: "Update all npm dependencies in all workspaces",
    });
    expect(result?.prompt?.options[3]).toEqual({
      key: "4",
      label: "Enter a custom value",
      isTextInput: true,
    });
  });

  it("parses plan approval options", () => {
    const text = [
      "Ready to start implementation?",
      "",
      "● 1.  Yes, automatically accept edits",
      "      Approves plan and allows tools to run automatically",
      "  2.  Yes, manually accept edits",
      "      Approves plan but requires confirmation for each tool",
      "  3.  Type your feedback...",
      "",
      "Enter to select",
      "",
      "0;✋  Action Required (my-project)",
    ].join("\n");

    const result = detectGeminiTerminalStatus(text);
    expect(result?.prompt?.options).toHaveLength(3);
    expect(result?.prompt?.title).toBe("Ready to start implementation?");
    expect(result?.prompt?.options[2]).toEqual({
      key: "3",
      label: "Type your feedback...",
      isTextInput: true,
    });
  });
});
