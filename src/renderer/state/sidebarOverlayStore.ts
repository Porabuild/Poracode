import { create } from "zustand";
import { readStoredBoolean } from "@/renderer/utils/localStorage";
import { persistStoreSlice, readPersistedSlice } from "@/renderer/utils/persistStoreSlice";

/**
 * Legacy hand-rolled key, retained for Electron where it represents an
 * explicit desktop preference. Browser V1 state is invalidated below because
 * it may contain responsive auto-collapse.
 */
const LEGACY_COLLAPSED_KEY = "poracode-sidebar-collapsed";
const PERSIST_KEY = "poracode-sidebar-overlay";
// V1 also captured responsive auto-collapse. V2 stores only an explicit user preference.
const PERSIST_VERSION = 2;
const isElectronHost = typeof window !== "undefined" && Boolean(window.poracodeHost);

interface SidebarOverlayState {
  isCollapsed: boolean;
  userCollapsed: boolean;
  isAutoCollapsed: boolean;
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
  setAutoCollapsed: (next: boolean) => void;
  setNarrow: (next: boolean) => void;
  setClosingOverlay: (next: boolean) => void;
  setOverlayReady: (next: boolean) => void;
  setShellWidth: (next: number) => void;
  setSkipTransition: (next: boolean) => void;
}

const initialPersisted = readPersistedSlice<{ version: number; isCollapsed: boolean }>(PERSIST_KEY);
const initialUserCollapsed =
  initialPersisted?.version === PERSIST_VERSION
    ? (initialPersisted.isCollapsed ?? false)
    : isElectronHost
      ? (initialPersisted?.isCollapsed ?? readStoredBoolean(LEGACY_COLLAPSED_KEY, false))
      : false;

if (initialPersisted && initialPersisted.version !== PERSIST_VERSION) {
  try {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ version: PERSIST_VERSION, isCollapsed: initialUserCollapsed }),
    );
  } catch {
    // Persistence is best-effort; keep the in-memory migrated value.
  }
}

export const useSidebarOverlayStore = create<SidebarOverlayState>()((set) => ({
  isCollapsed: initialUserCollapsed,
  userCollapsed: initialUserCollapsed,
  isAutoCollapsed: false,
  isNarrow: false,
  closingOverlay: false,
  overlayReady: false,
  shellWidth: 0,
  skipTransition: false,
  setCollapsed: (next) =>
    set((s) =>
      s.isCollapsed === next && s.userCollapsed === next && !s.isAutoCollapsed
        ? s
        : { isCollapsed: next, userCollapsed: next, isAutoCollapsed: false },
    ),
  setAutoCollapsed: (next) =>
    set((s) => {
      if (next) {
        return s.isCollapsed ? s : { isCollapsed: true, isAutoCollapsed: true };
      }
      return s.isAutoCollapsed ? { isCollapsed: s.userCollapsed, isAutoCollapsed: false } : s;
    }),
  setNarrow: (next) => set((s) => (s.isNarrow === next ? s : { isNarrow: next })),
  setClosingOverlay: (next) =>
    set((s) => (s.closingOverlay === next ? s : { closingOverlay: next })),
  setOverlayReady: (next) => set((s) => (s.overlayReady === next ? s : { overlayReady: next })),
  setShellWidth: (next) =>
    set((s) => (Math.abs(s.shellWidth - next) < 0.5 ? s : { shellWidth: next })),
  setSkipTransition: (next) =>
    set((s) => (s.skipTransition === next ? s : { skipTransition: next })),
}));

// Only the user's collapse preference survives relaunch; the overlay animation
// and measurement flags (shellWidth/isNarrow/…) are session-scoped. Persisting
// just this slice keeps the ResizeObserver-driven setShellWidth/setNarrow writes
// off localStorage — they change the store many times per resize but never the
// persisted value.
persistStoreSlice(useSidebarOverlayStore, PERSIST_KEY, (state) => ({
  version: PERSIST_VERSION,
  isCollapsed: state.userCollapsed,
}));

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
