import { describe, expect, it } from "vitest";
import type { PromptSegment } from "@/shared/contracts";
import { claudeSkillText, leadingSkillIndex } from "./skillPrompt";

const simplify: Extract<PromptSegment, { kind: "skill" }> = {
  kind: "skill",
  name: "simplify",
  invocation: "/simplify",
  provider: "Claude",
  scope: "global",
};

describe("leadingSkillIndex", () => {
  it("finds a skill that opens the prompt", () => {
    expect(leadingSkillIndex([simplify, { kind: "text", content: " test" }])).toBe(0);
  });

  it("skips blank text and attachments before the skill", () => {
    const segments: PromptSegment[] = [
      { kind: "text", content: "  \n" },
      { kind: "attachment", path: "/tmp/shot.png", mimeType: "image/png" },
      simplify,
    ];

    expect(leadingSkillIndex(segments)).toBe(2);
  });

  it("returns -1 when text comes before the skill", () => {
    expect(leadingSkillIndex([{ kind: "text", content: "please " }, simplify])).toBe(-1);
  });

  it("returns -1 when the prompt has no skill", () => {
    expect(leadingSkillIndex([{ kind: "text", content: "hello" }])).toBe(-1);
  });
});

describe("claudeSkillText", () => {
  it("sends a leading skill as its slash command", () => {
    expect(claudeSkillText(simplify, true)).toBe("/simplify");
  });

  it("asks the model to use a skill placed later in the text", () => {
    expect(claudeSkillText(simplify, false)).toBe("Use the simplify skill.");
  });
});
