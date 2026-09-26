import { describe, expect, it } from "vitest";
import type { PromptSegment } from "@/shared/contracts";
import { claudeSkillText, leadingSkill } from "./skillPrompt";

const simplify: Extract<PromptSegment, { kind: "skill" }> = {
  kind: "skill",
  name: "simplify",
  invocation: "/simplify",
  provider: "Claude",
  scope: "global",
};

describe("leadingSkill", () => {
  it("finds a skill that opens the prompt", () => {
    expect(leadingSkill([simplify, { kind: "text", content: " test" }])).toBe(simplify);
  });

  it("skips blank text and attachments before the skill", () => {
    const segments: PromptSegment[] = [
      { kind: "text", content: "  \n" },
      { kind: "attachment", path: "/tmp/shot.png", mimeType: "image/png" },
      simplify,
    ];

    expect(leadingSkill(segments)).toBe(simplify);
  });

  it("finds nothing when text comes before the skill", () => {
    expect(leadingSkill([{ kind: "text", content: "please " }, simplify])).toBeUndefined();
  });

  it("finds nothing when the prompt has no skill", () => {
    expect(leadingSkill([{ kind: "text", content: "hello" }])).toBeUndefined();
  });
});

describe("claudeSkillText", () => {
  it("sends the leading skill as its slash command", () => {
    expect(claudeSkillText(simplify, simplify)).toBe("/simplify");
  });

  it("asks the model to use any other skill", () => {
    expect(claudeSkillText(simplify, undefined)).toBe("Use the simplify skill.");
  });
});
