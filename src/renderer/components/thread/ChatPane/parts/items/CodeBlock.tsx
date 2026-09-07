import { useEffect, useState } from "react";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";
import {
  ensureLanguage,
  getShikiHighlighter,
  transparentBgTransformer,
  type ShikiTheme,
} from "./shikiClient";
import type { HighlightLanguage } from "./languageDetect";

interface CodeBlockProps {
  text: string;
  /** Language id (Shiki bundled language) — falls back to a plain `<pre>` if unsupported. */
  lang: HighlightLanguage;
  className?: string;
}

/**
 * Bounded LRU keyed on `theme::lang::text`. Same body is highlighted only
 * once per theme; eviction caps the working set so a long thread doesn't
 * pin megabytes of HTML.
 */
const cache = new Map<string, string>();
const MAX_CACHE = 200;

function cacheKey(theme: ShikiTheme, lang: string, text: string): string {
  return `${theme}::${lang}::${text}`;
}

function setCache(key: string, html: string): void {
  if (cache.has(key)) cache.delete(key);
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, html);
}

/**
 * Render `text` as syntax-highlighted code via Shiki. While the highlighter
 * loads (or for unsupported languages) the component falls back to a plain
 * `<pre>` so the user sees the body immediately and gets the colored version
 * once Shiki is ready.
 */
export function CodeBlock({ text, lang, className }: CodeBlockProps) {
  const appearance = useResolvedAppearance();
  const theme: ShikiTheme = appearance === "dark" ? "github-dark" : "github-light";
  const key = cacheKey(theme, lang, text);
  const [html, setHtml] = useState<string | null>(() => cache.get(key) ?? null);
  // Swap in the cached highlight during render on input change; on a cache
  // miss the previous highlight stays until the async pass below resolves
  // (the synchronous effect reset this replaces used to do the same).
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    const cached = cache.get(key);
    if (cached !== undefined) setHtml(cached);
  }

  useEffect(() => {
    // Already handled during render above; skip the redundant async pass.
    if (cache.get(key) !== undefined) return;
    let cancelled = false;
    void (async () => {
      const ok = await ensureLanguage(lang);
      if (!ok) {
        if (!cancelled) setHtml(null);
        return;
      }
      const highlighter = await getShikiHighlighter();
      try {
        const out = highlighter.codeToHtml(text, {
          lang,
          theme,
          transformers: [transparentBgTransformer],
        });
        setCache(key, out);
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, lang, text, theme]);

  if (html !== null) {
    return (
      <div
        className={`lc-shiki ${className ?? ""}`.trim()}
        // Shiki's output is HTML-escaped at the source — the only dynamic
        // content is `text`, which `codeToHtml` HTML-escapes before wrapping.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <pre
      className={`whitespace-pre-wrap break-words text-foreground-muted ${className ?? ""}`.trim()}
    >
      {text}
    </pre>
  );
}
