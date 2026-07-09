import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject, RefObject } from "react";

const FADE_MASK_GRADIENT =
  "linear-gradient(to bottom, transparent, black var(--top-fade-size, 0px), black calc(100% - var(--bottom-fade-size, 0px)), transparent)";

const FADE_MASK_STYLE: CSSProperties = {
  WebkitMaskImage: FADE_MASK_GRADIENT,
  maskImage: FADE_MASK_GRADIENT,
};

const DEFAULT_MAX_FADE_PX = 32;

interface ScrollFadeOptions {
  /**
   * Inner content element to also observe for size changes; lets the bottom
   * fade settle immediately when content height changes (virtualizer growth,
   * dynamic row collapse, etc.). Optional.
   */
  contentRef?: RefObject<HTMLElement | null>;
  /** Max fade height in px (applied to both top and bottom). Defaults to 32. */
  maxFadePx?: number;
}

interface ScrollFadeHandles<T extends HTMLElement> {
  /** Callback ref — pass to the scroll container's `ref`. */
  setScrollContainer: (el: T | null) => void;
  /** Direct access to the latest scroll element (e.g. for virtualizers). */
  scrollRef: MutableRefObject<T | null>;
  /**
   * Same value as `scrollRef.current`, but tracked as React state so consumers
   * can pass it down as a prop and trigger renders when it changes (e.g. to
   * (re)mount a virtualizer once the container is in the DOM).
   */
  scrollEl: T | null;
  /** Apply to the same scroll container's `style` to render the fade mask. */
  scrollFadeStyle: CSSProperties;
}

/**
 * Top + bottom fade mask on a scrollable container. Mirrors the ACP chat
 * scroll behaviour: writes `--top-fade-size` / `--bottom-fade-size` onto the
 * scroll element on scroll/resize (clamped to `maxFadePx`), and the consumer
 * applies `scrollFadeStyle` to render a CSS mask gradient from those vars.
 */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>(
  options?: ScrollFadeOptions,
): ScrollFadeHandles<T> {
  const { contentRef, maxFadePx = DEFAULT_MAX_FADE_PX } = options ?? {};
  const scrollRef = useRef<T | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [scrollEl, setScrollEl] = useState<T | null>(null);

  // Stable identity: an inline closure would cycle the ref null→element on
  // every parent re-render, dropping the virtualizer's scroll element.
  const setScrollContainer = useCallback((el: T | null) => {
    scrollRef.current = el;
    setScrollEl(el);
  }, []);

  useEffect(() => {
    const el = scrollEl;
    if (!el) return;

    let lastTopFade = Number.NaN;
    let lastBottomFade = Number.NaN;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      // Quantize to whole pixels so sub-pixel virtualizer churn does not keep
      // rewriting identical-looking fade masks during thread-open measure.
      const topFade = Math.min(maxFadePx, Math.round(scrollTop));
      const bottomFade = Math.min(
        maxFadePx,
        Math.max(0, Math.round(scrollHeight - scrollTop - clientHeight)),
      );
      // Skip style writes when the mask sizes are unchanged. Thread switches
      // fire many programmatic scrolls + ResizeObserver callbacks; rewriting
      // identical CSS vars still costs style invalidation in the profile.
      if (topFade === lastTopFade && bottomFade === lastBottomFade) return;
      lastTopFade = topFade;
      lastBottomFade = bottomFade;
      el.style.setProperty("--top-fade-size", `${topFade}px`);
      el.style.setProperty("--bottom-fade-size", `${bottomFade}px`);
    };
    const scheduleUpdate = () => {
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        update();
      });
    };

    update();
    // Coalesce scroll-driven updates with resize onto the same rAF. During
    // stick-to-bottom thread opens, scrollTop is written many times per frame;
    // a sync listener re-reads layout on each write.
    el.addEventListener("scroll", scheduleUpdate, { passive: true });

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(el);
    const contentEl = contentRef?.current;
    if (contentEl) observer.observe(contentEl);

    return () => {
      el.removeEventListener("scroll", scheduleUpdate);
      observer.disconnect();
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [scrollEl, contentRef, maxFadePx]);

  return {
    setScrollContainer,
    scrollRef,
    scrollEl,
    scrollFadeStyle: FADE_MASK_STYLE,
  };
}
