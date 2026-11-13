import type { HighlighterCore, ShikiTransformer } from "shiki/core";
import type { HighlightLanguage } from "./languageDetect";

/**
 * Keep the existing grammar versions and load only those the UI requests.
 * Imported grammars include their required embedded-language dependencies.
 */
const LANGUAGE_LOADERS = {
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  jsx: () => import("@shikijs/langs/jsx"),
  python: () => import("@shikijs/langs/python"),
  bash: () => import("@shikijs/langs/bash"),
  shell: () => import("@shikijs/langs/shell"),
  yaml: () => import("@shikijs/langs/yaml"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  markdown: () => import("@shikijs/langs/markdown"),
  sql: () => import("@shikijs/langs/sql"),
  diff: () => import("@shikijs/langs/diff"),
} satisfies Record<HighlightLanguage, () => Promise<unknown>>;

export const SHIKI_THEMES = ["github-light", "github-dark"] as const;
export type ShikiTheme = (typeof SHIKI_THEMES)[number];

let highlighterPromise: Promise<HighlighterCore> | null = null;
const pendingLanguages = new Map<HighlightLanguage, Promise<boolean>>();

/**
 * Lazy-create the singleton Shiki highlighter. Done via dynamic import so
 * Shiki's engine and themes stay out of the renderer's initial chunk and only
 * load the first time a tool-call body needs syntax highlighting.
 */
export function getShikiHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
      ]);
      return createHighlighterCore({
        themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
    })().catch((error: unknown) => {
      highlighterPromise = null;
      throw error;
    });
  }
  return highlighterPromise;
}

/**
 * Share concurrent grammar loads, retaining successful registrations and
 * allowing failed imports to retry. Unknown languages render as plain text.
 */
export async function ensureLanguage(lang: string): Promise<boolean> {
  if (!Object.hasOwn(LANGUAGE_LOADERS, lang)) return false;
  const language = lang as HighlightLanguage;
  const pending = pendingLanguages.get(language);
  if (pending) return pending;
  const request = (async () => {
    const highlighter = await getShikiHighlighter();
    if (!highlighter.getLoadedLanguages().includes(language)) {
      // Markdown's optional embedded grammars must not depend on which code
      // blocks happened to render earlier in this document.
      const grammars =
        language === "markdown"
          ? Object.values(LANGUAGE_LOADERS).map((load) => load())
          : [LANGUAGE_LOADERS[language]()];
      await highlighter.loadLanguage(...grammars);
    }
    return true;
  })();
  pendingLanguages.set(language, request);
  try {
    return await request;
  } finally {
    pendingLanguages.delete(language);
  }
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
