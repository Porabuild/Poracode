import { useEffect, useRef, type RefObject } from "react";
import { startsInHorizontalScroller } from "./startsInHorizontalScroller";

/** Horizontal travel that commits the gesture and switches tabs. */
const TRIGGER_PX = 56;
/** Horizontal travel must beat vertical by this factor to count as a swipe. */
const DOMINANCE = 1.4;

/**
 * Horizontal swipe → switch between the workspace's Changes / Files tabs,
 * mirroring the edge-swipe-back gesture conventions ({@link useSwipeBack}): a
 * dominant-axis check keeps vertical scrolling from being hijacked, and the
 * gesture is ignored when it starts on horizontally-scrollable content. Passive
 * listeners throughout — the tab switch fires once per gesture the moment the
 * horizontal travel threshold is crossed; nothing calls preventDefault, so the
 * pane still scrolls vertically under a mostly-vertical drag. `onSwipe` receives
 * the direction the finger moved ("left" advances, "right" goes back).
 */
export function useSwipeTabs(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onSwipe: (direction: "left" | "right") => void,
): void {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;

    let tracking = false;
    let committed = false;
    let startX = 0;
    let startY = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || startsInHorizontalScroller(event.target)) {
        tracking = false;
        return;
      }
      const touch = event.touches[0]!;
      tracking = true;
      committed = false;
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || committed) return;
      const touch = event.touches[0]!;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      // Vertical intent wins: once the finger drifts more vertically than
      // horizontally the gesture is a scroll — let it go.
      if (absY > absX) {
        tracking = false;
        return;
      }
      if (absX > TRIGGER_PX && absX > absY * DOMINANCE) {
        committed = true;
        tracking = false;
        onSwipeRef.current(deltaX < 0 ? "left" : "right");
      }
    };

    const onTouchEnd = () => {
      tracking = false;
    };

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: true });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [ref, enabled]);
}
