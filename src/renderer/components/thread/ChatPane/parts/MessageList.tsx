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
import { Surface, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageItemPayload, ProjectLocation, ToolCallPayload } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { threadMentionLabel } from "@/shared/promptContent";
import { threadProductProperties } from "@/renderer/analytics/posthog";
import { captureProductEvent } from "@/renderer/analytics/productAnalytics";
import { readBridge } from "@/renderer/bridge";
import { formatElapsed } from "@/renderer/utils/formatTime";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getRuntimeItemPayload,
  type CompletedTurnRecord,
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
import { useRevertedPromptStore } from "../../revertedPrompt";
import { ChatItemRow } from "./items/ChatItemRow";
import { chatMessageSurfaceClass } from "./items/chatMessageSurface";
import { imageViewRendersInline, resolveImageViewSource } from "./items/imageViewSource";
import { isToolLikeItem } from "./items/toolCallCategorization";
import { useTimelineMeasurements } from "./useTimelineMeasurements";
import { createUnderfilledHistoryTrigger, type HistoryStartReached } from "./underfilledHistory";
import {
  useVirtualRowMeasurement,
  type RemeasureVirtualRow,
  type VirtualRowSize,
} from "./useVirtualRowMeasurement";
import {
  findCheckpointBeforeUserMessage,
  mintCheckpointOperationKey,
} from "./checkpointRevertIdentity";

export interface CheckpointRevertActions {
  revertCheckpoint(input: {
    threadId: string;
    checkpointItemId: string;
    operationKey: string;
  }): Promise<{
    outcome: "completed" | "completed_local_only" | "ambiguous" | "failed" | "noop";
  }>;
}

interface MessageListProps {
  threadId: string;
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
  onStartReached?: HistoryStartReached;
  drawDistance?: number;
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
   * Lets the chat Find controller and the sticky prompt drive the virtualizer
   * to scroll a row into the rendered window. Registered with the live
   * handler on mount, null on unmount.
   */
  registerScrollToIndex?: (
    handler:
      | ((
          index: number,
          options?: { align?: "start" | "center" | "end"; animated?: boolean },
        ) => void)
      | null,
  ) => void;
}

const DEFAULT_ROW_ESTIMATE_PX = 59;
const CONTENT_TAIL_PADDING_PX = 8;
const INLINE_IMAGE_ROW_CHROME_PX = 27;
const INLINE_IMAGE_MAX_HEIGHT_REM = 18;
const INLINE_IMAGE_MAX_VIEWPORT_HEIGHT = 0.4;
const INLINE_IMAGE_HORIZONTAL_CHROME_PX = 26;
const SKIP_REVERT_CONFIRM_PREF_KEY = "poracode-chat-checkpoint-revert-skip-confirm";

