import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useComposerBubbleSlotStore } from "@/renderer/state/composerBubbleSlotStore";
import { shouldDisplaceCenteredControl } from "./composerBubbleRowGeometry";

/** Matches the 28px (`size-7`) floating chrome scale shared by the bubbles. */
const CONTROL_WIDTH_PX = 28;

/**
 * The out-of-flow row of composer bubbles above the composer, plus the slot a
 * pane's floating control (scroll-to-bottom) portals into. The control sits
 * centered on the bubbles' bottom line; when the right-aligned bubbles reach
 * the center it moves to its own centered row above them.
 *
 * Only the bubbles and the slot take pointer events: the row spans the pane
 * width so it can center the control, and must not shadow chat content.
 */
export function ComposerBubbleRow({
  threadId,
  children,
}: {
  threadId: string;
  children: ReactNode;
}) {
  const setSlot = useComposerBubbleSlotStore((s) => s.setSlot);
  const rowRef = useRef<HTMLDivElement>(null);
  const [displaced, setDisplaced] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const rowRect = row.getBoundingClientRect();
      let bubblesLeft: number | null = null;
      for (const child of row.children) {
        const rect = child.getBoundingClientRect();
        if (rect.width === 0) continue;
        bubblesLeft = bubblesLeft === null ? rect.left : Math.min(bubblesLeft, rect.left);
      }
      setDisplaced(
        shouldDisplaceCenteredControl({
          rowLeft: rowRect.left,
          rowWidth: rowRect.width,
          bubblesLeft,
          controlWidth: CONTROL_WIDTH_PX,
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    for (const child of row.children) observer.observe(child);
    const mutations = new MutationObserver(() => {
      observer.disconnect();
      observer.observe(row);
      for (const child of row.children) observer.observe(child);
      measure();
    });
    mutations.observe(row, { childList: true });
    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => () => setSlot(threadId, null), [setSlot, threadId]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-1.5 flex flex-col gap-1.5">
      <div
        ref={(el) => setSlot(threadId, el)}
        data-displaced={displaced ? "" : undefined}
        className={
          displaced
            ? "pointer-events-auto flex justify-center empty:hidden"
            : "pointer-events-auto absolute bottom-0 left-1/2 -translate-x-1/2"
        }
      />
      <div
        ref={rowRef}
        className="flex flex-wrap items-center justify-end gap-1.5 px-3 *:pointer-events-auto"
      >
        {children}
      </div>
    </div>
  );
}
