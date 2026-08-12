import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** Pointer handlers wired onto a `.m-sheet-grabber` element. */
export type SheetGrabberHandlers = {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/**
 * Drag-to-dismiss (and optionally drag-to-expand) gesture shared by every compact
 * sheet surface — `BottomSheet`, `FullScreenDrawer`, and the renderer's
 * `ResponsiveMenuSurface` drawer — so the finger math and thresholds live in one
 * place instead of three hand-kept-in-sync copies.
 *
 * The grabber tracks the finger by writing `--m-sheet-drag-y` on the sheet
 * element (via `sheetRef`); the CSS in `src/renderer/styles.css` turns that offset
 * into the transform. A downward drag past the threshold calls `onClose`; when
 * `expandable`, an upward drag snaps to the expanded height and a downward drag
 * from expanded collapses back.
 */
export function useSheetGrabber(options: {
  /** Enable the expand/collapse axis (bottom sheets); drawers pass `false`. */
  readonly expandable: boolean;
  /** Ignore new drags while the sheet is playing its exit animation. */
  readonly closing?: boolean | undefined;
  readonly onClose: () => void;
  /**
   * For sheets that stay mounted across open/close (e.g. `ResponsiveMenuSurface`),
   * pass the current open flag; the drag/expanded state resets each time it turns
   * true. Sheets that unmount when closed can omit it.
   */
  readonly resetOnOpen?: boolean | undefined;
}): {
  readonly sheetRef: RefObject<HTMLDivElement | null>;
  readonly expanded: boolean;
  readonly dragging: boolean;
  readonly grabberHandlers: SheetGrabberHandlers;
} {
  const { expandable, closing, onClose, resetOnOpen } = options;
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    expandedAtStart: boolean;
  } | null>(null);

  const clearDragOffset = () => {
    sheetRef.current?.style.removeProperty("--m-sheet-drag-y");
  };
  const setDragOffset = (offsetY: number) => {
    sheetRef.current?.style.setProperty("--m-sheet-drag-y", `${offsetY}px`);
  };

  // Sheets that stay mounted must clear stale drag/expanded state on reopen.
  useEffect(() => {
    if (!resetOnOpen) return;
    setExpanded(false);
    setDragging(false);
    dragRef.current = null;
    clearDragOffset();
  }, [resetOnOpen]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (closing) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      expandedAtStart: expanded,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.lastY = event.clientY;
    const deltaY = event.clientY - drag.startY;
    // Upward drags only get a slight rubber-band nudge; downward drags track the
    // finger toward dismissal.
    const easedY = deltaY < 0 ? Math.max(deltaY * 0.2, -28) : deltaY;
    setDragOffset(easedY);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const deltaY = drag.lastY - drag.startY;
    if (expandable) {
      const shouldClose =
        (drag.expandedAtStart && deltaY > 140) || (!drag.expandedAtStart && deltaY > 80);
      if (shouldClose) {
        setDragOffset(Math.max(deltaY, 0));
        onClose();
        return;
      }
      clearDragOffset();
      if (deltaY < -56) {
        setExpanded(true);
      } else if (drag.expandedAtStart && deltaY > 48) {
        setExpanded(false);
      }
      return;
    }
    if (deltaY > 120) {
      setDragOffset(Math.max(deltaY, 0));
      onClose();
      return;
    }
    clearDragOffset();
  };

  return {
    sheetRef,
    expanded,
    dragging,
    grabberHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}

/** The drag handle rendered at the top of every compact sheet/drawer. */
export function SheetGrabber(props: { readonly handlers: SheetGrabberHandlers }) {
  return (
    <div className="m-sheet-grabber" aria-hidden="true" {...props.handlers}>
      <span />
    </div>
  );
}