// Intentionally not wrapped in `React.memo`: pane swaps preserve this fiber
// while moving the DOM, so the virtualizer must re-render to re-measure.
export function MessageList({
  threadId,
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
  drawDistance,
  canRevertCheckpoints = true,
  checkpointGuard,
  checkpointActions,
  projectLocation,
  suppressInlineTurnAnchorId = null,
  registerScrollToIndex,
}: MessageListProps) {
  const { t } = useLingui();
  const hasItems = entries.length > 0;
  const parentActions = useChatPaneActions();
  const onContentHeightNotification = onContentHeightChange ?? parentActions?.onContentHeightChange;
  const listRef = useRef<LegendListRef | null>(null);
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const underfilledHistoryRef = useRef<ReturnType<typeof createUnderfilledHistoryTrigger> | null>(
    null,
  );
  if (underfilledHistoryRef.current === null) {
    underfilledHistoryRef.current = createUnderfilledHistoryTrigger();
  }
  function notifyContentHeight() {
    onContentHeightNotification?.();
    underfilledHistoryRef.current?.measure({
      threadId,
      oldestEntryId: entries[0]?.id,
      scroller: scrollElementRef.current,
      onStartReached,
    });
  }
  function retryUnderfilledHistory(event: {
    defaultPrevented: boolean;
    target: EventTarget | null;
  }) {
    if (
      event.defaultPrevented ||
      (event.target instanceof Element &&
        event.target.closest(
          "button, input, textarea, select, [role='button'], [contenteditable]:not([contenteditable='false'])",
        ))
    )
      return;
    underfilledHistoryRef.current?.retry({
      threadId,
      oldestEntryId: entries[0]?.id,
      scroller: scrollElementRef.current,
      onStartReached,
    });
  }
  const entriesRef = useRef(entries);
  useLayoutEffect(() => {
    entriesRef.current = entries;
  });
  const virtualSizeBoxRef = useRef<HTMLDivElement | null>(null);
  const [pendingRevert, setPendingRevert] = useState<{
    itemId: string;
    userItemId: string;
    operationKey: string;
  } | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [revertInFlight, setRevertInFlight] = useState(false);
  // Keys for attempts whose transport promise rejected without an explicit
  // server outcome. Retained across dialog close/skip-confirm clicks so a
  // lost-response retry reconciles the same operation; cleared once an
  // explicit outcome (completed/local_only/failed/ambiguous/noop) is observed.
  const unsettledKeysRef = useRef(new Map<string, string>());

  const snapshotMeasurements = useTimelineMeasurements({
    threadId,
    hasItems,
    entriesRef,
    listRef,
    scrollElementRef,
  });

  const setListRef = useCallback(
    (instance: LegendListRef | null) => {
      const previousInstance = listRef.current;
      const previousScrollElement = scrollElementRef.current;
      if (!instance && previousInstance && previousScrollElement) {
        snapshotMeasurements(previousInstance, previousScrollElement);
      }
      listRef.current = instance;
      if (!instance) underfilledHistoryRef.current?.reset();
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
    },
    [scrollContentRef, setScrollContainer, snapshotMeasurements],
  );

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
        animated: options?.animated ?? false,
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
    (
      itemKey: string,
      element: HTMLDivElement | null,
      liveStreamGrowth = false,
      observedSize?: VirtualRowSize,
    ) => {
      const instance = listRef.current;
      if (!element || !instance) return null;
      const height = observedSize?.height ?? element.offsetHeight;
      // A streamed store delta and the live-row ResizeObserver can report the
      // same painted size in either order. Let the first path update LegendList
      // and make the second a no-op instead of starting a redundant anchor /
      // scroll reconciliation cycle.
      if (liveStreamGrowth && instance.getState().sizes.get(itemKey) === height) {
        return instance.getState();
      }
      if (liveStreamGrowth) {
        onLiveVirtualizerLayoutChange?.();
      } else {
        onVirtualizerLayoutChange?.();
      }
      instance.setItemSize(itemKey, {
        height,
        width: observedSize?.width ?? element.offsetWidth,
      });
      return instance.getState();
    },
    [onLiveVirtualizerLayoutChange, onVirtualizerLayoutChange],
  );

  const readMeasuredRowHeight = (itemKey: string, index: number) => {
    const state = listRef.current?.getState();
    const height = state?.sizes.get(itemKey) ?? state?.sizeAtIndex(index);
    return height !== undefined && Number.isFinite(height) && height >= 0 ? height : undefined;
  };

  const performRevert = useCallback(
    async (itemId: string, userItemId: string, operationKey: string) => {
      // Snapshot before any await: the compound runs server-side, and the
      // composer should get back the prompt we are reverting even when a late
      // runtime event has already refreshed the transcript.
      const state = useAppStore.getState();
      const itemsById = state.runtimeItemsByIdByThread[threadId];
      const userItem = itemsById?.[userItemId];
      const restoredContent =
        userItem?.type === "user_message" && !userItem.parentItemId
          ? getRuntimeItemPayload<MessageItemPayload>(userItem, "user_message")?.content.map(
              (block) => ({ ...block }),
            )
          : undefined;
      const revert = checkpointActions ?? readBridge();
      let result: Awaited<ReturnType<typeof revert.revertCheckpoint>>;
      try {
        result = await revert.revertCheckpoint({
          threadId,
          checkpointItemId: itemId,
          operationKey,
        });
      } catch (error) {
        // A transport promise rejection carries no authoritative operation
        // outcome (the mutation may have been accepted with a lost reply).
        // Retain the key so the next attempt reconciles the same operation
        // instead of minting a new action.
        unsettledKeysRef.current.set(itemId, operationKey);
        throw error;
      }
      // An explicit outcome settled this action: lost-response retention no
      // longer applies. Retries within the same dialog reuse `pendingRevert`'s
      // key (resume/replay); a later deliberate action after close mints fresh.
      unsettledKeysRef.current.delete(itemId);
      if (result.outcome === "failed" || result.outcome === "ambiguous") {
        throw new Error(
          result.outcome === "ambiguous"
            ? t`Revert state is unknown; the provider did not confirm the rollback in time.`
            : t`The checkpoint could not be restored.`,
        );
      }
      if (result.outcome === "completed_local_only") {
        toast.warning(t`Provider conversation was not restored`, {
          description: t`Local chat history was reverted. The provider may still use the removed messages.`,
          timeout: 0,
        });
      }
      if (restoredContent?.length) {
        useRevertedPromptStore.getState().restore(threadId, restoredContent);
      }
      const thread = state.threads.find((item) => item.id === threadId);
      captureProductEvent("thread.checkpoint_reverted", {
        ...(thread ? threadProductProperties(thread) : {}),
        outcome:
          result.outcome === "completed"
            ? "complete"
            : result.outcome === "completed_local_only"
              ? "local_only"
              : result.outcome,
      });
      parentActions?.onContentHeightChange?.();
      return true;
    },
    [checkpointActions, parentActions, t, threadId],
  );

  const requestRevert = useCallback(
    (itemId: string, userItemId: string) => {
      // A retained unsettled key means the previous attempt's transport
      // rejected without an outcome: reuse it so the retry reconciles the
      // same operation. Otherwise this deliberate action mints fresh.
      const retained = unsettledKeysRef.current.get(itemId);
      const operationKey = retained ?? mintCheckpointOperationKey();
      if (localStorage.getItem(SKIP_REVERT_CONFIRM_PREF_KEY) === "1") {
        void performRevert(itemId, userItemId, operationKey).catch((error) => {
          console.warn("[checkpoint] failed to revert checkpoint", error);
          toast.danger(friendlyError(error));
        });
        return;
      }
      setDontAskAgain(false);
      setRevertError(null);
      setPendingRevert({ itemId, userItemId, operationKey });
    },
    [performRevert],
  );

  const closeRevertDialog = useCallback(() => {
    setPendingRevert(null);
    setDontAskAgain(false);
    setRevertError(null);
  }, []);

  const confirmRevert = useCallback(() => {
    if (!pendingRevert) return;
    setRevertError(null);
    setRevertInFlight(true);
    void performRevert(pendingRevert.itemId, pendingRevert.userItemId, pendingRevert.operationKey)
      .then((performed) => {
        if (!performed) return;
        if (dontAskAgain) {
          localStorage.setItem(SKIP_REVERT_CONFIRM_PREF_KEY, "1");
        }
        setPendingRevert(null);
        setDontAskAgain(false);
        useAppStore.getState().requestComposerFocus(threadId);
      })
      .catch((error) => {
        console.warn("[checkpoint] failed to revert checkpoint", error);
        setRevertError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        setRevertInFlight(false);
      });
  }, [dontAskAgain, pendingRevert, performRevert, threadId]);

  const pendingCheckpoint = useAppStore((state) =>
    pendingRevert ? state.fileCheckpointsByThread[threadId]?.[pendingRevert.itemId] : undefined,
  );

  return (
    <>
      <LegendList
        ref={setListRef}
        data={entries}
        dataKey={threadId}
        estimatedItemSize={DEFAULT_ROW_ESTIMATE_PX}
        extraData={`${lastLiveIndex}:${isTurnActive}:${markTailAsLive}:${suppressInlineTurnAnchorId ?? ""}:${canRevertCheckpoints}`}
        getFixedItemSize={(entry) =>
          getFixedTimelineEntrySize(entry, threadId, () => scrollElementRef.current?.clientWidth)
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
        {...(onContentHeightNotification || onStartReached
          ? { onContentSizeCommit: notifyContentHeight }
          : {})}
        {...(drawDistance !== undefined ? { drawDistance } : {})}
        {...(onStartReached
          ? {
              onStartReached: () => {
                void onStartReached();
              },
              onStartReachedThreshold: 0.75,
            }
          : {})}
        recycleItems={false}
        renderItem={({ item: entry, index }) => (
          <VirtualChatListRow
            threadId={threadId}
            entry={entry}
            index={index}
            isLastEntry={markTailAsLive && index === lastLiveIndex}
            isTurnActive={isTurnActive}
            remeasureElement={remeasureRowElement}
            readMeasuredRowHeight={readMeasuredRowHeight}
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
          // Declare the tail padding as a style, not a class: LegendList reads
          // padding from style objects only, and its end-of-list scroll target
          // and content-size model must match the DOM or the scroller lands
          // short of the bottom and the scroll-down control never hides.
          paddingBottom: CONTENT_TAIL_PADDING_PX,
          WebkitMaskImage:
            "linear-gradient(to bottom, black calc(100% - 14px), rgb(0 0 0 / var(--lc-chat-bottom-mask-end-alpha, 0)))",
          maskImage:
            "linear-gradient(to bottom, black calc(100% - 14px), rgb(0 0 0 / var(--lc-chat-bottom-mask-end-alpha, 0)))",
          transition: "--lc-chat-bottom-mask-end-alpha 150ms ease-out",
        }}
        data-poracode-chat-scroller="true"
        {...(onKeyDownCapture || onStartReached
          ? {
              onKeyDownCapture: (event) => {
                onKeyDownCapture?.(event);
                if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home") {
                  retryUnderfilledHistory(event);
                }
              },
            }
          : {})}
        onLoad={notifyContentHeight}
        {...(onPointerDownCapture ? { onPointerDownCapture } : {})}
        {...(onWheelCapture || onStartReached
          ? {
              onWheelCapture: (event) => {
                onWheelCapture?.(event);
                if (event.deltaY < 0) retryUnderfilledHistory(event);
              },
            }
          : {})}
        {...(scrollStyle ? { style: scrollStyle } : {})}
      />
      <RevertCheckpointDialog
        isOpen={pendingRevert !== null}
        dontAskAgain={dontAskAgain}
        isInFlight={revertInFlight}
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
  remeasureElement: RemeasureVirtualRow;
  readMeasuredRowHeight: (itemKey: string, index: number) => number | undefined;
  onVirtualizerLayoutChange?: () => void;
  suppressInlineTurnAnchorId: string | null;
  canRevertCheckpoints: boolean;
  onRequestRevert: (itemId: string, userItemId: string) => void;
};

