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
        invocation: "Use the code-review skill.",
        provider: "Claude",
        scope: "project",
      },
      { kind: "text", content: " on the current diff" },
    ];

    const text = textOf(await buildSdkUserMessage("", segments));

    expect(text).toBe("Use the code-review skill. on the current diff");
    expect(text).not.toContain("@/repo");
    expect(text).not.toContain("SKILL.md");
  });

  it("serializes a provider-native skill segment that carries no path", async () => {
    const segments: PromptSegment[] = [
      {
        kind: "skill",
        name: "code-review",
        invocation: "Use the code-review skill.",
        provider: "Claude",
        scope: "global",
      },
    ];

    expect(textOf(await buildSdkUserMessage("", segments))).toBe("Use the code-review skill.");
  });

  it("still emits file mentions as @path", async () => {
    const segments: PromptSegment[] = [
      { kind: "text", content: "look at " },
      { kind: "file", path: "/repo/src/index.ts" },
    ];

    expect(textOf(await buildSdkUserMessage("", segments))).toBe("look at @/repo/src/index.ts");
  });
});
