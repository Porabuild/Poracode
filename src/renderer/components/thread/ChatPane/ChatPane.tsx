import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowDown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { isThreadTurnActive, type Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { chatMessageSurfaceClass } from "./parts/items/chatMessageSurface";
import { readBridge } from "@/renderer/bridge";
import { useShimmerRef } from "@/renderer/thinkingAnimator";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useAppStore } from "@/renderer/state/appStore";
import { isPanelResizing, subscribePanelResize } from "@/renderer/state/panelResizeSignal";
import { hydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import {
  finalizeFileCheckpoint,
  hydrateFileCheckpoints,
} from "@/renderer/state/fileCheckpointActions";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useProjectRootNames } from "@/renderer/state/projectRootNamesStore";
import { useThreadHasLiveWorkflow } from "@/renderer/state/threadLiveWorkflowStore";
import { useProjectTreeStore } from "@/renderer/state/projectTreeStore";
import {
  buildFileEditorContext,
  openFileInEditor,
  resolveWorktreeBranch,
} from "@/renderer/utils/gitHelpers";
import { ChatFindBar, type ScrollToIndex } from "@/renderer/components/find/ChatFindBar";
import { ChatPaneActionsContext, type ChatPaneActions } from "./chatPaneActionsContext";
import { isElementAtBottom } from "./chatScrollGeometry";
import {
  selectChatScrollAnchor,
  selectChatScrollAnchorForTimeline,
  selectVisibleThreadTimelineEntries,
  type ChatTimelineEntry,
} from "./chatPaneSelectors";
import { normalizeChatProjectPath } from "./chatPathUtils";
import { formatElapsed } from "./formatElapsed";
import { MessageList } from "./parts/MessageList";
import { SubAgentOverlay } from "./parts/items/SubAgentOverlay";

interface ChatPaneProps {
  thread: Thread;
  hiddenRuntimeItemId?: string | undefined;
  hasSupplementaryContent?: boolean;
  layoutChangeToken?: string | null;
}

const USER_SCROLL_INTENT_MS = 750;
const EMPTY_COMPLETED_TURNS: NonNullable<
  ReturnType<typeof useAppStore.getState>["runtimeCompletedTurnsByThread"][string]
> = [];
const EMPTY_ITEM_IDS: readonly string[] = [];
const EMPTY_FILE_CHECKPOINT_TURNS: NonNullable<
  ReturnType<typeof useAppStore.getState>["fileCheckpointTurnsByThread"][string]
> = {};
const EMPTY_FILE_CHECKPOINTS: NonNullable<
  ReturnType<typeof useAppStore.getState>["fileCheckpointsByThread"][string]
> = {};

/**
 * Renderer-native chat surface for `presentationMode === "gui"` threads.
 *
 * Pulls canonical chat items from the Zustand `runtimeEventSlice` (populated
 * by IPC `thread-runtime-event` notifications) and renders them as a dense
 * vertical list. Pending approval / user-input requests are surfaced in the
 * composer (see `ThreadRuntimeRequestPanel`), not in the chat list.
 */
