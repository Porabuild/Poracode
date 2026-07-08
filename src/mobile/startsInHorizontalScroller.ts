/**
 * Walk up from a touch target looking for an element that can scroll
 * horizontally (a diff, a wide code block, an xterm terminal). A shell gesture
 * (edge-swipe-back, tab-swipe) that starts inside one is the user panning that
 * content, not a navigation — so the gesture must be dropped and the element
 * keeps its native horizontal scroll. Shared by {@link useSwipeBack} and
 * {@link useSwipeTabs} so both edge gestures agree on what counts as scrollable.
 */
export function startsInHorizontalScroller(target: EventTarget | null): boolean {
  for (
    let element = target instanceof HTMLElement ? target : null;
    element;
    element = element.parentElement
  ) {
    if (element.scrollWidth > element.clientWidth + 1) {
      const overflowX = window.getComputedStyle(element).overflowX;
      if (/(auto|scroll|overlay)/.test(overflowX)) return true;
    }
  }
  return false;
}
