import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { readStoredBoolean } from "@/renderer/utils/localStorage";

/**
 * Legacy hand-rolled key, read once as the initial seed so existing installs
 * keep their collapsed state; the `persist` envelope (PERSIST_KEY) takes over
 * on the first write.
 */
const LEGACY_COLLAPSED_KEY = "lightcode-sidebar-collapsed";
const PERSIST_KEY = "lightcode-sidebar-overlay";

interface SidebarOverlayState {
  isCollapsed: boolean;
  isNarrow: boolean;
  closingOverlay: boolean;
  overlayReady: boolean;
  /** Latest shell (outer AppShell root) width in CSS pixels; 0 before first measurement. */
  shellWidth: number;
  /**
   * When the sidebar transitions from overlay to collapsed, transitions on
   * width/min-width must be suppressed for one paint so the collapsed width
   * applies instantly. The flag is flipped on (synchronously) before the
   * collapse render and back off in a raf, mirroring the prior ref-based
   * behaviour.
   */
  skipTransition: boolean;
  setCollapsed: (next: boolean) => void;
  setNarrow: (next: boolean) => void;
  setClosingOverlay: (next: boolean) => void;
  setOverlayReady: (next: boolean) => void;
  setShellWidth: (next: number) => void;
  setSkipTransition: (next: boolean) => void;
}

export const useSidebarOverlayStore = create<SidebarOverlayState>()(
  persist(
    (set) => ({
      isCollapsed: readStoredBoolean(LEGACY_COLLAPSED_KEY, false),
      isNarrow: false,
      closingOverlay: false,
      overlayReady: false,
      shellWidth: 0,
      skipTransition: false,
      setCollapsed: (next) => set((s) => (s.isCollapsed === next ? s : { isCollapsed: next })),
      setNarrow: (next) => set((s) => (s.isNarrow === next ? s : { isNarrow: next })),
      setClosingOverlay: (next) =>
        set((s) => (s.closingOverlay === next ? s : { closingOverlay: next })),
      setOverlayReady: (next) => set((s) => (s.overlayReady === next ? s : { overlayReady: next })),
      setShellWidth: (next) =>
        set((s) => (Math.abs(s.shellWidth - next) < 0.5 ? s : { shellWidth: next })),
      setSkipTransition: (next) =>
        set((s) => (s.skipTransition === next ? s : { skipTransition: next })),
    }),
    {
      name: PERSIST_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the user's collapse preference survives relaunch; the overlay
      // animation and measurement flags are session-scoped.
      partialize: (state) => ({ isCollapsed: state.isCollapsed }),
    },
  ),
);

export function selectShouldOverlay(s: SidebarOverlayState): boolean {
  return !s.isCollapsed && s.isNarrow;
}

export function selectIsOverlay(s: SidebarOverlayState): boolean {
  return selectShouldOverlay(s) || s.closingOverlay;
}

/**
 * Collapse the sidebar. When the sidebar is currently floating as an overlay
 * (narrow viewport), play the slide-out animation first, then snap to the
 * collapsed width without a width transition.
 */
export function collapseSidebar(): void {
  const s = useSidebarOverlayStore.getState();
  if (selectShouldOverlay(s)) {
    s.setClosingOverlay(true);
    setTimeout(() => {
      const cur = useSidebarOverlayStore.getState();
      cur.setSkipTransition(true);
      cur.setClosingOverlay(false);
      cur.setCollapsed(true);
      requestAnimationFrame(() => {
        useSidebarOverlayStore.getState().setSkipTransition(false);
      });
    }, 200);
  } else {
    s.setCollapsed(true);
  }
}

export function expandSidebar(): void {
  useSidebarOverlayStore.getState().setCollapsed(false);
}

/**
 * Toggle the sidebar's collapsed state. Expanding is a plain state flip;
 * collapsing routes through {@link collapseSidebar} so the overlay (narrow
 * viewport) slide-out animation still plays. Backs the `sidebar.toggle`
 * command.
 */
export function toggleSidebar(): void {
  if (useSidebarOverlayStore.getState().isCollapsed) {
    expandSidebar();
  } else {
    collapseSidebar();
  }
}
