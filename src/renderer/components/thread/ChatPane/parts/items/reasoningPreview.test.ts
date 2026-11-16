import { describe, expect, it } from "vitest";
import {
  getReasoningInlinePreview,
  getReasoningLastLine,
  getReasoningPreview,
} from "./reasoningPreview";

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

  it("keeps a row-length thought whole so CSS truncates it at the row edge", () => {
    const thought =
      "The placeholder is published, so next I want to confirm it actually shows up on the registry. A quick read-only npm view should list the name, version, and dist-tags before I re-check what master does with the publish flag.";
    expect(getReasoningPreview(thought)).toBe(thought);
    expect(getReasoningInlinePreview(thought)).toBe(thought);
    expect(getReasoningLastLine(`Checking the registry\n${thought}`)).toBe(thought);
  });

  it("bounds the default preview length for very long reasoning", () => {
    const preview = getReasoningPreview("word ".repeat(1_000));
    expect(preview.length).toBeLessThanOrEqual(500);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("returns an empty string for whitespace-only text", () => {
    expect(getReasoningPreview("  \n\t")).toBe("");
  });
});
