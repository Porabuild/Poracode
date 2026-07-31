/**
 * Keep iOS Safari from leaving the document panned after a sheet input closes.
 *
 * A fixed sheet is visually attached to the viewport, but focusing an input in
 * it can still scroll the layout document. The keyboard then settles after the
 * focused element has unmounted, so one synchronous reset on close is too
 * early. Hold the opening offset while the sheet is active and reassert it
 * across that closing settle window.
 */

const SETTLE_TIMING_MS = [0, 16, 50, 150, 300, 500] as const;

let lockGeneration = 0;

function setScrollTop(element: Element | null | undefined, top: number): void {
  if (element && element.scrollTop !== top) element.scrollTop = top;
}

function restoreDocumentScroll(scroller: Element, top: number): void {
  setScrollTop(scroller, top);
  // A settle timer may outlive its renderer document during navigation or
  // test-environment teardown. The captured scroller is still safe to update,
  // but the ambient DOM globals no longer exist.
  if (typeof document === "undefined" || typeof window === "undefined") return;
  setScrollTop(document.scrollingElement, top);
  setScrollTop(document.documentElement, top);
  setScrollTop(document.body, top);
  if (window.scrollY !== top || window.scrollX !== 0) {
    try {
      window.scrollTo(0, top);
    } catch {
      // JSDOM and older WebKit builds may not implement programmatic scrolling.
    }
  }
}

/** Lock the document at its current vertical offset until the returned release runs. */
export function lockMobileSheetViewport(): () => void {
  const scroller = document.scrollingElement ?? document.documentElement;
  const top = scroller.scrollTop;
  const generation = ++lockGeneration;
  let released = false;

  const restore = () => restoreDocumentScroll(scroller, top);
  window.addEventListener("scroll", restore, { passive: true });
  window.visualViewport?.addEventListener("resize", restore);
  window.visualViewport?.addEventListener("scroll", restore);
  restore();

  return () => {
    if (released) return;
    released = true;
    window.removeEventListener("scroll", restore);
    window.visualViewport?.removeEventListener("resize", restore);
    window.visualViewport?.removeEventListener("scroll", restore);

    for (const delay of SETTLE_TIMING_MS) {
      window.setTimeout(() => {
        if (lockGeneration === generation) restore();
      }, delay);
    }
  };
}
