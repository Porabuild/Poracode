import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { layout, prepare } from "@chenglou/pretext";
import { splitPath } from "@/shared/pathUtils";

interface PathDisplayProps {
  path: string;
  className?: string;
  basenameClassName?: string;
  dirClassName?: string;
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
export function PathDisplay({
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
    dir && font && containerWidth > 0
      ? fitDirHeadEllipsis(dir, font, dirAvailable)
      : { suffix: dir, truncated: false };

  return (
    <span
      ref={containerRef}
      className={`flex min-w-0 items-center whitespace-nowrap overflow-hidden ${className ?? ""}`}
      title={title ?? path}
    >
      <span ref={fixedRef} className="flex shrink-0 items-center">
        <span className={basenameClassName}>{basename}</span>
        {trailing}
      </span>
      {dir && (
        <span className={`ml-1 min-w-0 ${dirClassName}`}>
          {dirDisplay.truncated && "…"}
          {dirDisplay.suffix}
        </span>
      )}
    </span>
  );
}

function fitDirHeadEllipsis(
  dir: string,
  font: string,
  width: number,
): { suffix: string; truncated: boolean } {
  if (width <= 0) return { suffix: "", truncated: true };

  const full = layout(prepare(dir, font), width, 16);
  if (full.lineCount <= 1) return { suffix: dir, truncated: false };

  let lo = 0;
  let hi = dir.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = "…" + dir.slice(dir.length - mid);
    const { lineCount } = layout(prepare(candidate, font), width, 16);
    if (lineCount <= 1) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { suffix: dir.slice(dir.length - best), truncated: true };
}
