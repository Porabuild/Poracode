import { describe, expect, it } from "vitest";
import type { PromptSegment } from "@/shared/contracts";
import {
  MAX_INLINE_SKILL_CONTENT_CHARS,
  buildInlineSkillInstructions,
  isPathUnderAny,
  selectSkillSegmentsForInjection,
} from "./skillPromptInjection";

function skillSegment(name: string, path: string): PromptSegment {
  return { kind: "skill", name, path, invocation: `/${name}`, provider: "Test", scope: "global" };
}

describe("isPathUnderAny", () => {
  it("matches across separators and case", () => {
    expect(
      isPathUnderAny("C:\\Users\\Dev\\.claude\\skills\\review\\SKILL.md", [
        "C:/users/dev/.claude/skills",
      ]),
    ).toBe(true);
  });

  it("requires a full path-segment boundary", () => {
    expect(isPathUnderAny("/home/dev/.claude/skills-extra/x", ["/home/dev/.claude/skills"])).toBe(
      false,
    );
    expect(isPathUnderAny("/home/dev/.claude/skills", ["/home/dev/.claude/skills"])).toBe(true);
  });

  it("ignores empty roots", () => {
    expect(isPathUnderAny("/anything", [""])).toBe(false);
  });
});

describe("selectSkillSegmentsForInjection", () => {
  it("keeps only non-native skill segments and deduplicates by path", () => {
    const nativePath = "/home/dev/.claude/skills/native/SKILL.md";
    const portablePath = "/home/dev/.agents/skills/portable/SKILL.md";
    const segments: PromptSegment[] = [
      { kind: "text", content: "do it" },
      skillSegment("native", nativePath),
      skillSegment("portable", portablePath),
      skillSegment("portable", portablePath.replaceAll("/", "\\")),
    ];
    const selected = selectSkillSegmentsForInjection(segments, ["/home/dev/.claude/skills"]);
    expect(selected.map((segment) => segment.name)).toEqual(["portable"]);
  });
});

describe("buildInlineSkillInstructions", () => {
  it("renders a header and one tagged block per skill", () => {
    const text = buildInlineSkillInstructions([
      { name: "review", directory: "/skills/review", content: "# Review\nDo the review." },
    ]);
    expect(text).toContain("The user invoked the following agent skill(s)");
    expect(text).toContain('<skill name="review" dir="/skills/review">');
    expect(text).toContain("Do the review.");
    expect(text).toContain("</skill>");
  });

  it("truncates oversized skill bodies", () => {
    const text = buildInlineSkillInstructions([
      {
        name: "big",
        directory: "/skills/big",
        content: "x".repeat(MAX_INLINE_SKILL_CONTENT_CHARS + 100),
      },
    ]);
    expect(text).toContain("[skill content truncated]");
  });

  it("drops skills that would overflow the total budget, keeping what fits", () => {
    const text = buildInlineSkillInstructions(
      [
        { name: "first", directory: "/a", content: "alpha ".repeat(20) },
        { name: "second", directory: "/b", content: "beta ".repeat(20) },
      ],
      400,
    );
    expect(text).toContain('name="first"');
    expect(text).not.toContain('name="second"');
  });

  it("returns an empty string with no skills", () => {
    expect(buildInlineSkillInstructions([])).toBe("");
  });
});
