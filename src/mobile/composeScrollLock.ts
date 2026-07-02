/**
 * Scroll lock for floating mobile composers.
 *
 * The mobile shell is overflow-locked (html/body/#root), yet iOS Safari still
 * pans the layout viewport when an input near the bottom edge gains focus —
 * the document scrolls even though nothing is scrollable, and the offset
 * lingers after the keyboard dismisses, so the next expansion starts from a
 * shifted page ("jumps somewhere"). While the composer is expanded we capture
 * the root scroller offset and re-assert it whenever the window or visual
 * viewport moves. Thread pages can also have nested scroll containers, so the
 * lock captures scrollable ancestors around the composer root and restores
 * them alongside the document root. On lock/unlock we re-assert across a short
 * settle window (iOS re-lays out a few hundred ms later and can move it again).
 *
 * Single-owner and idempotent: locking while locked refreshes the captured
 * composer ancestors and re-asserts the current baseline.
 */

const SETTLE_TIMING_MS = [0, 16, 50, 150, 300, 500] as const;
const MOBILE_ROOT_SCROLL_TOP = 0;

let isLocked = false;
let originalScrollTop = MOBILE_ROOT_SCROLL_TOP;
let lockedScroller: Element | null = null;
let settleTimers: number[] = [];

type CapturedScroller = {
  readonly element: Element;
  readonly top: number;
};

let capturedScrollers: CapturedScroller[] = [];

function setScrollTop(element: Element | null | undefined, top: number): void {
  if (element && element.scrollTop !== top) {
    element.scrollTop = top;
  }
}

function restoreRootScroll(top: number): void {
  setScrollTop(lockedScroller, top);
  setScrollTop(document.scrollingElement, top);
  setScrollTop(document.documentElement, top);
  setScrollTop(document.body, top);
  if (window.scrollY !== top || window.scrollX !== 0) {
    try {
      window.scrollTo(0, top);
    } catch {
      // JSDOM and older WebKit builds may not support programmatic window scroll.
    }
  }
}

function restoreCapturedScroll(): void {
  restoreRootScroll(originalScrollTop);
  for (const captured of capturedScrollers) {
    setScrollTop(captured.element, captured.top);
  }
}

function clearSettleTimers(): void {
  for (const id of settleTimers) window.clearTimeout(id);
  settleTimers = [];
}

function scheduleSettleRestores(
  top: number,
  scroller: Element | null,
  captured: readonly CapturedScroller[] = capturedScrollers,
): void {
  clearSettleTimers();
  const restore = () => {
    const previousLockedScroller = lockedScroller;
    if (scroller) lockedScroller = scroller;
    restoreRootScroll(top);
    for (const entry of captured) {
      setScrollTop(entry.element, entry.top);
    }
    lockedScroller = previousLockedScroller;
  };
  restore();
  settleTimers = SETTLE_TIMING_MS.map((delay) => window.setTimeout(restore, delay));
}

function handleViewportChange(): void {
  restoreCapturedScroll();
}

/**
 * Focus an element without letting the browser scroll it into view. iOS
 * Safari auto-pans the document to reveal a freshly focused input;
 * `preventScroll` suppresses that (fall back to plain focus where the option
 * throws).
 */
export function focusWithoutScroll(element: HTMLElement | null | undefined): void {
  if (!element) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function isScrollableAncestor(element: HTMLElement): boolean {
  if (element.scrollTop !== 0) return true;
  const style = window.getComputedStyle(element);
  return /(auto|scroll|overlay)/.test(style.overflowY);
}

function captureAncestorScrollers(source: HTMLElement | null | undefined) {
  const captured: CapturedScroller[] = [];
  for (let element = source?.parentElement; element; element = element.parentElement) {
    if (element === document.body || element === document.documentElement) break;
    if (isScrollableAncestor(element)) {
      captured.push({ element, top: element.scrollTop });
    }
  }
  return captured;
}

function mergeCapturedScrollers(next: readonly CapturedScroller[]): void {
  for (const entry of next) {
    if (!capturedScrollers.some((existing) => existing.element === entry.element)) {
      capturedScrollers.push(entry);
    }
  }
}

/** Freeze the page by capturing and re-asserting the root scroller offset. */
export function lockComposeScroll(source?: HTMLElement | null): void {
  if (typeof document === "undefined") return;
  if (isLocked) {
    mergeCapturedScrollers(captureAncestorScrollers(source));
    scheduleSettleRestores(originalScrollTop, lockedScroller);
    return;
  }
  const scroller = document.scrollingElement ?? document.documentElement;
  lockedScroller = scroller;
  capturedScrollers = captureAncestorScrollers(source);
  // The PWA shell is fixed and overflow-hidden; any nonzero root scroll here
  // is keyboard pan residue from iOS, not app state. Reset before focusing so
  // WebKit evaluates the composer from the correct screen position.
  originalScrollTop = MOBILE_ROOT_SCROLL_TOP;
  isLocked = true;
  clearSettleTimers();
  window.addEventListener("scroll", restoreCapturedScroll, { passive: true });
  window.visualViewport?.addEventListener("resize", handleViewportChange);
  window.visualViewport?.addEventListener("scroll", handleViewportChange);
  scheduleSettleRestores(originalScrollTop, scroller);
}

/** Restore the pre-lock offset, re-asserting across the keyboard settle window. */
export function unlockComposeScroll(): void {
  if (!isLocked) return;
  const scroller = lockedScroller;
  const top = originalScrollTop;
  const captured = capturedScrollers;
  window.removeEventListener("scroll", restoreCapturedScroll);
  window.visualViewport?.removeEventListener("resize", handleViewportChange);
  window.visualViewport?.removeEventListener("scroll", handleViewportChange);
  clearSettleTimers();
  isLocked = false;
  lockedScroller = null;
  capturedScrollers = [];
  if (!scroller) return;
  scheduleSettleRestores(top, scroller, captured);
}
