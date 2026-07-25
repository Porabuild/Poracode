import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePanelStore } from "@/renderer/state/panelStore";

/** Pointer travel before a press turns into a drag instead of a button click. */
const DRAG_THRESHOLD_PX = 4;
/** Keeps the rail off the pane's top and bottom edges. */
const EDGE_INSET_PX = 8;

interface RailDragState {
  pointerId: number;
  startY: number;
  startOffset: number;
  lastOffset: number;
  moved: boolean;
}

interface ThreadToolRailDrag {
  /** Clamped vertical offset to render at, live while dragging. */
  offset: number;
  isDragging: boolean;
  /** Spread onto the rail pill — it is both the grab handle and the tool container. */
  dragHandlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  };
}

/**
 * Vertical-only drag for the thread tool rail. The offset lives in the panel
 * store (persisted, shared by every pane) and is clamped to the pane on every
 * render, so shrinking the window can never park the rail out of reach.
 *
 * The rail pill doubles as the grab handle, so a press only becomes a drag past
 * {@link DRAG_THRESHOLD_PX}; below that it stays a plain button click. When it
 * does become a drag, the click that follows `pointerup` is swallowed.
 */
export function useThreadToolRailDrag(params: {
  paneHeight: number | null;
  railHeight: number | null;
}): ThreadToolRailDrag {
  const { paneHeight, railHeight } = params;
  const storedOffset = usePanelStore((s) => s.threadToolRailOffset);
  const setStoredOffset = usePanelStore((s) => s.setThreadToolRailOffset);

  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStateRef = useRef<RailDragState | null>(null);
  const justDraggedRef = useRef(false);

  function clamp(value: number): number {
    const maxOffset =
      paneHeight !== null && railHeight !== null
        ? Math.max(EDGE_INSET_PX, paneHeight - railHeight - EDGE_INSET_PX)
        : null;
    const lowerBounded = Math.max(value, EDGE_INSET_PX);
    return maxOffset === null ? lowerBounded : Math.min(lowerBounded, maxOffset);
  }

  const offset = clamp(dragOffset ?? storedOffset);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: offset,
      lastOffset: offset,
      moved: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const delta = event.clientY - state.startY;
    if (!state.moved) {
      if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      state.moved = true;
      // Captured only once this is a real drag: capturing on `pointerdown`
      // retargets `pointerup` and swallows clicks on the tool buttons.
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const next = clamp(state.startOffset + delta);
    state.lastOffset = next;
    setDragOffset(next);
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragOffset(null);
    if (!state.moved) return;
    justDraggedRef.current = true;
    setStoredOffset(state.lastOffset);
  }

  function onClickCapture(event: React.MouseEvent<HTMLElement>) {
    if (!justDraggedRef.current) return;
    justDraggedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    offset,
    isDragging: dragOffset !== null,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onClickCapture,
    },
  };
}
