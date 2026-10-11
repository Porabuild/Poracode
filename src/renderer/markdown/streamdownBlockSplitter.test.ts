// @vitest-environment node
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { Lexer } from "streamdown-marked";
import { parseMarkdownIntoBlocks } from "streamdown";
import {
  splitStreamdownMarkdownBlocks,
  STREAMDOWN_BLOCK_ONLY_LIMIT_CHARS,
} from "./streamdownBlockSplitter";

const corpus = [
  ["empty", ""],
  ["paragraphs", "One paragraph.\n\nAnother **bold** paragraph with _emphasis_.\n"],
  ["line endings", "# Heading\r\n\r\nFirst\rsecond\r\n\r\n---\rLast"],
  ["setext headings", "Title\n=====\n\nSubheading\n---\n\nEnd\n"],
  ["indentation", "\tcode\n    second\n\nparagraph\n\tcontinuation\n"],
  ["lists", "- [ ] open\n- [x] done **now**\n  - nested\n\n1. first\n2. second\n"],
  ["list continuation", "- long\n\n  continuation\n\n  ```js\n  let x = 1;\n  ```\n\nend"],
  ["quotes", "> first\n>\n> - nested\n>   > another\n\noutside\n"],
  ["tables", "| left | right |\n| :--- | ---: |\n| `a|b` | **value** |\n\nend\n"],
  ["escaped tables", "A | B\n-- | --\n\\|escaped | [link](https://example.test/a)\n"],
  ["fences", "```typescript\nconst x = `literal`;\n```\n\n~~~text\n$$ not math\n~~~\n\nend"],
  ["unclosed fence", "before\n\n````js meta\n```\nconst x = 1;\n"],
  ["code and math", "```text\n$$\n```\n\nnext\n\n$$\nmath\n\ncontinuation\n$$\n\nend"],
  ["inline punctuation", "**bold** ~~gone~~ `code` \\* literal ![alt](image.png) <https://x.test>"],
  ["references", '[first][label]\n\n[label]: https://example.test "title"\n\n[second][label]'],
  ["reference replacement", "[a]: /one\n\n[a]\n\n[a]: /two\n\n[a]"],
  ["footnote reference", "before\r\n\r\n[^note-1] after\r\n\r\n[^note-1]: **definition**"],
  ["footnote definition", "[^only]: note\r\n\r\nno reference"],
  ["footnote in code", "```text\n[^code]\r\n```\r\n\r\nafter"],
  ["footnote bounds", `[^${"a".repeat(200)}]\n\n[^${"a".repeat(201)}]: too long`],
  ["html container", "<div>\n\nfirst\n\n<span>nested</span>\n\n</div>\n\nend"],
  ["html repeated opens", "<div><div>\n\nfirst\n\n<div>another\n\n</div></div>\n\n</div>\n\nend"],
  ["html case and attributes", '<DIV data-note="a>b">\n\nbody\n\n</dIv>\n\nend'],
  ["html self closing", "<custom-tag/>\n\nfirst\n\n<custom:tag />\n\nsecond"],
  ["html void", "<hr>\n\nfirst\n\n<img src=x>\n\nsecond\n\n</img>\n\nend"],
  ["html comments", "<!-- <div> -->\n\nfirst\n\n<!-- </div> -->\n\nend"],
  [
    "html raw and declarations",
    "<!doctype html>\n\n<script>\nconst x = '<div>';\n</script>\n\nend",
  ],
  ["math paragraphs", "$$\n\\frac{1}{2}\n\ncontinued\n$$\n\nafter\n\n$x^2$\n"],
  ["math delimiter counts", "$$$$$\n\nodd\n\n$$\n\nend\n\n\\$$ escaped upstream witness"],
  ["LaTeX delimiters", "Weight \\(W\\).\n\n\\[\n\\frac{1}{2}\n\\]\n\nend"],
  [
    "unicode boundaries",
    "# Café e\u0301 🌍\n\n𐐀 **你好** مرحبا\n\nHigh \ud83cX low \udf0d lone \ud800\udfff\n",
  ],
  ["unicode links", "[🌍](https://example.test/你好) ![e\u0301](./🌍.png)\n\n`\ud800`\n"],
  ["control characters", "before\u0000\u0001\u000b\u000c\u2028\u2029after\n\nend\n"],
  ["delimiter pressure", "*_[`".repeat(32) + "body" + "]_*`".repeat(32)],
  ["nested bracket pressure", "[".repeat(48) + "x" + "]".repeat(48) + "(/path)\n\nend"],
  [
    "nested list pressure",
    Array.from({ length: 20 }, (_, index) => `${"  ".repeat(index)}- x`).join("\n"),
  ],
] as const;

