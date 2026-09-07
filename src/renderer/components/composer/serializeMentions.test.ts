import { beforeEach, describe, expect, it } from "vitest";
import type { PromptSegment } from "@/shared/contracts";
import { createDiffCommentChipElement } from "./DiffCommentChip";
import { createMcpMentionChipElement } from "./McpMentionChip";
import { createThreadMentionChipElement } from "./ThreadMentionChip";
import { createSlashCommandChipElement } from "./SlashCommandChip";
import {
  rebuildEditedPromptSegments,
  serializeComposerContent,
  serializeToSegments,
} from "./serializeMentions";

describe("serializeComposerContent", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("serializes plain text", () => {
    container.textContent = "hello world";
    expect(serializeComposerContent(container)).toBe("hello world");
  });

  it("promotes inline @path tokens into file segments", () => {
    container.textContent = "inspect @.agents/docs/ui-patterns.md now";
    expect(serializeToSegments(container)).toEqual([
      { kind: "text", content: "inspect " },
      { kind: "file", path: ".agents/docs/ui-patterns.md" },
      { kind: "text", content: " now" },
    ]);
  });

  it("treats end-of-input @path tokens as complete mentions", () => {
    container.textContent = "inspect @README.md";
    expect(serializeToSegments(container)).toEqual([
      { kind: "text", content: "inspect " },
      { kind: "file", path: "README.md" },
    ]);
  });

  it("does not treat email addresses as file mentions", () => {
    container.textContent = "email me@example.com please";
    expect(serializeToSegments(container)).toEqual([
      { kind: "text", content: "email me@example.com please" },
    ]);
  });

  it("does not treat scoped package names as file mentions", () => {
    container.textContent = "install @tanstack/react-virtual please";
    expect(serializeToSegments(container)).toEqual([
      { kind: "text", content: "install @tanstack/react-virtual please" },
    ]);
  });

  it("trims whitespace", () => {
    container.textContent = "  hello  ";
    expect(serializeComposerContent(container)).toBe("hello");
  });

  it("serializes mention chips as @path", () => {
    container.appendChild(document.createTextNode("check "));
    const chip = document.createElement("span");
    chip.dataset.mentionPath = "src/main.ts";
    chip.textContent = "main.ts"; // visible label, should be ignored
    container.appendChild(chip);
    container.appendChild(document.createTextNode(" please"));

    expect(serializeComposerContent(container)).toBe("check @src/main.ts please");
  });

  it("serializes an MCP mention chip as an mcp segment that flattens to @name", () => {
    container.appendChild(createMcpMentionChipElement({ id: "browser", name: "Browser" }));
    container.appendChild(document.createTextNode(" open the page"));

    expect(serializeToSegments(container)).toEqual([
      { kind: "mcp", id: "browser", name: "Browser" },
      { kind: "text", content: " open the page" },
    ]);
    expect(serializeComposerContent(container)).toBe("@Browser open the page");
  });

  it("serializes a thread mention chip as a thread segment that flattens to @title", () => {
    container.appendChild(
      createThreadMentionChipElement({ threadId: "thread-1", title: "Fix the composer" }),
    );
    container.appendChild(document.createTextNode(" please"));

    expect(serializeToSegments(container)).toEqual([
      { kind: "thread", threadId: "thread-1", title: "Fix the composer" },
      { kind: "text", content: " please" },
    ]);
    expect(serializeComposerContent(container)).toBe("@Fix the composer please");
  });

  it("keeps a thread mention chip when its title is empty", () => {
    container.appendChild(createThreadMentionChipElement({ threadId: "thread-1", title: "" }));

    expect(serializeToSegments(container)).toEqual([
      { kind: "thread", threadId: "thread-1", title: "" },
    ]);
    expect(serializeComposerContent(container)).toBe("@thread-1");
  });

  it("serializes BR as newline", () => {
    container.appendChild(document.createTextNode("line one"));
    container.appendChild(document.createElement("br"));
    container.appendChild(document.createTextNode("line two"));

    expect(serializeComposerContent(container)).toBe("line one\nline two");
  });

  it("serializes nested DIVs (contentEditable newlines) as newlines", () => {
    const div1 = document.createElement("div");
    div1.textContent = "line one";
    const div2 = document.createElement("div");
    div2.textContent = "line two";
    container.appendChild(div1);
    container.appendChild(div2);

    expect(serializeComposerContent(container)).toBe("line one\nline two");
  });

  it("handles multiple chips interspersed with text", () => {
    container.appendChild(document.createTextNode("fix "));
    const chip1 = document.createElement("span");
    chip1.dataset.mentionPath = "src/a.ts";
    container.appendChild(chip1);
    container.appendChild(document.createTextNode(" and "));
    const chip2 = document.createElement("span");
    chip2.dataset.mentionPath = "src/b.ts";
    container.appendChild(chip2);

    expect(serializeComposerContent(container)).toBe("fix @src/a.ts and @src/b.ts");
  });

  it("handles empty container", () => {
    expect(serializeComposerContent(container)).toBe("");
  });

  it("handles chip-only content", () => {
    const chip = document.createElement("span");
    chip.dataset.mentionPath = "README.md";
    container.appendChild(chip);

    expect(serializeComposerContent(container)).toBe("@README.md");
  });

  it("preserves skill metadata and uses the provider invocation when flattened", () => {
    const chip = createSlashCommandChipElement({
      id: "review-code",
      skillName: "review-code",
      skillPath: "C:\\Users\\me\\.agents\\skills\\review-code\\SKILL.md",
      skillInvocation: "$review-code",
      skillProvider: "Codex",
      skillScope: "global",
    });
    container.appendChild(chip);

    expect(chip.querySelector("svg")).not.toBeNull();

    expect(serializeToSegments(container)).toEqual([
      {
        kind: "skill",
        name: "review-code",
        path: "C:\\Users\\me\\.agents\\skills\\review-code\\SKILL.md",
        invocation: "$review-code",
        provider: "Codex",
        scope: "global",
      },
    ]);
    expect(serializeComposerContent(container)).toBe("$review-code");
  });

  it("preserves plugin ownership on a plugin-backed core skill", () => {
    const chip = createSlashCommandChipElement({
      id: "github",
      skillName: "github",
      skillPath: "C:\\plugins\\github\\skills\\github\\SKILL.md",
      skillInvocation: "$github",
      skillProvider: "GitHub",
      skillScope: "global",
      pluginId: "github",
      pluginName: "GitHub",
    });
    container.appendChild(chip);

    expect(chip).toHaveAttribute("aria-label", "GitHub");
    expect(serializeToSegments(container)).toEqual([
      {
        kind: "skill",
        name: "github",
        path: "C:\\plugins\\github\\skills\\github\\SKILL.md",
        invocation: "$github",
        provider: "GitHub",
        scope: "global",
        pluginId: "github",
        pluginName: "GitHub",
      },
    ]);
  });

  it("preserves multiple diff comments and flattens them for the agent", () => {
    const comments = [
      {
        kind: "diff_comment" as const,
        path: "src/a.ts",
        lineNumber: 12,
        side: "new" as const,
        staged: false,
        body: "Keep this guard.",
      },
      {
        kind: "diff_comment" as const,
        path: "src/b.ts",
        lineNumber: 7,
        side: "old" as const,
        staged: true,
        body: "Why was this removed?",
      },
    ];
    container.appendChild(createDiffCommentChipElement(comments[0]!));
    container.appendChild(document.createTextNode("\n\n"));
    container.appendChild(createDiffCommentChipElement(comments[1]!));

    expect(serializeToSegments(container)).toEqual([
      comments[0],
      { kind: "text", content: "\n\n" },
      comments[1],
    ]);
    expect(serializeComposerContent(container)).toBe(
      "Review comment on src/a.ts:+12 (unstaged):\nKeep this guard.\n\nReview comment on src/b.ts:-7 (staged):\nWhy was this removed?",
    );
  });

  it("displays a short skill name while serializing the ACP-native command id", () => {
    const chip = createSlashCommandChipElement({
      id: "skill:simplify",
      skillName: "simplify",
    });
    container.appendChild(chip);

    expect(chip.textContent).toBe("simplify");
    expect(chip.querySelector("svg")).not.toBeNull();
    expect(chip.dataset.skillName).toBe("simplify");
    expect(chip.getAttribute("aria-label")).toBe("Skill: simplify");
    expect(serializeComposerContent(container)).toBe("/skill:simplify");
  });

  it("excludes attachment segments from serialization", () => {
    // Note: serializeComposerContent uses serializeToSegments which walks DOM nodes.
    // The AttachmentBar logic is what puts attachments in the segments array.
    // This test ensures that if someone adds an attachment segment to the
    // result of serializeToSegments, it doesn't appear in the flat string.
    return import("./serializeMentions").then((m) => {
      const segments: any[] = [
        { kind: "text", content: "hello" },
        { kind: "attachment", path: "/tmp/foo.png" },
      ];
      expect(m.flattenSegments(segments)).toBe("hello");
    });
  });
});

