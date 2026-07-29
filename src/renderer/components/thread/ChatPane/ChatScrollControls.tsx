import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown } from "lucide-react";
import { floatingGlassSurfaceClass } from "@/renderer/components/layout/floatingGlass";
import { useAppStore } from "@/renderer/state/appStore";
import { isPanelResizing, subscribePanelResize } from "@/renderer/state/panelResizeSignal";
import {
  BOTTOM_EPSILON_PX,
  isElementAtBottom,
  nextShowScrollDown,
  shouldCoalesceLayoutSync,
  shouldIgnoreProgrammaticPinScroll,
  shouldReenableStickToBottom,
  shouldReleaseStickToBottom,
  shouldSkipScrollToBottomWrite,
  shouldTrustCachedAtBottom,
  nextAtBottomCacheUntil,
  shouldRepinForContentGrowth,
  THREAD_OPEN_COALESCE_MS,
} from "./chatScrollGeometry";

const USER_SCROLL_INTENT_MS = 750;
const VIRTUALIZER_LAYOUT_SETTLE_MS = 250;
/** Minimum at-bottom cache when no coalesce window is active. */
const AT_BOTTOM_CACHE_MS = 16;
const TOUCH_FIRST_POINTER_QUERY = "(hover: none) and (pointer: coarse)";
/**
 * How long sticky pins pause after an untagged upward scroll that release
 * logic classified as layout-driven. Long enough to bridge the gap between a
 * native scrollbar-thumb drag's scroll events, short enough that a one-shot
 * virtualizer adjustment recovers on the next streaming pin.
 */
const PIN_HOLDOFF_MS = 150;

export type ChatScrollControlsHandle = {
  beginVirtualizerLayoutChange(): void;
  beginLiveVirtualizerLayoutChange(): void;
  disableStickToBottom(): void;
  isStickToBottom(): boolean;
  markUserScrollIntent(): void;
  hasRecentUserScrollIntent(): boolean;
  /** Mark the next scroll event matching this scrollTop as our own write. */
  noteProgrammaticScroll(scrollTop: number): void;
  /**
   * True while the thread-open measurement storm is assumed to still be
   * running. Single shared epoch — keyed to the thread opening (and ended
   * early by a user scroll-away), not to any individual row's mount.
   */
  isThreadOpenSettling(): boolean;
  onContentHeightChange(): void;
};

export const ChatScrollControls = forwardRef<
  ChatScrollControlsHandle,
  {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    contentRef: React.RefObject<HTMLDivElement | null>;
    layoutChangeToken: string | null | undefined;
    tailEntryId: string | null;
    threadId: string;
    tailLoaderVisible: boolean;
    initialScrollSettled: boolean;
    initialScrollRevealDelayMs: number;
    virtualScrollToBottomRef: React.RefObject<(() => void) | null>;
    onInitialScrollSettled: () => void;
  }
