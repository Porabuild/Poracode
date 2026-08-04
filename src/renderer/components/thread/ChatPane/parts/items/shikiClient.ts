import type { HighlighterCore, ShikiTransformer } from "shiki/core";

/**
 * Languages registered when the highlighter is created. Keep this aligned
 * with `HighlightLanguage` in languageDetect.ts so the bundle only includes
 * grammars the UI can select.
 */
const INITIAL_LANGS = [
  "json",
  "jsonc",
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "python",
  "bash",
  "shell",
  "yaml",
  "html",
  "css",
  "go",
  "rust",
  "markdown",
  "sql",
  "diff",
] as const;

export const SHIKI_THEMES = ["github-light", "github-dark"] as const;
export type ShikiTheme = (typeof SHIKI_THEMES)[number];

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>(INITIAL_LANGS);

/**
 * Lazy-create the singleton Shiki highlighter. Done via dynamic import so
 * Shiki's grammars / WASM stay out of the renderer's initial chunk and only
 * load the first time a tool-call body needs syntax highlighting.
 */
export function getShikiHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createOnigurumaEngine }] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/oniguruma"),
      ]);
      return createHighlighterCore({
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
    })();
  }
  return highlighterPromise;
}

/**
 * Return whether `lang` is registered with the singleton highlighter. Unknown
 * languages fall back to plain rendering.
 */
export async function ensureLanguage(lang: string): Promise<boolean> {
  return loadedLangs.has(lang);
}

/** Strip the theme-provided `background-color` from the `<pre>` so the host surface shows through. */
export const transparentBgTransformer: ShikiTransformer = {
  name: "lc-transparent-bg",
  pre(node) {
    const style = String(node.properties.style ?? "");
    const next = style.replace(/background-color\s*:[^;]+;?/g, "").trim();
    if (next.length > 0) node.properties.style = next;
    else delete node.properties.style;
  },
};