describe("rebuildEditedPromptSegments", () => {
  const skill: Extract<PromptSegment, { kind: "skill" }> = {
    kind: "skill",
    name: "review-code",
    path: "C:\\Users\\me\\.agents\\skills\\review-code\\SKILL.md",
    invocation: "$review-code",
    provider: "Codex",
    scope: "global",
  };
  const attachment: Extract<PromptSegment, { kind: "attachment" }> = {
    kind: "attachment",
    path: "C:\\tmp\\context.txt",
  };
  const original: PromptSegment[] = [
    attachment,
    skill,
    { kind: "text", content: " inspect " },
    { kind: "file", path: "src/main.ts" },
    { kind: "text", content: " now" },
  ];

  it("preserves visible structured tokens without duplicating their flattened text", () => {
    expect(
      rebuildEditedPromptSegments("$review-code inspect @src/main.ts, then @src/new.ts", original),
    ).toEqual([
      attachment,
      skill,
      { kind: "text", content: " inspect " },
      { kind: "file", path: "src/main.ts" },
      { kind: "text", content: ", then " },
      { kind: "file", path: "src/new.ts" },
    ]);
  });

  it("drops removed visible tokens while retaining invisible attachments", () => {
    expect(rebuildEditedPromptSegments("Inspect the implementation", original)).toEqual([
      attachment,
      { kind: "text", content: "Inspect the implementation" },
    ]);
  });
});