describe("Streamdown block-only splitter compatibility", () => {
  it("uses the exact Marked version and module used by the pinned independent oracle", () => {
    const streamdownPackage = JSON.parse(
      readFileSync("node_modules/streamdown/package.json", "utf8"),
    ) as {
      version: string;
    };
    const markedPackage = JSON.parse(
      readFileSync("node_modules/streamdown-marked/package.json", "utf8"),
    ) as {
      version: string;
    };
    const appRequire = createRequire(import.meta.url);
    const streamdownRequire = createRequire(realpathSync("node_modules/streamdown/package.json"));
    expect(streamdownPackage.version).toBe("2.6.0");
    expect(markedPackage.version).toBe("17.0.6");
    expect(realpathSync(appRequire.resolve("streamdown-marked"))).toBe(
      realpathSync(streamdownRequire.resolve("marked")),
    );
  });

  it.each(corpus)("matches the untouched oracle at every UTF-16 prefix: %s", (_name, text) => {
    for (let end = 0; end <= text.length; end += 1) {
      const prefix = text.slice(0, end);
      expect(splitStreamdownMarkdownBlocks(prefix), `UTF-16 prefix ${end}`).toEqual(
        parseMarkdownIntoBlocks(prefix),
      );
    }
  });

  it.each(corpus)(
    "remains independent across replacement, shrink and repeat transitions: %s",
    (_name, text) => {
      const midpoint = Math.floor(text.length / 2);
      const sameLengthReplacement = text.slice(0, midpoint) + "X" + text.slice(midpoint + 1);
      const snapshots = [
        text,
        text,
        text.slice(0, midpoint),
        sameLengthReplacement,
        "[^replacement]: retained\r\n\r\nnew",
        "<div>\n\nreplacement\n\n</div>\n",
        "$$\nreplacement\n$$\n",
        "",
        text,
      ];
      for (const snapshot of snapshots) {
        expect(splitStreamdownMarkdownBlocks(snapshot)).toEqual(parseMarkdownIntoBlocks(snapshot));
      }
    },
  );

  it("preserves the original carriage returns on the early footnote path", () => {
    const text = "A[^a]\r\n\r\n[^a]: definition\r";
    expect(splitStreamdownMarkdownBlocks(text)).toEqual(parseMarkdownIntoBlocks(text));
    expect(splitStreamdownMarkdownBlocks(text)).toEqual([text]);
  });

  it("keeps the block pass but removes only its unused final inline-token drain", () => {
    const blockPass = vi.spyOn(Lexer.prototype, "blockTokens");
    const inlinePass = vi.spyOn(Lexer.prototype, "inlineTokens");
    const text =
      "# Heading **strong**\n\n- [x] a [link](https://example.test)\n- `code`\n\n| a | b |\n| --- | --- |\n| _x_ | ~~y~~ |\n";
    try {
      const expected = parseMarkdownIntoBlocks(text);
      const oracleBlockCalls = blockPass.mock.calls.length;
      expect(oracleBlockCalls).toBeGreaterThan(0);
      expect(inlinePass.mock.calls.length).toBeGreaterThan(0);
      blockPass.mockClear();
      inlinePass.mockClear();

      expect(splitStreamdownMarkdownBlocks(text)).toEqual(expected);
      expect(blockPass).toHaveBeenCalledTimes(oracleBlockCalls);
      expect(inlinePass).not.toHaveBeenCalled();
    } finally {
      blockPass.mockRestore();
      inlinePass.mockRestore();
    }
  });

  it.each([-1, 0, 1])("uses the strict UTF-16 admission boundary at offset %s", (offset) => {
    const text = "**rich** " + "x".repeat(STREAMDOWN_BLOCK_ONLY_LIMIT_CHARS - 9 + offset);
    expect(text.length).toBe(STREAMDOWN_BLOCK_ONLY_LIMIT_CHARS + offset);
    const expected = parseMarkdownIntoBlocks(text);
    const inlinePass = vi.spyOn(Lexer.prototype, "inlineTokens");
    try {
      expect(splitStreamdownMarkdownBlocks(text)).toEqual(expected);
      expect(inlinePass.mock.calls.length > 0).toBe(offset >= 0);
    } finally {
      inlinePass.mockRestore();
    }
  });

  it("falls back to the untouched oracle for large syntax-heavy inputs", () => {
    const text = "**rich** [link](https://example.test)\n\n".repeat(1_600);
    expect(text.length).toBeGreaterThan(STREAMDOWN_BLOCK_ONLY_LIMIT_CHARS);
    expect(splitStreamdownMarkdownBlocks(text)).toEqual(parseMarkdownIntoBlocks(text));
  });

  it("creates a fresh lexer and preserves its normal inline queue bookkeeping", () => {
    const pass = vi.spyOn(Lexer.prototype, "blockTokens");
    try {
      splitStreamdownMarkdownBlocks("paragraph **one**");
      splitStreamdownMarkdownBlocks("paragraph **two**");
      expect(pass).toHaveBeenCalledTimes(2);
      expect(pass.mock.contexts[0]).not.toBe(pass.mock.contexts[1]);
      // Queued inline work remains owned by each short-lived lexer. The block
      // pass is unmodified; only Lexer.lex's subsequent drain is bypassed.
      expect(pass.mock.contexts[0]).toHaveProperty("inlineQueue", [
        expect.objectContaining({ src: "paragraph **one**" }),
      ]);
      expect(pass.mock.contexts[1]).toHaveProperty("inlineQueue", [
        expect.objectContaining({ src: "paragraph **two**" }),
      ]);
    } finally {
      pass.mockRestore();
    }
  });

  it("avoids the redundant inline pass's stack overflow without losing block source", () => {
    const text = "*".repeat(8_192) + "x" + "*".repeat(8_192);
    expect(text.length).toBe(16_385);
    const inlinePass = vi.spyOn(Lexer.prototype, "inlineTokens");
    try {
      expect(() => parseMarkdownIntoBlocks(text)).toThrowError(RangeError);
      expect(inlinePass.mock.calls.length).toBeGreaterThan(0);
      inlinePass.mockClear();
      expect(splitStreamdownMarkdownBlocks(text).join("")).toBe(text.replace(/\r\n|\r/g, "\n"));
      expect(inlinePass).not.toHaveBeenCalled();
    } finally {
      inlinePass.mockRestore();
    }
  });
});
