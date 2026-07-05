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
import { isElementAtBottom } from "./chatScrollGeometry";
import { selectChatScrollAnchor, selectChatScrollAnchorForTimeline } from "./chatPaneSelectors";

const USER_SCROLL_INTENT_MS = 750;

export type ChatScrollControlsHandle = {
  disableStickToBottom(): void;
  isStickToBottom(): boolean;
  markUserScrollIntent(): void;
  onContentHeightChange(): void;
};

export const ChatScrollControls = forwardRef<
  ChatScrollControlsHandle,
  {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    contentRef: React.RefObject<HTMLDivElement | null>;
    hiddenRuntimeItemId?: string | undefined;
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
    contentRef,
    hiddenRuntimeItemId,
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
  const [showScrollDown, setShowScrollDown] = useState(false);

  function syncBottomStateFromLayout() {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = isElementAtBottom(el);
    if (isAtBottom) stickToBottomRef.current = true;
    setShowScrollDown(!stickToBottomRef.current && !isAtBottom);
  }

  function disableStickToBottom() {
    if (!stickToBottomRef.current) return;
    cancelScheduledInitialSettle();
    stickToBottomRef.current = false;
    const el = scrollRef.current;
    setShowScrollDown(!el || !isElementAtBottom(el));
  }

  function markUserScrollIntent() {
    userScrollIntentUntilRef.current = performance.now() + USER_SCROLL_INTENT_MS;
  }

  function hasRecentUserScrollIntent() {
    return performance.now() <= userScrollIntentUntilRef.current;
  }

  function scrollToBottom(options: { reconcileVirtualizer?: boolean } = {}) {
    const el = scrollRef.current;
    if (!el) return;
    const virtualScrollToBottom = virtualScrollToBottomRef.current;
    if (options.reconcileVirtualizer && virtualScrollToBottom) {
      virtualScrollToBottom();
    }
    el.scrollTop = el.scrollHeight;
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
    if (hasScheduledLayoutSync()) return;
    // During an active panel/divider drag the viewport changes every frame, and
    // both this scroller's ResizeObserver and MessageList's totalSize effect
    // call in here per frame. Collapse to a single coalesced rAF (no synchronous
    // read, no chained settle passes) so the content still reflows and stays
    // bottom-pinned live, but we do at most one forced reflow per frame instead
    // of stacking several. The drag-end reconcile below runs the full settle.
    if (isPanelResizing()) {
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
    onContentHeightChange: syncLayoutNowAndAfterPaint,
  }));

  useLayoutEffect(() => {
    scrollToBottom({ reconcileVirtualizer: true });
    scheduleInitialScrollSettle();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll reset is keyed to thread changes; the helper reads refs/state setters only.
  }, [threadId]);

  // Preserve the bottom pin when the surrounding thread layout changes, but
  // keep the user's place if they already scrolled up.
  useLayoutEffect(() => {
    if (layoutChangeToken === initialLayoutChangeTokenRef.current) return;
    initialLayoutChangeTokenRef.current = layoutChangeToken;
    syncLayoutNowAndAfterPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effect is keyed to layout token changes; the helper reads refs/state setters only.
  }, [layoutChangeToken]);

  // Scroll to bottom when the composer signals a fresh user submission.
  // Token increments per submit, so consecutive sends still re-trigger.
  const initialScrollTokenRef = useRef(scrollToBottomToken);
  useLayoutEffect(() => {
    if (scrollToBottomToken === initialScrollTokenRef.current) return;
    initialScrollTokenRef.current = scrollToBottomToken;
    scrollToBottom({ reconcileVirtualizer: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helper reads refs/state setters only.
  }, [scrollToBottomToken]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const prevScrollTop = lastScrollTopRef.current;
      const nextScrollTop = el.scrollTop;
      lastScrollTopRef.current = nextScrollTop;
      const isAtBottom = isElementAtBottom(el);
      // Only release sticky when the user actually moves away from the bottom.
      // Bare `!isAtBottom` here would race with virtualizer measurements that
      // grow `scrollHeight` after a programmatic scroll lands — flipping sticky
      // off in that one frame, then keeping the button stuck on because the
      // corrective syncLayoutNow takes the non-sticky branch.
      if (nextScrollTop < prevScrollTop && !isAtBottom && hasRecentUserScrollIntent()) {
        cancelScheduledInitialSettle();
        stickToBottomRef.current = false;
      } else if (isAtBottom && (nextScrollTop >= prevScrollTop || !hasRecentUserScrollIntent())) {
        // Don't re-enable sticky when the user is actively scrolling upward but
        // is still within `BOTTOM_EPSILON_PX` of the bottom — otherwise a tiny
        // wheel-up gets snapped back by the next streaming delta.
        stickToBottomRef.current = true;
      }
      setShowScrollDown(!stickToBottomRef.current && !isAtBottom);
    };

    lastScrollTopRef.current = el.scrollTop;
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef, threadId]);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el && !content) return;
    const observer = new ResizeObserver(() => {
      // ResizeObserver already runs after layout and before paint, so syncing
      // immediately here avoids a visible one-frame catch-up when rows collapse
      // or when the viewport shrinks because surrounding UI grew.
      syncLayoutNowAndAfterPaint();
    });
    if (el) {
      observer.observe(el);
    }
    if (content) {
      observer.observe(content);
    }
    return () => observer.disconnect();
  }, [contentRef, scrollRef, threadId]);

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
    return useAppStore.subscribe(
      (s) =>
        hiddenRuntimeItemId
          ? selectChatScrollAnchorForTimeline(s, threadId, hiddenRuntimeItemId)
          : selectChatScrollAnchor(s, threadId),
      () => syncPinnedContentChange(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscription identity is keyed to the rendered thread; the effect event reads latest layout refs.
  }, [hiddenRuntimeItemId, threadId]);

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
