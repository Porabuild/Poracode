import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SHIFT_DURATION_MS = 380;
const SHIFT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const REVEAL_STEP_MS = 52;
const MAX_REVEAL_LEAD_MS = 680;

interface Point {
  x: number;
  y: number;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function cardsOf(list: HTMLUListElement): HTMLElement[] {
  return [...list.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.dataset.motionKey !== undefined,
  );
}

/**
 * List-local slot coordinates (`offsetLeft` / `offsetTop` relative to the
 * positioned `<ul>`). Keeping coordinates list-local ignores scroll changes and
 * header collapse so unrelated layout motion never triggers spurious FLIP
 * slides; offsets also ignore CSS transforms.
 */
function slotOf(card: HTMLElement): Point {
  return {
    x: card.offsetLeft,
    y: card.offsetTop,
  };
}

function measure(list: HTMLUListElement): Map<string, Point> {
  return new Map(cardsOf(list).map((card) => [card.dataset.motionKey!, slotOf(card)]));
}

/**
 * Coordinates two distinct layers of discovery card motion so neither fights
 * the other:
 * 1. Staggered reveal: newly mounted `.agent-discovery-row` surfaces receive a
 *    monotonic `--discovery-enter-delay` so burst arrivals cascade organically
 *    across both columns instead of popping in all on one frame.
 * 2. FLIP slot glides: outer `<li>` items (`data-motion-key`) glide smoothly
 *    whenever their grid slot changes (e.g. a row expands from a profile/env
 *    update, or the unpaired final card centers once scanning finishes).
 *    Unrelated commits that leave a card's own slot unchanged leave any
 *    in-flight glide uninterrupted.
 */
export function useDiscoveryCardMotion(listRef: RefObject<HTMLUListElement | null>): void {
  const slotsRef = useRef(new Map<string, Point>());
  const slidesRef = useRef(new Map<string, Animation>());
  const seenKeysRef = useRef(new Set<string>());
  const nextRevealAtRef = useRef(0);

  useLayoutEffect(() => {
    const list = listRef.current;
    const slides = slidesRef.current;
    const cards = list ? cardsOf(list) : [];
    if (!list || cards.length === 0) {
      for (const slide of slides.values()) slide.cancel();
      slides.clear();
      slotsRef.current = new Map();
      seenKeysRef.current.clear();
      nextRevealAtRef.current = 0;
      return;
    }

    const animate = !prefersReducedMotion();
    const seen = seenKeysRef.current;
    const activeKeys = new Set<string>();
    const newSurfaces: HTMLElement[] = [];

    for (const card of cards) {
      const key = card.dataset.motionKey!;
      activeKeys.add(key);
      if (!seen.has(key)) {
        seen.add(key);
        const surface = card.querySelector<HTMLElement>(".agent-discovery-row");
        if (surface) newSurfaces.push(surface);
      }
    }

    for (const key of seen) {
      if (!activeKeys.has(key)) {
        seen.delete(key);
        const staleSlide = slides.get(key);
        if (staleSlide) {
          staleSlide.cancel();
          slides.delete(key);
        }
      }
    }

    if (animate && newSurfaces.length > 0) {
      const now = performance.now();
      let cursor = Math.max(now, nextRevealAtRef.current);
      const availableLead = Math.max(0, now + MAX_REVEAL_LEAD_MS - cursor);
      const step =
        newSurfaces.length > 1
          ? Math.min(REVEAL_STEP_MS, availableLead / newSurfaces.length)
          : REVEAL_STEP_MS;
      for (const surface of newSurfaces) {
        const revealAt = Math.min(cursor, now + MAX_REVEAL_LEAD_MS);
        const delayMs = Math.max(0, Math.round(revealAt - now));
        surface.style.setProperty("--discovery-enter-delay", `${delayMs}ms`);
        cursor = revealAt + step;
      }
      nextRevealAtRef.current = cursor;
    }

    const previous = slotsRef.current;
    const next = new Map<string, Point>();
    for (const card of cards) {
      const key = card.dataset.motionKey!;
      const slot = slotOf(card);
      next.set(key, slot);
      const from = previous.get(key);
      const running = slides.get(key);

      if (!animate || !from) {
        if (running) {
          running.cancel();
          slides.delete(key);
        }
        continue;
      }

      const layoutDx = from.x - slot.x;
      const layoutDy = from.y - slot.y;
      if (Math.abs(layoutDx) < 0.5 && Math.abs(layoutDy) < 0.5) {
        // Leave an in-flight glide untouched when this card's slot did not move.
        continue;
      }

      let drawnX = 0;
      let drawnY = 0;
      if (running) {
        const offset = new DOMMatrixReadOnly(getComputedStyle(card).transform);
        drawnX = offset.m41;
        drawnY = offset.m42;
        running.cancel();
        slides.delete(key);
      }

      const dx = layoutDx + drawnX;
      const dy = layoutDy + drawnY;
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
