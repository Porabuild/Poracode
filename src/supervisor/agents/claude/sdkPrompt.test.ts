import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PromptSegment } from "@/shared/contracts";
import { buildSdkUserMessage } from "./sdkPrompt";

function textOf(message: Awaited<ReturnType<typeof buildSdkUserMessage>>): string {
  const content = message.message.content;
  if (typeof content === "string") return content;
  return content
    .flatMap((block) => (block.type === "text" ? [(block as { text: string }).text] : []))
    .join("");
}

describe("buildSdkUserMessage", () => {
  it("serializes a skill segment as its invocation text, never as an @path", async () => {
    const segments: PromptSegment[] = [
      {
        kind: "skill",
        name: "code-review",
        path: "/repo/.claude/skills/code-review/SKILL.md",
        invocation: "/code-review",
        provider: "Claude",
        scope: "project",
      },
      { kind: "text", content: " on the current diff" },
    ];

    const text = textOf(await buildSdkUserMessage("", segments));

    expect(text).toBe("/code-review on the current diff");
    expect(text).not.toContain("@/repo");
    expect(text).not.toContain("SKILL.md");
  });

  it("serializes a provider-native skill segment that carries no path", async () => {
    const segments: PromptSegment[] = [
      {
        kind: "skill",
        name: "code-review",
        invocation: "/code-review",
        provider: "Claude",
        scope: "global",
      },
    ];

    expect(textOf(await buildSdkUserMessage("", segments))).toBe("/code-review");
  });

  describe("with a leading skill", () => {
    const skill: PromptSegment = {
      kind: "skill",
      name: "simplify",
      invocation: "/simplify",
      provider: "Claude",
      scope: "global",
    };

    function blocksOf(message: Awaited<ReturnType<typeof buildSdkUserMessage>>) {
      return message.message.content as Array<{ type: string; text?: string }>;
    }

    it("puts the slash command in the last block, after attachments", async () => {
      const dir = mkdtempSync(join(tmpdir(), "claude-sdk-prompt-"));
      const image = join(dir, "shot.png");
      writeFileSync(image, "png");
      try {
        const message = await buildSdkUserMessage("", [
          skill,
          { kind: "text", content: " this " },
          { kind: "attachment", path: image, mimeType: "image/png" },
          { kind: "text", content: "please" },
        ]);

        const blocks = blocksOf(message);
        expect(blocks.map((block) => block.type)).toEqual(["image", "text"]);
        expect(blocks.at(-1)?.text).toBe("/simplify this please");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("mentions leading file attachments after the slash command", async () => {
      const message = await buildSdkUserMessage("", [
        { kind: "attachment", path: "/repo/notes.md", mimeType: "text/markdown" },
        skill,
        { kind: "text", content: " test" },
      ]);

      expect(blocksOf(message)).toEqual([
        { type: "text", text: "/simplify test\n\n@/repo/notes.md" },
      ]);
    });

    it("drops blank text before the slash command", async () => {
      const message = await buildSdkUserMessage("", [
        { kind: "text", content: "\n  " },
        skill,
        { kind: "text", content: " test" },
      ]);

      expect(blocksOf(message)).toEqual([{ type: "text", text: "/simplify test" }]);
    });

    it("puts inline instructions before the slash command", async () => {
      const message = await buildSdkUserMessage("", [skill], "Portable skill body");

      expect(blocksOf(message)).toEqual([
        { type: "text", text: "Portable skill body" },
        { type: "text", text: "/simplify" },
      ]);
    });

    it("asks the model to use a skill that is not at the start", async () => {
      const message = await buildSdkUserMessage("", [{ kind: "text", content: "please " }, skill]);

      expect(textOf(message)).toBe("please Use the simplify skill.");
    });
  });

  it("still emits file mentions as @path", async () => {
    const segments: PromptSegment[] = [
      { kind: "text", content: "look at " },
      { kind: "file", path: "/repo/src/index.ts" },
    ];

    expect(textOf(await buildSdkUserMessage("", segments))).toBe("look at @/repo/src/index.ts");
  });
});
