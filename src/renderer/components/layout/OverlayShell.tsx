import { useEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";
import { pushEscapeHandler } from "./overlayEscapeStack";

export type OverlayShellMode = "fixed" | "absolute";
const EXIT_FALLBACK_MS = 200;

/**
 * Shared overlay wrapper with fade-in/fade-out animation.
 * Renders children in a full-cover container and animates opacity on
 * mount/unmount. Pressing Escape triggers a close via the fade-out → onExited
 * path.
 *
 * `mode="fixed"` (default) covers the whole window. `mode="absolute"` covers
 * the nearest positioned ancestor — used for pane-scoped overlays (e.g. the
 * sub-agent drawer over a single chat pane in a split-pane layout).
 *
 * `instantEnter` skips the fade-in. Glass overlays hide the base app while they
 * are shown, so a fade-in composites the overlay against bare desktop material.
 * That is fine for content that paints in one frame, but an overlay that is
 * still mounting during the fade (GitHub Actions builds its view model and
 * fetches workflows) leaves the user watching full-screen acrylic instead. Such
 * overlays appear at full opacity and keep the fade-out only.
 */
export function OverlayShell(props: {
  open: boolean;
  onExited?: () => void;
  children: ReactNode;
  mode?: OverlayShellMode;
  instantEnter?: boolean;
}) {
  const { open, onExited, children, mode = "fixed", instantEnter = false } = props;
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const escapeClosingRef = useRef(false);
  const exitCompletedRef = useRef(false);
  // Overlays that clear their own context on close (e.g. the GitHub Actions
  // view) drop their children in the same render that flips `open` to false,
  // which would blank the surface before the fade-out ran. Keep the last open
  // children and render those for the duration of the exit transition.
  const exitChildrenRef = useRef(children);

  useEffect(() => {
    if (open) exitChildrenRef.current = children;
  }, [children, open]);

  // Mount immediately when opened, fade in on next frame
  useEffect(() => {
    if (open) {
      if (escapeClosingRef.current) return undefined;
      exitCompletedRef.current = false;
      setMounted(true);
      // Batched with setMounted into a single render, so the surface never
      // paints at opacity-0 and no enter transition runs.
      if (instantEnter) {
        setVisible(true);
        return undefined;
      }
      // Delay to allow the DOM to render at opacity-0 before transitioning
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    // Parent acknowledged close — reset escape flag
    escapeClosingRef.current = false;
    // Start fade-out
    setVisible(false);
    return undefined;
  }, [open, instantEnter]);

  // Browsers may omit transitionend when a tab is backgrounded, rendering is
  // throttled, or reduced-motion styles remove the transition. Never leave an
  // invisible full-window surface mounted indefinitely.
  useEffect(() => {
    if (!mounted || visible) return;
    const timer = setTimeout(() => {
      if (open && !escapeClosingRef.current) return;
      if (exitCompletedRef.current) return;
      exitCompletedRef.current = true;
      setMounted(false);
      onExited?.();
    }, EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [mounted, onExited, open, visible]);

  // Close on Escape via the overlay escape stack — only the topmost overlay
  // dismisses, so a transient overlay floating above this one (e.g. the
  // browser drawer at z-60 above Settings at z-50) consumes Escape first.
  useEffect(() => {
    if (!open || !onExited) return;
    return pushEscapeHandler(() => {
      escapeClosingRef.current = true;
      setVisible(false);
      (document.activeElement as HTMLElement | null)?.blur();
    });
  }, [open, onExited]);

  // Unmount after this surface's own fade-out completes. Overlay content
  // animates too, and those transitions bubble — unmounting on a child's
  // transitionEnd cut the fade short and read as a flicker.
  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "opacity") return;
    if (!visible) {
      if (exitCompletedRef.current) return;
      exitCompletedRef.current = true;
      setMounted(false);
      onExited?.();
    }
  }

  if (!mounted) return null;

  const positionClass = mode === "fixed" ? "fixed inset-0 z-50" : "absolute inset-0 z-30";
  return (
    <div
      data-overlay-surface=""
      // Present from the start of the fade-in until the start of the fade-out.
      // The glass-sidebar CSS hides the base app behind this overlay, so it
      // must engage immediately — leaving the app painted during the fade
      // shows the main-window sidebar through the translucent overlay. The
      // overlay is responsible for painting its own chrome on the first frame.
      {...(visible ? { "data-overlay-visible": "" } : {})}
      className={`${positionClass} flex flex-col bg-background transition-opacity duration-150 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onTransitionEnd={handleTransitionEnd}
    >
      {open ? children : exitChildrenRef.current}
    </div>
  );
}
