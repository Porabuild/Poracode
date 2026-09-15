import { type RefObject, useEffect } from "react";
import { useTwoRafReady } from "@/renderer/hooks/useTwoRafReady";
import { selectShouldOverlay, useSidebarOverlayStore } from "@/renderer/state/sidebarOverlayStore";
import { CONTENT_MIN_WIDTH } from "./useResizablePanels";

const SIDEBAR_COLLAPSED_WIDTH = 48;

export { SIDEBAR_COLLAPSED_WIDTH };

function readStableObservedWidth(entry: ResizeObserverEntry): number | null {
  if (!entry.target.isConnected) return null;
  const width = entry.contentRect.width;
  if (width <= 0) return null;
  return width;
}

/**
 * Wires DOM ResizeObservers and the overlay-ready raf chain to the
 * `sidebarOverlayStore`. Sidebar overlay state lives in zustand so that the
 * components that *render* the sidebar can subscribe to specific slices
 * (and only those subscribers re-render on collapse). This hook owns the
 * effects and writes to the store; it returns nothing.
 */
export function useSidebarOverlayEffects(opts: {
  sidebarWidth: number;
  shellRef: RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}) {
  const { sidebarWidth, shellRef, disabled = false } = opts;

  // Shell width → isNarrow + shellWidth. On the narrow transition we collapse
  // the sidebar to the icon rail rather than overlaying it; overlay only
  // triggers if the user manually re-expands the sidebar in narrow mode.
  // Auto-collapsing is restored when the window grows back above the threshold.
  // `shellWidth` is also written so other shell consumers (right-overlay
  // detection) can share this single observer instead of doubling up.
  useEffect(() => {
    if (disabled) return;
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = readStableObservedWidth(entry);
      if (width === null) return;
      const next = width < CONTENT_MIN_WIDTH + sidebarWidth;
      const store = useSidebarOverlayStore.getState();
      if (next && !store.isNarrow) {
        if (!store.isCollapsed) {
          store.setAutoCollapsed(true);
        }
      } else if (!next && store.isNarrow) {
        store.setAutoCollapsed(false);
      }
      store.setNarrow(next);
      store.setShellWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [disabled, sidebarWidth, shellRef]);

  // shouldOverlay → overlayReady, via the shared two-RAF gate so the browser
  // commits the off-screen `translateX(-full)` state before the slide-in
  // transition starts.
  const shouldOverlay = useSidebarOverlayStore(selectShouldOverlay);
  const overlayReady = useTwoRafReady(shouldOverlay);
  useEffect(() => {
    useSidebarOverlayStore.getState().setOverlayReady(overlayReady);
  }, [overlayReady]);
}
