import {
  useEffect,
  useRef,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Toast, toast as heroToast } from "@heroui/react";

const DISMISS_DISTANCE = 64;
const CLICK_SUPPRESSION_DISTANCE = 8;
const DISMISS_ANIMATION_MS = 160;

type ToastElement = HTMLDivElement;
type ToastPointerEvent = ReactPointerEvent<ToastElement>;
type SwipeDismissToastProps = ComponentProps<typeof Toast>;

type ActiveSwipe = {
  element: ToastElement;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
};

function clearSwipeStyles(element: ToastElement): void {
  delete element.dataset.swipeDragging;
  delete element.dataset.swipeDismissing;
  element.style.removeProperty("--lc-toast-swipe-x");
  element.style.removeProperty("--lc-toast-swipe-y");
  element.style.removeProperty("--lc-toast-swipe-opacity");
}

function setSwipeOffset(element: ToastElement, deltaX: number, deltaY: number): void {
  const displayedY = deltaY < 0 ? Math.max(deltaY * 0.2, -24) : deltaY;
  const dismissDistance = Math.max(Math.abs(deltaX), Math.max(deltaY, 0));
  const opacity = Math.max(0.45, 1 - dismissDistance / (DISMISS_DISTANCE * 2.5));

  element.style.setProperty("--lc-toast-swipe-x", `${deltaX}px`);
  element.style.setProperty("--lc-toast-swipe-y", `${displayedY}px`);
  element.style.setProperty("--lc-toast-swipe-opacity", `${opacity}`);
}

/** Adds touch-only swipe dismissal without interfering with HeroUI's toast stack transforms. */
export function SwipeDismissToast({ className, ...props }: SwipeDismissToastProps) {
  const activeSwipeRef = useRef<ActiveSwipe | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const clickResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
      if (clickResetTimerRef.current !== null) window.clearTimeout(clickResetTimerRef.current);
      if (activeSwipeRef.current) heroToast.resumeAll();
    };
  }, []);

  const scheduleClickSuppressionReset = () => {
    if (clickResetTimerRef.current !== null) window.clearTimeout(clickResetTimerRef.current);
    clickResetTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      clickResetTimerRef.current = null;
    }, 0);
  };

  const onPointerDown = (event: ToastPointerEvent) => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;

    if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
    clearSwipeStyles(event.currentTarget);
    event.currentTarget.dataset.swipeDragging = "true";
    activeSwipeRef.current = {
      element: event.currentTarget,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    suppressClickRef.current = false;
    heroToast.pauseAll();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ToastPointerEvent) => {
    const swipe = activeSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;

    swipe.lastX = event.clientX;
    swipe.lastY = event.clientY;
    const deltaX = swipe.lastX - swipe.startX;
    const deltaY = swipe.lastY - swipe.startY;
    if (Math.hypot(deltaX, deltaY) >= CLICK_SUPPRESSION_DISTANCE) {
      suppressClickRef.current = true;
    }
    setSwipeOffset(swipe.element, deltaX, deltaY);
    event.preventDefault();
  };

  const finishSwipe = (event: ToastPointerEvent, cancelled: boolean) => {
    const swipe = activeSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;

    activeSwipeRef.current = null;
    heroToast.resumeAll();
    delete swipe.element.dataset.swipeDragging;

    const deltaX = swipe.lastX - swipe.startX;
    const deltaY = swipe.lastY - swipe.startY;
    const horizontalDistance = Math.abs(deltaX);
    const shouldDismiss =
      !cancelled && (horizontalDistance >= DISMISS_DISTANCE || deltaY >= DISMISS_DISTANCE);

    if (!shouldDismiss) {
      clearSwipeStyles(swipe.element);
      scheduleClickSuppressionReset();
      return;
    }

    suppressClickRef.current = true;
    swipe.element.dataset.swipeDismissing = "true";
    const dismissHorizontally =
      horizontalDistance >= DISMISS_DISTANCE && horizontalDistance >= deltaY;
    if (dismissHorizontally) {
      swipe.element.style.setProperty("--lc-toast-swipe-x", deltaX < 0 ? "-110vw" : "110vw");
    } else {
      swipe.element.style.setProperty("--lc-toast-swipe-y", "110vh");
    }
    swipe.element.style.setProperty("--lc-toast-swipe-opacity", "0");

    dismissTimerRef.current = window.setTimeout(() => {
      heroToast.close(props.toast.key);
      dismissTimerRef.current = null;
    }, DISMISS_ANIMATION_MS);
    scheduleClickSuppressionReset();
  };

  return (
    <Toast
      {...props}
      {...(className === undefined ? {} : { className })}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onLostPointerCapture={(event) => finishSwipe(event, true)}
      onPointerCancel={(event) => finishSwipe(event, true)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishSwipe(event, false)}
    />
  );
}
