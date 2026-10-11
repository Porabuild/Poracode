import { useLayoutEffect, useState, type RefObject } from "react";
import { useAppStore } from "@/renderer/state/appStore";
import { runtimeHistoryBoundary } from "@/renderer/state/runtimeHistoryBoundary";
import { createUnderfilledHistoryTrigger, type HistoryStartReached } from "./underfilledHistory";

/** Hidden child pages must advance the reader even before a visible parent arrives. */
export function useUnderfilledHistory({
  threadId,
  oldestVisibleEntryId,
  scrollElementRef,
  onStartReached,
  onContentHeightChange,
}: {
  threadId: string;
  oldestVisibleEntryId: string | undefined;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  onStartReached: HistoryStartReached | undefined;
  onContentHeightChange: (() => void) | undefined;
}) {
  const canonicalBoundaryId = useAppStore((state) => {
    if (!onStartReached) return undefined;
    const controls = runtimeHistoryBoundary(threadId).sparseControlIds;
    return state.runtimeItemIdsByThread[threadId]?.find((id) => !controls.has(id));
  });
  const oldestEntryId = canonicalBoundaryId ?? oldestVisibleEntryId;
  const [trigger] = useState(createUnderfilledHistoryTrigger);
  const resetUnderfilledHistory = trigger.reset;
  useLayoutEffect(() => resetUnderfilledHistory, [resetUnderfilledHistory]);
  // Hidden-only prepends change no virtual rows or content size. Measure their
  // canonical boundary at commit rather than waiting for a scroll/resize event.
  useLayoutEffect(() => {
    trigger.measure({
      threadId,
      oldestEntryId,
      scroller: scrollElementRef.current,
      onStartReached,
    });
  }, [threadId, oldestEntryId, scrollElementRef, onStartReached, trigger]);

  function notifyContentHeight() {
    onContentHeightChange?.();
    trigger.measure({
      threadId,
      oldestEntryId,
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
    trigger.retry({
      threadId,
      oldestEntryId,
      scroller: scrollElementRef.current,
      onStartReached,
    });
  }
  return { notifyContentHeight, retryUnderfilledHistory, resetUnderfilledHistory };
}
