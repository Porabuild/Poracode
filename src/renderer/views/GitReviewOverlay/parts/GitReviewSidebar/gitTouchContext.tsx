import { createContext, useContext, useRef } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Touch adaptation for the git-review file list. On the desktop the per-file
 * and per-group actions live behind hover; a touch device has no hover, so the
 * mobile shell installs this context and the rows expose the same actions
 * through a long-press context menu instead. When the context is absent (the
 * desktop default) the rows render their original hover affordances unchanged.
 */

export interface GitTouchFileTarget {
  readonly path: string;
  readonly staged: boolean;
  readonly status: string;
  readonly insertions: number;
  readonly deletions: number;
}

export interface GitTouchGroupTarget {
  readonly title: string;
  readonly staged: boolean;
}

export interface GitTouchActions {
  /** Open the action menu for a single file row (stage/unstage, revert, …). */
  openFileMenu(target: GitTouchFileTarget): void;
  /** Open the action menu for a group header (stage all, revert all, …). */
  openGroupMenu(target: GitTouchGroupTarget): void;
}

const GitTouchContext = createContext<GitTouchActions | null>(null);

export const GitTouchProvider = GitTouchContext.Provider;

export function useGitTouch(): GitTouchActions | null {
  return useContext(GitTouchContext);
}

interface LongPressOptions {
  readonly delayMs?: number;
  readonly moveTolerancePx?: number;
}

/**
 * Disables the browser's own press-and-hold reactions so only our context menu
 * appears: text selection ("Select All") via `user-select`, and the iOS
 * long-press callout via `-webkit-touch-callout`. Spread alongside `handlers`.
 */
const PRESS_NO_SELECT: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
};

function isTouchLikePointer(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

/**
 * Fires `handler` after a press-and-hold. `firedRef` lets the caller suppress
 * the click that a touch release would otherwise dispatch right after a
 * long-press (so a long-press never also triggers the row's tap action).
 * `handlers` also swallows the native `contextmenu` event, and `style` blocks
 * the default text selection a long-press would otherwise start.
 */
export function useLongPress(handler: () => void, options: LongPressOptions = {}) {
  const { delayMs = 450, moveTolerancePx = 10 } = options;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    // Only press-and-hold from touch/pen; mouse keeps the hover affordances.
    if (!isTouchLikePointer(event.pointerType)) return;
    event.preventDefault();
    firedRef.current = false;
    startRef.current = { x: event.clientX, y: event.clientY };
    clear();
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      handler();
    }, delayMs);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > moveTolerancePx) {
      clear();
    }
  };

  const onPointerUp = () => clear();
  const onPointerCancel = () => clear();
  // The long-press also raises the native context menu on touch; swallow it so
  // it never competes with the action menu we open ourselves.
  const onContextMenu = (event: ReactMouseEvent) => event.preventDefault();

  return {
    firedRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu },
    style: PRESS_NO_SELECT,
  };
}
