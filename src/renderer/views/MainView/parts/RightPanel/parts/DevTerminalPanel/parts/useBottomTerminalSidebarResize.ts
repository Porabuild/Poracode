import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { readStoredNumber, writeStoredNumber } from "@/renderer/utils/localStorage";

const WIDTH_STORAGE_KEY = "poracode-bottom-terminal-sidebar-width";
export const BOTTOM_TERMINAL_SIDEBAR_MIN_WIDTH = 100;
export const BOTTOM_TERMINAL_SIDEBAR_MAX_WIDTH = 360;
const BOTTOM_TERMINAL_SIDEBAR_DEFAULT_WIDTH = 140;
const KEY_RESIZE_STEP_PX = 24;

function clampWidth(width: number): number {
  return Math.min(
    BOTTOM_TERMINAL_SIDEBAR_MAX_WIDTH,
    Math.max(BOTTOM_TERMINAL_SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
}

export function useBottomTerminalSidebarResize() {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampWidth(readStoredNumber(WIDTH_STORAGE_KEY, BOTTOM_TERMINAL_SIDEBAR_DEFAULT_WIDTH)),
  );
  const widthRef = useRef(sidebarWidth);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  function applyWidth(width: number): number {
    const next = clampWidth(width);
    widthRef.current = next;
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${next}px`;
      sidebarRef.current.style.minWidth = `${next}px`;
    }
    return next;
  }

  function commitWidth(width: number) {
    const next = applyWidth(width);
    setSidebarWidth(next);
    writeStoredNumber(WIDTH_STORAGE_KEY, next);
  }

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    cleanupRef.current?.();

    const startX = event.clientX;
    const startWidth = widthRef.current;

    function onPointerMove(pointerEvent: PointerEvent) {
      applyWidth(startWidth + pointerEvent.clientX - startX);
    }

    function cleanup() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      cleanupRef.current = null;
    }

    function onPointerUp() {
      cleanup();
      commitWidth(widthRef.current);
    }

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = widthRef.current - KEY_RESIZE_STEP_PX;
        break;
      case "ArrowRight":
        next = widthRef.current + KEY_RESIZE_STEP_PX;
        break;
      case "Home":
        next = BOTTOM_TERMINAL_SIDEBAR_MIN_WIDTH;
        break;
      case "End":
        next = BOTTOM_TERMINAL_SIDEBAR_MAX_WIDTH;
        break;
      default:
        return;
    }
    event.preventDefault();
    commitWidth(next);
  }

  return {
    sidebarRef,
    sidebarWidth,
    handleResizeStart,
    handleResizeKeyDown,
  };
}
