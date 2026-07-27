import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type ReactNode,
  type RefObject,
  type WheelEventHandler,
} from "react";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { Surface } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type {
  MessageItemPayload,
  ProjectLocation,
  ThreadConfig,
  ToolCallPayload,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { formatElapsed } from "@/renderer/utils/formatTime";
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
import { useChatPaneActions } from "../chatPaneActionsContext";
import {
  growingStreamLength,
  selectCompletedTurnForEntry,
  selectRuntimeItemById,
  type ChatTimelineEntry,
} from "../chatPaneSelectors";
import { ChatItemRow } from "./items/ChatItemRow";
import { chatMessageSurfaceClass } from "./items/chatMessageSurface";
import { imageViewRendersInline, resolveImageViewSource } from "./items/imageViewSource";
import { isToolLikeItem } from "./items/toolCallCategorization";
import {
  getTimelineMeasurementSignature,
  readTimelineMeasurements,
  writeTimelineMeasurements,
} from "./timelineMeasurementCache";

export interface CheckpointRevertActions {
  rollbackThreadConversation(input: {
    threadId: string;
    numTurns: number;
    config?: ThreadConfig;
  }): Promise<void>;
  restoreFileCheckpoint(input: {
    threadId: string;
    checkpointItemId: string;
    projectLocation: ProjectLocation;
  }): Promise<void>;
}

interface MessageListProps {
  threadId: string;
  threadConfig?: ThreadConfig;
  entries: readonly ChatTimelineEntry[];
  isTurnActive?: boolean;
  markTailAsLive?: boolean;
  setScrollContainer?: (element: HTMLDivElement | null) => void;
  scrollContentRef?: RefObject<HTMLDivElement | null>;
  onContentHeightChange?: () => void;
  onVirtualizerLayoutChange?: () => void;
  onLiveVirtualizerLayoutChange?: () => void;
  registerVirtualScrollToBottom?: (handler: (() => void) | null) => void;
  scrollClassName?: string;
  scrollStyle?: CSSProperties;
  contentClassName?: string;
  header?: ReactNode;
  footer?: ReactNode;
  emptyContent?: ReactNode;
  onWheelCapture?: WheelEventHandler<HTMLDivElement>;
  onPointerDownCapture?: PointerEventHandler<HTMLDivElement>;
  onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>;
  onStartReached?: () => void;
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

// Keep enough content mounted around the viewport that fast trackpad movement
// cannot outrun the next virtual range.
const CHAT_TRANSCRIPT_DRAW_DISTANCE_PX = 1_000;
const DEFAULT_ROW_ESTIMATE_PX = 59;
const INLINE_IMAGE_ROW_CHROME_PX = 27;
const INLINE_IMAGE_MAX_HEIGHT_REM = 18;
const INLINE_IMAGE_MAX_VIEWPORT_HEIGHT = 0.4;
const INLINE_IMAGE_HORIZONTAL_CHROME_PX = 26;
const SKIP_REVERT_CONFIRM_PREF_KEY = "poracode-chat-checkpoint-revert-skip-confirm";

// Intentionally not wrapped in `React.memo`: pane swaps preserve this fiber
// while moving the DOM, so the virtualizer must re-render to re-measure.
export function MessageList({
  threadId,
  threadConfig,
  entries,
  isTurnActive = false,
  markTailAsLive = true,
  setScrollContainer,
  scrollContentRef,
  onContentHeightChange,
  onVirtualizerLayoutChange,
  onLiveVirtualizerLayoutChange,
  registerVirtualScrollToBottom,
  scrollClassName,
  scrollStyle,
  contentClassName,
  header,
  footer,
  emptyContent,
  onWheelCapture,
  onPointerDownCapture,
  onKeyDownCapture,
  onStartReached,
  canRevertCheckpoints = true,
  checkpointGuard,
  checkpointActions,
  projectLocation,
  suppressInlineTurnAnchorId = null,
  registerScrollToIndex,
}: MessageListProps) {
  const hasItems = entries.length > 0;
  const parentActions = useChatPaneActions();
  const listRef = useRef<LegendListRef | null>(null);
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const virtualSizeBoxRef = useRef<HTMLDivElement | null>(null);
  const totalSizeUnsubscribeRef = useRef<(() => void) | null>(null);
  const measurementSignatureRef = useRef<string | null>(null);
  const restoredMeasurementSignatureRef = useRef<string | null>(null);
  const [pendingRevertItemId, setPendingRevertItemId] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);

  const snapshotMeasurements = useCallback(
    (instance: LegendListRef, scrollElement: HTMLDivElement) => {
      const signature = measurementSignatureRef.current;
      if (!signature || getTimelineMeasurementSignature(scrollElement) !== signature) return;
      const state = useAppStore.getState();
      const sizes = instance.getState().sizes;
      const measurements = entriesRef.current.flatMap((entry, index) => {
        if (entry.kind !== "item") return [];
        if (!isRemountStableSnapshotItem(selectRuntimeItemById(state, threadId, entry.id))) {
          return [];
        }
        const size = sizes.get(entry.id);
        return size === undefined ? [] : [{ key: entry.id, index, size }];
      });
      writeTimelineMeasurements(threadId, signature, measurements);
    },
    [threadId],
  );

  const setListRef = useCallback(
    (instance: LegendListRef | null) => {
      const previousInstance = listRef.current;
      const previousScrollElement = scrollElementRef.current;
      if (!instance && previousInstance && previousScrollElement) {
        snapshotMeasurements(previousInstance, previousScrollElement);
      }
      totalSizeUnsubscribeRef.current?.();
      totalSizeUnsubscribeRef.current = null;
      listRef.current = instance;
      const scrollElement = instance?.getScrollableNode() as HTMLDivElement | undefined;
      const contentElement = scrollElement?.querySelector<HTMLDivElement>(
        ".legend-list-content-container",
      );
      scrollElementRef.current = scrollElement ?? null;
      virtualSizeBoxRef.current = contentElement ?? null;
      if (contentElement) {
        contentElement.dataset.chatVirtualSizeBox = "true";
        contentElement.dataset.bottomFadeVisible = "true";
      }
      if (scrollContentRef) scrollContentRef.current = contentElement ?? null;
      setScrollContainer?.(scrollElement ?? null);
      if (instance) {
        totalSizeUnsubscribeRef.current = instance
          .getState()
          .listen("totalSize", () =>
            (onContentHeightChange ?? parentActions?.onContentHeightChange)?.(),
          );
      }
    },
    [
      onContentHeightChange,
      parentActions,
      scrollContentRef,
      setScrollContainer,
      snapshotMeasurements,
    ],
  );

  useLayoutEffect(() => {
    const instance = listRef.current;
    const scrollElement = scrollElementRef.current;
    if (!instance || !scrollElement || entries.length === 0) return;
    const signature = getTimelineMeasurementSignature(scrollElement);
    measurementSignatureRef.current = signature;
    if (!signature || restoredMeasurementSignatureRef.current === signature) return;
    restoredMeasurementSignatureRef.current = signature;
    const entryIds = new Set(entries.map((entry) => entry.id));
    const measurements = readTimelineMeasurements(threadId, signature);
    for (const measurement of measurements) {
      if (!entryIds.has(String(measurement.key))) continue;
      instance.setItemSize(String(measurement.key), {
        height: measurement.size,
        width: scrollElement.clientWidth,
      });
    }
  }, [entries, threadId]);

  useLayoutEffect(() => {
    const register = registerVirtualScrollToBottom ?? parentActions?.registerVirtualScrollToBottom;
    if (!register) return;
    register(() => {
      void listRef.current?.scrollToEnd({ animated: false });
    });
    return () => register(null);
  }, [parentActions, registerVirtualScrollToBottom]);

  useLayoutEffect(() => {
    if (!registerScrollToIndex) return;
    registerScrollToIndex((index, options) => {
      if (index < 0 || index >= entries.length) return;
      const align = options?.align ?? "center";
      void listRef.current?.scrollToIndex({
        animated: false,
        index,
        viewPosition: align === "start" ? 0 : align === "end" ? 1 : 0.5,
      });
    });
    return () => registerScrollToIndex(null);
  }, [entries.length, registerScrollToIndex]);

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

  const remeasureRowElement = useCallback(
    (itemKey: string, element: HTMLDivElement | null, liveStreamGrowth = false) => {
      if (!element) return;
      const height = element.offsetHeight;
      // A streamed store delta and the live-row ResizeObserver can report the
      // same painted size in either order. Let the first path update LegendList
      // and make the second a no-op instead of starting a redundant anchor /
      // scroll reconciliation cycle.
      if (liveStreamGrowth && listRef.current?.getState().sizes.get(itemKey) === height) {
        return;
      }
      if (liveStreamGrowth) {
        onLiveVirtualizerLayoutChange?.();
      } else {
        onVirtualizerLayoutChange?.();
      }
      listRef.current?.setItemSize(itemKey, {
        height,
        width: element.offsetWidth,
      });
    },
    [onLiveVirtualizerLayoutChange, onVirtualizerLayoutChange],
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
          await revert.rollbackThreadConversation({
            threadId,
            numTurns: rollbackTurns,
            ...(threadConfig ? { config: threadConfig } : {}),
          });
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
    [checkpointActions, parentActions, projectLocation, threadConfig, threadId],
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

  return (
    <>
      <LegendList
        ref={setListRef}
        data={entries}
        dataKey={threadId}
        drawDistance={CHAT_TRANSCRIPT_DRAW_DISTANCE_PX}
        estimatedItemSize={DEFAULT_ROW_ESTIMATE_PX}
        extraData={`${lastLiveIndex}:${isTurnActive}:${markTailAsLive}:${suppressInlineTurnAnchorId ?? ""}:${canRevertCheckpoints}`}
        getFixedItemSize={(entry) =>
          getFixedTimelineEntrySize(entry, threadId, scrollElementRef.current?.clientWidth)
        }
        getItemType={(entry, index) =>
          getTimelineEntryType(
            entry,
            threadId,
            index,
            index === lastLiveIndex && isTurnActive,
            suppressInlineTurnAnchorId,
          )
        }
        initialScrollAtEnd
        keyExtractor={(entry) => entry.id}
        maintainScrollAtEnd={{
          animated: false,
          on: { dataChange: true, footerLayout: true, itemLayout: true, layout: true },
        }}
        maintainScrollAtEndThreshold={0}
        maintainVisibleContentPosition={{ data: true, size: true }}
        {...(onStartReached ? { onStartReached, onStartReachedThreshold: 0.75 } : {})}
        recycleItems={false}
        renderItem={({ item: entry, index }) => (
          <VirtualChatListRow
            threadId={threadId}
            entry={entry}
            index={index}
            isLastEntry={markTailAsLive && index === lastLiveIndex}
            isTurnActive={isTurnActive}
            remeasureElement={remeasureRowElement}
            {...(onVirtualizerLayoutChange ? { onVirtualizerLayoutChange } : {})}
            suppressInlineTurnAnchorId={suppressInlineTurnAnchorId}
            canRevertCheckpoints={canRevertCheckpoints}
            onRequestRevert={requestRevert}
          />
        )}
        {...(header ? { ListHeaderComponent: <>{header}</> } : {})}
        {...(!hasItems && emptyContent ? { ListEmptyComponent: <>{emptyContent}</> } : {})}
        {...(footer ? { ListFooterComponent: <div className="pb-2">{footer}</div> } : {})}
        {...(scrollClassName ? { className: scrollClassName } : {})}
        contentContainerClassName={`relative w-full overflow-hidden [--lc-chat-bottom-mask-end-alpha:0] ${contentClassName ?? ""}`}
        contentContainerStyle={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black calc(100% - 14px), rgb(0 0 0 / var(--lc-chat-bottom-mask-end-alpha, 0)))",
          maskImage:
            "linear-gradient(to bottom, black calc(100% - 14px), rgb(0 0 0 / var(--lc-chat-bottom-mask-end-alpha, 0)))",
          transition: "--lc-chat-bottom-mask-end-alpha 150ms ease-out",
        }}
        data-poracode-chat-scroller="true"
        {...(onKeyDownCapture ? { onKeyDownCapture } : {})}
        onLoad={() => (onContentHeightChange ?? parentActions?.onContentHeightChange)?.()}
        {...(onPointerDownCapture ? { onPointerDownCapture } : {})}
        {...(onWheelCapture ? { onWheelCapture } : {})}
        {...(scrollStyle ? { style: scrollStyle } : {})}
      />
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
  remeasureElement: (
    itemKey: string,
    element: HTMLDivElement | null,
    liveStreamGrowth?: boolean,
  ) => void;
  onVirtualizerLayoutChange?: () => void;
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
  remeasureElement,
  onVirtualizerLayoutChange,
  suppressInlineTurnAnchorId,
  canRevertCheckpoints,
  onRequestRevert,
}: VirtualChatListRowProps) {
  const rowElementRef = useRef<HTMLDivElement | null>(null);
  const liveMeasureRafRef = useRef<number | null>(null);
  const ref = useCallback((element: HTMLDivElement | null) => {
    rowElementRef.current = element;
  }, []);
  const remeasureRow = useCallback(() => {
    const element = rowElementRef.current;
    if (!element) return;
    remeasureElement(entry.id, element);
  }, [entry.id, remeasureElement]);
  const scheduleLiveMeasure = useCallback(() => {
    if (liveMeasureRafRef.current !== null) return;
    liveMeasureRafRef.current = requestAnimationFrame(() => {
      liveMeasureRafRef.current = null;
      const element = rowElementRef.current;
      if (!element) return;
      remeasureElement(entry.id, element, true);
    });
  }, [entry.id, remeasureElement]);
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
  useLayoutEffect(() => {
    const element = rowElementRef.current;
    if (!element) return;

    let previousHeight = element.offsetHeight;
    let previousWidth = element.offsetWidth;
    const observer = new ResizeObserver(() => {
      const nextHeight = element.offsetHeight;
      const nextWidth = element.offsetWidth;
      if (nextHeight === previousHeight && nextWidth === previousWidth) return;
      const heightDelta = nextHeight - previousHeight;
      previousHeight = nextHeight;
      previousWidth = nextWidth;
      // The smoothed Markdown renderer can grow between provider deltas, and the
      // completion commit renders the final text concurrently — often a few
      // frames after the store event. The DOM resize is the earliest reliable
      // signal and ResizeObserver runs after layout but before paint, so measure
      // LegendList here rather than waiting for the next stream event or frame.
      remeasureElement(entry.id, element, true);
      // LegendList turns that size into new row offsets through a React render,
      // which lands on the NEXT frame. Nothing sits below the tail, so there it
      // is invisible — but a row that grows mid-list paints into its neighbour
      // for that frame. Steering is when that shows: the prompt is appended
      // under the still-working row, so when the turn closes, the row's final
      // text plus its "Worked for X" line grow underneath the prompt bubble,
      // which covers them until the reflow catches up. Shift the rows below by
      // the same delta here, still before paint; LegendList rewrites the
      // identical offsets on its own pass, so the two converge. Growth only —
      // LegendList deliberately defers shrinks, and racing that would jitter.
      if (!isLastEntry && heightDelta > 0) shiftFollowingRows(element, heightDelta);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [entry.id, isLastEntry, remeasureElement]);
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
  const inlineTurnVisibleRef = useRef(false);
  useLayoutEffect(() => {
    if (inlineTurnVisibleRef.current === showInlineTurn) return;
    inlineTurnVisibleRef.current = showInlineTurn;
    onVirtualizerLayoutChange?.();
    scheduleLiveMeasure();
  }, [onVirtualizerLayoutChange, scheduleLiveMeasure, showInlineTurn]);

  return (
    <div
      ref={ref}
      data-chat-virtual-row="true"
      data-index={index}
      data-item-id={entry.id}
      className="relative mx-auto w-full max-w-[920px]"
    >
      <div className={`group/checkpoint relative w-full pb-1 ${showTurnGap ? "pt-3" : ""}`}>
        <div className="relative">
          <ChatItemRow
            threadId={threadId}
            entry={entry}
            isLastEntry={isLastEntry}
            onHeightChange={remeasureRow}
            {...(onVirtualizerLayoutChange ? { onVirtualizerLayoutChange } : {})}
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

function getTimelineEntryType(
  entry: ChatTimelineEntry,
  threadId: string,
  index: number,
  isLiveTail: boolean,
  suppressInlineTurnAnchorId: string | null,
): string {
  const state = useAppStore.getState();
  const completedTurn = selectCompletedTurnForEntry(state, threadId, entry);
  const hasInlineTurn =
    completedTurn !== undefined &&
    completedTurn.anchorItemId !== null &&
    completedTurn.anchorItemId !== suppressInlineTurnAnchorId;
  const rowSuffix = hasInlineTurn ? ":turn" : "";
  if (entry.kind === "tool_call_group") {
    return `${isLiveTail ? "tool_call_group:live" : entry.kind}${rowSuffix}`;
  }
  const item = selectRuntimeItemById(state, threadId, entry.id);
  if (!item) return "unknown";
  if (item.type !== "assistant_message" && item.type !== "user_message") {
    return `${item.type}${rowSuffix}`;
  }
  if (isLiveTail) return `${item.type}:live${rowSuffix}`;
  const payload = getRuntimeItemPayload<MessageItemPayload>(item, item.type);
  const leadingGapSuffix = item.type === "user_message" && index > 0 ? ":gap" : "";
  if (payload?.content.some((block) => block.kind === "image")) {
    return `${item.type}:media${leadingGapSuffix}${rowSuffix}`;
  }
  const payloadTextLength =
    payload?.content.reduce(
      (length, block) =>
        length +
        (block.kind === "text"
          ? block.text.length
          : block.kind === "skill"
            ? block.invocation.length
            : 0),
      0,
    ) ?? 0;
  const textLength = growingStreamLength(item) + payloadTextLength;
  const sizeBucket = textLength <= 256 ? "short" : textLength <= 2_048 ? "medium" : "long";
  return `${item.type}:${sizeBucket}${leadingGapSuffix}${rowSuffix}`;
}

function getFixedTimelineEntrySize(
  entry: ChatTimelineEntry,
  threadId: string,
  listWidth: number | undefined,
): number | undefined {
  if (entry.kind !== "item" || !listWidth) return undefined;
  const item = selectRuntimeItemById(useAppStore.getState(), threadId, entry.id);
  if (!item || !isToolLikeItem(item) || !imageViewRendersInline(item.payload)) return undefined;
  // Legend's single fallback estimate is intentionally message-sized. Inline
  // images are the large outlier during prepend, so reserve their intrinsic
  // responsive height before the row mounts and MVCP never anchors to 59px.
  const source = resolveImageViewSource(item.payload as ToolCallPayload | undefined);
  if (!source?.width || !source.height) return undefined;
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const maxHeight = Math.min(
    INLINE_IMAGE_MAX_HEIGHT_REM * (Number.isFinite(rootFontSize) ? rootFontSize : 16),
    window.innerHeight * INLINE_IMAGE_MAX_VIEWPORT_HEIGHT,
  );
  const availableWidth = Math.max(0, Math.min(listWidth, 920) - INLINE_IMAGE_HORIZONTAL_CHROME_PX);
  const renderedHeight = Math.min(
    source.height,
    maxHeight,
    (availableWidth * source.height) / source.width,
  );
  return Math.round(renderedHeight + INLINE_IMAGE_ROW_CHROME_PX);
}

/**
 * Nudge the virtual rows below `element` by `delta` px, before paint, to cover
 * the frame between a mid-list row growing and LegendList re-rendering the new
 * offsets. Purely transient: LegendList owns `top` and rewrites it (to the same
 * value) on its own pass.
 */
function shiftFollowingRows(element: HTMLElement, delta: number): void {
  if (!Number.isFinite(delta) || Math.abs(delta) < 1) return;
  const container = element.parentElement;
  const parent = container?.parentElement;
  if (!container || !parent) return;
  const ownTop = Number.parseFloat(container.style.top);
  if (!Number.isFinite(ownTop)) return;
  for (const sibling of parent.children) {
    if (!(sibling instanceof HTMLElement) || sibling === container) continue;
    const top = Number.parseFloat(sibling.style.top);
    if (!Number.isFinite(top) || top <= ownTop) continue;
    sibling.style.top = `${top + delta}px`;
  }
}

/**
 * Whether a completed row's measured height survives a remount unchanged, so its
 * cached measurement may be restored (see `writeTimelineMeasurements`, applied
 * via LegendList's `setItemSize`). A row type with local expand/collapse state
 * remounts collapsed (its `useState` dies with the fiber), so restoring an
 * expanded-state size would anchor the list to a stale height on first revisit
 * — the jump the snapshot cache exists to prevent. Tool-call groups, reasoning
 * ("Thought" toggle), user messages (clamped "Show more"), and every tool/
 * command/file/search accordion are therefore unstable; non-completed rows are
 * dropped too since their height keeps changing while the thread works in the
 * background.
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
