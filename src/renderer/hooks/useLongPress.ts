import { useLayoutEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 12;

function isTouchLikePointer(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
}

/**
 * Press-and-hold detection for touch surfaces. Fires `onLongPress` once the
 * primary pointer has stayed within MOVE_TOLERANCE_PX for LONG_PRESS_MS; a
 * lift, a second touch, or the browser taking over for a scroll
 * (pointercancel) aborts it. After a long-press fires, the click that trails
 * the pointer release is swallowed in the capture phase so the hold never
 * also activates links or buttons inside the pressed element. The native
 * touch-hold behavior is suppressed too — otherwise mobile browsers can start
 * text selection or open their own callout before our sheet appears. The
 * selection guard lives on `document` so it continues to cover a drawer that
 * mounts beneath the held pointer. Pointer down deliberately stays
 * uncancelled: React Aria buttons need the native pointer sequence to
 * synthesize `onPress` for an ordinary tap.
 *
 * Pass `null` to disable: no handlers are attached and the element behaves
 * exactly as before.
 */
export function useLongPress(onLongPress: (() => void) | null): Partial<LongPressHandlers> {
  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const onLongPressRef = useRef(onLongPress);
  const selectionGuardCleanupRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  const fire = () => {
    timerRef.current = null;
    firedRef.current = true;
    onLongPressRef.current?.();
  };

  const clearSelectionGuard = () => {
    selectionGuardCleanupRef.current?.();
    selectionGuardCleanupRef.current = null;
  };

  const cancelPending = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
    clearSelectionGuard();
  };

  const armSelectionGuard = () => {
    clearSelectionGuard();

    const preventNativeHold = (event: Event) => event.preventDefault();
    const finishPointerSequence = () => cancelPending();
    document.addEventListener("selectstart", preventNativeHold, true);
    document.addEventListener("contextmenu", preventNativeHold, true);
    window.addEventListener("pointerup", finishPointerSequence, true);
    window.addEventListener("pointercancel", finishPointerSequence, true);
    selectionGuardCleanupRef.current = () => {
      document.removeEventListener("selectstart", preventNativeHold, true);
      document.removeEventListener("contextmenu", preventNativeHold, true);
      window.removeEventListener("pointerup", finishPointerSequence, true);
      window.removeEventListener("pointercancel", finishPointerSequence, true);
    };
  };

  useLayoutEffect(() => () => cancelPending(), []);

  if (!onLongPress) return {};

  return {
    onPointerDown: (event) => {
      if (!event.isPrimary) {
        cancelPending();
        return;
      }
      firedRef.current = false;
      if (isTouchLikePointer(event.pointerType)) armSelectionGuard();
      originRef.current = { x: event.clientX, y: event.clientY };
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(fire, LONG_PRESS_MS);
    },
    onPointerMove: (event) => {
      const origin = originRef.current;
      if (timerRef.current === null || origin === null) return;
      const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
      if (distance > MOVE_TOLERANCE_PX) cancelPending();
    },
    onPointerUp: cancelPending,
    onPointerCancel: cancelPending,
    onClickCapture: (event) => {
      if (!firedRef.current) return;
      firedRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onContextMenu: (event) => {
      event.preventDefault();
      const alreadyFired = firedRef.current;
      cancelPending();
      if (!alreadyFired) onLongPress?.();
    },
  };
}
