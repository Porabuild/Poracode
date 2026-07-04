import { useEffect, useRef, type RefObject } from "react";

/** Gesture starts only from the left screen edge, like the iOS back swipe. */
const EDGE_START_PX = 28;
/** Horizontal travel that commits the gesture and fires the back navigation. */
const TRIGGER_PX = 72;
/** Vertical drift past which the gesture is treated as a scroll and dropped. */
const SLOP_Y_PX = 44;

/**
 * Left-edge swipe → back navigation for the phone shell, mirroring the native
 * iOS gesture. Once the finger drags rightward from the edge the touchmove is
 * consumed (preventDefault on a non-passive listener), so the page doesn't
 * scroll under the gesture and the browser's own history swipe — where it is
 * cancelable at all — doesn't double-fire. `onBack` fires once per gesture the
 * moment the travel threshold is crossed; the shell's pop view transition
 * plays the visual slide.
 */
export function useSwipeBack(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onBack: () => void,
): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;

    let tracking = false;
    let committed = false;
    let startX = 0;
    let startY = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const touch = event.touches[0]!;
      if (touch.clientX > EDGE_START_PX) return;
      tracking = true;
      committed = false;
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0]!;
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      if (deltaY > SLOP_Y_PX && deltaY > deltaX) {
        tracking = false;
        return;
      }
      if (deltaX > 8 && event.cancelable) event.preventDefault();
      if (!committed && deltaX > TRIGGER_PX) {
        committed = true;
        tracking = false;
        onBackRef.current();
      }
    };

    const onTouchEnd = () => {
      tracking = false;
    };

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
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
