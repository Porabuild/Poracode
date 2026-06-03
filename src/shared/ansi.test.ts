import { describe, expect, it } from "vitest";
import { stripAnsi, stripAnsiPreservingLayout, takeTail } from "./ansi";

describe("stripAnsi", () => {
  it("removes SGR colour sequences", () => {
    expect(stripAnsi("\u001b[1mBold\u001b[0m")).toBe("Bold");
  });

  it("removes CSI sequences", () => {
    expect(stripAnsi("\u001b[2Jhello")).toBe("hello");
  });

  it("removes OSC sequences", () => {
    expect(stripAnsi("title\r\n\u001b]0;powershell.exe\u0007")).toBe("title\r\n");
  });
});

describe("stripAnsiPreservingLayout", () => {
  it("replaces CUP (cursor position) with newline", () => {
    const input = "\u001b[3;3HDo you trust\u001b[4;3Hthe contents";
    expect(stripAnsiPreservingLayout(input)).toBe("\nDo you trust\nthe contents");
  });

  it("replaces CUF (cursor forward) with spaces", () => {
    const input = ">\u001b[1C1.\u001b[1CYes, continue";
    expect(stripAnsiPreservingLayout(input)).toBe("> 1. Yes, continue");
  });

  it("handles CUF with multi-digit count", () => {
    const input = "foo\u001b[4Cbar";
    expect(stripAnsiPreservingLayout(input)).toBe("foo    bar");
  });

  it("handles CUF with no count (defaults to 1)", () => {
    const input = "a\u001b[Cb";
    expect(stripAnsiPreservingLayout(input)).toBe("a b");
  });

  it("handles CUP with H and f final bytes", () => {
    const input = "\u001b[1;1Hfoo\u001b[2;1fbar";
    expect(stripAnsiPreservingLayout(input)).toBe("\nfoo\nbar");
  });

  it("strips SGR and other sequences after normalising layout", () => {
    const input = "\u001b[3;3H\u001b[1m> 1.\u001b[0m\u001b[1CYes, continue";
    expect(stripAnsiPreservingLayout(input)).toBe("\n> 1. Yes, continue");
  });

  it("preserves line structure for Codex trust-prompt TUI output", () => {
    // Simulates the actual TUI-style output from Codex CLI
    const tuiOutput = [
      "\u001b[2J", // clear screen
      "\u001b[1;3HYou are in C:\\Users\\work\\project",
      "\u001b[3;3HDo you trust the contents of this directory?",
      "\u001b[5;3H> 1. Yes, continue",
      "\u001b[6;3H2. No, quit",
      "\u001b[8;3HPress enter to continue",
    ].join("");

    const result = stripAnsiPreservingLayout(tuiOutput);
    const lines = result.split("\n").filter((l) => l.trim());

    expect(lines).toEqual([
      "You are in C:\\Users\\work\\project",
      "Do you trust the contents of this directory?",
      "> 1. Yes, continue",
      "2. No, quit",
      "Press enter to continue",
    ]);
  });

  it("returns the same string when there is no ESC (fast path)", () => {
    const plain = "npm warn exec\nbuild ok";
    expect(stripAnsiPreservingLayout(plain)).toBe(plain);
  });

  it("caps CUF space expansion", () => {
    const input = `a\u001b[999999Cb`;
    expect(stripAnsiPreservingLayout(input)).toBe(`a${" ".repeat(8192)}b`);
  });

  it("leaves normal \\r\\n-based output unchanged", () => {
    const normal = "line one\r\nline two\r\nline three";
    expect(stripAnsiPreservingLayout(normal)).toBe(normal);
  });
});

describe("takeTail", () => {
  it("returns the value when shorter than maxLength", () => {
    expect(takeTail("abc", 10)).toBe("abc");
  });

  it("returns the tail when longer than maxLength", () => {
    expect(takeTail("abcdef", 3)).toBe("def");
  });
});
