export const BOTTOM_EPSILON_PX = 4;

/**
 * How long after a thread opens the virtualizer row-measurement storm is
 * assumed to still be running. Scroll controls coalesce layout syncs and user
 * messages ignore ResizeObserver remeasures within this window.
 */
export const THREAD_OPEN_COALESCE_MS = 400;

export function distanceFromBottom(element: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

export function isElementAtBottom(element: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): boolean {
  return distanceFromBottom(element) <= BOTTOM_EPSILON_PX;
}

/**
 * Stick-to-bottom storms call `scrollToBottom` many times per frame while the
 * virtualizer measures rows. Writing `scrollTop` when already pinned still
 * fires scroll listeners and forces style recalc — skip that write.
 *
 * Never skip when `scrollHeight` changed since the last pin: collapsing a tool
 * (or any row resize) can leave a transient "at bottom" reading while the
 * scroller is about to settle above the bottom. An explicit pin write is
 * required to stay stuck.
 */
export function shouldSkipScrollToBottomWrite(input: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
  lastPinnedScrollHeight: number;
}): boolean {
  if (input.scrollHeight <= 0) return false;
  if (input.scrollHeight !== input.lastPinnedScrollHeight) return false;
  return isElementAtBottom(input);
}

/**
 * During a thread-open measurement storm, trust a recent "already at bottom"
 * result so we do not re-read scroll metrics on every ResizeObserver /
 * totalSize callback — but only while `scrollHeight` is unchanged. If content
 * grew (virtualizer measured taller rows), we must re-pin or the chat opens
 * mid-transcript.
 *
 * Never trust the cache when `reconcileVirtualizer` is requested: the initial
 * open settle path must still call the virtualizer's scrollToIndex.
 */
export function shouldTrustCachedAtBottom(input: {
  now: number;
  cachedUntil: number;
  scrollHeight: number;
  lastPinnedScrollHeight: number;
  reconcileVirtualizer?: boolean;
}): boolean {
  if (input.reconcileVirtualizer) return false;
  if (input.scrollHeight !== input.lastPinnedScrollHeight) return false;
  return input.now < input.cachedUntil;
}

/**
 * After confirming the scroller is already at bottom during a thread-open
 * storm, keep trusting that result until the coalesce window ends (or at least
 * one frame).
 */
export function nextAtBottomCacheUntil(input: {
  now: number;
  frameCacheMs: number;
  coalesceUntil: number;
}): number {
  return Math.max(input.now + input.frameCacheMs, input.coalesceUntil);
}

/**
 * While sticky during a thread-open storm, only re-pin when the scrollable
 * content height changed. Re-reading distance-from-bottom on every callback is
 * wasted when `scrollHeight` is unchanged; grow or shrink both require a pin
 * (collapse must not leave the view stranded above the bottom).
 */
export function shouldRepinForContentGrowth(input: {
  stickToBottom: boolean;
  now: number;
  coalesceUntil: number;
  scrollHeight: number;
  lastPinnedScrollHeight: number;
}): boolean {
  if (!input.stickToBottom) return true;
  if (input.now >= input.coalesceUntil) return true;
  return input.scrollHeight !== input.lastPinnedScrollHeight;
}

/**
 * Programmatic pin scrolls only move downward (or stay). When sticky is on and
 * scrollTop did not move up, the scroll listener can skip layout reads / button
 * state updates — the pin path already owns bottom state.
 */
export function shouldIgnoreProgrammaticPinScroll(input: {
  stickToBottom: boolean;
  prevScrollTop: number;
  nextScrollTop: number;
}): boolean {
  return input.stickToBottom && input.nextScrollTop >= input.prevScrollTop;
}

