import { describe, expect, it } from "vitest";
import type { AgentSlashCommand } from "@/shared/contracts";
import { bindLeadingSkillInvocation } from "./threadSlashCommands";
import { revertedPromptToDraft } from "./revertedPrompt";

describe("revertedPromptToDraft", () => {
  it("restores editor chips and keeps attachments separate with their MIME type", () => {
    const draft = revertedPromptToDraft(
      [
        { kind: "text", text: "Look at " },
        { kind: "file", path: "src/app.ts", source: "mention" },
        { kind: "thread", threadId: "other-thread", title: "Design review" },
        { kind: "mcp", name: "Browser" },
        {
          kind: "diff_comment",
          path: "src/app.ts",
          lineNumber: 12,
          side: "new",
          staged: false,
          body: "Why?",
        },
        {
          kind: "image",
          path: "C:\\tmp\\shot",
          mimeType: "image/png",
          dataUrl: "",
          source: "attachment",
        },
        {
          kind: "file",
          path: "C:\\tmp\\notes.md",
          source: "attachment",
          mimeType: "text/markdown",
        },
      ],
      [],
    );
    expect(draft.segments).toEqual([
      { kind: "text", content: "Look at " },
      { kind: "file", path: "src/app.ts" },
      { kind: "thread", threadId: "other-thread", title: "Design review" },
      { kind: "mcp", id: "Browser", name: "Browser" },
      {
        kind: "diff_comment",
        path: "src/app.ts",
        lineNumber: 12,
        side: "new",
        staged: false,
        body: "Why?",
      },
    ]);
    expect(draft.attachments).toEqual([
      {
        id: expect.any(String),
        path: "C:\\tmp\\shot",
        name: "shot",
        mimeType: "image/png",
        isImage: true,
      },
      {
        id: expect.any(String),
        path: "C:\\tmp\\notes.md",
        name: "notes.md",
        mimeType: "text/markdown",
        isImage: false,
      },
    ]);
  });

  it("resolves skills by plugin identity and cannot rebind an unavailable skill on send", () => {
    const command: AgentSlashCommand = {
      id: "review",
      label: "Review",
      section: "skills",
      skillName: "review",
      skillInvocation: "/skill:review",
      skillPath: "/skills/review/SKILL.md",
      skillProvider: "Example",
      skillScope: "project",
      pluginId: "review-plugin",
    };
    const skill = {
      kind: "skill" as const,
      name: "review",
      invocation: "/review",
      pluginId: "review-plugin",
    };
    const restored = revertedPromptToDraft(
      [{ kind: "text", text: "Please " }, skill, skill],
      [command],
    );
    expect(restored.segments.slice(1)).toEqual(
      Array.from({ length: 2 }, () => ({
        kind: "skill",
        name: "review",
        invocation: "/skill:review",
        path: "/skills/review/SKILL.md",
        provider: "Example",
        scope: "project",
        pluginId: "review-plugin",
      })),
    );
    const unavailable = revertedPromptToDraft([{ ...skill, pluginId: "other-plugin" }], [command]);
    expect(unavailable.segments).toEqual([{ kind: "text", content: "`/review`" }]);
    expect(bindLeadingSkillInvocation(unavailable.segments, [command])).toEqual(
      unavailable.segments,
    );
  });
});
