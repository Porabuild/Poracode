const PIXELS_PER_LINE = 16;

/**
 * Lets the wheel scroll the transcript while the pointer is over a control that
 * floats beside it (the prompt rail) and so is not inside the scroller. A
 * synthetic `wheel` is dispatched first so the pane's wheel handlers (user
 * scroll intent, leaving the live tail) see the gesture, then the scroller is
 * moved directly because synthetic events never scroll by themselves.
 */
export function forwardWheelToScroller(event: WheelEvent, scroller: HTMLElement): void {
  if (event.defaultPrevented || event.ctrlKey || event.deltaY === 0) return;
  event.preventDefault();
  const forwarded = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
  });
  if (!scroller.dispatchEvent(forwarded)) return;
  const pixelsPerUnit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? PIXELS_PER_LINE
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? scroller.clientHeight
        : 1;
  scroller.scrollBy({ top: event.deltaY * pixelsPerUnit });
}