export function ChatPane(props: ChatPaneProps) {
  const { thread, hiddenRuntimeItemId, hasSupplementaryContent = false, layoutChangeToken } = props;
  const { id: threadId, projectId, status, worktreePath, worktreeBranch } = thread;
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollToIndexRef = useRef<ScrollToIndex | null>(null);
  const registerScrollToIndex = (handler: ScrollToIndex | null) => {
    scrollToIndexRef.current = handler;
  };
  // `scrollEl` mirrors `scrollRef.current` as React state so the virtualizer
  // in `MessageList` sees the element transition from `null` to mounted across
  // a real React render. Without this, after a drag-drop pane move the
  // virtualizer's internal observer-driven rerender can be lost and the chat
  // renders empty (with a scrollbar from `getTotalSize`) until the next state
  // change forces a recompute.
  const { setScrollContainer, scrollRef, scrollEl, scrollFadeStyle } =
    useScrollFade<HTMLDivElement>({ contentRef });
  const [initialScrollSettledThreadId, setInitialScrollSettledThreadId] = useState<string | null>(
    null,
  );
  const isInitialScrollSettled = initialScrollSettledThreadId === threadId;

  const scrollControlsRef = useRef<ChatScrollControlsHandle>(null);
  const virtualScrollToBottomRef = useRef<(() => void) | null>(null);
  const timelineEntries = useAppStore(
    useShallow((s) => selectVisibleThreadTimelineEntries(s, threadId, hiddenRuntimeItemId)),
  );
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId));
  const branch = resolveWorktreeBranch(projectId, worktreePath ?? "", worktreeBranch);
  const isHomeScope = isHomeProjectId(projectId);
  const targetContext = useMemo(
    () => (project ? buildFileEditorContext(project, worktreePath, branch) : null),
    [project, worktreePath, branch],
  );
  const projectRootNames = useProjectRootNames(
    isHomeScope ? undefined : targetContext?.projectLocation,
  );

  const paneActions: ChatPaneActions | null = useMemo(() => {
    if (!project || !targetContext || isHomeScope) return null;
    return {
      openProjectRelativePath: (path, lineNumber) => {
        void openFileInEditor(
          project,
          worktreePath,
          branch,
          normalizeChatProjectPath(path, targetContext.projectLocation),
          lineNumber,
        );
      },
      revealProjectFolderInTree: (path) => {
        const normalized = normalizeChatProjectPath(path, targetContext.projectLocation);
        const fileEditor = useFileEditorStore.getState();
        const currentRoot = fileEditor.rootContext;
        const isSameContext =
          currentRoot?.projectId === targetContext.projectId &&
          currentRoot?.worktreePath === targetContext.worktreePath;
        if (!isSameContext) {
          fileEditor.setRootContext(targetContext);
        }
        if (fileEditor.overlayMode !== "fullscreen") {
          fileEditor.setOverlayMode("modal");
        }
        const ancestors = collectPathAncestors(normalized);
        useProjectTreeStore.getState().expandMany(ancestors);
      },
      showProjectEntryInExplorer: (path) => {
        const normalized = normalizeChatProjectPath(path, targetContext.projectLocation);
        void readBridge().revealProjectEntry({
          projectLocation: targetContext.projectLocation,
          path: normalized,
        });
      },
      onContentHeightChange: () => scrollControlsRef.current?.onContentHeightChange(),
      isStickToBottom: () => scrollControlsRef.current?.isStickToBottom() ?? false,
      registerVirtualScrollToBottom: (handler) => {
        virtualScrollToBottomRef.current = handler;
      },
      projectLocation: targetContext.projectLocation,
      projectRootNames,
    };
  }, [project, targetContext, isHomeScope, branch, worktreePath, projectRootNames]);

  useEffect(() => {
    void hydrateThreadRuntimeItems(threadId);
  }, [threadId]);

  useEffect(() => {
    if (!targetContext || isHomeScope) return;
    void hydrateFileCheckpoints({
      threadId,
      projectLocation: targetContext.projectLocation,
    });
  }, [isHomeScope, targetContext, threadId]);

  const completedTurns = useAppStore(
    (s) => s.runtimeCompletedTurnsByThread[threadId] ?? EMPTY_COMPLETED_TURNS,
  );
  const fileCheckpointTurns = useAppStore(
    (s) => s.fileCheckpointTurnsByThread[threadId] ?? EMPTY_FILE_CHECKPOINT_TURNS,
  );
  const fileCheckpoints = useAppStore(
    (s) => s.fileCheckpointsByThread[threadId] ?? EMPTY_FILE_CHECKPOINTS,
  );
  const finalizingFileCheckpointIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!targetContext || isHomeScope || completedTurns.length === 0) return;
    for (const turn of completedTurns) {
      const checkpointItemId = turn.anchorItemId;
      if (!checkpointItemId) continue;
      if (fileCheckpointTurns[checkpointItemId]) continue;
      if (finalizingFileCheckpointIdsRef.current.has(checkpointItemId)) continue;
      const state = useAppStore.getState();
      const runtimeItemIds = state.runtimeItemIdsByThread[threadId] ?? EMPTY_ITEM_IDS;
      const runtimeItemsById = state.runtimeItemsByIdByThread[threadId];
      const baseCheckpointItemId = findBaseCheckpointItemId(
        runtimeItemIds,
        runtimeItemsById,
        checkpointItemId,
      );
      if (!baseCheckpointItemId) continue;
      if (!fileCheckpoints[baseCheckpointItemId]) continue;
      finalizingFileCheckpointIdsRef.current.add(checkpointItemId);
      void finalizeFileCheckpoint({
        threadId,
        checkpointItemId,
        baseCheckpointItemId,
        projectLocation: targetContext.projectLocation,
      }).finally(() => {
        finalizingFileCheckpointIdsRef.current.delete(checkpointItemId);
      });
    }
  }, [completedTurns, fileCheckpoints, fileCheckpointTurns, isHomeScope, targetContext, threadId]);

  const isEmpty = timelineEntries.length === 0 && !hasSupplementaryContent;
  const isLive = isThreadTurnActive(status);
  // A detached background workflow keeps the thread doing real work after the
  // foreground turn settles. Treat that as "still working" for the tail-loader
  // timer (so it keeps ticking "Working for ...") without touching `status` -
  // composer interrupt/steer and notifications stay on the raw status.
  const hasLiveWorkflow = useThreadHasLiveWorkflow(threadId);
  const showWorkingTimer = isLive || hasLiveWorkflow;
  const hasOpenRuntimeRequest = useAppStore(
    (s) => (s.runtimeRequestsByThread[threadId]?.length ?? 0) > 0,
  );
  // Anchor on thread.status alone — gating on item state caused the loader to
  // disappear in the gap between an item flipping to `completed` and the next
  // `item.started` arriving, even though the runtime was still working the
  // turn.
  const turn = resolveTurnTiming(thread, showWorkingTimer);
  const mostRecentDisplayableCompletedTurn = useAppStore((s) =>
    showWorkingTimer
      ? null
      : selectMostRecentDisplayableCompletedTurn(s.runtimeCompletedTurnsByThread[threadId]),
  );
  const mostRecentCompletedTurnAnchor = mostRecentDisplayableCompletedTurn?.anchorItemId ?? null;
  const completedTurnCanRenderInTail =
    !showWorkingTimer &&
    (turn?.endedAt != null || mostRecentDisplayableCompletedTurn !== null) &&
    isCompletedTurnAnchorAtTimelineTail(mostRecentCompletedTurnAnchor, timelineEntries);
  const tailTurn =
    completedTurnCanRenderInTail && mostRecentDisplayableCompletedTurn
      ? mostRecentDisplayableCompletedTurn
      : turn;
  const showTailLoader = showWorkingTimer || completedTurnCanRenderInTail;
  // The agent is not actually working while it waits for a user answer, so the
  // tail loader keeps rendering but its elapsed-time counter freezes for the
  // duration of the wait and resumes once the user submits a response. Anchor
  // on `hasOpenRuntimeRequest` (cleared optimistically by the request panel)
  // rather than `thread.status`, which only flips back to `working` after the
  // supervisor's round-trip — for plan approvals the agent often opens a new
  // request before that round-trip completes, leaving status stuck at
  // `needs_approval` even though the user has already answered.
  const isTurnPaused = hasOpenRuntimeRequest;
  const showEmptyHint = isEmpty && !isLive;
  // The tail loader displays the most recent completed turn's frozen elapsed
  // time when the thread is idle and no newer timeline row exists. Once an
  // optimistic next prompt is appended, keep the completed indicator inline at
  // its anchor so the prompt does not briefly occupy the old footer position.
  const suppressInlineTurnAnchorId = completedTurnCanRenderInTail
    ? mostRecentCompletedTurnAnchor
    : null;
  const checkpointGuard = useAppStore(
    useShallow((s) =>
      resolveCheckpointGuard({
        threads: s.threads,
        threadId,
        projectId,
        worktreePath,
      }),
    ),
  );

  return (
    <ChatPaneActionsContext.Provider value={paneActions}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative min-h-0 flex-1">
          <div
            ref={setScrollContainer}
            data-lightcode-chat-scroller="true"
            className="min-h-0 h-full overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
            style={scrollFadeStyle}
            onWheelCapture={(event) => {
              if (event.deltaY < 0) {
                scrollControlsRef.current?.markUserScrollIntent();
                scrollControlsRef.current?.disableStickToBottom();
              }
            }}
            onPointerDownCapture={() => {
              scrollControlsRef.current?.markUserScrollIntent();
            }}
            onKeyDownCapture={(event) => {
              if (isScrollNavigationKey(event.key)) {
                scrollControlsRef.current?.markUserScrollIntent();
              }
            }}
          >
            <div
              ref={contentRef}
              className={`min-h-full pb-2 ${isInitialScrollSettled ? "" : "pointer-events-none opacity-0"}`}
            >
              {isEmpty && !showTailLoader ? (
                showEmptyHint ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-foreground-muted">
                    <span>
                      <Trans>No messages yet</Trans>
                    </span>
                  </div>
                ) : null
              ) : (
                <>
                  <MessageList
                    key={threadId}
                    threadId={threadId}
                    entries={timelineEntries}
                    scrollElement={scrollEl}
                    registerScrollToIndex={registerScrollToIndex}
                    suppressInlineTurnAnchorId={suppressInlineTurnAnchorId}
                    canRevertCheckpoints={!isLive && !isHomeScope}
                    checkpointGuard={checkpointGuard}
                    projectLocation={isHomeScope ? undefined : targetContext?.projectLocation}
                  />
                  {showTailLoader && tailTurn ? (
                    <ChatTailLoader turn={tailTurn} isPaused={isTurnPaused} />
                  ) : null}
                </>
              )}
            </div>
          </div>
          <ChatScrollControls
            ref={scrollControlsRef}
            scrollRef={scrollRef}
            contentRef={contentRef}
            hiddenRuntimeItemId={hiddenRuntimeItemId}
            layoutChangeToken={layoutChangeToken}
            threadId={threadId}
            tailLoaderVisible={showTailLoader}
            initialScrollSettled={isInitialScrollSettled}
            virtualScrollToBottomRef={virtualScrollToBottomRef}
            onInitialScrollSettled={() => setInitialScrollSettledThreadId(threadId)}
          />
          <SubAgentOverlay
            threadId={threadId}
            {...(project ? { projectLocation: project.location } : {})}
          />
          <ChatFindBar
            threadId={threadId}
            scrollToIndexRef={scrollToIndexRef}
            scrollElement={scrollEl}
          />
        </div>
      </div>
    </ChatPaneActionsContext.Provider>
  );
}

