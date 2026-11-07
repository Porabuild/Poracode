import { useLayoutEffect, useRef, useState, type RefObject } from "react";
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
  const hydrationStatus = useAppStore((state) => state.runtimeHydrationStatus[threadId]);
  // Rows can commit before their cursor and hydration admission are installed.
  // An early read would report no progress and latch this boundary as failed.
  const oldestEntryId =
    hydrationStatus === "pending" || hydrationStatus === "failed"
      ? undefined
      : (canonicalBoundaryId ?? oldestVisibleEntryId);
  const [trigger] = useState(createUnderfilledHistoryTrigger);
  const scheduleMeasurementRef = useRef(() => {});
  const resetUnderfilledHistory = trigger.reset;
  useLayoutEffect(() => resetUnderfilledHistory, [resetUnderfilledHistory]);
  // Hidden-only prepends change no virtual rows or content size. Measure their
  // canonical boundary at commit rather than waiting for a scroll/resize event.
  useLayoutEffect(() => {
    const measure = () =>
      trigger.measure({
        threadId,
        oldestEntryId,
        scroller: scrollElementRef.current,
        onStartReached,
      });
    measure();
    const scroller = scrollElementRef.current;
    if (!scroller || !onStartReached) return;
    let frame: number | null = null;
    const scheduleMeasurement = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    scheduleMeasurementRef.current = scheduleMeasurement;
    // A group can finish collapsing after the virtualizer's content callback.
    // Recheck the committed layout, including a pane revealed or made taller
    // without any change to its rows or canonical history boundary.
    scheduleMeasurement();
    const observer = new ResizeObserver(scheduleMeasurement);
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      scheduleMeasurementRef.current = () => {};
    };
  }, [threadId, oldestEntryId, scrollElementRef, onStartReached, trigger]);

  function notifyContentHeight() {
    onContentHeightChange?.();
    trigger.measure({
      threadId,
      oldestEntryId,
      scroller: scrollElementRef.current,
      onStartReached,
    });
    scheduleMeasurementRef.current();
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
    const scroller = scrollElementRef.current;
    if (
      oldestEntryId !== undefined &&
      scroller &&
      scroller.clientHeight > 0 &&
      scroller.scrollHeight > scroller.clientHeight &&
      scroller.scrollTop <= 1
    ) {
      // At the top another upward gesture produces no scroll event, so a failed
      // virtualizer edge request would otherwise stay latched. The pager shares
      // its pending request across repeated gestures.
      void onStartReached?.();
      return;
    }
    trigger.retry({
      threadId,
      oldestEntryId,
      scroller: scrollElementRef.current,
      onStartReached,
    });
  }
  return { notifyContentHeight, retryUnderfilledHistory, resetUnderfilledHistory };
}