/**
 * Release stick-to-bottom when the scroller moves up and is no longer at the
 * bottom. Native scrollbar-thumb drags often never fire `pointerdown` on the
 * scroller (Windows overlay scrollbars) — only `scroll` — so this must NOT
 * require a prior user-scroll-intent flag.
 *
 * Layout clamps (content height shrinks and the browser lowers scrollTop) must
 * not release sticky — those are filtered via `scrollHeightShrunk`. Height
 * growth can also make the virtualizer adjust scrollTop upward while it
 * preserves its visible-content anchor. Treat that as layout-driven unless a
 * wheel/touch/pointer gesture already established user intent. The same is true
 * when a growing composer shrinks the viewport and the virtualizer compensates
 * its anchor before ResizeObserver re-pins the tail. A native
 * scrollbar drag that emits no pointer event still releases on its next
 * stable-height scroll event. LegendList can also move scrollTop before the
 * browser exposes the corresponding scrollHeight change, so its explicit
 * layout window gets the same treatment. Our own scrollTop writes are filtered
 * via `isProgrammaticScroll`.
 */
export function shouldReleaseStickToBottom(input: {
  prevScrollTop: number;
  nextScrollTop: number;
  isAtBottom: boolean;
  isProgrammaticScroll: boolean;
  scrollHeightShrunk: boolean;
  scrollHeightGrew: boolean;
  viewportHeightChanged: boolean;
  isVirtualizerLayoutChange: boolean;
  hasRecentUserScrollIntent: boolean;
}): boolean {
  if (input.isProgrammaticScroll) return false;
  if (input.scrollHeightShrunk) return false;
  if (input.viewportHeightChanged && !input.hasRecentUserScrollIntent) return false;
  if (input.isVirtualizerLayoutChange && !input.hasRecentUserScrollIntent) return false;
  if (input.scrollHeightGrew && !input.hasRecentUserScrollIntent) return false;
  return input.nextScrollTop < input.prevScrollTop && !input.isAtBottom;
}

/**
 * `ChatPane` arms scroll-intent on pointerdown so scrollbar / touch drags can
 * release stick-to-bottom. Clicks on in-chat controls (tool expand/collapse,
 * links, inputs) must not arm that intent: sticky row-height compensation then
 * moves `scrollTop` and the scroll handler would treat it as a user
 * scroll-away, leaving the transcript stranded above the bottom while content
 * grows or shrinks.
 */
export function shouldMarkUserScrollIntentFromPointerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  // Includes the ARIA roles React Aria / HeroUI render for non-native controls
  // (options, tabs, switches, sliders…) — a missed control here strands the
  // transcript above the bottom when its click releases stick-to-bottom.
  return (
    target.closest(
      "button, a, input, textarea, select, option, label, summary, [contenteditable='true'], " +
        "[role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], " +
        "[role='option'], [role='tab'], [role='slider'], [role='menuitem'], " +
        "[role='menuitemcheckbox'], [role='menuitemradio']",
    ) === null
  );
}

export function shouldReenableStickToBottom(input: {
  prevScrollTop: number;
  nextScrollTop: number;
  isAtBottom: boolean;
  hasRecentUserScrollIntent: boolean;
}): boolean {
  return (
    input.isAtBottom &&
    (input.nextScrollTop >= input.prevScrollTop || !input.hasRecentUserScrollIntent)
  );
}

export function nextShowScrollDown(input: {
  stickToBottom: boolean;
  isAtBottom: boolean;
}): boolean {
  return !input.stickToBottom && !input.isAtBottom;
}

/**
 * Collapse layout sync to a single rAF while the viewport is being resized or
 * while a thread-open measurement storm is still settling. Otherwise each
 * ResizeObserver tick stacks an immediate scrollToBottom plus two follow-up
 * paints.
 */
export function shouldCoalesceLayoutSync(input: {
  isPanelResizing: boolean;
  initialScrollSettled: boolean;
  now: number;
  threadOpenCoalesceUntil: number;
}): boolean {
  return (
    input.isPanelResizing ||
    !input.initialScrollSettled ||
    input.now < input.threadOpenCoalesceUntil
  );
}
