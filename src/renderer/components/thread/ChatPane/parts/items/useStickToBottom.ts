import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";
import { isElementAtBottom } from "../../chatScrollGeometry";

interface UseStickToBottomOptions {
  /**
   * Gates the ResizeObserver-driven re-pin. Leave it on (the default) for a
   * viewport that only mounts while content streams; pass a flag for a
   * container whose stickiness is conditional.
   */
  enabled?: boolean;
}

/**
 * Pins a scroll container to its bottom edge while its content grows, releasing
 * the pin once the user scrolls up and re-engaging when they return to the
 * bottom. Attach the returned refs to the scrollable element (`scrollRef`) and
 * its growing content wrapper (`contentRef`).
 */
export function useStickToBottom({ enabled = true }: UseStickToBottomOptions = {}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const lastScrollTopRef = useRef(0);

  const scrollToBottom = useEffectEvent(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
  });

  // Pin on first paint so the container lands on the latest content rather than
  // the top of the trail.
  useLayoutEffect(() => {
    stickRef.current = true;
    scrollToBottom();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const prev = lastScrollTopRef.current;
      const next = el.scrollTop;
      lastScrollTopRef.current = next;
      const atBottom = isElementAtBottom(el);
      if (next < prev && !atBottom) {
        stickRef.current = false;
      } else if (atBottom) {
        stickRef.current = true;
      }
    };
    lastScrollTopRef.current = el.scrollTop;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const syncStickyScroll = useEffectEvent(() => {
    if (!stickRef.current) return;
    scrollToBottom();
  });

  useEffect(() => {
    if (!enabled) return;
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      // ResizeObserver fires after layout and before paint, so syncing here
      // keeps the viewport pinned without a visible one-frame catch-up.
      syncStickyScroll();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [enabled]);

  return { scrollRef, contentRef };
}
