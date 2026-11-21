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

const ALL_HIGHLIGHT_LANGUAGES = Object.keys(LANGUAGE_LOADERS) as HighlightLanguage[];

export const SHIKI_THEMES = ["github-light", "github-dark"] as const;
export type ShikiTheme = (typeof SHIKI_THEMES)[number];

export interface LoadedHighlightResult {
  html: string | null;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;
let highlighterInstance: HighlighterCore | null = null;
const readyLanguages = new Set<HighlightLanguage>();
const pendingLanguages = new Map<HighlightLanguage, Promise<boolean>>();

function isHighlightLanguage(lang: string): lang is HighlightLanguage {
  return Object.hasOwn(LANGUAGE_LOADERS, lang);
}

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
      const highlighter = await createHighlighterCore({
        themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
      highlighterInstance = highlighter;
      return highlighter;
    })().catch((error: unknown) => {
      highlighterPromise = null;
      throw error;
    });
  }
  return highlighterPromise;
}

/**
 * Return the singleton highlighter synchronously when both the engine and
 * `lang` have already finished loading.
 */
export function getLoadedShikiHighlighter(lang: string): HighlighterCore | null {
  if (!highlighterInstance || !isHighlightLanguage(lang)) return null;
  return readyLanguages.has(lang) ? highlighterInstance : null;
}

/**
 * Highlight `text` synchronously when both the engine and `lang` are already
 * loaded. Returns `null` while loading (so callers can render plain text and
 * await `ensureLanguage(lang)`), or `{ html }` once loaded (`html: null` if
 * tokenization throws).
 */
export function highlightLoadedCode(
  text: string,
  lang: string,
  theme: ShikiTheme,
): LoadedHighlightResult | null {
  const highlighter = getLoadedShikiHighlighter(lang);
  if (!highlighter) return null;
  try {
    return {
      html: highlighter.codeToHtml(text, {
        lang,
        theme,
        mergeSameStyleTokens: true,
        transformers: [transparentBgTransformer],
      }),
    };
  } catch {
    return { html: null };
  }
}

/**
 * Share concurrent grammar loads, retaining successful registrations and
 * allowing failed imports to retry. Unknown languages render as plain text.
 */
export async function ensureLanguage(lang: string): Promise<boolean> {
  if (!isHighlightLanguage(lang)) return false;
  if (getLoadedShikiHighlighter(lang)) return true;
  const pending = pendingLanguages.get(lang);
  if (pending) return pending;
  const request = (async () => {
    const highlighter = await getShikiHighlighter();
    const loaded = highlighter.getLoadedLanguages();
    // Markdown's optional embedded grammars must not depend on which code
    // blocks happened to render earlier in this document.
    const missingLanguages: HighlightLanguage[] =
      lang === "markdown"
        ? ALL_HIGHLIGHT_LANGUAGES.filter((key) => !loaded.includes(key))
        : loaded.includes(lang)
          ? []
          : [lang];
    if (missingLanguages.length > 0) {
      await highlighter.loadLanguage(...missingLanguages.map((key) => LANGUAGE_LOADERS[key]()));
    }
    if (lang === "markdown") {
      for (const key of ALL_HIGHLIGHT_LANGUAGES) {
        readyLanguages.add(key);
      }
    } else {
      readyLanguages.add(lang);
      for (const key of highlighter.getLoadedLanguages()) {
        if (key !== "markdown" && isHighlightLanguage(key)) {
          readyLanguages.add(key);
        }
      }
    }
    return true;
  })();
  pendingLanguages.set(lang, request);
  try {
    return await request;
  } finally {
    pendingLanguages.delete(lang);
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
