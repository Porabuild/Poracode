import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useLingui } from "@lingui/react/macro";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { useBrowserDockStore } from "@/renderer/state/browserDockStore";
import { pushEscapeHandler } from "@/renderer/components/layout/overlayEscapeStack";
import { BrowserPanel } from "./BrowserPanel";

const MemoBrowserPanel = memo(BrowserPanel);

type BrowserHostMode = "hidden" | "docked" | "drawer" | "fullscreen";

/**
 * Mounts the in-app browser exactly once, in a `document.body` portal, and
 * repositions it per presentation mode (docked over the right-panel slot,
 * floating drawer, or fullscreen). Keeping a single mounted instance is what
 * lets the live page survive every docked↔drawer↔fullscreen transition — each
 * `<webview>` owns its own guest WebContents, so remounting would reload it.
 *
 * Rendering from the body (rather than inside the right panel) is also required
 * for correctness: the panel lives under a `will-change-transform` ancestor
 * (AsideSlot) and inside a `z-index` stacking context (UnifiedRightPanel tab
 * layer), both of which would clip a nested `position: fixed` overlay.
 *
 * Positioning is applied imperatively so per-frame rect tracking never
 * re-renders the embedded webview.
 */
export function BrowserHost() {
  const { t } = useLingui();
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const browserOverlayOpen = usePanelStore((s) => s.browserOverlayOpen);
  const browserOverlayMaximized = usePanelStore((s) => s.browserOverlayMaximized);
  const drawerWidth = usePanelStore((s) => s.browserOverlayDrawerWidth);
  const setDrawerWidth = usePanelStore((s) => s.setBrowserOverlayDrawerWidth);
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  const setBrowserOverlayOpen = usePanelStore((s) => s.setBrowserOverlayOpen);
  const setBrowserOverlayMaximized = usePanelStore((s) => s.setBrowserOverlayMaximized);
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab);
  const extracted = useBrowserPanelStore((s) => s.extracted);

  const mode: BrowserHostMode = extracted
    ? "hidden"
    : browserOverlayOpen
      ? browserOverlayMaximized
        ? "fullscreen"
        : "drawer"
      : browserPanelOpen
        ? "docked"
        : "hidden";

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const dockedVisible = rightPanelTab === "browser";

  // Position imperatively for every mode so leftover inline styles never fight
  // the next mode's layout. While docked, track the panel slot's rect each
  // frame — sidebar collapse / panel resize can move it without a React render.
  useLayoutEffect(() => {
    const w = wrapperRef.current;
    if (!w) return;
    if (mode === "fullscreen") {
      Object.assign(w.style, { top: "0px", left: "0px", right: "0px", bottom: "0px" });
      w.style.width = "";
      w.style.height = "";
      w.style.maxWidth = "";
      // Clear the docked z-index override so the fullscreen class (z-80) wins.
      w.style.zIndex = "";
      return;
    }
    if (mode === "drawer") {
      Object.assign(w.style, {
        top: "2rem",
        right: "2rem",
        bottom: "2rem",
        left: "auto",
        width: `${drawerWidth}px`,
        maxWidth: "calc(100vw - 4rem)",
      });
      w.style.height = "";
      // Clear the docked z-index override so the drawer class (z-60) wins.
      w.style.zIndex = "";
      return;
    }
    // docked
    if (!dockedVisible) return;
    let raf = 0;
    let last = "";
    let lastOverlay: boolean | null = null;
    const measure = () => {
      const el = useBrowserDockStore.getState().slotEl;
      if (!el) return;
      // On narrow viewports the right panel that hosts the slot floats as a
      // fixed, opaque overlay (z-50). The webview is body-portaled at z-30, so
      // it would paint *behind* that panel. Detect the overlay from the slot's
      // own ancestry — its containing panel <aside> switches from `relative`
      // (docked) to `fixed` (overlay) — and lift the webview above it (z-55,
      // matching the drawer's intent of riding over panel/settings chrome).
      const panelAside = el.closest("aside");
      const overlay = !!panelAside && getComputedStyle(panelAside).position === "fixed";
      if (overlay !== lastOverlay) {
        lastOverlay = overlay;
        w.style.zIndex = overlay ? "55" : "";
      }
      const r = el.getBoundingClientRect();
      const key = `${r.top}|${r.left}|${r.width}|${r.height}`;
      if (key === last) return;
      last = key;
      Object.assign(w.style, {
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        right: "auto",
        bottom: "auto",
        maxWidth: "",
      });
    };
    measure();
    const tick = () => {
      measure();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, drawerWidth, dockedVisible]);

  useLayoutEffect(() => {
    if (mode !== "drawer" && mode !== "fullscreen") return;
    return pushEscapeHandler(restoreOrCloseOverlay);
    // restoreOrCloseOverlay closes over stable store setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, browserPanelOpen]);

  if (mode === "hidden") return null;

  function restoreOrCloseOverlay() {
    setBrowserOverlayMaximized(false);
    setBrowserOverlayOpen(false);
    if (browserPanelOpen) setRightPanelTab("browser");
  }

  function handleResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = drawerWidth;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    setIsResizing(true);
    const onMove = (e: MouseEvent) => {
      // Handle is on the LEFT edge of a panel anchored to the RIGHT viewport
      // edge; dragging left (negative delta) grows the panel.
      setDrawerWidth(startWidth + (startX - e.clientX));
    };
    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setIsResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Docked z-index defaults to z-30 here; while the host panel is floating as a
  // fixed overlay, the positioning effect lifts it to 55 imperatively (see the
  // docked branch above) so it never re-renders the embedded webview.
  const wrapperClassName =
    mode === "docked"
      ? "fixed z-30 flex min-h-0 flex-col overflow-hidden bg-[var(--content-background)]"
      : mode === "drawer"
        ? "fixed z-[60] flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
        : "fixed z-[80] flex min-h-0 flex-col overflow-hidden bg-background";

  // Give the static modes (drawer/fullscreen) a definite box at first render,
  // mirroring the values the layout effect re-applies below. The embedded
  // <webview> self-paints its guest at whatever size its layout box has the
  // moment it mounts; if geometry is only applied a tick later in useLayoutEffect
  // the wrapper commits at auto (~0) height and the guest latches a blank surface
  // it never re-presents (docked dodges this via its per-frame rAF resize loop).
  const wrapperStyle: CSSProperties | undefined =
    mode === "drawer"
      ? {
          top: "2rem",
          right: "2rem",
          bottom: "2rem",
          left: "auto",
          width: `${drawerWidth}px`,
          maxWidth: "calc(100vw - 4rem)",
        }
      : mode === "fullscreen"
        ? { top: 0, left: 0, right: 0, bottom: 0 }
        : mode === "docked" && !dockedVisible
          ? { display: "none" }
          : undefined;

  const browserVisible = mode === "docked" ? dockedVisible : true;

  return createPortal(
    <>
      {mode === "drawer" ? (
        <div
          className="fixed inset-0 z-[59] bg-black/40"
          onClick={restoreOrCloseOverlay}
          aria-hidden
        />
      ) : null}
      <div ref={wrapperRef} className={wrapperClassName} style={wrapperStyle}>
        {mode === "drawer" ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t`Resize browser drawer`}
            className="absolute left-0 top-0 bottom-0 z-10 w-1.5 cursor-ew-resize transition-colors hover:bg-foreground/15"
            onMouseDown={handleResizeStart}
          />
        ) : null}
        <MemoBrowserPanel visible={browserVisible} />
      </div>
      {isResizing ? (
        <div className="fixed inset-0 z-[100]" style={{ cursor: "ew-resize" }} aria-hidden />
      ) : null}
    </>,
    document.body,
  );
}
