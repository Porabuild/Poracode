import { expect, test } from "bun:test";
import { chatMarkdown } from "./chatMarkdown";

const rootNames = new Set(["src", "docs", "README.md"]);

test("paragraph paths become code-span chips", () => {
  expect(chatMarkdown("Edit src/app.ts:12 and docs/.", { rootNames })).toBe(
    "Edit `app.ts · L12` and `docs/`",
  );
});

test("list, table, heading, and blockquote paths rewrite", () => {
  expect(
    chatMarkdown(
      "# See src/app.ts\n\n- src/lib/\n- plain\n\n| a | b |\n|---|---|\n| src/x.ts | y |\n\n> docs/guide.md",
      {
        rootNames,
      },
    ),
  ).toBe(
    "# See `app.ts`\n\n- `lib/`\n- plain\n\n| a | b |\n|---|---|\n| `x.ts` | y |\n\n> `guide.md`",
  );
});

test("fenced and indented code stay untouched", () => {
  const source =
    "Before `src/app.ts`.\n\n```\nsrc/app.ts:9\n```\n\n    src/app.ts:9\n\nAfter src/app.ts now";
  expect(chatMarkdown(source, { rootNames })).toBe(
    "Before `app.ts`.\n\n```\nsrc/app.ts:9\n```\n\n    src/app.ts:9\n\nAfter `app.ts` now",
  );
});

test("non-path inline code stays untouched", () => {
  expect(chatMarkdown("run `bun test` now", { rootNames })).toBe("run `bun test` now");
});

test("codespan paths chip with line ranges", () => {
  expect(chatMarkdown("see `src/app.ts:12-20`", { rootNames })).toBe("see `app.ts · L12-20`");
});

test("folder prose needs root names", () => {
  expect(chatMarkdown("in src/lib/ today", { rootNames })).toBe("in `lib/` today");
  expect(chatMarkdown("in src/lib/ today")).toBe("in src/lib/ today");
});

test("bare autolinks and bracketed urls relabel", () => {
  const url = "https://github.com/owner/repo/pull/12";
  expect(chatMarkdown(`see ${url}`, {})).toBe(
    "see [#12 · owner/repo](https://github.com/owner/repo/pull/12)",
  );
  expect(chatMarkdown(`see <${url}>`, {})).toBe(
    "see [#12 · owner/repo](https://github.com/owner/repo/pull/12)",
  );
  expect(chatMarkdown(`see [${url}](${url})`, {})).toBe(
    "see [#12 · owner/repo](https://github.com/owner/repo/pull/12)",
  );
});

test("labeled links keep their label", () => {
  expect(chatMarkdown("[the docs](https://example.com/a/b)", {})).toBe(
    "[the docs](https://example.com/a/b)",
  );
});

test("poracode path urls and project-path links chip", () => {
  const href = "https://poracode.local/path/v2/src%2Fapp.ts?line=12";
  expect(chatMarkdown(`[open](${href})`, {})).toBe("`app.ts · L12`");
  expect(chatMarkdown("[app](src/app.ts)", { rootNames })).toBe("`app.ts`");
  expect(chatMarkdown("[app](/repo/src/app.ts)", { root: "/repo", rootNames })).toBe("`app.ts`");
});

test("partial streaming input returns the source", () => {
  const source = "text\n\n```ts\nconst x = ";
  expect(chatMarkdown(source, { rootNames })).toBe(source);
});

test("CRLF normalizes before rewriting", () => {
  expect(chatMarkdown("a\r\nsrc/app.ts\r\n", { rootNames })).toBe("a\n`app.ts`\n");
});

test("labels containing backticks are skipped", () => {
  const source = "see [x](foo`bar.ts) end";
  expect(chatMarkdown(source, { rootNames })).toBe(source);
});

test("list items rewrite inline tokens, not the item's raw text", () => {
  const names = new Set([...rootNames, "lib"]);
  expect(
    chatMarkdown(
      "- `src/server.ts:12` — reads PORT\n- see src/app.test.ts and `bun test`\n- [docs](src/lib/a.ts) and https://github.com/anomalyco/opencode/pull/1234",
      { rootNames: names },
    ),
  ).toBe(
    "- `server.ts · L12` — reads PORT\n- see `app.test.ts` and `bun test`\n- `a.ts` and [#1234 · anomalyco/opencode](https://github.com/anomalyco/opencode/pull/1234)",
  );
  expect(
    chatMarkdown("1. Edit `src/app.ts`\n   - nested `lib/b.ts:3-9` item\n2. Done", {
      rootNames: names,
    }),
  ).toBe("1. Edit `app.ts`\n   - nested `b.ts · L3-9` item\n2. Done");
});
