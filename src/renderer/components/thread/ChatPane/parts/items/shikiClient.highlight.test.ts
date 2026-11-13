import { Blob as NodeBlob } from "node:buffer";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import {
  ensureLanguage,
  getShikiHighlighter,
  SHIKI_THEMES,
  transparentBgTransformer,
} from "./shikiClient";

// jsdom's Blob lacks the stream API used by the reference engine's Wasm loader.
beforeAll(() => vi.stubGlobal("Blob", NodeBlob));
afterAll(() => vi.unstubAllGlobals());

function styledLines(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  const lines = Array.from(container.querySelectorAll(".line"), (line) => {
    const runs: { text: string; style: string }[] = [];
    for (const child of line.childNodes) {
      const text = child.textContent ?? "";
      const style = child instanceof HTMLElement ? (child.getAttribute("style") ?? "") : "";
      const previous = runs.at(-1);
      if (previous?.style === style) previous.text += text;
      else runs.push({ text, style });
    }
    return runs;
  });
  return {
    text: container.textContent,
    lines,
    elements: container.querySelectorAll("span").length,
  };
}

describe("highlighting fidelity", () => {
  it("loads JSON without unrelated grammars", async () => {
    await ensureLanguage("json");
    expect((await getShikiHighlighter()).getLoadedLanguages()).toEqual(["json"]);
  });

  it("preserves existing grammar colors, embedded code and text while merging equal-style spans", async () => {
    // Markdown is requested before its embedded grammars have been used.
    await ensureLanguage("markdown");
    const highlighter = await getShikiHighlighter();
    const reference = await createHighlighterCore({
      themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
      langs: [
        import("@shikijs/langs/json"),
        import("@shikijs/langs/jsonc"),
        import("@shikijs/langs/javascript"),
        import("@shikijs/langs/typescript"),
        import("@shikijs/langs/tsx"),
        import("@shikijs/langs/jsx"),
        import("@shikijs/langs/python"),
        import("@shikijs/langs/bash"),
        import("@shikijs/langs/shell"),
        import("@shikijs/langs/yaml"),
        import("@shikijs/langs/html"),
        import("@shikijs/langs/css"),
        import("@shikijs/langs/go"),
        import("@shikijs/langs/rust"),
        import("@shikijs/langs/markdown"),
        import("@shikijs/langs/sql"),
        import("@shikijs/langs/diff"),
      ],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
    const samples = {
      json: '{"text":"<script> & 🦀 中文","enabled":true,"number":42}',
      jsonc: '// comment\n{"enabled":true,}',
      javascript: "const x = value?.items.map(item => `${item.name}`);",
      typescript: "export const value: Record<string, number> = { count: 3 };",
      tsx: 'const View = ({x}: {x: string}) => <div title="value">{x}</div>;',
      jsx: 'const View = ({x}) => <div title="value">{x}</div>;',
      python: 'def greet(name):\n    return f"Hello {name!r}"',
      bash: 'for item in "$@"; do echo "${item:-value}"; done',
      shell: 'export VALUE="hello"\necho "$VALUE"',
      yaml: "name: value\nitems:\n  - first\n",
      html: "<style>p { color: red }</style><script>const x = /a+/g;</script>",
      css: ".item:hover { color: rgb(1 2 3 / .5); }",
      go: "package main\nfunc main() { values := []int{1, 2}; _ = values }",
      rust: "fn main() { let values: Vec<u8> = vec![1, 2]; }",
      markdown:
        '# Header\n\n```typescript\nconst x: string = "hello";\n```\n\n```bash\necho "$VALUE"\n```',
      sql: "SELECT id FROM items WHERE enabled = true;",
      diff: "--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new",
    };
    let reduced = false;
    try {
      for (const [lang, text] of Object.entries(samples)) {
        await ensureLanguage(lang);
        for (const theme of SHIKI_THEMES) {
          const options = { lang, theme, transformers: [transparentBgTransformer] };
          const before = styledLines(reference.codeToHtml(text, options));
          const after = styledLines(
            highlighter.codeToHtml(text, { ...options, mergeSameStyleTokens: true }),
          );
          expect(after.text, `${lang}/${theme} text`).toBe(before.text);
          expect(after.lines, `${lang}/${theme} colors`).toEqual(before.lines);
          expect(after.elements).toBeLessThanOrEqual(before.elements);
          reduced ||= after.elements < before.elements;
        }
      }
      expect(reduced).toBe(true);
    } finally {
      reference.dispose();
    }
  });
});
