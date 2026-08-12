let cachedIsIosTouchScroll: boolean | undefined;

/**
 * True on iOS / iPadOS WebKit — the one platform where writing `scrollTop`
 * during an active touch-driven momentum (inertial) scroll cancels the
 * momentum, snapping the scroll to a stop. Everywhere else a programmatic
 * scroll-position write while the user is scrolling is harmless.
 *
 * Detection mirrors @tanstack/virtual-core's own iOS check: the
 * iPhone/iPod/iPad UA string, plus iPadOS which masquerades as desktop Safari
 * ("MacIntel") but exposes touch points. Memoised because the form factor
 * never changes at runtime. Kept separate from PWA installation lifecycle code
 * so scroll behavior can be reused without registering install listeners.
 */
export function isIosTouchScroll(): boolean {
  if (cachedIsIosTouchScroll !== undefined) return cachedIsIosTouchScroll;
  if (typeof navigator === "undefined") {
    cachedIsIosTouchScroll = false;
    return cachedIsIosTouchScroll;
  }
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  const isIos =
    /iP(hone|od|ad)/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
  cachedIsIosTouchScroll = isIos;
  return cachedIsIosTouchScroll;
}
