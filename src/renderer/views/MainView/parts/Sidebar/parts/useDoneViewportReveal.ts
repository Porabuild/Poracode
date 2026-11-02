import { useLayoutEffect, useRef } from "react";

/** The pinned Done section is capped at this share of the sidebar column. */
export const DONE_SECTION_MAX_HEIGHT_PERCENT = 50;

// Keep in sync with `clipTransitionClass` in SidebarDoneRows.tsx: the reveal
// only stays smooth while both curves share one timing.
const REVEAL_DURATION_MS = 200;
const REVEAL_EASING = "cubic-bezier(0.2,0.8,0.2,1)";

/**
 * Eases the capped Done viewport open together with its rows.
 *
 * The rows reveal through their own grid-rows clip, which runs over their full
 * height. Once they outgrow the cap, the visible part of that reveal finishes
 * within the first frames of the front-loaded curve, so the section reads as
 * snapping open. Easing the viewport's max-height from its pre-open height up
 * to the cap with the same timing keeps the visible reveal on the full
 * duration; when the rows fit under the cap, their clip stays the smaller
 * bound and governs as before.
 */
export function useDoneViewportReveal(collapsed: boolean) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const section = viewport?.parentElement;
    const column = section?.parentElement;
    if (collapsed || !viewport || !section || !column) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Rows mounted by this commit still sit at their collapsed starting size,
    // so this is the height the section had before it opened.
    const from = viewport.getBoundingClientRect().height;
    const header = section.getBoundingClientRect().height - from;
    const to = (column.clientHeight * DONE_SECTION_MAX_HEIGHT_PERCENT) / 100 - header;
    if (to <= from) return;
    const animation = viewport.animate([{ maxHeight: `${from}px` }, { maxHeight: `${to}px` }], {
      duration: REVEAL_DURATION_MS,
      easing: REVEAL_EASING,
    });
    return () => {
      if (animation.playState === "finished") return;
      // Collapsing mid-reveal: hold the bound while the rows' clip closes
      // under it. Releasing it now would pop the viewport open to the clip's
      // taller height. A reveal started meanwhile outranks the held one.
      animation.pause();
      window.setTimeout(() => animation.cancel(), REVEAL_DURATION_MS);
    };
  }, [collapsed]);

  return viewportRef;
}
