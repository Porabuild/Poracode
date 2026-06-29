import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";
import { detectLanguageFromPath } from "@/renderer/components/thread/ChatPane/parts/items/languageDetect";
import {
  ensureLanguage,
  getShikiHighlighter,
  transparentBgTransformer,
  type ShikiTheme,
} from "@/renderer/components/thread/ChatPane/parts/items/shikiClient";

/** Files larger than this skip live highlighting to keep typing responsive. */
const MAX_HIGHLIGHT_CHARS = 50_000;

/**
 * Lightweight code editor for the mobile Files tab: a transparent `<textarea>`
 * layered over a Shiki-highlighted backdrop (the classic two-layer trick).
 * Both layers share identical font metrics + wrapping so the caret tracks the
 * colored glyphs; the textarea holds the live value while the backdrop is
 * re-highlighted (debounced) as you type. Falls back to plain text for unknown
 * languages, very large files, or while Shiki's grammar/WASM loads.
 *
 * Reuses the desktop renderer's Shiki singleton + language detection so the PWA
 * doesn't ship a second highlighter, and the theme follows the app appearance.
 */
export function HighlightedEditor(props: {
  readonly value: string;
  readonly path: string;
  readonly initialLineNumber?: number | undefined;
  readonly readOnly?: boolean | undefined;
  readonly onChange: (next: string) => void;
}) {
  const appearance = useResolvedAppearance();
  const theme: ShikiTheme = appearance === "dark" ? "github-dark" : "github-light";
  const language = detectLanguageFromPath(props.path);
  const tooLarge = props.value.length > MAX_HIGHLIGHT_CHARS;
  const [html, setHtml] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (language === "plain" || tooLarge) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    // Debounce so a long file isn't re-tokenized on every keystroke.
    const handle = window.setTimeout(() => {
      void (async () => {
        const ok = await ensureLanguage(language);
        if (cancelled) return;
        if (!ok) {
          setHtml(null);
          return;
        }
        const highlighter = await getShikiHighlighter();
        if (cancelled) return;
        try {
          setHtml(
            highlighter.codeToHtml(props.value, {
              lang: language,
              theme,
              transformers: [transparentBgTransformer],
            }),
          );
        } catch {
          setHtml(null);
        }
      })();
    }, 90);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [props.value, language, tooLarge, theme]);

  useLayoutEffect(() => {
    const lineNumber = props.initialLineNumber;
    if (!lineNumber || lineNumber <= 1) return;
    const scrollEl = scrollRef.current;
    const textarea = textareaRef.current;
    if (!scrollEl || !textarea) return;
    const handle = window.requestAnimationFrame(() => {
      const styles = window.getComputedStyle(textarea);
      const parsedLineHeight = Number.parseFloat(styles.lineHeight);
      const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : 16;
      scrollEl.scrollTop = Math.max(
        0,
        (lineNumber - 1) * lineHeight - scrollEl.clientHeight * 0.35,
      );
      const offset = findLineStartOffset(props.value, lineNumber);
      textarea.setSelectionRange(offset, offset);
    });
    return () => window.cancelAnimationFrame(handle);
  }, [props.path, props.initialLineNumber, props.value]);

  return (
    <div ref={scrollRef} className="m-files-code">
      <div className="m-files-code__inner">
        {html !== null ? (
          <div
            className="m-files-code__hl lc-shiki"
            aria-hidden="true"
            // Shiki HTML-escapes the source before wrapping it in token spans.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="m-files-code__hl" aria-hidden="true">
            {props.value}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="m-files-code__ta"
          value={props.value}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          readOnly={props.readOnly ?? false}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

function findLineStartOffset(value: string, lineNumber: number): number {
  if (lineNumber <= 1) return 0;
  let offset = 0;
  for (let line = 1; line < lineNumber; line += 1) {
    const nextBreak = value.indexOf("\n", offset);
    if (nextBreak === -1) return value.length;
    offset = nextBreak + 1;
  }
  return offset;
}
