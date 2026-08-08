import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useLingui } from "@lingui/react/macro";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useIsPanelTabVisible } from "@/renderer/state/panelDockSelectors";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { pushEscapeHandler } from "@/renderer/components/layout/overlayEscapeStack";
import { BrowserPanel } from "./BrowserPanel";
import {
  HEADLESS_HEIGHT,
  HEADLESS_WIDTH,
  HEADLESS_Z,
  type BrowserHostMode,
  useBrowserHostPositioning,
} from "./useBrowserHostPositioning";

const MemoBrowserPanel = memo(BrowserPanel);

// Step used when the drawer's resize handle is nudged via arrow keys.
const DRAWER_RESIZE_STEP_PX = 24;

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
  const setBrowserOverlayOpen = usePanelStore((s) => s.setBrowserOverlayOpen);
  const setBrowserOverlayMaximized = usePanelStore((s) => s.setBrowserOverlayMaximized);
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab);
  const extracted = useBrowserPanelStore((s) => s.extracted);
  const hasTabs = useBrowserPanelStore((s) => s.tabs.length > 0);
  const automationActive = useBrowserPanelStore((s) => s.automationActive);

  // The browser is painted wherever its dock slot lives: the right panel's
  // active layer, a right-panel split section, or a bottom dock slot. Keying
  // this off `rightPanelTab` alone would drop a split/docked browser into
  // off-screen background mode, leaving an empty section behind.
  const dockedVisible = useIsPanelTabVisible("browser");

  const mode: BrowserHostMode = extracted
    ? "hidden"
    : browserOverlayOpen
      ? browserOverlayMaximized
        ? "fullscreen"
        : "drawer"
      : browserPanelOpen && dockedVisible
        ? "docked"
        : // Panel + overlay both closed: keep tabs alive off-screen so the agent
          // can drive them headless (no forced panel reveal).
          "background";

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  useBrowserHostPositioning({ wrapperRef, mode, drawerWidth, dockedVisible });

  useLayoutEffect(() => {
    if (mode !== "drawer" && mode !== "fullscreen") return;
    return pushEscapeHandler(restoreOrCloseOverlay);
    // restoreOrCloseOverlay closes over stable store setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, browserPanelOpen]);

  // Extracted → the standalone window owns the browser. Background renders the
  // webviews off-screen ONLY while the agent is actively automating (and there
  // are tabs); when idle it unmounts to free resources.
  if (mode === "hidden") return null;
  if (mode === "background" && (!hasTabs || !automationActive)) return null;

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

  // Keyboard equivalent of dragging: the handle sits on the drawer's left
  // edge, so ArrowLeft (drag left) grows the drawer and ArrowRight (drag
  // right) shrinks it — matching handleResizeStart's drag semantics.
  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setDrawerWidth(drawerWidth + DRAWER_RESIZE_STEP_PX);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setDrawerWidth(drawerWidth - DRAWER_RESIZE_STEP_PX);
    }
  }

  // Docked z-index defaults to z-30 here; while the host panel is floating as a
  // fixed overlay, the positioning effect lifts it to 55 imperatively (see the
  // docked branch above) so it never re-renders the embedded webview.
  const wrapperClassName =
    mode === "docked"
      ? "fixed z-30 flex min-h-0 flex-col overflow-hidden bg-[var(--content-background)]"
      : mode === "drawer"
        ? "fixed z-[60] flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
        : mode === "background"
          ? "fixed flex min-h-0 flex-col overflow-hidden pointer-events-none opacity-0 bg-[var(--content-background)]"
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
        : mode === "background"
          ? {
              top: 0,
              left: 0,
              width: HEADLESS_WIDTH,
              height: HEADLESS_HEIGHT,
              zIndex: Number(HEADLESS_Z),
            }
          : mode === "docked" && !dockedVisible
            ? { display: "none" }
            : undefined;

  // Keep the active tab painting (display:flex) even off-screen so the agent
  // can screenshot it headlessly; only the docked-but-not-selected case hides.
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
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={t`Resize browser drawer`}
            className="absolute left-0 top-0 bottom-0 z-10 w-1.5 cursor-ew-resize transition-colors hover:bg-foreground/15"
            onMouseDown={handleResizeStart}
            onKeyDown={handleResizeKeyDown}
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
