import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Surface } from "@heroui/react";
import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import type { CompletedTurnRecord } from "@/renderer/state/slices/runtimeEventSlice";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import {
  CheckpointRevertButton,
  DEFAULT_CHECKPOINT_GUARD,
  RevertCheckpointDialog,
  type CheckpointGuard,
} from "./CheckpointRevertControls";
import { formatElapsed } from "../formatElapsed";
import {
  ChatPaneActionsContext,
  type ChatPaneActions,
  useChatPaneActions,
} from "../chatPaneActionsContext";
import {
  selectCompletedTurnForEntry,
  selectRuntimeItemById,
  type ChatTimelineEntry,
} from "../chatPaneSelectors";
import { ChatItemRow } from "./items/ChatItemRow";
import { chatMessageSurfaceClass } from "./items/chatMessageSurface";

interface MessageListProps {
  threadId: string;
  entries: readonly ChatTimelineEntry[];
  scrollElement: HTMLDivElement | null;
  /**
   * Reverting is transcript-local today. Disable it while a turn is live so
   * late provider events cannot append onto a truncated timeline.
   */
  canRevertCheckpoints?: boolean;
  checkpointGuard?: CheckpointGuard;
  projectLocation?: ProjectLocation | undefined;
  /**
   * If set, the inline "Worked for X" indicator anchored to this item id is
   * suppressed because the parent tail loader is already showing it (matches
   * the most recent completed turn while the thread is idle).
   */
  suppressInlineTurnAnchorId?: string | null;
}

const CHAT_TRANSCRIPT_OVERSCAN = 8;
const DEFAULT_ROW_ESTIMATE_PX = 96;
const SKIP_REVERT_CONFIRM_PREF_KEY = "lightcode-chat-checkpoint-revert-skip-confirm";

// Intentionally not wrapped in `React.memo`: pane swaps preserve this fiber
// while moving the DOM, so the virtualizer must re-render to re-measure.
export function MessageList({
  threadId,
  entries,
  scrollElement,
  canRevertCheckpoints = true,
  checkpointGuard,
  projectLocation,
  suppressInlineTurnAnchorId = null,
}: MessageListProps) {
  const hasItems = entries.length > 0;
  const parentActions = useChatPaneActions();
  const virtualSizeBoxRef = useRef<HTMLDivElement | null>(null);
  const rowElementsRef = useRef(new Map<number, HTMLDivElement>());
  const pendingScrollCompensationRef = useRef(0);
  const [measureEpoch, setMeasureEpoch] = useState(0);
  const [pendingRevertItemId, setPendingRevertItemId] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
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
    useAnimationFrameWithResizeObserver: true,
  });

  useLayoutEffect(() => {
    if (!parentActions?.registerVirtualScrollToBottom) return;
    parentActions.registerVirtualScrollToBottom(() => {
      if (entries.length === 0) return;
      virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
    });
    return () => parentActions.registerVirtualScrollToBottom?.(null);
  }, [entries.length, parentActions, virtualizer]);

  useLayoutEffect(() => {
    // Compensate scroll when a row above the viewport (or any row while
    // bottom-sticky) trades its estimated height for a real measurement —
    // otherwise the estimate error shifts the visible content. Always return
    // false so TanStack never calls scrollTo itself: that adjustment runs
    // outside React's commit and paints one frame apart from the translateY /
    // row-height change, which reads as flicker. Instead the delta is
    // accumulated here and applied in the layout effect below, in the same
    // commit (and therefore the same paint) as the DOM change it compensates.
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, delta) => {
      if (!scrollElement) return false;
      if (parentActions?.isStickToBottom?.() || item.start + item.size <= scrollElement.scrollTop) {
        pendingScrollCompensationRef.current += delta;
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
    scrollElement.scrollTop += pendingScrollCompensationRef.current;
    pendingScrollCompensationRef.current = 0;
  });

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

  useLayoutEffect(() => {
    parentActions?.onContentHeightChange();
  }, [parentActions, totalSize]);

  useLayoutEffect(() => {
    if (measureEpoch === 0) return;
    for (const element of rowElementsRef.current.values()) {
      virtualizer.measureElement(element);
    }
  }, [measureEpoch, virtualizer]);

  const measureRowElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        rowElementsRef.current.set(index, element);
        virtualizer.measureElement(element);
        // TanStack defers ref-time measurement to the next ResizeObserver
        // frame while scrolling, but the row's real DOM height is already on
        // screen this commit — a frame with the old scroll offset would paint
        // shifted. Measure synchronously so the estimate correction (and the
        // pending scroll compensation it accumulates) applies pre-paint.
        virtualizer.resizeItem(
          index,
          virtualizer.options.measureElement(element, undefined, virtualizer),
        );
      } else {
        rowElementsRef.current.delete(index);
        virtualizer.measureElement(element);
      }
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
      if (rollbackTurns > 0) {
        try {
          await readBridge().rollbackThreadConversation({
            threadId,
            numTurns: rollbackTurns,
          });
        } catch (error) {
          console.warn(
            "[checkpoint] provider rollback failed; continuing with local revert",
            error,
          );
        }
      }
      if (projectLocation && checkpoint) {
        await readBridge().restoreFileCheckpoint({
          threadId,
          checkpointItemId: itemId,
          projectLocation,
        });
      }
      state.truncateThreadRuntimeAfter(threadId, itemId);
      parentActions?.onContentHeightChange();
    },
    [parentActions, projectLocation, threadId],
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

  // Row actions bubble up through ChatPaneActionsContext so disclosure rows can
  // notify the parent scroll controls when their height changes. We do NOT call
  // virtualizer.measure() here — that would reset the entire size cache back to
  // estimates and cause every row to jump. TanStack Virtual's measureElement ref
  // already attaches a ResizeObserver to each row wrapper; when a disclosure
  // expands or collapses the observer fires automatically and recalculates only
  // the affected row's position.
  const rowActions = useMemo<ChatPaneActions | null>(() => {
    if (!parentActions) return null;
    return {
      ...parentActions,
      onContentHeightChange: () => {
        setMeasureEpoch((epoch) => epoch + 1);
        parentActions.onContentHeightChange();
      },
    };
  }, [parentActions]);

  if (!hasItems) return null;

  return (
    <ChatPaneActionsContext.Provider value={rowActions}>
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
        onClose={() => {
          setPendingRevertItemId(null);
          setDontAskAgain(false);
          setRevertError(null);
        }}
        onConfirm={confirmRevert}
      />
    </ChatPaneActionsContext.Provider>
  );
}

