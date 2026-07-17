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
/** Minimum at-bottom cache when no coalesce window is active. */
const AT_BOTTOM_CACHE_MS = 16;

export type ChatScrollControlsHandle = {
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
    layoutChangeToken: string | null | undefined;
    threadId: string;
    tailLoaderVisible: boolean;
    initialScrollSettled: boolean;
    virtualScrollToBottomRef: React.RefObject<(() => void) | null>;
    onInitialScrollSettled: () => void;
  }
>(function ChatScrollControls(props, ref) {
  const { t } = useLingui();
  const {
    scrollRef,
    layoutChangeToken,
    threadId,
    tailLoaderVisible,
    initialScrollSettled,
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
  const userScrollIntentUntilRef = useRef(0);
  const programmaticScrollTopRef = useRef<number | null>(null);
  const programmaticScrollUntilRef = useRef(0);
  const threadOpenCoalesceUntilRef = useRef(0);
  const atBottomCachedUntilRef = useRef(0);
  const lastPinnedScrollHeightRef = useRef(0);
  const lastSeenScrollHeightRef = useRef(0);
  const disableStickToBottomRef = useRef<() => void>(() => undefined);
  const [showScrollDown, setShowScrollDown] = useState(false);

  function syncBottomStateFromLayout() {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = isElementAtBottom(el);
    if (isAtBottom) stickToBottomRef.current = true;
    setShowScrollDown(nextShowScrollDown({ stickToBottom: stickToBottomRef.current, isAtBottom }));
  }

  function disableStickToBottom() {
    if (!stickToBottomRef.current) return;
    cancelScheduledInitialSettle();
    cancelScheduledLayoutSync();
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
    if (virtualScrollToBottom) {
      const targetScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      noteProgrammaticScroll(targetScrollTop);
      virtualScrollToBottom();
      lastPinnedScrollHeightRef.current = el.scrollHeight;
      stickToBottomRef.current = true;
      setShowScrollDown(false);
      return;
    }
    writeScrollTop(el, el.scrollHeight);
    lastPinnedScrollHeightRef.current = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
    stickToBottomRef.current = true;
    setShowScrollDown(false);
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
  }

  const scheduleInitialScrollSettle = useEffectEvent(() => {
    cancelScheduledInitialSettle();
    initialSettleRafRef.current = requestAnimationFrame(() => {
      initialSettleRafRef.current = null;
      scrollToBottom({ reconcileVirtualizer: true });
      initialSettleSecondRafRef.current = requestAnimationFrame(() => {
        initialSettleSecondRafRef.current = null;
        scrollToBottom({ reconcileVirtualizer: true });
        onInitialScrollSettled();
      });
    });
  });

  useImperativeHandle(ref, () => ({
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
      lastSeenScrollHeightRef.current = nextScrollHeight;
      const isProgrammaticScroll = consumeProgrammaticScroll(nextScrollTop);
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
      const isAtBottom = isElementAtBottom(el);
      // Release on upward scroll away from the bottom (native scrollbar thumb —
      // often no pointerdown). Layout clamps that shrink scrollHeight and lower
      // scrollTop keep sticky; height growth during a live stream must not block
      // release. Our own scrollTop writes are tagged via noteProgrammaticScroll.
      if (
        shouldReleaseStickToBottom({
          prevScrollTop,
          nextScrollTop,
          isAtBottom,
          isProgrammaticScroll,
          scrollHeightShrunk,
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
          hasRecentUserScrollIntent: hasRecentUserScrollIntent(),
        })
      ) {
        // Don't re-enable sticky when the user is actively scrolling upward but
        // is still within `BOTTOM_EPSILON_PX` of the bottom — otherwise a tiny
        // wheel-up gets snapped back by the next streaming delta.
        stickToBottomRef.current = true;
      }
      setShowScrollDown(
        nextShowScrollDown({ stickToBottom: stickToBottomRef.current, isAtBottom }),
      );
    };

    lastScrollTopRef.current = el.scrollTop;
    lastSeenScrollHeightRef.current = el.scrollHeight;
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef, threadId]);

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
    return () => observer.disconnect();
  }, [scrollRef, threadId]);

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
    syncPinnedContentChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinning is keyed to loader visibility changes; the effect event reads latest layout refs.
  }, [tailLoaderVisible, initialScrollSettled]);

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

  function handleScrollButtonPress() {
    // The button is an explicit request to resume following the tail. Do not
    // let the short scroll-away intent window discard the first press.
    userScrollIntentUntilRef.current = 0;
    scrollToBottom({ reconcileVirtualizer: true });
  }

  return (
    <Button
      isIconOnly
      variant="tertiary"
      size="sm"
      aria-label={t`Scroll to bottom`}
      onPress={handleScrollButtonPress}
      className={`absolute bottom-4 right-4 z-10 transition-opacity duration-200 ease-out ${
        showScrollDown ? "opacity-80 hover:opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <ArrowDown className="size-3.5" strokeWidth={2.5} />
    </Button>
  );
});
