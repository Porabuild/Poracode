import { describe, expect, it } from "vitest";
import { getReasoningInlinePreview, getReasoningPreview } from "./reasoningPreview";

// @vitest-environment node

describe("getReasoningPreview", () => {
  it("flattens multi-line reasoning into a single-line snippet", () => {
    expect(getReasoningPreview("First I will read the file.\nThen I will edit it.")).toBe(
      "First I will read the file. Then I will edit it.",
    );
  });

  it("separates source lines with centered dots for inline Thought rows", () => {
    expect(
      getReasoningInlinePreview(
        "**Designing owner-only retrieval**\n\n**Consolidating worktree candidates**\nPreserving error handling",
      ),
    ).toBe(
      "Designing owner-only retrieval · Consolidating worktree candidates · Preserving error handling",
    );
  });

  it("strips markdown structure so the snippet reads as prose", () => {
    expect(getReasoningPreview("## Plan\n- check the **selector**\n> quote\n`code` path")).toBe(
      "Plan check the selector quote code path",
    );
  });

  it("keeps a word boundary where adjacent emphasis markers were removed", () => {
    expect(
      getReasoningPreview("Planning parallel subagent tasks****Locating repository path"),
    ).toBe("Planning parallel subagent tasks Locating repository path");
  });

  it("drops fenced code blocks, including unterminated ones", () => {
    expect(getReasoningPreview("Look at\n```ts\nconst a = 1;\n```\nthe result")).toBe(
      "Look at the result",
    );
    expect(getReasoningPreview("Look at\n```ts\nconst a = 1;")).toBe("Look at");
  });

  it("truncates long reasoning with an ellipsis", () => {
    const preview = getReasoningPreview("word ".repeat(100), 40);
    expect(preview.length).toBeLessThanOrEqual(40);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("returns an empty string for whitespace-only text", () => {
    expect(getReasoningPreview("  \n\t")).toBe("");
  });
});