type ChatScrollControlsHandle = {
  disableStickToBottom(): void;
  isStickToBottom(): boolean;
  markUserScrollIntent(): void;
  onContentHeightChange(): void;
};

const ChatScrollControls = forwardRef<
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

interface TurnTiming {
  startedAt: number;
  endedAt: number | null;
}

interface CompletedTurnTiming extends TurnTiming {
  anchorItemId: string | null;
  endedAt: number;
}

function parseTurnTimestamp(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Derives the current or last completed run window from persisted thread timing
 * so reopening a thread doesn't reseed the footer timer from mount time.
 */
function resolveTurnTiming(thread: Thread, forceLive = false): TurnTiming | null {
  const isLive = forceLive || isThreadTurnActive(thread.status);

  if (isLive) {
    // When only a background workflow keeps the thread live, the foreground
    // turn has ended and `activeTurnStartedAt` is cleared - fall back to the
    // just-completed turn's start so the timer continues from there instead of
    // reseeding at mount time.
    const startedAt = parseTurnTimestamp(
      thread.activeTurnStartedAt ?? thread.lastTurnStartedAt ?? thread.createdAt,
    );
    return startedAt === null ? null : { startedAt, endedAt: null };
  }

  const startedAt = parseTurnTimestamp(thread.lastTurnStartedAt);
  const endedAt = parseTurnTimestamp(thread.lastTurnEndedAt);
  if (startedAt === null || endedAt === null) {
    return null;
  }

  return {
    startedAt,
    endedAt: Math.max(startedAt, endedAt),
  };
}

function selectMostRecentDisplayableCompletedTurn(
  records: readonly CompletedTurnTiming[] | undefined,
): CompletedTurnTiming | null {
  if (!records) return null;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]!;
    if (record.endedAt - record.startedAt >= 1000) return record;
  }
  return null;
}

