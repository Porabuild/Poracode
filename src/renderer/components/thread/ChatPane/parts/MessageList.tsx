import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Surface } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { MessageItemPayload, ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { isIosTouchScroll } from "@/renderer/utils/iosScroll";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getRuntimeItemPayload,
  type CompletedTurnRecord,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import {
  DEFAULT_CHECKPOINT_GUARD,
  RevertCheckpointDialog,
  type CheckpointGuard,
} from "./CheckpointRevertControls";
import { formatElapsed } from "../formatElapsed";
import { useChatPaneActions } from "../chatPaneActionsContext";
import {
  growingStreamLength,
  selectCompletedTurnForEntry,
  selectRuntimeItemById,
  type ChatTimelineEntry,
} from "../chatPaneSelectors";
import { ChatItemRow } from "./items/ChatItemRow";
import { chatMessageSurfaceClass } from "./items/chatMessageSurface";
import { imageViewRendersInline } from "./items/imageViewSource";
import { isToolLikeItem } from "./items/toolCallCategorization";
import {
  getTimelineMeasurementSignature,
  readTimelineMeasurements,
  writeTimelineMeasurements,
} from "./timelineMeasurementCache";
import { BOTTOM_EPSILON_PX } from "../chatScrollGeometry";

export interface CheckpointRevertActions {
  rollbackThreadConversation(input: { threadId: string; numTurns: number }): Promise<void>;
  restoreFileCheckpoint(input: {
    threadId: string;
    checkpointItemId: string;
    projectLocation: ProjectLocation;
  }): Promise<void>;
}

interface MessageListProps {
  threadId: string;
  entries: readonly ChatTimelineEntry[];
  isTurnActive?: boolean;
  scrollElement: HTMLDivElement | null;
  /**
   * Reverting is transcript-local today. Disable it while a turn is live so
   * late provider events cannot append onto a truncated timeline.
   */
  canRevertCheckpoints?: boolean;
  checkpointGuard?: CheckpointGuard;
  checkpointActions?: CheckpointRevertActions | undefined;
  projectLocation?: ProjectLocation | undefined;
  /**
   * If set, the inline "Worked for X" indicator anchored to this item id is
   * suppressed because the parent tail loader is already showing it (matches
   * the most recent completed turn while the thread is idle).
   */
  suppressInlineTurnAnchorId?: string | null;
  /**
   * Lets the chat Find controller drive the virtualizer to scroll a matched
   * row into the rendered window before highlighting it. Registered with the
   * live handler on mount, null on unmount.
   */
  registerScrollToIndex?: (
    handler: ((index: number, options?: { align?: "start" | "center" | "end" }) => void) | null,
  ) => void;
}

// Trackpad deltas can jump farther than a viewport before React commits the
// next virtual range. Keep a larger item-count band mounted so fast scrolls do
// not expose the spacer before rows render.
const CHAT_TRANSCRIPT_OVERSCAN = 16;
const DEFAULT_ROW_ESTIMATE_PX = 96;
const INLINE_IMAGE_ROW_ESTIMATE_PX = 320;
const ASSISTANT_IMAGE_ROW_ESTIMATE_PX = 384;
// A collapsed tool/command/file/search row — and a collapsed tool-call group —
// renders a single accordion/disclosure trigger: `chatRowClass`'s `py-1` (8px)
// wrapping command-size text with `leading-tight` (~15px at the 13px default),
// plus the virtual row wrapper's `pb-1` (4px) ≈ 27px. Groups are only expanded
// while they are the live tail (measured immediately), so collapsed is the
// right default. This was 64 (group) / 56 (items) — a ~2x over-estimate that
// fed a large estimate→measure delta into scroll compensation on scrollback.
const COLLAPSED_ROW_ESTIMATE_PX = 28;
// The completed reasoning "Thought" toggle is a custom row (not the accordion):
// `py-2` (16px) around a single ~12px icon/label line (`size-3` icons,
// `leading-none`), plus the virtual row wrapper's `pb-1` (4px) ≈ 32px. Was 52.
const COLLAPSED_REASONING_ROW_ESTIMATE_PX = 32;
const SKIP_REVERT_CONFIRM_PREF_KEY = "poracode-chat-checkpoint-revert-skip-confirm";
// How long the iOS scroll-compensation flush waits for momentum to idle before
// applying the buffered delta. Matches @tanstack/virtual-core's
// `isScrollingResetDelay` (150ms) so it fires right as the virtualizer itself
// considers the scroll settled.
const COMPENSATION_SETTLE_MS = 150;

// Intentionally not wrapped in `React.memo`: pane swaps preserve this fiber
// while moving the DOM, so the virtualizer must re-render to re-measure.
export function MessageList({
  threadId,
  entries,
  isTurnActive = false,
  scrollElement,
  canRevertCheckpoints = true,
  checkpointGuard,
  checkpointActions,
  projectLocation,
  suppressInlineTurnAnchorId = null,
  registerScrollToIndex,
}: MessageListProps) {
  const hasItems = entries.length > 0;
  const parentActions = useChatPaneActions();
  const virtualSizeBoxRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollCompensationRef = useRef(0);
  // iOS WebKit cancels an in-flight momentum scroll the instant any
  // programmatic `scrollTop` write lands, so the per-commit compensation write
  // below makes a flick-up "stop" each time a row above the viewport trades its
  // estimated height for a real one. On iOS we instead buffer that delta while a
  // backward momentum scroll is in flight and flush it in a single write once
  // the gesture settles. Captured once: the form factor never changes at runtime.
  const deferScrollCompensation = useRef(isIosTouchScroll()).current;
  const isCompensationDeferredRef = useRef(false);
  const compensationFlushTimerRef = useRef<number | null>(null);
  const scheduleCompensationFlushRef = useRef<(() => void) | null>(null);
  const [pendingRevertItemId, setPendingRevertItemId] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [initialMeasurementSignature] = useState(() =>
    getTimelineMeasurementSignature(scrollElement),
  );
  const [initialMeasurementsCache] = useState(() =>
    readTimelineMeasurements(threadId, initialMeasurementSignature),
  );
  const measurementSignatureRef = useRef(initialMeasurementSignature);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: useCallback(() => scrollElement, [scrollElement]),
    estimateSize: useCallback(
      (index: number) => {
        const entry = entries[index];
        return estimateTimelineEntrySize(entry, threadId);
      },
      [entries, threadId],
    ),
    getItemKey: useCallback((index: number) => entries[index]?.id ?? index, [entries]),
    overscan: CHAT_TRANSCRIPT_OVERSCAN,
    useFlushSync: true,
    // On iOS the rAF-wrapped ResizeObserver adds ~16ms of latency that desyncs a
    // remeasure from the momentum frame for no benefit (TanStack's own default is
    // off). Keep it on elsewhere — it's load-bearing nowhere else and flipping it
    // for everyone is out of scope for this fix.
    useAnimationFrameWithResizeObserver: !deferScrollCompensation,
    // Force the first range calculation to the tail. A fixed overshoot avoids
    // both an extra estimation pass and a mismatch when restored measurements
    // are taller than the current estimates.
    initialOffset: () => Number.MAX_SAFE_INTEGER,
    initialMeasurementsCache,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: BOTTOM_EPSILON_PX,
  });

  useLayoutEffect(() => {
    const signature = getTimelineMeasurementSignature(scrollElement);
    if (measurementSignatureRef.current === null) {
      measurementSignatureRef.current = signature;
    }
    return () => {
      const cacheSignature = measurementSignatureRef.current;
      if (!cacheSignature || getTimelineMeasurementSignature(scrollElement) !== cacheSignature) {
        return;
      }
      const state = useAppStore.getState();
      const measurements = virtualizer
        .takeSnapshot()
        .filter((measurement) =>
          isRemountStableSnapshotItem(
            selectRuntimeItemById(state, threadId, String(measurement.key)),
          ),
        );
      writeTimelineMeasurements(threadId, cacheSignature, measurements);
    };
  }, [scrollElement, threadId, virtualizer]);

  useLayoutEffect(() => {
    if (!parentActions?.registerVirtualScrollToBottom) return;
    parentActions.registerVirtualScrollToBottom(() => {
      if (entries.length === 0) return;
      virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
    });
    return () => parentActions.registerVirtualScrollToBottom?.(null);
  }, [entries.length, parentActions, virtualizer]);

  useLayoutEffect(() => {
    if (!registerScrollToIndex) return;
    registerScrollToIndex((index, options) => {
      if (index < 0 || index >= entries.length) return;
      virtualizer.scrollToIndex(index, options ?? { align: "center" });
    });
    return () => registerScrollToIndex(null);
  }, [entries.length, registerScrollToIndex, virtualizer]);

  useLayoutEffect(() => {
    // Compensate when a row above a user-controlled scrollback window trades
    // its estimate for a real measurement. End-pinned growth is owned by
    // TanStack's native anchor; scrollback corrections stay synchronous with
    // our row commit so they do not paint a frame apart from the height change.
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, delta, instance) => {
      if (!scrollElement) return false;
      const isAboveViewport = item.start + item.size <= scrollElement.scrollTop;
      const stickToBottom = parentActions?.isStickToBottom?.() === true;
      const hasIntent = parentActions?.hasRecentUserScrollIntent?.() === true;
      // Sticky / in-viewport measure while the user is scrolling away must not
      // write scrollTop — that yanks a thumb/wheel drag back toward the bottom.
      // Above-viewport deltas are different: they keep the same pixels on screen
      // when an estimated row mounts shorter/taller, so they must still apply
      // (synchronously) or scroll-back jumps.
      if (hasIntent && (stickToBottom || !isAboveViewport)) {
        return false;
      }
      // Native end anchoring owns sticky row growth. Keep the custom buffered
      // compensation only for rows above a user-controlled scrollback window.
      if (!stickToBottom && isAboveViewport) {
        pendingScrollCompensationRef.current += delta;
        // Defer above-viewport corrections only for momentum coasts without a
        // hard intent flag (iOS / trackpad). While intent is active we apply
        // above-viewport deltas in the same frame as the measure.
        if (!hasIntent && instance?.isScrolling && instance.scrollDirection === "backward") {
          isCompensationDeferredRef.current = true;
        }
      }
      return false;
    };
    return () => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [parentActions, scrollElement, virtualizer]);

  // Intentionally dependency-free: runs after every commit, once row refs have
  // synchronously measured newly mounted rows, so the scroll correction lands
  // before the browser paints the row's real height.
  useLayoutEffect(() => {
    if (pendingScrollCompensationRef.current === 0 || !scrollElement) return;
    // Buffered deltas are held until the gesture settles (see the effect below)
    // so the write never lands mid-momentum. Sticky / intent above-viewport
    // corrections still apply synchronously, in the same paint as the measure.
    if (isCompensationDeferredRef.current) {
      // Arm the settle flush from the commit itself, not just from scroll
      // events — so a deferral set on the final scroll tick of a coast (where no
      // further scroll arrives to re-arm) is still flushed once activity idles,
      // even on platforms without `scrollend`.
      scheduleCompensationFlushRef.current?.();
      return;
    }
    parentActions?.noteProgrammaticScroll?.(
      scrollElement.scrollTop + pendingScrollCompensationRef.current,
    );
    scrollElement.scrollTop += pendingScrollCompensationRef.current;
    pendingScrollCompensationRef.current = 0;
  });

  // Apply buffered scroll compensation in a single write once an upward scroll
  // has settled. A `scroll`-idle debounce covers both a short flick and a long
  // inertial coast; `scrollend` gives a crisper signal when available. Sticky
  // corrections never enter this path (they stay synchronous above).
  useLayoutEffect(() => {
    if (!scrollElement) return;
    const flushCompensation = () => {
      if (compensationFlushTimerRef.current !== null) {
        clearTimeout(compensationFlushTimerRef.current);
        compensationFlushTimerRef.current = null;
      }
      if (pendingScrollCompensationRef.current === 0) {
        isCompensationDeferredRef.current = false;
        return;
      }
      // Intent still active — keep any leftover buffer and retry after settle.
      // Do not discard: that used to jump scroll-back when estimate→measure
      // shrinks landed above the viewport with no compensation.
      if (parentActions?.hasRecentUserScrollIntent?.()) {
        isCompensationDeferredRef.current = true;
        if (compensationFlushTimerRef.current === null) {
          compensationFlushTimerRef.current = window.setTimeout(
            flushCompensation,
            COMPENSATION_SETTLE_MS,
          );
        }
        return;
      }
      isCompensationDeferredRef.current = false;
      parentActions?.noteProgrammaticScroll?.(
        scrollElement.scrollTop + pendingScrollCompensationRef.current,
      );
      scrollElement.scrollTop += pendingScrollCompensationRef.current;
      pendingScrollCompensationRef.current = 0;
    };
    const scheduleFlush = () => {
      if (!isCompensationDeferredRef.current) return;
      if (compensationFlushTimerRef.current !== null) {
        clearTimeout(compensationFlushTimerRef.current);
      }
      // Re-armed on every scroll tick, so it only fires once momentum truly idles.
      compensationFlushTimerRef.current = window.setTimeout(
        flushCompensation,
        COMPENSATION_SETTLE_MS,
      );
    };
    scheduleCompensationFlushRef.current = scheduleFlush;
    scrollElement.addEventListener("scroll", scheduleFlush, { passive: true });
    scrollElement.addEventListener("scrollend", flushCompensation);
    if (deferScrollCompensation) {
      // iOS: a new touchstart itself cancels any in-flight momentum — flush then
      // so visible drift is bounded to a single gesture.
      scrollElement.addEventListener("touchstart", flushCompensation, { passive: true });
    }
    return () => {
      scheduleCompensationFlushRef.current = null;
      scrollElement.removeEventListener("scroll", scheduleFlush);
      scrollElement.removeEventListener("scrollend", flushCompensation);
      if (deferScrollCompensation) {
        scrollElement.removeEventListener("touchstart", flushCompensation);
      }
      if (compensationFlushTimerRef.current !== null) {
        clearTimeout(compensationFlushTimerRef.current);
        compensationFlushTimerRef.current = null;
      }
      // Don't strand a buffered delta when the thread unmounts mid-flick.
      if (pendingScrollCompensationRef.current !== 0) {
        parentActions?.noteProgrammaticScroll?.(
          scrollElement.scrollTop + pendingScrollCompensationRef.current,
        );
        scrollElement.scrollTop += pendingScrollCompensationRef.current;
        pendingScrollCompensationRef.current = 0;
      }
    };
  }, [deferScrollCompensation, parentActions, scrollElement]);

  useLayoutEffect(() => {
    const virtualSizeBox = virtualSizeBoxRef.current;
    if (!virtualSizeBox) return;

    const selectLastItemIsAssistantMessage = (state: AppStoreState) =>
      isLastTimelineEntryAssistantMessage(state, threadId, entries);
    const updateBottomMask = (lastItemIsAssistantMessage: boolean) => {
      virtualSizeBox.style.setProperty(
        "--lc-chat-bottom-mask-end-alpha",
        lastItemIsAssistantMessage ? "0" : "1",
      );
      virtualSizeBox.dataset.bottomFadeVisible = lastItemIsAssistantMessage ? "true" : "false";
    };

    updateBottomMask(selectLastItemIsAssistantMessage(useAppStore.getState()));
    return useAppStore.subscribe(selectLastItemIsAssistantMessage, updateBottomMask);
  }, [entries, threadId]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const firstVisibleStart = virtualItems[0]?.start ?? 0;

  // The "live tail" index drives the auto-expand on `ToolCallGroup`. Trailing
  // empty/in-flight reasoning items don't count: an agent emitting a reasoning
  // bracket between tool calls would otherwise collapse the group prematurely
  // (and it often completes empty and gets dropped, causing a flicker). Only
  // once reasoning actually has text — or any other item arrives — does the
  // previous group lose its live status.
  const liveTailSelector = useCallback(
    (state: AppStoreState) => computeLiveTailIndex(state, threadId, entries),
    [entries, threadId],
  );
  const lastLiveIndex = useAppStore(liveTailSelector);

  const measureRowElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element && element.dataset.index !== String(index)) {
        // TanStack reads data-index during measurement; keep reused rows aligned.
        element.dataset.index = String(index);
      }
      // Register with TanStack's ResizeObserver cache. measureElement skips
      // resizeItem while isScrolling, so scroll-back still needs a forced sync
      // size — but only one offsetHeight read (the old path measured twice).
      virtualizer.measureElement(element);
      if (!element) return;
      virtualizer.resizeItem(index, element.offsetHeight);
    },
    [virtualizer],
  );

  const performRevert = useCallback(
    async (itemId: string) => {
      const state = useAppStore.getState();
      const itemIds = state.runtimeItemIdsByThread[threadId];
      const itemsById = state.runtimeItemsByIdByThread[threadId];
      const completedTurns = state.runtimeCompletedTurnsByThread[threadId] ?? [];
      const checkpoint = state.fileCheckpointsByThread[threadId]?.[itemId];
      const rollbackTurns =
        itemIds && itemsById
          ? countRollbackTurnsAfterCheckpoint(itemIds, itemsById, completedTurns, itemId)
          : 0;
      const revert = checkpointActions ?? readBridge();
      if (rollbackTurns > 0) {
        try {
          await revert.rollbackThreadConversation({ threadId, numTurns: rollbackTurns });
        } catch (error) {
          console.warn(
            "[checkpoint] provider rollback failed; continuing with local revert",
            error,
          );
        }
      }
      if (projectLocation && checkpoint) {
        await revert.restoreFileCheckpoint({
          threadId,
          checkpointItemId: itemId,
          projectLocation,
        });
      }
      state.truncateThreadRuntimeAfter(threadId, itemId);
      await readBridge().dbTruncateThreadRuntimeAfter({ threadId, itemId });
      parentActions?.onContentHeightChange();
    },
    [checkpointActions, parentActions, projectLocation, threadId],
  );

  const requestRevert = useCallback(
    (itemId: string) => {
      if (localStorage.getItem(SKIP_REVERT_CONFIRM_PREF_KEY) === "1") {
        void performRevert(itemId).catch((error) => {
          console.warn("[checkpoint] failed to revert checkpoint", error);
        });
        return;
      }
      setDontAskAgain(false);
      setRevertError(null);
      setPendingRevertItemId(itemId);
    },
    [performRevert],
  );

  const closeRevertDialog = useCallback(() => {
    setPendingRevertItemId(null);
    setDontAskAgain(false);
    setRevertError(null);
  }, []);

  const confirmRevert = useCallback(() => {
    if (!pendingRevertItemId) return;
    setRevertError(null);
    void performRevert(pendingRevertItemId)
      .then(() => {
        if (dontAskAgain) {
          localStorage.setItem(SKIP_REVERT_CONFIRM_PREF_KEY, "1");
        }
        setPendingRevertItemId(null);
        setDontAskAgain(false);
      })
      .catch((error) => {
        console.warn("[checkpoint] failed to revert checkpoint", error);
        setRevertError(error instanceof Error ? error.message : String(error));
      });
  }, [dontAskAgain, pendingRevertItemId, performRevert]);

  const pendingCheckpoint = useAppStore((state) =>
    pendingRevertItemId
      ? state.fileCheckpointsByThread[threadId]?.[pendingRevertItemId]
      : undefined,
  );

  if (!hasItems) return null;

  return (
    <>
      <div className="mx-auto w-full max-w-[920px] pb-1">
        <div
          ref={virtualSizeBoxRef}
          data-chat-virtual-size-box="true"
          data-bottom-fade-visible="true"
          className="relative w-full overflow-hidden [--lc-chat-bottom-mask-end-alpha:0]"
          style={{
            height: totalSize,
            WebkitMaskImage:
              "linear-gradient(to bottom, black calc(100% - 14px), rgb(0 0 0 / var(--lc-chat-bottom-mask-end-alpha, 0)))",
            maskImage:
              "linear-gradient(to bottom, black calc(100% - 14px), rgb(0 0 0 / var(--lc-chat-bottom-mask-end-alpha, 0)))",
            transition: "--lc-chat-bottom-mask-end-alpha 150ms ease-out",
          }}
        >
          <div
            data-chat-virtual-block="true"
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${firstVisibleStart}px)` }}
          >
            {virtualItems.map((virtualRow) => {
              const entry = entries[virtualRow.index];
              if (!entry) return null;
              return (
                <VirtualChatListRow
                  key={virtualRow.key}
                  threadId={threadId}
                  entry={entry}
                  index={virtualRow.index}
                  isLastEntry={virtualRow.index === lastLiveIndex}
                  isTurnActive={isTurnActive}
                  measureElement={measureRowElement}
                  suppressInlineTurnAnchorId={suppressInlineTurnAnchorId}
                  canRevertCheckpoints={canRevertCheckpoints}
                  onRequestRevert={requestRevert}
                />
              );
            })}
          </div>
        </div>
      </div>
      <RevertCheckpointDialog
        isOpen={pendingRevertItemId !== null}
        dontAskAgain={dontAskAgain}
        checkpointGuard={checkpointGuard ?? DEFAULT_CHECKPOINT_GUARD}
        canRestoreFiles={projectLocation !== undefined && pendingCheckpoint !== undefined}
        errorMessage={revertError ?? undefined}
        onDontAskAgainChange={setDontAskAgain}
        onClose={closeRevertDialog}
        onConfirm={confirmRevert}
      />
    </>
  );
}

type VirtualChatListRowProps = {
  threadId: string;
  entry: ChatTimelineEntry;
  index: number;
  isLastEntry: boolean;
  isTurnActive: boolean;
  measureElement: (index: number, element: HTMLDivElement | null) => void;
  suppressInlineTurnAnchorId: string | null;
  canRevertCheckpoints: boolean;
  onRequestRevert: (itemId: string) => void;
};

const VirtualChatListRow = memo(function VirtualChatListRow({
  threadId,
  entry,
  index,
  isLastEntry,
  isTurnActive,
  measureElement,
  suppressInlineTurnAnchorId,
  canRevertCheckpoints,
  onRequestRevert,
}: VirtualChatListRowProps) {
  const rowElementRef = useRef<HTMLDivElement | null>(null);
  const liveMeasureRafRef = useRef<number | null>(null);
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      rowElementRef.current = element;
      measureElement(index, element);
    },
    [index, measureElement],
  );
  const scheduleLiveMeasure = useCallback(() => {
    if (liveMeasureRafRef.current !== null) return;
    liveMeasureRafRef.current = requestAnimationFrame(() => {
      liveMeasureRafRef.current = null;
      const element = rowElementRef.current;
      if (!element) return;
      measureElement(index, element);
    });
  }, [index, measureElement]);
  useLayoutEffect(() => {
    if (!isLastEntry) return;
    return useAppStore.subscribe(
      (state) => {
        const items = state.runtimeItemsByIdByThread[threadId];
        if (entry.kind === "item") return liveStreamMeasureToken(items?.[entry.id]);
        // A live tool-call group can hold a streaming row (e.g. reasoning
        // expanded while the model thinks) that grows the virtualized row.
        // Scan from the tail — the streaming row is the newest, so the loop
        // short-circuits without walking the completed rows above it.
        for (let i = entry.itemIds.length - 1; i >= 0; i -= 1) {
          const token = liveStreamMeasureToken(items?.[entry.itemIds[i]!]);
          if (token !== null) return token;
        }
        return null;
      },
      (token) => {
        if (token !== null) scheduleLiveMeasure();
      },
    );
  }, [entry, isLastEntry, scheduleLiveMeasure, threadId]);
  useLayoutEffect(
    () => () => {
      if (liveMeasureRafRef.current !== null) {
        cancelAnimationFrame(liveMeasureRafRef.current);
        liveMeasureRafRef.current = null;
      }
    },
    [],
  );
  const isUserMessage = useAppStore((state) =>
    entry.kind === "item"
      ? state.runtimeItemsByIdByThread[threadId]?.[entry.id]?.type === "user_message"
      : false,
  );
  const checkpointRevertItemId = useAppStore((state) => {
    if (!canRevertCheckpoints || entry.kind !== "item") return null;
    const itemIds = state.runtimeItemIdsByThread[threadId];
    const itemsById = state.runtimeItemsByIdByThread[threadId];
    if (!itemIds || !itemsById) return null;
    if (itemsById[entry.id]?.type !== "user_message") return null;
    return findCheckpointBeforeUserMessage(itemIds, itemsById, entry.id);
  });
  const showTurnGap = isUserMessage && index > 0;
  const completedTurn = useAppStore((state) => selectCompletedTurnForEntry(state, threadId, entry));
  const showInlineTurn =
    completedTurn !== undefined &&
    completedTurn.anchorItemId !== null &&
    completedTurn.anchorItemId !== suppressInlineTurnAnchorId;

  return (
    <div
      ref={ref}
      data-chat-virtual-row="true"
      data-index={index}
      data-item-id={entry.id}
      className="w-full"
    >
      <div className={`group/checkpoint relative w-full pb-1 ${showTurnGap ? "pt-3" : ""}`}>
        <div className="relative">
          <ChatItemRow
            threadId={threadId}
            entry={entry}
            isLastEntry={isLastEntry}
            isTurnActive={isTurnActive}
            checkpointRevert={
              checkpointRevertItemId ? { itemId: checkpointRevertItemId, onRequestRevert } : null
            }
          />
        </div>
        {showInlineTurn ? (
          <CompletedTurnIndicator threadId={threadId} record={completedTurn} />
        ) : null}
      </div>
    </div>
  );
});

function CompletedTurnIndicator({ record }: { threadId: string; record: CompletedTurnRecord }) {
  const elapsedSeconds = Math.max(0, Math.floor((record.endedAt - record.startedAt) / 1000));
  if (elapsedSeconds < 1) return null;
  const elapsed = formatElapsed(elapsedSeconds);
  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div className="flex flex-col gap-0.5 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
        {elapsedSeconds >= 1 ? (
          <span className="text-muted">
            <Trans>Worked for {elapsed}</Trans>
          </span>
        ) : null}
      </div>
    </Surface>
  );
}

function computeLiveTailIndex(
  state: AppStoreState,
  threadId: string,
  entries: readonly ChatTimelineEntry[],
): number {
  const items = state.runtimeItemsByIdByThread[threadId];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]!;
    if (entry.kind === "tool_call_group") return i;
    const item = items?.[entry.id];
    if (item?.type === "reasoning" && !(item.streams.reasoning_text ?? "").trim()) continue;
    return i;
  }
  return -1;
}

function isLastTimelineEntryAssistantMessage(
  state: AppStoreState,
  threadId: string,
  entries: readonly ChatTimelineEntry[],
): boolean {
  const lastEntry = entries[entries.length - 1];
  if (!lastEntry || lastEntry.kind !== "item") return false;
  return state.runtimeItemsByIdByThread[threadId]?.[lastEntry.id]?.type === "assistant_message";
}

/**
 * Change token for an in-flight item whose streamed content grows its row.
 * Includes the item id so back-to-back streaming items inside one group still
 * produce distinct tokens.
 */
function liveStreamMeasureToken(item: RuntimeChatItem | undefined): string | null {
  if (!item || item.state === "completed") return null;
  return `${item.id}:${item.state}:${growingStreamLength(item)}`;
}

function estimateTimelineEntrySize(entry: ChatTimelineEntry | undefined, threadId: string): number {
  if (!entry) return DEFAULT_ROW_ESTIMATE_PX;
  // A tool-call group only estimates while collapsed (it auto-expands solely as
  // the live tail, which is measured immediately), so use the collapsed trigger.
  if (entry.kind === "tool_call_group") return COLLAPSED_ROW_ESTIMATE_PX;
  return estimateRuntimeItemSize(selectRuntimeItemById(useAppStore.getState(), threadId, entry.id));
}

function estimateRuntimeItemSize(item: ReturnType<typeof selectRuntimeItemById>): number {
  if (!item) return DEFAULT_ROW_ESTIMATE_PX;
  switch (item.type) {
    case "assistant_message":
      if (assistantMessageHasImageContent(item)) return ASSISTANT_IMAGE_ROW_ESTIMATE_PX;
      return item.state === "completed" ? 168 : 208;
    case "user_message":
      return 88;
    case "reasoning":
      return item.state === "completed" ? COLLAPSED_REASONING_ROW_ESTIMATE_PX : 128;
    case "plan":
      return 128;
    case "tool_call":
    case "mcp_tool_call":
    case "image_view":
    case "dynamic_tool_call":
      if (imageViewRendersInline(item.payload)) return INLINE_IMAGE_ROW_ESTIMATE_PX;
      return item.state === "completed" ? COLLAPSED_ROW_ESTIMATE_PX : 132;
    case "command_execution":
    case "file_change":
    case "web_search":
      return item.state === "completed" ? COLLAPSED_ROW_ESTIMATE_PX : 132;
    case "error":
      return 80;
    default:
      return DEFAULT_ROW_ESTIMATE_PX;
  }
}

/**
 * Whether a completed row's measured height survives a remount unchanged, so its
 * cached measurement may be restored (see `writeTimelineMeasurements`). Kept
 * beside `estimateRuntimeItemSize` because both are per-type tables that must
 * stay in sync: a row type with local expand/collapse state remounts collapsed
 * (its `useState` dies with the fiber), so restoring an expanded-state size
 * would hand scroll compensation one huge delta on first revisit — the jump the
 * snapshot cache exists to prevent. Tool-call groups, reasoning ("Thought"
 * toggle), user messages (clamped "Show more"), and every tool/command/file/
 * search accordion are therefore unstable; non-completed rows are dropped too
 * since their height keeps changing while the thread works in the background.
 */
function isRemountStableSnapshotItem(item: RuntimeChatItem | undefined): boolean {
  if (!item || item.state !== "completed") return false;
  switch (item.type) {
    case "assistant_message":
    case "plan":
    case "question_answer":
    case "error":
      return true;
    default:
      // Inline image cards have no disclosure; every other tool-like row renders
      // the collapsible accordion and remounts collapsed.
      return isToolLikeItem(item) && imageViewRendersInline(item.payload);
  }
}

function assistantMessageHasImageContent(
  item: NonNullable<ReturnType<typeof selectRuntimeItemById>>,
): boolean {
  const payload = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message");
  return payload?.content.some((block) => block.kind === "image") ?? false;
}

function findCheckpointBeforeUserMessage(
  itemIds: readonly string[],
  itemsById: ReturnType<typeof useAppStore.getState>["runtimeItemsByIdByThread"][string],
  userItemId: string,
): string | null {
  const userIndex = itemIds.indexOf(userItemId);
  if (userIndex <= 0) return null;

  for (let idx = userIndex - 1; idx >= 0; idx -= 1) {
    const itemId = itemIds[idx]!;
    if (itemsById[itemId]?.type === "assistant_message") return itemId;
  }

  return null;
}

function countRollbackTurnsAfterCheckpoint(
  itemIds: readonly string[],
  itemsById: ReturnType<typeof useAppStore.getState>["runtimeItemsByIdByThread"][string],
  completedTurns: ReadonlyArray<CompletedTurnRecord>,
  checkpointItemId: string,
): number {
  const checkpointIndex = itemIds.indexOf(checkpointItemId);
  if (checkpointIndex < 0) return 0;

  if (completedTurns.length > 0) {
    let count = 0;
    for (const turn of completedTurns) {
      if (!turn.anchorItemId) continue;
      if (itemIds.indexOf(turn.anchorItemId) > checkpointIndex) count += 1;
    }
    return count;
  }

  let count = 0;
  for (let idx = checkpointIndex + 1; idx < itemIds.length; idx += 1) {
    const itemId = itemIds[idx]!;
    if (itemsById[itemId]?.type === "assistant_message") count += 1;
  }
  return count;
}
