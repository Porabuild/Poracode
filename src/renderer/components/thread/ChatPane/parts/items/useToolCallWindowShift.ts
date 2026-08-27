import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createToolCallWindowShift, type ToolCallWindowShiftHandle } from "./toolCallWindowShift";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export interface UseToolCallWindowShiftOptions {
  /** Ordered keys of the rows currently rendered in the collapsed window. */
  keys: readonly string[];
  /** Raw Settings -> GUI chat font size, the input to the baked pitch table. */
  guiChatFontSize: number;
  /**
   * True only for a live collapsed window that actually drops rows. Growth,
   * `Show all`, and history groups have nothing to slide.
   */
  isWindowed: boolean;
  /** The in-flow rows container the group already keeps a ref to. */
  viewportRef: RefObject<HTMLDivElement | null>;
}

export interface UseToolCallWindowShiftResult {
  wrapRef: RefObject<HTMLDivElement | null>;
  /** Pass to `ToolCallRowOpenContext` so expanded rows disable the animation. */
  onRowOpenChange: (open: boolean) => void;
}

/**
 * Wires the group's DOM into the sliding-window rig. All the animation state
 * lives in the framework-free `toolCallWindowShift` module; this hook only
 * supplies refs, the per-commit `sync` call, and the gating flags.
 */
export function useToolCallWindowShift({
  keys,
  guiChatFontSize,
  isWindowed,
  viewportRef,
}: UseToolCallWindowShiftOptions): UseToolCallWindowShiftResult {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const openRowCountRef = useRef(0);
  const shiftRef = useRef<ToolCallWindowShiftHandle | null>(null);
  // Optimistic: an IntersectionObserver reports asynchronously, and the live
  // tail is on screen in the common case. Being wrong costs one animation.
  const isOnScreenRef = useRef(true);

  useLayoutEffect(() => {
    // Built on first commit and disposed with the group, so the composited
    // layers a running animation holds never outlive the rows that need them.
    shiftRef.current ??= createToolCallWindowShift(window);
    return () => {
      shiftRef.current?.dispose();
      shiftRef.current = null;
    };
  }, []);

  // A group can stay mounted while scrolled out of view — the virtualizer keeps
  // a margin of rows around the viewport, and the user can scroll away from a
  // live tail that is still appending. Animating there is pure waste, so the rig
  // is torn down and the window snaps until it comes back on screen.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) isOnScreenRef.current = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isWindowed]);

  useLayoutEffect(() => {
    shiftRef.current?.sync({
      wrap: wrapRef.current,
      viewport: viewportRef.current,
      keys,
      guiChatFontSize,
      enabled:
        isWindowed &&
        openRowCountRef.current === 0 &&
        isOnScreenRef.current &&
        !prefersReducedMotion() &&
        document.visibilityState === "visible",
    });
  }, [guiChatFontSize, isWindowed, keys, viewportRef]);

  // Stable identity: this is a context value, and a fresh function per render
  // would re-render every row in the group on every appended tool call.
  const [onRowOpenChange] = useState(() => (open: boolean) => {
    openRowCountRef.current = Math.max(0, openRowCountRef.current + (open ? 1 : -1));
    if (open) shiftRef.current?.cancel();
  });

  return { wrapRef, onRowOpenChange };
}
