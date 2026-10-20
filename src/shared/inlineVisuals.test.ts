import { describe, expect, it } from "vitest";
import {
  INLINE_VISUAL_FORMAT_VERSION,
  INLINE_VISUAL_SEARCH_VERSION,
  inlineVisualSearchText,
  splitInlineVisuals,
} from "./inlineVisuals";

describe("inline visual text format", () => {
  it("keeps prose and a title searchable without reading HTML", () => {
    const text =
      "Before\n```poracode-html-v1 Loan calculator\n<script>privateSource()</script>\n```\nAfter";
    expect(INLINE_VISUAL_FORMAT_VERSION).toBe(1);
    expect(splitInlineVisuals(text)).toEqual([
      { kind: "markdown", text: "Before\n" },
      {
        kind: "visual",
        version: 1,
        title: "Loan calculator",
        html: "<script>privateSource()</script>\n",
        complete: true,
      },
      { kind: "markdown", text: "After" },
    ]);
    expect(inlineVisualSearchText(text)).toBe("Before\n\nLoan calculator\nAfter");
  });

  it("versions extraction separately and preserves native source under its original position", () => {
    expect(INLINE_VISUAL_SEARCH_VERSION).toBe(2);
    const text =
      'Before\r\n```poracode-visual-v1 Cost comparison\r\n{"secret":"source"}\r\n```\r\nAfter';
    expect(splitInlineVisuals(text)).toEqual([
      { kind: "markdown", text: "Before\r\n" },
      {
        kind: "native",
        version: 1,
        title: "Cost comparison",
        source: '{"secret":"source"}\r\n',
        complete: true,
      },
      { kind: "markdown", text: "After" },
    ]);
    expect(inlineVisualSearchText(text)).toBe("Before\r\n\nCost comparison\nAfter");
  });

  it("excludes every native body without parsing JSON, including future and unfinished versions", () => {
    for (const version of [1, 2, 999]) {
      for (const closing of ["", "\n~~~\nAfter"]) {
        const text = `Before\n~~~poracode-visual-v${version} Calculator\ninvalid { privateSource()${closing}`;
        expect(inlineVisualSearchText(text)).toBe(
          `Before\n\nCalculator\n${closing ? "After" : ""}`,
        );
      }
    }
  });

  it("keeps ordinary fenced native examples opaque and does not confuse mixed document types", () => {
    const quoted = "````json\n```poracode-visual-v1 Example\n{}\n```\n````";
    expect(inlineVisualSearchText(quoted)).toBe(quoted);
    const text =
      "```poracode-html-v1 HTML\n<span>x</span>\n```\n```poracode-visual-v1 Native\n{}\n```";
    expect(
      splitInlineVisuals(text)
        .filter((part) => part.kind !== "markdown")
        .map((part) => part.kind),
    ).toEqual(["visual", "native"]);
    expect(inlineVisualSearchText(text)).toBe("\nHTML\n\nNative\n");
  });

  it("excludes incomplete and future-version HTML from search", () => {
    for (const version of [1, 2, 999]) {
      const text = `Before\n~~~poracode-html-v${version} Chart\r\n<script>privateSource()`;
      expect(inlineVisualSearchText(text)).toBe("Before\n\nChart\n");
      expect(splitInlineVisuals(text)[1]).toMatchObject({ version, complete: false });
    }
  });

  it("does not execute or strip quoted examples or ordinary HTML code fences", () => {
    for (const text of [
      "````markdown\n```poracode-html-v1 Example\n<script>example()</script>\n```\n````",
      "```html\n<button>Example</button>\n```",
      "    ```poracode-html-v1 Example\n    <div>Indented code</div>",
    ]) {
      expect(splitInlineVisuals(text)).toEqual([{ kind: "markdown", text }]);
      expect(inlineVisualSearchText(text)).toBe(text);
    }
  });

  it("matches fence marker and length and preserves multiple visual positions", () => {
    const parts = splitInlineVisuals(
      "````poracode-html-v1 First\n```\n~~~\n<div>one</div>\n````\nprose\n~~~poracode-html-v1 Second\n<div>two</div>\n~~~",
    );
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatchObject({
      title: "First",
      html: "```\n~~~\n<div>one</div>\n",
      complete: true,
    });
    expect(parts[1]).toEqual({ kind: "markdown", text: "prose\n" });
    expect(parts[2]).toMatchObject({ title: "Second", complete: true });
  });
});
