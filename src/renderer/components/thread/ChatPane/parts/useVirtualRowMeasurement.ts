import { useCallback, useLayoutEffect, useRef } from "react";
import type { LegendListState } from "@legendapp/list/react";
import type { ChatTimelineEntry } from "../chatPaneSelectors";
import { syncFollowingVirtualRowPositions } from "./virtualRowLayout";

export interface VirtualRowSize {
  height: number;
  width: number;
}
export type RemeasureVirtualRow = (
  itemKey: string,
  element: HTMLDivElement | null,
  liveStreamGrowth?: boolean,
  observedSize?: VirtualRowSize,
) => LegendListState | null;

/** Keep resize observation independent of changing parent callbacks. Browser
 * supplied border-box dimensions avoid a second synchronous geometry read. */
export function useVirtualRowMeasurement(
  entry: ChatTimelineEntry,
  isLastEntry: boolean,
  remeasureElement: RemeasureVirtualRow,
  readMeasuredRowHeight: (itemKey: string) => number | undefined,
  /** Synchronous structural signal lets an established observer own dimensions.
   * Without this capability, explicit callers retain their full measurement. */
  onExplicitLayoutChange?: () => void,
) {
  const rowElementRef = useRef<HTMLDivElement | null>(null);
  const observationRef = useRef<{ element: HTMLDivElement; established: boolean } | null>(null);
  const remeasureElementRef = useRef(remeasureElement);
  const readMeasuredRowHeightRef = useRef(readMeasuredRowHeight);
  const onExplicitLayoutChangeRef = useRef(onExplicitLayoutChange);
  useLayoutEffect(() => {
    remeasureElementRef.current = remeasureElement;
    readMeasuredRowHeightRef.current = readMeasuredRowHeight;
    onExplicitLayoutChangeRef.current = onExplicitLayoutChange;
  }, [remeasureElement, readMeasuredRowHeight, onExplicitLayoutChange]);
  const liveMeasureRafRef = useRef<number | null>(null);
  // Keep the observer mounted when an appended prompt changes this row from
  // tail to mid-list; resetting its height baseline there misses completion
  // growth that lands in the same commit.
  const isLastEntryRef = useRef(isLastEntry);
  useLayoutEffect(() => {
    isLastEntryRef.current = isLastEntry;
  });
  const remeasureRow = useCallback(() => {
    const element = rowElementRef.current;
    if (!element) return;
    const observation = observationRef.current;
    if (observation && (observation.element !== element || !element.isConnected)) {
      observation.established = false;
    }
    if (
      observation?.element === element &&
      observation.established &&
      onExplicitLayoutChangeRef.current
    ) {
      // Preserve the non-live signal even for automatic disclosure changes.
      // The observer supplies fresh dimensions before paint; reuse no size here.
      onExplicitLayoutChangeRef.current();
      return;
    }
    remeasureElementRef.current(entry.id, element);
  }, [entry.id]);
  const scheduleLiveMeasure = useCallback(() => {
    if (liveMeasureRafRef.current !== null) return;
    liveMeasureRafRef.current = requestAnimationFrame(() => {
      liveMeasureRafRef.current = null;
      const element = rowElementRef.current;
      if (!element) return;
      remeasureElementRef.current(entry.id, element, true);
    });
  }, [entry.id]);
  // Stream events can arrive without changing the painted row size. Measuring
  // on every delta forces layout before the browser's resize delivery. Observe
  // actual geometry instead; explicit disclosure and inline-turn changes keep
  // their own measurement paths, including the coalesced frame above.
  useLayoutEffect(() => {
    const element = rowElementRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    // The initial ResizeObserver delivery supplies the baseline after layout.
    // Reading offsets while each new row mounts forces layout repeatedly in
    // the same React commit. An unknown baseline must still admit that first
    // delivery; LegendList remains authoritative for the resulting positions.
    let previousHeight: number | undefined;
    let previousWidth: number | undefined;
    let observingBorderBox = false;
    const observation = { element, established: false };
    const observerCallback: ResizeObserverCallback = (entries) => {
      if (
        observationRef.current !== observation ||
        rowElementRef.current !== element ||
        !element.isConnected
      ) {
        observation.established = false;
        return;
      }
      const entryObservation = entries?.find((candidate) => candidate.target === element);
      const wasEstablished = observation.established;
      observation.established = false;
      const box = entryObservation?.borderBoxSize?.[0];
      const nextHeight = box ? Math.round(box.blockSize) : element.offsetHeight;
      const nextWidth = box ? Math.round(box.inlineSize) : element.offsetWidth;
      const usableBox =
        observingBorderBox &&
        !!box &&
        Number.isFinite(nextHeight) &&
        Number.isFinite(nextWidth) &&
        nextHeight >= 0 &&
        nextWidth >= 0;
      if (nextHeight === previousHeight && nextWidth === previousWidth) {
        observation.established = usableBox && wasEstablished;
        return;
      }
      // The library may have a cached size, or its own observer may have run
      // first. An unknown first baseline does not imply growth. Read before
      // updating the size map so an initial cached shrink stays library-owned.
      const previousMeasuredHeight =
        previousHeight ?? readMeasuredRowHeightRef.current(entry.id) ?? nextHeight;
      const heightDelta = nextHeight - previousMeasuredHeight;
      previousHeight = nextHeight;
      previousWidth = nextWidth;
      // The smoothed Markdown renderer can grow between provider deltas, and the
      // completion commit renders the final text concurrently — often a few
      // frames after the store event. The DOM resize is the earliest reliable
      // signal and ResizeObserver runs after layout but before paint, so measure
      // LegendList here rather than waiting for the next stream event or frame.
      const layout = remeasureElementRef.current(entry.id, element, true, {
        height: nextHeight,
        width: nextWidth,
      });
      // LegendList may commit its position wrappers on this frame or the next.
      // Nothing sits below the tail, but a growing mid-list row can briefly
      // paint into its neighbour. Mirror the virtualizer's authoritative
      // single-column positions before paint; never infer them from DOM deltas.
      // Shrinks remain entirely LegendList-owned because it deliberately
      // confirms them on the next animation frame.
      if (layout && !isLastEntryRef.current && heightDelta > 0) {
        syncFollowingVirtualRowPositions(element, layout);
      }
      observation.established = usableBox && !!layout;
    };
    let observer: ResizeObserver | undefined;
    observationRef.current = observation;
    try {
      observer = new ResizeObserver(observerCallback);
      // Measure the same border box as offsetHeight/width, including changes
      // that leave the content box unchanged. Legacy delivery still falls back.
      try {
        observer.observe(element, { box: "border-box" });
        observingBorderBox = true;
      } catch {
        // Older observers may reject this option. Retain their live/completion
        // delivery path, but content-box ownership cannot replace explicit reads.
        observer.observe(element);
      }
    } catch {
      observationRef.current = null;
      try {
        observer?.disconnect();
      } catch {
        // An unusable observer leaves the explicit measurement fallback active.
      }
      return;
    }
    return () => {
      if (observationRef.current === observation) observationRef.current = null;
      observer.disconnect();
    };
  }, [entry.id]);
  useLayoutEffect(
    () => () => {
      if (liveMeasureRafRef.current !== null) {
        cancelAnimationFrame(liveMeasureRafRef.current);
        liveMeasureRafRef.current = null;
      }
    },
    [],
  );
  return { rowElementRef, remeasureRow, scheduleLiveMeasure };
}
