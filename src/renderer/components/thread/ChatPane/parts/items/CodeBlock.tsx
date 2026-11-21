import { useEffect, useMemo, useRef, useState } from "react";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";
import { ensureLanguage, highlightLoadedCode, type ShikiTheme } from "./shikiClient";
import type { HighlightLanguage } from "./languageDetect";
import { SyntaxHighlightCache } from "./syntaxHighlightCache";

interface CodeBlockProps {
  text: string;
  /** Language id (Shiki bundled language) — falls back to a plain `<pre>` if unsupported. */
  lang: HighlightLanguage;
  className?: string;
}

interface ImmediateHighlight {
  html: string | null;
  resolved: boolean;
}

/**
 * Bounded LRU keyed on `theme::lang::text`. Same body is highlighted only
 * once per theme; eviction caps the working set so a long thread doesn't
 * retain an unbounded amount of source and HTML.
 */
const cache = new SyntaxHighlightCache();

function cacheKey(theme: ShikiTheme, lang: string, text: string): string {
  return `${theme}::${lang}::${text}`;
}

function resolveImmediateHighlight(
  key: string,
  text: string,
  lang: HighlightLanguage,
  theme: ShikiTheme,
): ImmediateHighlight {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return { html: cached, resolved: true };
  }
  const result = highlightLoadedCode(text, lang, theme);
  if (!result) {
    return { html: null, resolved: false };
  }
  return { html: result.html, resolved: true };
}

/**
 * Render `text` as syntax-highlighted code via Shiki. While the highlighter or
 * grammar loads (or for unsupported languages) the component falls back to a
 * plain `<pre>` so the user sees the current body immediately and gets the
 * colored version once Shiki is ready. Once the grammar is loaded, updates
 * highlight synchronously during render so streaming text never flashes plain
 * `<pre>` frames between chunks.
 */
export function CodeBlock({ text, lang, className }: CodeBlockProps) {
  const appearance = useResolvedAppearance();
  const theme: ShikiTheme = appearance === "dark" ? "github-dark" : "github-light";
  const key = cacheKey(theme, lang, text);
  // Manual memoization keeps synchronous highlighting tied to input identity in
  // test runs without React Compiler and avoids re-tokenizing uncached oversized
  // blocks when `asyncResult` commits.
  const immediate = useMemo(
    () => resolveImmediateHighlight(key, text, lang, theme),
    [key, text, lang, theme],
  );
  const [asyncResult, setAsyncResult] = useState<{ key: string; html: string } | null>(null);
  // Drop stale async HTML once the key moves on so a cold-load result is not
  // retained in state after subsequent updates resolve synchronously.
  if (asyncResult !== null && (immediate.resolved || asyncResult.key !== key)) {
    setAsyncResult(null);
  }
  const html = immediate.resolved
    ? immediate.html
    : asyncResult?.key === key
      ? asyncResult.html
      : null;

  const cachedRef = useRef<{
    key: string;
    text: string;
    lang: HighlightLanguage;
    theme: ShikiTheme;
  } | null>(null);

  useEffect(() => {
    if (html === null) return;
    const prev = cachedRef.current;
    if (
      prev &&
      prev.key !== key &&
      prev.lang === lang &&
      prev.theme === theme &&
      text.length > prev.text.length &&
      text.startsWith(prev.text)
    ) {
      // Replace the prior prefix of an actively streaming block instead of
      // filling the shared LRU with dead intermediate frames.
      cache.delete(prev.key);
    }
    if (prev?.key !== key) {
      cache.set(key, html);
      cachedRef.current = { key, text, lang, theme };
    }
  }, [html, key, lang, text, theme]);

  useEffect(() => {
    if (immediate.resolved) return;
    let cancelled = false;
    void (async () => {
      try {
        const ok = await ensureLanguage(lang);
        if (cancelled || !ok) return;
        const result = highlightLoadedCode(text, lang, theme);
        if (result?.html != null) {
          setAsyncResult({ key, html: result.html });
        }
      } catch {
        // Keep the plain `<pre>` fallback visible when grammar or engine loading fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [immediate.resolved, key, lang, text, theme]);

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