function ChatTailLoader({ turn, isPaused }: { turn: TurnTiming; isPaused: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[920px]">
      <Surface variant="transparent" className={chatMessageSurfaceClass}>
        <div className="inline-flex items-center gap-1.5 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
          <WorkingFor turn={turn} isPaused={isPaused} />
        </div>
      </Surface>
    </div>
  );
}

/**
 * Self-ticking elapsed-time label. While `turn.endedAt` is null, ticks every
 * second as "Working for N"; once set, freezes as "Worked for N". When
 * `isPaused` is true (e.g. the runtime is blocked on a user-input prompt) the
 * counter freezes at its current value and the paused interval is excluded
 * from the elapsed total once it resumes. Mutates `textContent` directly via
 * a ref instead of calling `setState` so the per-second tick produces zero
 * React commits — important while the rest of the chat is potentially
 * streaming.
 */
function WorkingFor({ turn, isPaused }: { turn: TurnTiming; isPaused: boolean }) {
  const { t } = useLingui();
  const textRef = useRef<HTMLSpanElement>(null);
  const pauseStateRef = useRef<{ accumulatedPauseMs: number; pausedSinceMs: number | null }>({
    accumulatedPauseMs: 0,
    pausedSinceMs: null,
  });

  useEffect(() => {
    pauseStateRef.current = { accumulatedPauseMs: 0, pausedSinceMs: null };
  }, [turn.startedAt, turn.endedAt]);

  useEffect(() => {
    const update = () => {
      const node = textRef.current;
      if (!node) return;
      if (turn.endedAt !== null) {
        const elapsedSeconds = Math.max(0, Math.floor((turn.endedAt - turn.startedAt) / 1000));
        const elapsed = formatElapsed(elapsedSeconds);
        const text = elapsedSeconds < 1 ? "" : t`Worked for ${elapsed}`;
        node.textContent = text;
        node.dataset.lightcodeShimmerText = text;
        return;
      }
      const pauseState = pauseStateRef.current;
      const now = Date.now();
      const currentPauseMs =
        pauseState.pausedSinceMs !== null ? Math.max(0, now - pauseState.pausedSinceMs) : 0;
      const elapsedMs = now - turn.startedAt - pauseState.accumulatedPauseMs - currentPauseMs;
      const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const elapsed = formatElapsed(elapsedSeconds);
      const text = elapsedSeconds < 1 ? "" : t`Working for ${elapsed}`;
      node.textContent = text;
      node.dataset.lightcodeShimmerText = text;
    };

    if (isPaused) {
      if (pauseStateRef.current.pausedSinceMs === null) {
        pauseStateRef.current.pausedSinceMs = Date.now();
      }
      update();
      return;
    }

    if (pauseStateRef.current.pausedSinceMs !== null) {
      pauseStateRef.current.accumulatedPauseMs += Math.max(
        0,
        Date.now() - pauseStateRef.current.pausedSinceMs,
      );
      pauseStateRef.current.pausedSinceMs = null;
    }
    update();
    if (turn.endedAt !== null) return;
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [turn.startedAt, turn.endedAt, isPaused, t]);

  const isThinking = !isPaused && turn.endedAt === null;
  useShimmerRef(textRef, isThinking);
  const className = isThinking ? "lightcode-thinking-text" : "text-muted";
  return <span ref={textRef} className={className} aria-live="polite" />;
}

function isScrollNavigationKey(key: string): boolean {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "PageUp" ||
    key === "PageDown" ||
    key === "Home" ||
    key === "End" ||
    key === " "
  );
}

