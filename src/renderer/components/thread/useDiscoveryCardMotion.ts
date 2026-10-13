import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SHIFT_DURATION_MS = 380;
const SHIFT_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

interface Point {
  x: number;
  y: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function cardsOf(list: HTMLUListElement): HTMLElement[] {
  return [...list.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.motionKey !== undefined,
  );
}

/**
 * Layout slot in scroll-independent coordinates: the list's viewport origin
 * plus the scroller's offset plus the card's offset inside the (positioned)
 * list. Offsets ignore transforms, so a card mid-entry still reports its slot.
 */
function slotOf(list: HTMLUListElement, card: HTMLElement): Point {
  const origin = list.getBoundingClientRect();
  return {
    x: origin.left + card.offsetLeft,
    y: origin.top + (list.parentElement?.scrollTop ?? 0) + card.offsetTop,
  };
}

function measure(list: HTMLUListElement): Map<string, Point> {
  return new Map(cardsOf(list).map((card) => [card.dataset.motionKey!, slotOf(list, card)]));
}

/**
 * Slides discovery cards (FLIP) to their new grid slot whenever a commit moves
 * them: a new card reflowing the grid, the odd last card leaving its centered
 * slot, or the hero shrinking when the scan finishes. Cards carry
 * `data-motion-key`; the list must be the positioned child of the scroller.
 */
export function useDiscoveryCardMotion(listRef: RefObject<HTMLUListElement | null>): void {
  const slotsRef = useRef(new Map<string, Point>());
  const slidesRef = useRef(new Map<string, Animation>());

  useLayoutEffect(() => {
    const list = listRef.current;
    const slides = slidesRef.current;
    if (!list) {
      slotsRef.current = new Map();
      return;
    }
    const animate = !prefersReducedMotion();
    const previous = slotsRef.current;
    const next = new Map<string, Point>();
    for (const card of cardsOf(list)) {
      const key = card.dataset.motionKey!;
      // An interrupted slide restarts from where the card is drawn right now,
      // not from its old slot, so back-to-back arrivals never jump.
      let drawnX = 0;
      let drawnY = 0;
      const running = slides.get(key);
      if (running) {
        const offset = new DOMMatrixReadOnly(getComputedStyle(card).transform);
        drawnX = offset.m41;
        drawnY = offset.m42;
        running.cancel();
        slides.delete(key);
      }
      const slot = slotOf(list, card);
      next.set(key, slot);
      const from = previous.get(key);
      if (!animate || !from) continue;
      const dx = from.x + drawnX - slot.x;
      const dy = from.y + drawnY - slot.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const slide = card.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: SHIFT_DURATION_MS, easing: SHIFT_EASING },
      );
      slides.set(key, slide);
      slide.onfinish = () => {
        if (slides.get(key) === slide) slides.delete(key);
      };
    }
    slotsRef.current = next;
  });

  // A window resize reflows the grid without a commit; re-baseline so the
  // next commit does not replay the resize as a slide.
  useEffect(() => {
    const slides = slidesRef.current;
    const rebaseline = () => {
      for (const slide of slides.values()) slide.cancel();
      slides.clear();
      const list = listRef.current;
      slotsRef.current = list ? measure(list) : new Map();
    };
    window.addEventListener("resize", rebaseline);
    return () => {
      window.removeEventListener("resize", rebaseline);
      for (const slide of slides.values()) slide.cancel();
      slides.clear();
    };
  }, [listRef]);
}