>(function ChatScrollControls(props, ref) {
  const { t } = useLingui();
  const {
    scrollRef,
    contentRef,
    layoutChangeToken,
    tailEntryId,
    threadId,
    tailLoaderVisible,
    initialScrollSettled,
    initialScrollRevealDelayMs,
    virtualScrollToBottomRef,
    onInitialScrollSettled,
  } = props;
  const scrollToBottomToken = useAppStore((s) => s.chatScrollToBottomTokens[threadId] ?? 0);
  const initialLayoutChangeTokenRef = useRef(layoutChangeToken);
  const lastScrollTopRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const pinRafRef = useRef<number | null>(null);
  const layoutSyncRafRef = useRef<number | null>(null);
  const layoutSyncSecondRafRef = useRef<number | null>(null);
  const initialSettleRafRef = useRef<number | null>(null);
  const initialSettleSecondRafRef = useRef<number | null>(null);
  const initialSettleRevealRafRef = useRef<number | null>(null);
  const initialSettleRevealTimeoutRef = useRef<number | null>(null);
  const explicitPinRafRef = useRef<number | null>(null);
  const explicitPinSecondRafRef = useRef<number | null>(null);
  const virtualizerLayoutChangeUntilRef = useRef(0);
  const initialRevealLayoutChangeUntilRef = useRef(0);
  const userScrollIntentUntilRef = useRef(0);
  const programmaticScrollTopRef = useRef<number | null>(null);
  const programmaticScrollUntilRef = useRef(0);
  const threadOpenCoalesceUntilRef = useRef(0);
  const atBottomCachedUntilRef = useRef(0);
  const lastPinnedScrollHeightRef = useRef(0);
  const lastSeenScrollHeightRef = useRef(0);
  const lastSeenClientHeightRef = useRef(0);
  const previousInitialScrollSettledRef = useRef(initialScrollSettled);
  const disableStickToBottomRef = useRef<() => void>(() => undefined);
  const pinHoldoffUntilRef = useRef(0);
  const touchFirstPointer = window.matchMedia(TOUCH_FIRST_POINTER_QUERY).matches;
  const [showScrollDown, setShowScrollDown] = useState(false);

  function cancelVirtualizerLayoutChange() {
    virtualizerLayoutChangeUntilRef.current = 0;
    initialRevealLayoutChangeUntilRef.current = 0;
  }

  function markVirtualizerLayoutChange(extendInitialReveal: boolean) {
    // LegendList applies measured sizes and visible-content compensation over
    // multiple animation frames. A short deadline is more robust than counting
    // paints because its MVCP recalculation can itself be deferred by rAF.
    const settleUntil = performance.now() + VIRTUALIZER_LAYOUT_SETTLE_MS;
    virtualizerLayoutChangeUntilRef.current = settleUntil;
    if (extendInitialReveal) initialRevealLayoutChangeUntilRef.current = settleUntil;
  }

  function beginVirtualizerLayoutChange() {
    markVirtualizerLayoutChange(true);
  }

  function beginLiveVirtualizerLayoutChange() {
    // Streaming rows can grow continuously. Their LegendList compensation
    // still needs the scroll-safety guard above, but must not keep the initial
    // transcript hidden until the stream ends.
    markVirtualizerLayoutChange(false);
  }

  function syncBottomStateFromLayout() {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = isElementAtBottom(el);
    if (isAtBottom) stickToBottomRef.current = true;
    setShowScrollDown(nextShowScrollDown({ stickToBottom: stickToBottomRef.current, isAtBottom }));
  }

  function disableStickToBottom() {
    if (!stickToBottomRef.current) return;
    cancelVirtualizerLayoutChange();
    cancelScheduledInitialSettle();
    cancelScheduledExplicitPin();
    cancelScheduledLayoutSync();
    pinHoldoffUntilRef.current = 0;
    if (pinRafRef.current !== null) {
      cancelAnimationFrame(pinRafRef.current);
      pinRafRef.current = null;
    }
    // End the open-storm coalesce immediately so a first scroll-away is not
    // still treated as a measurement settle that wants to re-pin / coalesce.
    threadOpenCoalesceUntilRef.current = 0;
    atBottomCachedUntilRef.current = 0;
    lastPinnedScrollHeightRef.current = 0;
    stickToBottomRef.current = false;
    const el = scrollRef.current;
    setShowScrollDown(!el || !isElementAtBottom(el));
  }
  disableStickToBottomRef.current = disableStickToBottom;

  function markUserScrollIntent() {
    userScrollIntentUntilRef.current = performance.now() + USER_SCROLL_INTENT_MS;
  }

  function hasRecentUserScrollIntent() {
    return performance.now() <= userScrollIntentUntilRef.current;
  }

  function noteProgrammaticScroll(scrollTop: number) {
    // Cover the async scroll event that follows a scrollTop write. Match the
    // written value so a later user thumb-drag (different scrollTop) is never
    // mistaken for our pin/compensation write.
    programmaticScrollTopRef.current = scrollTop;
    programmaticScrollUntilRef.current = performance.now() + 48;
  }

  function consumeProgrammaticScroll(nextScrollTop: number): boolean {
    if (performance.now() > programmaticScrollUntilRef.current) {
      programmaticScrollTopRef.current = null;
      return false;
    }
    const expected = programmaticScrollTopRef.current;
    if (expected === null) return false;
    if (Math.abs(nextScrollTop - expected) > BOTTOM_EPSILON_PX) return false;
    programmaticScrollTopRef.current = null;
    return true;
  }

  function writeScrollTop(el: HTMLElement, nextScrollTop: number) {
    noteProgrammaticScroll(nextScrollTop);
    el.scrollTop = nextScrollTop;
  }

  function writeBottomPin(el: HTMLElement) {
    writeScrollTop(el, el.scrollHeight);
    lastPinnedScrollHeightRef.current = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
    stickToBottomRef.current = true;
    setShowScrollDown(false);
  }

  function scrollToBottom(options: { reconcileVirtualizer?: boolean } = {}) {
    const el = scrollRef.current;
    if (!el) return;
    // User is actively scrolling away (wheel / scrollbar / pointer drag).
    // Never re-pin — ResizeObserver and streaming anchors must not fight the
    // gesture. Intent alone used to leave sticky on until the first scroll
    // event; this guard covers that race and any missed disable.
    if (hasRecentUserScrollIntent() && !isElementAtBottom(el)) {
      stickToBottomRef.current = false;
      setShowScrollDown(true);
      return;
    }
    const now = performance.now();
    // An untagged upward scroll was recently suppressed as layout-driven. It
    // may equally be a native scrollbar-thumb drag (Windows overlay thumbs emit
    // no pointer events) — hold pins off briefly so a real drag is not yanked.
    // A continuing drag keeps re-arming the holdoff via its scroll events; a
    // one-shot virtualizer adjustment lets it lapse and the next growth pin
    // reattaches the transcript.
    if (options.reconcileVirtualizer !== true && now < pinHoldoffUntilRef.current) {
      if (!isElementAtBottom(el)) return;
      pinHoldoffUntilRef.current = 0;
    }
    const scrollHeight = el.scrollHeight;
    const reconcileVirtualizer = options.reconcileVirtualizer === true;
    // Stick-to-bottom storms (thread switch / row measure) call this many times
    // per frame. If we are already pinned at the same content height, skip
    // scrollTop writes — they still fire scroll listeners and force style recalc.
    // Never skip when reconcileVirtualizer is set: open/settle must drive the
    // virtualizer to the last row. Never skip when scrollHeight grew either —
    // otherwise chats open mid-transcript after rows measure taller.
    if (
      shouldTrustCachedAtBottom({
        now,
        cachedUntil: atBottomCachedUntilRef.current,
        scrollHeight,
        lastPinnedScrollHeight: lastPinnedScrollHeightRef.current,
        reconcileVirtualizer,
      })
    ) {
      stickToBottomRef.current = true;
      setShowScrollDown(false);
      return;
    }
    // During the open storm while sticky, only re-pin when scrollHeight grew.
    if (
      !reconcileVirtualizer &&
      !shouldRepinForContentGrowth({
        stickToBottom: stickToBottomRef.current,
        now,
        coalesceUntil: threadOpenCoalesceUntilRef.current,
        scrollHeight,
        lastPinnedScrollHeight: lastPinnedScrollHeightRef.current,
      })
    ) {
      atBottomCachedUntilRef.current = nextAtBottomCacheUntil({
        now,
        frameCacheMs: AT_BOTTOM_CACHE_MS,
        coalesceUntil: threadOpenCoalesceUntilRef.current,
      });
      stickToBottomRef.current = true;
      setShowScrollDown(false);
      return;
    }
    if (
      !reconcileVirtualizer &&
      shouldSkipScrollToBottomWrite({
        scrollHeight,
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
        lastPinnedScrollHeight: lastPinnedScrollHeightRef.current,
      })
    ) {
      // Once pinned, trust that until the coalesce window ends — but only for
      // this scrollHeight (see shouldTrustCachedAtBottom).
      atBottomCachedUntilRef.current = nextAtBottomCacheUntil({
        now,
        frameCacheMs: AT_BOTTOM_CACHE_MS,
        coalesceUntil: threadOpenCoalesceUntilRef.current,
      });
      lastPinnedScrollHeightRef.current = scrollHeight;
      lastScrollTopRef.current = el.scrollTop;
      stickToBottomRef.current = true;
      setShowScrollDown(false);
      return;
    }
    atBottomCachedUntilRef.current = 0;
    const virtualScrollToBottom = virtualScrollToBottomRef.current;
    // Reconcile LegendList only for explicit/open-settle pins. During normal
    // streaming growth its scrollToEnd request settles asynchronously against
    // virtualizer state, which can lag the DOM row measurement by a frame and
    // leave the transcript visibly above the end. A direct tagged write pins
    // the already-laid-out scroller synchronously; its scroll event keeps the
    // virtualizer's offset in sync.
    if (reconcileVirtualizer && virtualScrollToBottom) {
      beginVirtualizerLayoutChange();
      virtualScrollToBottom();
    }
    writeBottomPin(el);
  }

  const syncLayoutNow = useEffectEvent(() => {
    if (stickToBottomRef.current) {
      scrollToBottom();
      return;
    }
    syncBottomStateFromLayout();
  });

  function cancelScheduledLayoutSync() {
    if (layoutSyncRafRef.current !== null) {
      cancelAnimationFrame(layoutSyncRafRef.current);
      layoutSyncRafRef.current = null;
    }
    if (layoutSyncSecondRafRef.current !== null) {
      cancelAnimationFrame(layoutSyncSecondRafRef.current);
      layoutSyncSecondRafRef.current = null;
    }
  }

  function hasScheduledLayoutSync() {
    return layoutSyncRafRef.current !== null || layoutSyncSecondRafRef.current !== null;
  }

  const syncLayoutNowAndAfterPaint = useEffectEvent(() => {
    const el = scrollRef.current;
    const contentHeightChanged = !!el && el.scrollHeight !== lastPinnedScrollHeightRef.current;

    // Height-driven sticky pins must run in this frame. Cancel any pending
    // coalesce so an earlier open-storm schedule cannot defer the write.
    if (contentHeightChanged && stickToBottomRef.current) {
      cancelScheduledLayoutSync();
      syncLayoutNow();
      return;
    }

    if (hasScheduledLayoutSync()) return;
    // During an active panel/divider drag the viewport changes every frame.
    // Collapse ResizeObserver updates to a single coalesced rAF (no synchronous
    // read, no chained settle passes) so the content still reflows and stays
    // bottom-pinned live, but we do at most one forced reflow per frame. The
    // drag-end reconcile below runs the full settle.
    //
    // Same coalescing while the initial thread-open settle is still running, and
    // for a short window after open while the virtualizer finishes measuring
    // mounted rows — otherwise each ResizeObserver tick stacks sync
    // scrollToBottom + two follow-up paints.
    if (
      shouldCoalesceLayoutSync({
        isPanelResizing: isPanelResizing(),
        initialScrollSettled,
        now: performance.now(),
        threadOpenCoalesceUntil: threadOpenCoalesceUntilRef.current,
      })
    ) {
      layoutSyncRafRef.current = requestAnimationFrame(() => {
        layoutSyncRafRef.current = null;
        syncLayoutNow();
      });
      return;
    }
    syncLayoutNow();
    layoutSyncRafRef.current = requestAnimationFrame(() => {
      layoutSyncRafRef.current = null;
      syncLayoutNow();
      layoutSyncSecondRafRef.current = requestAnimationFrame(() => {
        layoutSyncSecondRafRef.current = null;
        syncLayoutNow();
      });
    });
  });

  function cancelScheduledInitialSettle() {
    if (initialSettleRafRef.current !== null) {
      cancelAnimationFrame(initialSettleRafRef.current);
      initialSettleRafRef.current = null;
    }
    if (initialSettleSecondRafRef.current !== null) {
      cancelAnimationFrame(initialSettleSecondRafRef.current);
      initialSettleSecondRafRef.current = null;
    }
    if (initialSettleRevealRafRef.current !== null) {
      cancelAnimationFrame(initialSettleRevealRafRef.current);
      initialSettleRevealRafRef.current = null;
    }
    if (initialSettleRevealTimeoutRef.current !== null) {
      window.clearTimeout(initialSettleRevealTimeoutRef.current);
      initialSettleRevealTimeoutRef.current = null;
    }
  }

  function cancelScheduledExplicitPin() {
    if (explicitPinRafRef.current !== null) {
      cancelAnimationFrame(explicitPinRafRef.current);
      explicitPinRafRef.current = null;
    }
    if (explicitPinSecondRafRef.current !== null) {
      cancelAnimationFrame(explicitPinSecondRafRef.current);
      explicitPinSecondRafRef.current = null;
    }
  }

  function scheduleExplicitPinSettle() {
    cancelScheduledExplicitPin();
    explicitPinRafRef.current = requestAnimationFrame(() => {
      explicitPinRafRef.current = null;
      const el = scrollRef.current;
      if (!el || !stickToBottomRef.current || hasRecentUserScrollIntent()) return;
      // LegendList's scrollToEnd can apply its measured end offset after the
      // synchronous DOM pin, leaving the viewport one row-gap above the real
      // bottom. Reassert the direct pin after that virtualizer update, then
      // once more after the following paint for late row measurement.
      writeBottomPin(el);
      explicitPinSecondRafRef.current = requestAnimationFrame(() => {
        explicitPinSecondRafRef.current = null;
        const settledEl = scrollRef.current;
        if (!settledEl || !stickToBottomRef.current || hasRecentUserScrollIntent()) return;
        writeBottomPin(settledEl);
      });
    });
  }

  const scheduleInitialScrollSettle = useEffectEvent(() => {
    cancelScheduledInitialSettle();
    initialSettleRafRef.current = requestAnimationFrame(() => {
      initialSettleRafRef.current = null;
      scrollToBottom({ reconcileVirtualizer: true });
      initialSettleSecondRafRef.current = requestAnimationFrame(() => {
        initialSettleSecondRafRef.current = null;
        scrollToBottom({ reconcileVirtualizer: true });
        // LegendList applies the second scrollToEnd reconciliation on its own
        // next animation frame. Keep the initially hidden transcript hidden
        // through that frame, then pin once more before revealing it. Safari
        // otherwise exposes one paint at the estimated offset before the
        // measured tail moves into its final position.
        initialSettleRevealRafRef.current = requestAnimationFrame(() => {
          initialSettleRevealRafRef.current = null;
          const revealSettledTranscript = (forceBottomPin: boolean) => {
            initialSettleRevealTimeoutRef.current = null;
            // The hidden settle passes above already reconciled LegendList.
            // Finish with a direct DOM pin only: another scrollToEnd here
            // schedules a deferred virtualizer offset that can overwrite the
            // correct pin on the first visible paint.
            if (forceBottomPin) {
              const el = scrollRef.current;
              if (el) {
                // The delayed PWA transcript is still hidden and cannot have
                // meaningful user scroll intent. LegendList can nevertheless
                // emit an upward anchor-adjustment scroll and arm the normal
                // anti-drag holdoff. Clear that synthetic state and make the
                // final pre-reveal pin unconditional.
                userScrollIntentUntilRef.current = 0;
                pinHoldoffUntilRef.current = 0;
                writeBottomPin(el);
              }
            } else {
              scrollToBottom();
            }
            onInitialScrollSettled();
          };
          if (initialScrollRevealDelayMs > 0) {
            const revealAfterLatestVirtualizerSettle = () => {
              const remainingMs =
                initialRevealLayoutChangeUntilRef.current +
                initialScrollRevealDelayMs -
                performance.now();
              if (remainingMs > 0) {
                // A later LegendList measurement can extend the deadline after
                // this timer was armed. Re-check at every wake-up so reveal is
                // always delayMs after the final initial-layout signal. Live
                // stream growth uses a separate scroll-safety deadline.
                initialSettleRevealTimeoutRef.current = window.setTimeout(
                  revealAfterLatestVirtualizerSettle,
                  remainingMs,
                );
                return;
              }
              revealSettledTranscript(true);
            };
            // The opt-in mobile delay begins after the virtualizer's actual
            // layout-settle deadline, not merely after the rAF that requested
            // scrollToEnd. Safari/LegendList can apply its measured anchor
            // later inside this window.
            revealAfterLatestVirtualizerSettle();
          } else {
            // Desktop preserves its existing immediate post-settle reveal.
            revealSettledTranscript(false);
          }
        });
      });
    });
  });

  useImperativeHandle(ref, () => ({
    beginVirtualizerLayoutChange,
    beginLiveVirtualizerLayoutChange,
    disableStickToBottom,
    isStickToBottom: () => stickToBottomRef.current,
    markUserScrollIntent,
    hasRecentUserScrollIntent,
    noteProgrammaticScroll,
    isThreadOpenSettling: () => performance.now() < threadOpenCoalesceUntilRef.current,
    onContentHeightChange: syncLayoutNowAndAfterPaint,
  }));

  useLayoutEffect(() => {
    threadOpenCoalesceUntilRef.current = performance.now() + THREAD_OPEN_COALESCE_MS;
    atBottomCachedUntilRef.current = 0;
    lastPinnedScrollHeightRef.current = 0;
    lastSeenScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;
    lastSeenClientHeightRef.current = scrollRef.current?.clientHeight ?? 0;
    scrollToBottom({ reconcileVirtualizer: true });
    scheduleInitialScrollSettle();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll reset is keyed to thread changes; the helper reads refs/state setters only.
  }, [threadId]);

  // Preserve the bottom pin when the surrounding thread layout changes, but
  // keep the user's place if they already scrolled up. Run synchronously —
  // dock expand/collapse can shift scrollTop without changing scrollHeight,
  // and open-storm coalesce would otherwise leave the view stranded for a frame.
  useLayoutEffect(() => {
    if (layoutChangeToken === initialLayoutChangeTokenRef.current) return;
    initialLayoutChangeTokenRef.current = layoutChangeToken;
    cancelScheduledLayoutSync();
    syncLayoutNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effect is keyed to layout token changes; the helper reads refs/state setters only.
  }, [layoutChangeToken]);

  // Scroll to bottom when the composer signals a fresh user submission.
  // Token increments per submit, so consecutive sends still re-trigger.
  const initialScrollTokenRef = useRef(scrollToBottomToken);
  useLayoutEffect(() => {
    if (scrollToBottomToken === initialScrollTokenRef.current) return;
    initialScrollTokenRef.current = scrollToBottomToken;
    // A fresh submission explicitly resumes following the tail, even if it
    // lands inside the short scroll-away intent window.
    userScrollIntentUntilRef.current = 0;
    scrollToBottom({ reconcileVirtualizer: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helper reads refs/state setters only.
  }, [scrollToBottomToken]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll listener is keyed to the scroller/thread; helpers close over refs.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const prevScrollTop = lastScrollTopRef.current;
      const nextScrollTop = el.scrollTop;
      lastScrollTopRef.current = nextScrollTop;
      const nextScrollHeight = el.scrollHeight;
      const scrollHeightShrunk = nextScrollHeight < lastSeenScrollHeightRef.current;
      const scrollHeightGrew = nextScrollHeight > lastSeenScrollHeightRef.current;
      lastSeenScrollHeightRef.current = nextScrollHeight;
      const nextClientHeight = el.clientHeight;
      const viewportHeightChanged = nextClientHeight !== lastSeenClientHeightRef.current;
      lastSeenClientHeightRef.current = nextClientHeight;
      const isProgrammaticScroll = consumeProgrammaticScroll(nextScrollTop);
      const hasRecentUserIntent = hasRecentUserScrollIntent();
      // Programmatic stick-to-bottom only moves down. Skip layout reads / button
      // updates for those events — CDP profiles spent tens of ms here per switch.
      if (
        shouldIgnoreProgrammaticPinScroll({
          stickToBottom: stickToBottomRef.current,
          prevScrollTop,
          nextScrollTop,
        })
      ) {
        return;
      }
      const isVirtualizerLayoutChange =
        performance.now() <= virtualizerLayoutChangeUntilRef.current;
      const isAtBottom = isElementAtBottom(el);
      // Release on upward scroll away from the bottom (native scrollbar thumb —
      // often no pointerdown). Layout clamps that shrink scrollHeight and
      // virtualizer anchor adjustments keep sticky, including the frame where
      // LegendList moves scrollTop before scrollHeight updates. A real
      // wheel/touch/pointer gesture is still allowed to release during those
      // layout windows. Our own scrollTop writes are tagged via
      // noteProgrammaticScroll.
      if (
        shouldReleaseStickToBottom({
          prevScrollTop,
          nextScrollTop,
          isAtBottom,
          isProgrammaticScroll,
          scrollHeightShrunk,
          scrollHeightGrew,
          viewportHeightChanged,
          isVirtualizerLayoutChange,
          hasRecentUserScrollIntent: hasRecentUserIntent,
        })
      ) {
        // Arm intent so ResizeObserver / streaming re-pins stay blocked for the
        // rest of the thumb drag (which may never have set intent itself).
        markUserScrollIntent();
        disableStickToBottomRef.current();
      } else if (
        shouldReenableStickToBottom({
          prevScrollTop,
          nextScrollTop,
          isAtBottom,
          hasRecentUserScrollIntent: hasRecentUserIntent,
        })
      ) {
        // Don't re-enable sticky when the user is actively scrolling upward but
        // is still within `BOTTOM_EPSILON_PX` of the bottom — otherwise a tiny
        // wheel-up gets snapped back by the next streaming delta.
        stickToBottomRef.current = true;
      }
      if (
        stickToBottomRef.current &&
        !isAtBottom &&
        !isProgrammaticScroll &&
        !viewportHeightChanged &&
        nextScrollTop < prevScrollTop
      ) {
        if (touchFirstPointer) {
          // Touch scrolling always starts with the pane's pointerdown handler,
          // which disables sticky mode before the first scroll event. With no
          // recorded intent, an upward move inside a virtualizer/height-change
          // window is therefore LegendList's visible-content compensation.
          // Re-pin in this event, before Safari can paint the live tail below
          // the floating composer while waiting for another provider delta.
          pinHoldoffUntilRef.current = 0;
          atBottomCachedUntilRef.current = 0;
          writeBottomPin(el);
        } else {
          // Desktop native scrollbar thumbs can emit scroll without pointer
          // events. Hold pins off briefly so a real drag keeps re-arming the
          // guard, while a one-shot virtualizer adjustment lets it lapse and
          // the next streaming pin reattaches. See scrollToBottom.
          pinHoldoffUntilRef.current = performance.now() + PIN_HOLDOFF_MS;
        }
      }
      setShowScrollDown(
        nextShowScrollDown({ stickToBottom: stickToBottomRef.current, isAtBottom }),
      );
    };

    lastScrollTopRef.current = el.scrollTop;
    lastSeenScrollHeightRef.current = el.scrollHeight;
    lastSeenClientHeightRef.current = el.clientHeight;
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef, threadId, touchFirstPointer]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // ResizeObserver already runs after layout and before paint, so syncing
      // immediately here avoids a visible one-frame catch-up when the viewport
      // changes because surrounding UI or panel dimensions changed.
      syncLayoutNowAndAfterPaint();
    });
    if (el) {
      observer.observe(el);
    }
    // Observing only the scroller misses content growth (its own box never
    // changes). The virtualizer's totalSize listener reports growth too, but
    // after paint — the streaming tail then pushes the footer down for one
    // visible frame before the pin catches up. The content element's resize
    // fires pre-paint, so the sticky pin lands in the same frame.
    const content = contentRef.current;
    if (content) {
      observer.observe(content);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on initial settle: the virtualizer assigns contentRef after mount.
  }, [scrollRef, contentRef, threadId, initialScrollSettled]);

  const syncPinnedContentChange = useEffectEvent(() => {
    if (pinRafRef.current !== null) {
      cancelAnimationFrame(pinRafRef.current);
    }
    if (stickToBottomRef.current) {
      scrollToBottom({ reconcileVirtualizer: true });
      if (!initialScrollSettled) {
        scheduleInitialScrollSettle();
      }
    }
    pinRafRef.current = requestAnimationFrame(() => {
      pinRafRef.current = null;
      if (!stickToBottomRef.current) return;
      scrollToBottom({ reconcileVirtualizer: true });
      if (!initialScrollSettled) {
        scheduleInitialScrollSettle();
      }
    });
    return () => {
      if (pinRafRef.current !== null) {
        cancelAnimationFrame(pinRafRef.current);
        pinRafRef.current = null;
      }
    };
  });

  useLayoutEffect(() => {
    const becameSettled = initialScrollSettled && !previousInitialScrollSettledRef.current;
    previousInitialScrollSettledRef.current = initialScrollSettled;
    // The delayed PWA path already force-pinned immediately before revealing.
    // Re-running scrollToEnd because the reveal state changed would let
    // LegendList apply another deferred anchor offset to the visible viewport.
    if (becameSettled && initialScrollRevealDelayMs > 0) return;
    syncPinnedContentChange();
    // The submit signal can arrive before the optimistic user row is mounted.
    // Keying this settle to the tail entry as well re-pins after that row
    // actually changes the virtualized content height. Manual scrollback stays
    // untouched because syncPinnedContentChange only follows an active sticky
    // bottom anchor.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinning is keyed to tail/loader visibility changes; the effect event reads latest layout refs.
  }, [tailEntryId, tailLoaderVisible, initialScrollSettled]);

  // When a panel/divider drag ends, the coalesced in-drag syncs above skipped
  // the full settle pass. Run it once now so the final bottom-pin / scroll-down
  // button state is correct against the settled layout.
  useLayoutEffect(
    () =>
      subscribePanelResize((resizing) => {
        if (resizing) return;
        cancelScheduledLayoutSync();
        syncLayoutNowAndAfterPaint();
      }),
    [],
  );

  useEffect(() => cancelScheduledLayoutSync, []);
  useEffect(() => cancelScheduledInitialSettle, []);
  useEffect(() => cancelScheduledExplicitPin, []);

  function handleScrollButtonPress() {
    // The button is an explicit request to resume following the tail. Do not
    // let the short scroll-away intent window discard the first press.
    userScrollIntentUntilRef.current = 0;
    scrollToBottom({ reconcileVirtualizer: true });
    scheduleExplicitPinSettle();
  }

  return (
    <Button
      isIconOnly
      variant="tertiary"
      size="sm"
      aria-label={t`Scroll to bottom`}
      onPress={handleScrollButtonPress}
      /* Centered via a negative margin, not `-translate-x-1/2`: HeroUI's pressed
         state animates `transform`, which would fight a translate and snap the
         button sideways on click. */
      className={`${floatingGlassSurfaceClass} absolute bottom-4 left-1/2 z-10 -ml-3.5 size-7 min-w-0 rounded-full transition-opacity duration-200 ease-out ${
        showScrollDown ? "opacity-80 hover:opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <ArrowDown className="size-3.5" strokeWidth={2.5} />
    </Button>
  );
});
