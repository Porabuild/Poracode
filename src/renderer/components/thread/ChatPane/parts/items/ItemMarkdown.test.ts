import { describe, expect, it } from "vitest";
import { normalizeGfmTableSeparators, normalizeShortCodeFenceClosers } from "./ItemMarkdown";

describe("normalizeShortCodeFenceClosers", () => {
  it("treats a two-backtick line as a closer inside a triple-backtick fence", () => {
    expect(
      normalizeShortCodeFenceClosers("before\n\n```text\nwriting is blocked\n``\n\nafter\n"),
    ).toBe("before\n\n```text\nwriting is blocked\n```\n\nafter\n");
  });

  it("leaves two backticks alone outside code fences", () => {
    expect(normalizeShortCodeFenceClosers("before\n``\nafter\n")).toBe("before\n``\nafter\n");
  });
});

describe("normalizeGfmTableSeparators", () => {
  it("expands a short separator to match a wider header", () => {
    const input = "| a | b | c | d |\n|---|---|---|\n| 1 | 2 | 3 | 4 |\n";
    const out = normalizeGfmTableSeparators(input);
    expect(out).toContain("| --- | --- | --- | --- |");
    expect(out.split("\n")[2]).toBe("| 1 | 2 | 3 | 4 |");
  });

  it("truncates a long separator to match a narrower header", () => {
    const input = "| a | b |\n|---|---|---|---|\n| 1 | 2 |\n";
    const out = normalizeGfmTableSeparators(input);
    expect(out).toContain("| --- | --- |");
    expect(out).not.toContain("---|---|---|---");
  });

  it("preserves alignment markers when expanding", () => {
    const input = "| a | b | c | d |\n|:---|---:|:---:|\n| 1 | 2 | 3 | 4 |\n";
    const out = normalizeGfmTableSeparators(input);
    expect(out).toContain("| :--- | ---: | :---: | --- |");
  });

  it("leaves a well-formed table untouched", () => {
    const input = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    expect(normalizeGfmTableSeparators(input)).toBe(input);
  });

  it("does not touch separator-like lines inside a code fence", () => {
    const input = "```\n| a | b | c |\n|---|---|\n```\n";
    expect(normalizeGfmTableSeparators(input)).toBe(input);
  });

  it("preserves CRLF line endings", () => {
    const input = "| a | b | c |\r\n|---|---|\r\n| 1 | 2 | 3 |\r\n";
    const out = normalizeGfmTableSeparators(input);
    expect(out).toContain("| --- | --- | --- |\r\n");
  });

  it("returns text unchanged when a properly closed fence precedes a bare two-backtick line", () => {
    const text = "```js\nconsole.log(1)\n```\n\nProse.\n``\n";
    expect(normalizeShortCodeFenceClosers(text)).toBe(text);
  });
});

// @vitest-environment node
