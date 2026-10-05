import { describe, expect, it } from "vitest";
import { buildUserPromptPreview } from "./userPromptText";

describe("buildUserPromptPreview", () => {
  it("collapses newlines and whitespace runs into single spaces", () => {
    expect(
      buildUserPromptPreview([{ kind: "text", text: "  Fix the\n\nlogin   bug\tplease  " }]),
    ).toBe("Fix the login bug please");
  });

  it("keeps skill and mention tokens inline", () => {
    expect(
      buildUserPromptPreview([
        { kind: "skill", name: "review", invocation: "/review" },
        { kind: "text", text: " this with " },
        { kind: "mcp", name: "github" },
      ]),
    ).toBe("/review this with @github");
  });

  it("drops browser selector payloads", () => {
    const text = 'Make this red\n```lc-selector\n{"selector":"#save","name":"shot.png"}\n```';
    expect(buildUserPromptPreview([{ kind: "text", text }])).toBe("Make this red");
  });

  it("falls back to the first attachment name when there is no text", () => {
    expect(
      buildUserPromptPreview([
        { kind: "text", text: "\n" },
        {
          kind: "image",
          mimeType: "image/png",
          dataUrl: "",
          path: "/tmp/uploads/screenshot.png",
          source: "attachment",
        },
        { kind: "file", path: "/tmp/notes.md", name: "notes.md", source: "attachment" },
      ]),
    ).toBe("screenshot.png");
  });

  it("returns null when there is neither text nor a named attachment", () => {
    expect(buildUserPromptPreview([])).toBeNull();
    expect(
      buildUserPromptPreview([{ kind: "image", mimeType: "image/png", dataUrl: "data:," }]),
    ).toBeNull();
  });
});
