import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/renderer/styles.css"), "utf8");

/** Splits on separator characters that sit outside (), [] and quotes. */
function splitTopLevel(text: string, isSeparator: (char: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char === "\\") {
      index += 1;
    } else if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "]") {
      depth -= 1;
    } else if (depth === 0 && isSeparator(char)) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Removes every balanced block that starts with `opener`, such as `:has(…)`. */
function withoutBlocks(text: string, opener: string, open: string, close: string): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    if (!text.startsWith(opener, index)) {
      out += text.charAt(index);
      index += 1;
      continue;
    }
    let depth = 0;
    for (index += opener.length - 1; index < text.length; index += 1) {
      if (text.charAt(index) === open) depth += 1;
      else if (text.charAt(index) === close && --depth === 0) break;
    }
    index += 1;
  }
  return out;
}

/** Full selectors of a rule, with CSS nesting (`&`) resolved against its parents. */
function resolvedSelectors(rule: Rule): string[] {
  const own = splitTopLevel(rule.selector, (char) => char === ",").map((part) => part.trim());
  const parent = rule.parent;
  if (parent?.type !== "rule") return own;
  return resolvedSelectors(parent as Rule).flatMap((outer) =>
    own.map((inner) => (inner.includes("&") ? inner.replaceAll("&", outer) : `${outer} ${inner}`)),
  );
}

/**
 * Selectors that hang `:has()` on the document or app root, however the root
 * is spelled (`html`, `:is(html)`, `html:not(…)`, `div#root`, `:root`, …).
 */
function rootRelationalSelectors(css: string): string[] {
  const found: string[] = [];
  parse(css).walkRules((rule) => {
    for (const selector of resolvedSelectors(rule)) {
      const compounds = splitTopLevel(selector, (char) => /[\s>+~]/.test(char));
      for (const compound of compounds) {
        if (!compound.includes(":has(")) continue;
        const anchor = withoutBlocks(withoutBlocks(compound, ":has(", "(", ")"), "[", "[", "]");
        if (/(?<![\w.#-])(?:html|body)(?![\w-])|:root(?![\w-])|#root(?![\w-])/i.test(anchor)) {
          found.push(selector);
        }
      }
    }
  });
  return found;
}

describe("relational selector styles", () => {
  it("never anchors :has() on the document or app root", () => {
    // Element insertions and removals below a :has() anchor make the engine
    // re-evaluate it and restyle what depends on it. On the document or app
    // root that is the whole window, on every streamed chat element.
    expect(rootRelationalSelectors(source)).toEqual([]);
  });

  it("recognizes a root anchor however it is spelled", () => {
    const rooted = [
      "#root:has(.reply) .poracode-shell",
      'html[data-native-material="on"] #root:has([data-x] .aside) .poracode-shell',
      "html:has(.reply) .message",
      "HTML:has(.reply) .message",
      ":root:has(.reply) .message",
      ".dark:root:has(.reply) .message",
      "body.dark:has(.reply) .message",
      ":where(html):has(.reply) .message",
      "html:not([data-compact-layout]):has(.reply) .message",
      "html:is(.dark, .light):has(.reply) .message",
      "div#root:not(.unused):has(.reply) .message",
    ];
    for (const selector of rooted) {
      expect([selector, rootRelationalSelectors(`${selector} { color: red; }`).length]).toEqual([
        selector,
        1,
      ]);
    }
    expect(
      rootRelationalSelectors("#root { &:has(.reply) .message { color: red; } }"),
    ).toHaveLength(1);
    expect(
      rootRelationalSelectors('.before::before { content: "/*"; } html:has(.a) .b { color: red; }'),
    ).toHaveLength(1);
  });

  it("leaves local anchors and look-alike names alone", () => {
    const local = [
      "html[data-compact-layout] .poracode-shell:has(.dock) .actions",
      "#root .switch:has(input:checked) .switch__control",
      ".body:has(.icon)",
      ".html:has(.icon)",
      '[data-syntax="html:has("]',
      ".card:has(#root)",
      ".card:has(html)",
    ];
    for (const selector of local) {
      expect([selector, rootRelationalSelectors(`${selector} { color: red; }`).length]).toEqual([
        selector,
        0,
      ]);
    }
    expect(rootRelationalSelectors('.demo::before { content: "html:has("; }')).toEqual([]);
  });

  it("hides the base app behind a glass overlay through the root flag", () => {
    expect(source).toMatch(
      /html\[data-native-material="on"\]\[data-glass-overlay-visible\] #root \.poracode-shell\s*\{\s*visibility: hidden;\s*\}/,
    );
    expect(source).toMatch(
      /html\[data-native-material="on"\]\[data-glass-overlay-visible\]\s+#root\s+\[data-overlay-surface\]\s+\.poracode-shell\s*\{\s*visibility: visible;\s*\}/,
    );
  });
});