/** ["", "src", "src/foo", "src/foo/bar"] for "src/foo/bar". Empty string is the tree root. */
function collectPathAncestors(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const ancestors: string[] = [""];
  for (let i = 0; i < segments.length; i++) {
    ancestors.push(segments.slice(0, i + 1).join("/"));
  }
  return ancestors;
}

function isCompletedTurnAnchorAtTimelineTail(
  anchorItemId: string | null,
  entries: readonly ChatTimelineEntry[],
): boolean {
  if (anchorItemId === null || entries.length === 0) return true;
  const lastEntry = entries[entries.length - 1]!;
  return lastEntry.kind === "item"
    ? lastEntry.id === anchorItemId
    : lastEntry.itemIds.includes(anchorItemId);
}

type CheckpointGuard = {
  scopeLabel: string;
  hasSharedTree: boolean;
  sharedThreadCount: number;
};

function resolveCheckpointGuard(input: {
  threads: readonly Thread[];
  threadId: string;
  projectId: string;
  worktreePath?: string | undefined;
}): CheckpointGuard {
  const treeKey = checkpointTreeKey(input.projectId, input.worktreePath);
  const sharedThreadCount = input.threads.filter(
    (thread) =>
      thread.id !== input.threadId &&
      !thread.archived &&
      checkpointTreeKey(thread.projectId, thread.worktreePath) === treeKey,
  ).length;
  return {
    scopeLabel: input.worktreePath ? "this worktree" : "the main project tree",
    hasSharedTree: sharedThreadCount > 0,
    sharedThreadCount,
  };
}

function checkpointTreeKey(projectId: string, worktreePath: string | undefined): string {
  return `${projectId}\0${worktreePath ?? ""}`;
}

function findBaseCheckpointItemId(
  itemIds: readonly string[],
  itemsById:
    | ReturnType<typeof useAppStore.getState>["runtimeItemsByIdByThread"][string]
    | undefined,
  checkpointItemId: string,
): string | null {
  const checkpointIndex = itemIds.indexOf(checkpointItemId);
  if (checkpointIndex < 0) return null;
  for (let idx = checkpointIndex; idx >= 0; idx -= 1) {
    const itemId = itemIds[idx]!;
    if (itemsById?.[itemId]?.type === "user_message") return itemId;
  }
  return null;
}
