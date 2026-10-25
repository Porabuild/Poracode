import { useEffect, useState, type RefObject } from "react";

/**
 * Content-box width of the referenced element in px, kept current by a
 * ResizeObserver. Stays 0 until the first observation and when ResizeObserver
 * is unavailable, so callers should treat 0 as "wide" (width === 0 || >= min).
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
