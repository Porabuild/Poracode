import { useEffect, useState } from "react";

/** The transcript column's width cap (`max-w-[920px]` on its rows). */
const TRANSCRIPT_COLUMN_WIDTH_PX = 920;
/** Inset from the pane edge (12) plus the rail (24) and a gap (8). */
export const RAIL_MIN_GUTTER_PX = 44;

interface RailPane {
  pane: HTMLElement;
  /** Free space between the pane's left edge and the transcript column's text. */
  gutter: number;
  /** Space between the pane's top edge and the transcript scroller. */
  top: number;
  /** Space between the transcript scroller and the pane's bottom edge. */
  bottom: number;
}

/**
 * The thread pane that hosts the transcript, and where the transcript sits in
 * it. The transcript is a column capped in width and aligned (centered, or
 * pushed left in a split), so floating chrome that must clear it (the prompt
 * rail) is placed in the pane instead, spanning only the scroller's height and
 * given the measured `gutter` beside the column. Null when the transcript is
 * not inside a thread pane (side chat, overlays), the primary pointer is not
 * fine (touch), or before it is measured.
 */
export function useRailPane(scrollElement: HTMLDivElement | null): RailPane | null {
  const [measured, setMeasured] = useState<(RailPane & { scroller: HTMLElement }) | null>(null);

  useEffect(() => {
    const pane = scrollElement?.closest<HTMLElement>("[data-poracode-thread-pane]");
    if (!scrollElement || !pane) return;
    if (typeof window.matchMedia === "function" && !window.matchMedia("(pointer: fine)").matches)
      return;
    // A ResizeObserver reports once as soon as it starts observing, which is
    // the initial measurement; later reports follow layout changes.
    const observer = new ResizeObserver(() => {
      const paneRect = pane.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      const top = scrollRect.top - paneRect.top;
      const bottom = paneRect.bottom - scrollRect.bottom;
      const gutter =
        scrollRect.left -
        paneRect.left +
        Math.max(0, (scrollRect.width - TRANSCRIPT_COLUMN_WIDTH_PX) / 2);
      setMeasured((previous) =>
        previous?.scroller === scrollElement &&
        previous.pane === pane &&
        Math.abs(previous.top - top) < 0.5 &&
        Math.abs(previous.bottom - bottom) < 0.5 &&
        Math.abs(previous.gutter - gutter) < 0.5
          ? previous
          : { scroller: scrollElement, pane, top, bottom, gutter },
      );
    });
    observer.observe(pane);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [scrollElement]);

  return measured && measured.scroller === scrollElement ? measured : null;
}
