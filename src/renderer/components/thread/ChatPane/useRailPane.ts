import { useEffect, useState } from "react";

/** The transcript column's width cap (`max-w-[920px]` on its rows). */
const TRANSCRIPT_COLUMN_WIDTH_PX = 920;
/** Inset from the pane edge (12) plus the rail (24) and a gap (8). */
export const RAIL_MIN_GUTTER_PX = 44;

interface RailPane {
  pane: HTMLElement;
  /** Free space between the pane's left edge and the transcript column's text. */
  gutter: number;
}

/**
 * The thread pane that hosts the transcript, and where the transcript sits in
 * it. The transcript is a column capped in width and aligned (centered, or
 * pushed left in a split), so floating chrome that must clear it (the prompt
 * rail) is placed in the pane instead, given the measured `gutter` beside the
 * column. Its vertical anchor belongs to the pane, so composer growth does not
 * move it. Null when the transcript is not inside a thread pane (side chat,
 * overlays), the primary pointer is not fine (touch), or before it is measured.
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
      const gutter =
        scrollRect.left -
        paneRect.left +
        Math.max(0, (scrollRect.width - TRANSCRIPT_COLUMN_WIDTH_PX) / 2);
      setMeasured((previous) =>
        previous?.scroller === scrollElement &&
        previous.pane === pane &&
        Math.abs(previous.gutter - gutter) < 0.5
          ? previous
          : { scroller: scrollElement, pane, gutter },
      );
    });
    observer.observe(pane);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [scrollElement]);

  return measured && measured.scroller === scrollElement ? measured : null;
}
