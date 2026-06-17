import {
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useLingui } from "@lingui/react/macro";
import { usePanelStore } from "@/renderer/state/panelStore";
import { pushEscapeHandler } from "./overlayEscapeStack";

/**
 * Floating shell for the in-app browser overlay. Reuses the chrome of
 * LoginTerminalOverlay (rounded floating card, same margins, border, shadow)
 * and hosts both presentation modes — drawer and fullscreen — on a single
 * mounted element so toggling maximize transitions size/position smoothly
 * instead of unmounting and replaying the entrance animation.
 *
 * Behavior:
 * - Animation: subtle slide-in combined with fade. Works for both drawer and
 *   fullscreen without the jarring full-width slide of fullscreen.
 * - Maximized: leaves side margins so macOS traffic lights and Windows
 *   titleBarOverlay controls (top-left/top-right) sit outside the panel.
 *   The backdrop also leaves the titlebar strip exposed so OS controls and
 *   window-drag region stay live.
 * - Backdrop: semi-transparent scrim outside the panel — dims the underlying
 *   overlay and consumes pointer events. Click to dismiss.
 * - Resize: left-edge drag handle adjusts width in drawer mode. While
 *   dragging, a full-window cursor catcher sits above the embedded webview so
 *   pointer events keep flowing to the host window (webview otherwise eats
 *   them as soon as the cursor crosses into its area).
 * - Escape: routed through the shared overlay escape stack so the underlying
 *   overlay below this one is not also dismissed.
 */
export function BrowserDrawerShell(props: {
  open: boolean;
  maximized: boolean;
  onExited?: () => void;
  children: ReactNode;
}) {
  const { open, maximized, onExited, children } = props;
  const { t } = useLingui();
  const drawerWidth = usePanelStore((s) => s.browserOverlayDrawerWidth);
  const setDrawerWidth = usePanelStore((s) => s.setBrowserOverlayDrawerWidth);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        if (inner) cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
  }, [open]);

  function requestClose() {
    setVisible(false);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  useEffect(() => {
    if (!open || !onExited) return;
    return pushEscapeHandler(requestClose);
    // requestClose closes over stable setters/refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onExited]);

  function handleTransitionEnd(event: React.TransitionEvent<HTMLDivElement>) {
    if (visible) return;
    if (event.propertyName !== "opacity") return;
    setMounted(false);
    onExited?.();
  }

  function handleResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = drawerWidth;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    setIsResizing(true);

    function onMove(e: MouseEvent) {
      // Handle is on the LEFT edge of a panel anchored to the RIGHT viewport
      // edge; dragging left (negative clientX delta) grows the panel.
      const delta = startX - e.clientX;
      setDrawerWidth(startWidth + delta);
    }
    function onUp() {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setIsResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (!mounted) return null;

  const maximizedOverrides: CSSProperties = maximized
    ? {
        top: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        maxWidth: "none",
        borderRadius: 0,
      }
    : { width: `${drawerWidth}px` };

  const animationTransition = isResizing
    ? "transform 240ms ease-out, opacity 240ms ease-out, top 200ms ease-out, right 200ms ease-out, bottom 200ms ease-out, max-width 200ms ease-out, border-radius 200ms ease-out"
    : "transform 240ms ease-out, opacity 240ms ease-out, top 200ms ease-out, right 200ms ease-out, bottom 200ms ease-out, width 200ms ease-out, max-width 200ms ease-out, border-radius 200ms ease-out";

  return (
    <div className={`fixed inset-0 ${maximized ? "z-[80]" : "z-[60]"}`}>
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={requestClose}
        aria-hidden
      />
      <div
        data-overlay-surface="browser-overlay"
        className="pointer-events-auto fixed bottom-8 right-8 top-8 flex max-w-[calc(100vw-4rem)] flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl will-change-transform"
        style={{
          ...maximizedOverrides,
          transform: visible ? "translateX(0)" : "translateX(120px)",
          opacity: visible ? 1 : 0,
          transition: animationTransition,
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {!maximized ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t`Resize browser drawer`}
            className="absolute left-0 top-0 bottom-0 z-10 w-1.5 cursor-ew-resize transition-colors hover:bg-foreground/15"
            onMouseDown={handleResizeStart}
          />
        ) : null}
        {children}
      </div>
      {isResizing ? (
        <div className="absolute inset-0 z-[100]" style={{ cursor: "ew-resize" }} aria-hidden />
      ) : null}
    </div>
  );
}
