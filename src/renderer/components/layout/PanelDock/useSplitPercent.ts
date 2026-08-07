import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { readStoredNumber, writeStoredNumber } from "@/renderer/utils/localStorage";

const KEY_RESIZE_STEP_PERCENT = 2;

/**
 * Percent-based two-pane split resize (drag + keyboard), persisted per
 * `storageKey`. During a drag the percent is written straight to the sized
 * pane's `flexBasis`; React state (and localStorage) only commit on release,
 * like the terminal split in `TerminalSurfaces`.
 */
export function useSplitPercent(options: {
  storageKey: string;
  /** "row": panes sit side by side (drag along X). "column": panes stack (drag along Y). */
  orientation: "row" | "column";
  /** Element whose size converts pointer deltas into percent. */
  containerRef: RefObject<HTMLElement | null>;
  /** Pane that receives the live `flexBasis` writes; its size is `percent`. */
  paneRef: RefObject<HTMLElement | null>;
  /** Flip drag direction when the sized pane sits after the divider. */
  invert?: boolean;
  defaultPercent?: number;
  minPercent?: number;
}) {
  const {
    storageKey,
    orientation,
    containerRef,
    paneRef,
    invert = false,
    defaultPercent = 50,
    minPercent = 15,
  } = options;
  const maxPercent = 100 - minPercent;

  function clampPercent(value: number): number {
    if (!Number.isFinite(value)) return defaultPercent;
    return Math.min(maxPercent, Math.max(minPercent, value));
  }

  const [percent, setPercent] = useState(() =>
    clampPercent(readStoredNumber(storageKey, defaultPercent)),
  );
  const percentRef = useRef(percent);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  // Re-sync the pane after commits and after the pane remounts on
  // placement/tab changes (flexBasis lives on the element, not in JSX).
  useEffect(() => {
    percentRef.current = percent;
    if (paneRef.current) paneRef.current.style.flexBasis = `${percent}%`;
  });

  function applyPercent(value: number): number {
    const next = clampPercent(value);
    percentRef.current = next;
    if (paneRef.current) paneRef.current.style.flexBasis = `${next}%`;
    return next;
  }

  function commitPercent(value: number) {
    const next = applyPercent(value);
    setPercent(next);
    writeStoredNumber(storageKey, next);
  }

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    cleanupRef.current?.();

    // Keep receiving moves even when the pointer crosses a webview/iframe
    // (browser panel, terminal) that would otherwise swallow the events.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    const startCoord = orientation === "row" ? event.clientX : event.clientY;
    const startPercent = percentRef.current;

    function onPointerMove(pointerEvent: PointerEvent) {
      const container = containerRef.current;
      if (!container) return;
      const totalSize = orientation === "row" ? container.offsetWidth : container.offsetHeight;
      if (totalSize <= 0) return;
      const pointerCoord = orientation === "row" ? pointerEvent.clientX : pointerEvent.clientY;
      const deltaPercent = ((pointerCoord - startCoord) / totalSize) * 100 * (invert ? -1 : 1);
      applyPercent(startPercent + deltaPercent);
    }

    function cleanup() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      cleanupRef.current = null;
    }

    function onPointerUp() {
      cleanup();
      commitPercent(percentRef.current);
    }

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const decreaseKey = orientation === "row" ? "ArrowLeft" : "ArrowUp";
    const increaseKey = orientation === "row" ? "ArrowRight" : "ArrowDown";
    const step = KEY_RESIZE_STEP_PERCENT * (invert ? -1 : 1);
    let next: number;
    switch (event.key) {
      case decreaseKey:
        next = percentRef.current - step;
        break;
      case increaseKey:
        next = percentRef.current + step;
        break;
      case "Home":
        next = minPercent;
        break;
      case "End":
        next = maxPercent;
        break;
      default:
        return;
    }
    event.preventDefault();
    commitPercent(next);
  }

  return { percent, minPercent, maxPercent, handleResizeStart, handleResizeKeyDown };
}