const VirtualChatListRow = memo(function VirtualChatListRow({
  threadId,
  entry,
  index,
  isLastEntry,
  isTurnActive,
  remeasureElement,
  readMeasuredRowHeight,
  onVirtualizerLayoutChange,
  suppressInlineTurnAnchorId,
  canRevertCheckpoints,
  onRequestRevert,
}: VirtualChatListRowProps) {
  const { rowElementRef, remeasureRow, scheduleLiveMeasure } = useVirtualRowMeasurement(
    entry,
    isLastEntry,
    remeasureElement,
    (itemKey) => readMeasuredRowHeight(itemKey, index),
    onVirtualizerLayoutChange,
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
      ref={rowElementRef}
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
              checkpointRevertItemId
                ? {
                    itemId: checkpointRevertItemId,
                    onRequestRevert: (id) => onRequestRevert(id, entry.id),
                  }
                : null
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
            : block.kind === "thread"
              ? threadMentionLabel(block).length + 1
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
  readListWidth: () => number | undefined,
): number | undefined {
  if (entry.kind !== "item") return undefined;
  const item = selectRuntimeItemById(useAppStore.getState(), threadId, entry.id);
  if (!item || !isToolLikeItem(item) || !imageViewRendersInline(item.payload)) return undefined;
  // Legend's single fallback estimate is intentionally message-sized. Inline
  // images are the large outlier during prepend, so reserve their intrinsic
  // responsive height before the row mounts and MVCP never anchors to 59px.
  const source = resolveImageViewSource(item.payload as ToolCallPayload | undefined);
  if (!source?.width || !source.height) return undefined;
  // Ordinary message/tool rows need no geometry read at all.
  const listWidth = readListWidth();
  if (!listWidth) return undefined;
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
