import { useEffect, useEffectEvent, useState } from "react";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import {
  findVisibleRowRange,
  type RenderedRowBounds,
  type VisibleRowRange,
} from "./stickyPromptTarget";

const EDGE_TOLERANCE_PX = 2;

interface VisibleRowIds {
  firstId: string;
  lastId: string;
}

/**
 * Timeline indexes of the first and last rows that overlap the transcript
 * viewport, or null before the first measurement. Rows mount, move and resize
 * as the user scrolls, older pages load, or the tail streams. Each of those
 * either fires a scroll event or changes `entries`, so the range is
 * re-resolved on both, at most once per frame.
 *
 * The measured range is remembered by entry id and turned into indexes against
 * the `entries` of the current render. Prepending an older page shifts every
 * index at once; resolving by id keeps the range on the same rows instead of
 * pointing at their new neighbours until the next measurement.
 */
export function useVisibleRowRange(
  scrollElement: HTMLDivElement | null,
  entries: readonly ChatTimelineEntry[],
): VisibleRowRange | null {
  const [visibleIds, setVisibleIds] = useState<VisibleRowIds | null>(null);

  const syncRange = useEffectEvent((currentEntries: readonly ChatTimelineEntry[]) => {
    if (!scrollElement) return;
    const viewport = scrollElement.getBoundingClientRect();
    const rows: RenderedRowBounds[] = [];
    for (const row of scrollElement.querySelectorAll<HTMLElement>("[data-chat-virtual-row]")) {
      // A row can outlive its entry for a frame after the timeline changes.
      const index = Number(row.dataset.index);
      if (currentEntries[index]?.id !== row.dataset.itemId) continue;
      const rect = row.getBoundingClientRect();
      rows.push({ index, top: rect.top, bottom: rect.bottom });
    }
    // A row that only grazes the viewport edge is not on screen: after a jump
    // lands on a row, the previous row's bottom edge can overlap by a sub-pixel.
    const range = findVisibleRowRange(
      rows,
      viewport.top + EDGE_TOLERANCE_PX,
      viewport.bottom - EDGE_TOLERANCE_PX,
    );
    const next =
      range && currentEntries[range.first] && currentEntries[range.last]
        ? { firstId: currentEntries[range.first]!.id, lastId: currentEntries[range.last]!.id }
        : null;
    setVisibleIds((previous) =>
      previous?.firstId === next?.firstId && previous?.lastId === next?.lastId ? previous : next,
    );
  });

  useEffect(() => {
    if (!scrollElement) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        syncRange(entries);
      });
    };
    schedule();
    scrollElement.addEventListener("scroll", schedule, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scrollElement, entries]);

  if (visibleIds === null) return null;
  const first = entries.findIndex((entry) => entry.id === visibleIds.firstId);
  const last = entries.findIndex((entry) => entry.id === visibleIds.lastId);
  return first >= 0 && last >= 0 ? { first, last } : null;
}
