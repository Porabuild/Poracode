import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { measureNaturalWidth, prepare } from "@chenglou/pretext";
import { splitPath } from "@/shared/pathUtils";
import { StartTruncatedText } from "./StartTruncatedText";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

interface PathDisplayProps {
  path: string;
  className?: string;
  basenameClassName?: string;
  dirClassName?: string;
  measureOverflow?: boolean;
  /** Inline content rendered between the basename and the muted directory,
   *  e.g. status badges that should follow the filename. */
  trailing?: ReactNode;
  /** Overrides the hover tooltip (defaults to `path`). Lets callers show the
   *  full path while the visible text is shortened/relativized. */
  title?: string;
}

/**
 * Renders a path as `<basename> <muted dir>`. When the muted dir doesn't fit
 * the available width, drops characters off the **front** of the dir and
 * prepends a leading ellipsis (`…er/components/common`). The basename and any
 * `trailing` content are never truncated.
 */
export function PathDisplay({ measureOverflow = true, ...props }: PathDisplayProps) {
  return measureOverflow ? <MeasuredPathDisplay {...props} /> : <CssPathDisplay {...props} />;
}

function MeasuredPathDisplay({
  path,
  className,
  basenameClassName = "text-foreground",
  dirClassName = "text-muted/60",
  trailing,
  title,
}: PathDisplayProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const fixedRef = useRef<HTMLSpanElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [fixedWidth, setFixedWidth] = useState(0);
  const [font, setFont] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setFont(getComputedStyle(el).font);
    setContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setContainerWidth(cr.width);
    });
    ro.observe(el);

    let fro: ResizeObserver | null = null;
    const fEl = fixedRef.current;
    if (fEl) {
      setFixedWidth(fEl.getBoundingClientRect().width);
      fro = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (cr) setFixedWidth(cr.width);
      });
      fro.observe(fEl);
    }

    return () => {
      ro.disconnect();
      fro?.disconnect();
    };
  }, []);

  const { dirWithSlash, basename } = splitPath(path);
  const dir = dirWithSlash.replace(/[\\/]$/, "");
  // Reserve a few pixels of slack — Canvas measureText and browser glyph rendering
  // disagree by sub-pixel amounts, so fitting to the exact width clips the last char.
  const FIT_SLACK = 4;
  const dirAvailable = Math.max(0, containerWidth - fixedWidth - FIT_SLACK);
  const dirDisplay =
    dir && font && containerWidth > 0 ? fitDirHeadEllipsis(dir, font, dirAvailable) : dir;

  return (
    <span
      ref={containerRef}
      className={`flex min-w-0 items-center whitespace-nowrap overflow-hidden ${className ?? ""}`}
      title={title ?? path}
    >
      {/* The basename slot is `shrink-0` on purpose: its measured width must be
          its *intrinsic* width so it never reacts to the directory's size.
          If it could shrink, flexbox would compress it whenever the dir grew,
          ResizeObserver would report the smaller width, `dirAvailable` would
          grow, the dir would grow again — a runaway loop that crushed the
          basename to nothing. The basename is instead capped to the container
          width so that when it alone overflows the row it truncates with a
          trailing ellipsis rather than hard-clipping (which read as vanishing). */}
      <span ref={fixedRef} className="flex shrink-0 items-center">
        <span
          className={`min-w-0 truncate ${basenameClassName}`}
          style={containerWidth > 0 ? { maxWidth: containerWidth } : undefined}
        >
          {basename}
        </span>
        {trailing}
      </span>
      {dirDisplay &&
        (font ? (
          <span className={`ml-1 min-w-0 shrink-0 ${dirClassName}`}>{dirDisplay}</span>
        ) : (
          // Font variants can leave the computed shorthand empty. Let CSS use the actual face.
          <StartTruncatedText className={`ml-1 ${dirClassName}`}>{dirDisplay}</StartTruncatedText>
        ))}
    </span>
  );
}

function CssPathDisplay({
  path,
  className,
  basenameClassName = "text-foreground",
  dirClassName = "text-muted/60",
  trailing,
  title,
}: PathDisplayProps) {
  const { dirWithSlash, basename } = splitPath(path);
  const dir = dirWithSlash.replace(/[\\/]$/, "");

  return (
    <span
      className={`flex min-w-0 items-center whitespace-nowrap overflow-hidden ${className ?? ""}`}
      title={title ?? path}
    >
      <span className="flex max-w-full shrink-0 items-center">
        <span className={`min-w-0 truncate ${basenameClassName}`}>{basename}</span>
        {trailing}
      </span>
      {dir && <StartTruncatedText className={`ml-1 ${dirClassName}`}>{dir}</StartTruncatedText>}
    </span>
  );
}

function fitDirHeadEllipsis(dir: string, font: string, width: number): string {
  if (width <= 0) return "";
  const fits = (text: string) => measureNaturalWidth(prepare(text, font)) <= width;
  if (fits(dir)) return dir;

  // Keep at least two whole graphemes after the ellipsis.
  const starts = Array.from(graphemes.segment(dir), (part) => part.index);
  let lo = 1;
  let hi = starts.length - 2;
  let best = "";
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = "…" + dir.slice(starts[mid]);
    if (fits(candidate)) {
      best = candidate;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
}
