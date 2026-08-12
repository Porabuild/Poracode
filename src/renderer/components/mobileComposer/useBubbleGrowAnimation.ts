import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/* Release safety net when transitionend never arrives (hidden tab, reduced
   motion, interrupted transition). Slightly longer than the 0.2s bubble
   transition. */
const FALLBACK_RELEASE_MS = 300;

/** Inline geometry pinned on the bubble for the duration of one flip. */
export type BubblePin = {
  readonly height: string;
  /** Collapse only: the collapsed CSS caps max-height at one control line,
   * which would clamp the pinned height — lift the cap until release. */
  readonly maxHeight: string | null;
};

/**
 * Animates the compose bubble between its collapsed and expanded heights in
 * real pixels. The CSS alone can't do this: the collapsed cap is one control
 * line (~34/44px) while the expanded cap is a viewport calc (~600px) far above
 * the real content height (~90px), so a max-height transition between them
 * finishes the visible travel in the first/last ~30ms and the dock reads as
 * snapping.
 *
 * While `expanded` flips, this hook pins an inline height measured from the
 * live layout (height, not max-height: the bubble is content-sized, so only a
 * real height can hold it open against the shrunken collapsed content), lets
 * the CSS transition run between the two px values, then releases back to the
 * stylesheet. Purely presentational: `data-expanded` still flips with the
 * prop, so all inner chrome changes (toolbar, input clamp, border-radius)
 * behave exactly as before. Returns the pin to apply, or null when CSS owns
 * the bubble.
 */
export function useBubbleGrowAnimation(
  bubbleRef: RefObject<HTMLDivElement | null>,
  expanded: boolean,
  /** Guarded-focus paths (data-instant-expand) must sit at final geometry
   * immediately — no pin, no animation. */
  skipAnimation: boolean,
): BubblePin | null {
  const [pin, setPin] = useState<BubblePin | null>(null);
  // Ref mirror so the flip effect can read the pin without depending on it —
  // depending on it would cancel the in-flight animation (its own setState
  // would re-run the effect and the cleanup would cancel the pending rAF).
  const pinRef = useRef<BubblePin | null>(null);
  const setPinned = (value: BubblePin | null) => {
    pinRef.current = value;
    setPin(value);
  };
  // Rest heights captured while idle, so a flip can start from the real
  // pre-flip height even though the layout effect runs after the DOM has
  // already switched to the post-flip styles.
  const collapsedHeightRef = useRef(0);
  const expandedHeightRef = useRef(0);
  const prevExpandedRef = useRef(expanded);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // Content edits happen below FloatingComposerDock (the contenteditable owns
  // its own state), so they can resize the bubble without rendering this hook.
  // Observe the actual border box to keep the rest-height cache current for a
  // later collapse/re-expand. Without this, inserting a newline left
  // expandedHeightRef at the pre-edit height and the collapse pin immediately
  // clipped the newly-grown input back to that stale size.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const observer = new ResizeObserver((entries) => {
      if (pinRef.current !== null) return;
      const entry = entries[entries.length - 1];
      const height = entry?.borderBoxSize?.[0]?.blockSize ?? bubble.getBoundingClientRect().height;
      if (height <= 0) return;
      if (expandedRef.current) {
        expandedHeightRef.current = height;
      } else {
        collapsedHeightRef.current = height;
      }
    });
    observer.observe(bubble);
    return () => observer.disconnect();
  }, [bubbleRef]);

  // Keep the rest height of the current state fresh whenever nothing is
  // pinned and this component does render. ResizeObserver above covers
  // descendant-only layout changes (typing, attachments, and toolbar wraps).
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble || pin !== null) return;
    // The flip commit carries post-flip styles but the pin is not applied
    // yet — leave the rest-height caches alone for that commit.
    if (prevExpandedRef.current !== expanded) return;
    const height = bubble.getBoundingClientRect().height;
    if (height <= 0) return;
    if (expanded) {
      expandedHeightRef.current = height;
    } else {
      collapsedHeightRef.current = height;
    }
  });

  useLayoutEffect(() => {
    if (prevExpandedRef.current === expanded) {
      // The cold-keyboard probe may begin an animated expansion, then switch
      // to the guarded-focus path once iOS reports the final keyboard height.
      // That enables skipAnimation without another expanded-state flip. React
      // cleans up the in-flight effect first (cancelling its release timeout),
      // so explicitly drop its pin here; otherwise the old expanded height is
      // left inline and removing editor lines can no longer shrink the bubble.
      if (skipAnimation && pinRef.current !== null) setPinned(null);
      return;
    }
    prevExpandedRef.current = expanded;
    const bubble = bubbleRef.current;
    if (!bubble || skipAnimation) {
      setPinned(null);
      return;
    }
    // A flip mid-animation starts from the live (still pinned) height rather
    // than a rest height, so reversing never jumps.
    const from =
      pinRef.current !== null
        ? bubble.getBoundingClientRect().height
        : expanded
          ? collapsedHeightRef.current
          : expandedHeightRef.current;
    if (from <= 0) return; // Never measured — let the CSS snap.
    // Pin at the pre-flip height before this commit paints.
    setPinned({ height: `${from}px`, maxHeight: expanded ? null : `${from}px` });

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      setPinned(null);
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === bubble && event.propertyName === "height") release();
    };
    bubble.addEventListener("transitionend", onTransitionEnd);
    // Double rAF: the pinned start value must paint (or at least commit)
    // before the target is set, or the transition has no start and jumps.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Prefer the rest height cached while last expanded: scrollHeight here
        // reads the inner chrome mid-transition (padding/line-height still
        // animating), which overshoots the real target and makes the bubble
        // grow past its final size and snap back on release. The cache is
        // refreshed live while expanded, so it tracks content changes; fall
        // back to scrollHeight only before the first-ever expansion.
        const target = expanded
          ? expandedHeightRef.current || bubble.scrollHeight
          : collapsedHeightRef.current;
        if (target > 0) {
          setPinned({
            height: `${target}px`,
            maxHeight: expanded ? null : `${Math.max(from, target)}px`,
          });
        } else {
          release();
        }
      });
    });
    const timeout = window.setTimeout(release, FALLBACK_RELEASE_MS);
    return () => {
      bubble.removeEventListener("transitionend", onTransitionEnd);
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [expanded, skipAnimation, bubbleRef]);

  return pin;
}
