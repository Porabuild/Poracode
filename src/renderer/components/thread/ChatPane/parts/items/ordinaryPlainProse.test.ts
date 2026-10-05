import { describe, expect, it } from "vitest";
import { isOrdinaryPlainProse, MAX_ORDINARY_PLAIN_PROSE_LENGTH } from "./ordinaryPlainProse";

describe("isOrdinaryPlainProse", () => {
  it.each([
    "A",
    "An ordinary paragraph with 42 words to check.",
    "First sentence. Second sentence! Still ordinary? Yes: it is.",
    'We can use "quotes", apostrophes and (parentheses); it\'s fine.',
    "A well-known result — 25% faster… perhaps",
    "Two  internal   spaces",
    "Café and cafe\u0301",
    "Привет світе! Zażółć gęślą jaźń.",
    "普通话。日本語、한국어！",
    "مرحبا بالعالم، שלום עולם",
    "Astral letters 𐐀 and emoji 🌍 ☕️ 👍🏽",
    "lone high \ud83c",
    "lone low \udf0d",
    "http:",
    "x=1",
    "a = b",
    "x=",
    "⟦x=1 y=2⟧ ordinary prose",
    "⟦a=2 s=30 t=179000⟧ prose",
    "trailing ",
    "trailing  ",
    "Sentence.   ",
    "Two  internal   spaces  ",
    "Emoji 🌍 👍🏽  ",
    "x=1  ",
  ])("accepts the verbatim paragraph %j", (text) => {
    expect(isOrdinaryPlainProse(text)).toBe(true);
  });

  it.each([
    "",
    " ",
    " indented",
    "    code",
    "line\nbreak",
    "paragraph\n\nbreak",
    "line\rbreak",
    "line\r\nbreak",
    "tab\there",
    "nonbreaking\u00a0space",
    "narrow\u202fspace",
    "line\u2028separator",
    "paragraph\u2029separator",
    "\ufeffBOM",
    "zero\u200bwidth",
    "soft\u00adhyphen",
    "bidi\u202eoverride",
    "control\u0000character",
    "👩‍💻",
    "astral format \u{e0001}",
    "astral private use \u{f0000}",
    "astral unassigned \u{1000c}",
    "-",
    "- item",
    "+ item",
    "* item",
    "1.",
    "1. item",
    "1)",
    "1) item",
    "1234567890) ambiguous",
    "---",
    "===",
    "=leading",
    "x==1",
    "Title\n===",
    "# heading",
    "> quote",
    "| table |",
    "**bold**",
    "word_emphasis",
    "~strike",
    "`code",
    "```fence",
    "[link",
    "![image",
    "[reference]: target",
    "[label](https://example.test)",
    "<em>html</em>",
    "<!-- comment",
    "&amp; entity",
    "&#65; entity",
    "incomplete &cop",
    "email@example.test",
    "https://example.test",
    "www.",
    "WWW. next",
    "www.example.test",
    "example.com",
    "README.md",
    "src/file.ts:12",
    "src/folder",
    "/absolute",
    "C:\\project\\file",
    "file:relative.txt",
    "backslash \\escape",
    "$x$",
    "\\(x\\)",
    "x + y",
    "x^2",
    "{ambiguous}",
    "ellipsis...",
    "decimal 3.14",
  ])("falls back for syntax, structural whitespace or ambiguity %j", (text) => {
    expect(isOrdinaryPlainProse(text)).toBe(false);
  });

  it("bounds scans by the current UTF-16 length", () => {
    expect(isOrdinaryPlainProse("x".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH))).toBe(true);
    expect(isOrdinaryPlainProse("x".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH + 1))).toBe(false);
    expect(isOrdinaryPlainProse("🌍".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH / 2))).toBe(true);
    expect(isOrdinaryPlainProse("🌍".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH / 2 + 1))).toBe(false);
    const withTrailingSpace = "x".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH - 1) + " ";
    expect(isOrdinaryPlainProse(withTrailingSpace)).toBe(true);
    expect(isOrdinaryPlainProse(withTrailingSpace + " ")).toBe(false);
    expect(isOrdinaryPlainProse("\ud800".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH))).toBe(true);
    expect(isOrdinaryPlainProse("\ud800".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH + 1))).toBe(false);
    expect(isOrdinaryPlainProse("\udfff".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH))).toBe(true);
    expect(isOrdinaryPlainProse("\udfff".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH) + " ")).toBe(
      false,
    );
  });

  it("accepts every lone surrogate verbatim, including interior positions and trailing spaces", () => {
    for (let code = 0xd800; code <= 0xdfff; code += 1) {
      const surrogate = String.fromCharCode(code);
      expect(isOrdinaryPlainProse(surrogate)).toBe(true);
      expect(isOrdinaryPlainProse(`Text ${surrogate} middle ${surrogate}  `)).toBe(true);
    }
  });

  it.each([
    "Hello 🌍 ☕️ 👍🏽 🚀 done!  ",
    "🌍👍🏽🚀",
    "𐐀𐐨 𝔄 𠀀 𞤀 done.  ",
    "𐐀🌍𐐨👍🏽𠀀🚀",
    "High \ud83c remains \udbff  ",
    "Low \udf0d remains \udfff  ",
    "Broken \ud83cX\udf0d \ud83d\ud83d \udfff\udfff end  ",
    "\udf0d\ud83cX\ud83c🌍 end  ",
  ])("accepts every UTF-16 prefix including malformed snapshots: %j", (text) => {
    for (let end = 1; end <= text.length; end += 1) {
      const snapshot = text.slice(0, end);
      expect({ snapshot, eligible: isOrdinaryPlainProse(snapshot) }).toEqual({
        snapshot,
        eligible: true,
      });
    }
  });

  it.each([
    "- item",
    "1) item",
    "**bold**",
    "src/file.ts",
    "$x$",
    "&amp;",
    "control\u0000",
    "format\u200b",
    "space\u00a0",
    "space\u202f",
    "line\u2028",
    "👩‍💻",
    "\u{e0001}",
    "\u{f0000}",
    "\u{1000c}",
  ])("retains syntax and Unicode guards alongside lone surrogates: %j", (text) => {
    expect(isOrdinaryPlainProse(`${text} \ud800`)).toBe(false);
    expect(isOrdinaryPlainProse(`${text} \udfff  `)).toBe(false);
  });

  it.each(["", " ", " leading", "-", "1.", "www.", "**bold**", "line\n", "tab\t", "\u00a0"])(
    "keeps ineligible snapshots on the rich path when ASCII spaces arrive: %j",
    (text) => {
      expect(isOrdinaryPlainProse(text + " ")).toBe(false);
      expect(isOrdinaryPlainProse(text + "   ")).toBe(false);
    },
  );

  it.each([
    ["1", ")", " item"],
    ["1", ".", " item"],
    ["Read www", ".", "example.test"],
    ["Read README.", "m", "d"],
    ["See src", "/", "file.ts"],
    ["Hello", "[", "link](https://example.test)"],
    ["Hello", "&", "amp;"],
    ["Hello", "$", "x$"],
    ["Hello", "\n", "\nnext paragraph"],
  ])("rechecks a streamed prefix and its completion: %j", (prefix, syntax, completion) => {
    expect(isOrdinaryPlainProse(prefix)).toBe(true);
    expect(isOrdinaryPlainProse(prefix + syntax)).toBe(false);
    expect(isOrdinaryPlainProse(prefix + syntax + completion)).toBe(false);
    expect(isOrdinaryPlainProse(prefix)).toBe(true);
  });

  it("checks replacements even when a longer snapshot keeps the old prefix and suffix", () => {
    const edge = "ordinary words ".repeat(20);
    const previous = `${edge}middle ${edge}done`;
    const replacement = `${edge}**changed middle** ${edge}done`;
    expect(isOrdinaryPlainProse(previous)).toBe(true);
    expect(isOrdinaryPlainProse(replacement)).toBe(false);
    expect(isOrdinaryPlainProse("Short replacement")).toBe(true);
  });

  it("rechecks interior surrogate replacements and repairs without weakening guards", () => {
    const edge = "ordinary words ".repeat(20);
    for (const middle of ["🌍", "\ud83cX", "\udf0dX", "\ud83d\ud83d broken \udfff\udfff", "𐐀"]) {
      const snapshot = `${edge}${middle} middle ${edge}done  `;
      expect(isOrdinaryPlainProse(snapshot)).toBe(true);
      expect(isOrdinaryPlainProse(`${edge}${middle} **changed middle** ${edge}done  `)).toBe(false);
    }
  });
});