type VirtualChatListRowProps = {
  threadId: string;
  entry: ChatTimelineEntry;
  index: number;
  isLastEntry: boolean;
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
    if (!isLastEntry || entry.kind !== "item") return;
    return useAppStore.subscribe(
      (state) => {
        const item = state.runtimeItemsByIdByThread[threadId]?.[entry.id];
        if (!item || item.state === "completed") return null;
        switch (item.type) {
          case "assistant_message":
            return `${item.type}:${item.state}:${item.streams.assistant_text?.length ?? 0}`;
          case "reasoning":
            return `${item.type}:${item.state}:${item.streams.reasoning_text?.length ?? 0}`;
          case "command_execution":
            return `${item.type}:${item.state}:${item.streams.command_output?.length ?? 0}`;
          case "file_change":
            return `${item.type}:${item.state}:${item.streams.file_change_output?.length ?? 0}`;
          default:
            return `${item.type}:${item.state}`;
        }
      },
      (token) => {
        if (token !== null) scheduleLiveMeasure();
      },
    );
  }, [entry.id, entry.kind, isLastEntry, scheduleLiveMeasure, threadId]);
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
            checkpointRevertControl={
              checkpointRevertItemId ? (
                <CheckpointRevertButton
                  itemId={checkpointRevertItemId}
                  onRequestRevert={onRequestRevert}
                />
              ) : null
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
  return (
    <Surface variant="transparent" className={chatMessageSurfaceClass}>
      <div className="flex flex-col gap-0.5 text-[length:var(--lc-chat-font-size-meta)] text-foreground-muted">
        {elapsedSeconds >= 1 ? (
          <span className="text-muted">Worked for {formatElapsed(elapsedSeconds)}</span>
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

function estimateTimelineEntrySize(entry: ChatTimelineEntry | undefined, threadId: string): number {
  if (!entry) return DEFAULT_ROW_ESTIMATE_PX;
  if (entry.kind === "tool_call_group") return 64;
  return estimateRuntimeItemSize(selectRuntimeItemById(useAppStore.getState(), threadId, entry.id));
}

function estimateRuntimeItemSize(item: ReturnType<typeof selectRuntimeItemById>): number {
  if (!item) return DEFAULT_ROW_ESTIMATE_PX;
  switch (item.type) {
    case "assistant_message":
      return item.state === "completed" ? 168 : 208;
    case "user_message":
      return 88;
    case "reasoning":
      return item.state === "completed" ? 52 : 128;
    case "plan":
      return 128;
    case "command_execution":
    case "tool_call":
    case "mcp_tool_call":
    case "image_view":
    case "dynamic_tool_call":
    case "file_change":
    case "web_search":
      return item.state === "completed" ? 56 : 132;
    case "error":
      return 80;
    default:
      return DEFAULT_ROW_ESTIMATE_PX;
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
