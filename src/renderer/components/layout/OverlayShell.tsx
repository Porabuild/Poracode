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
  const [visible, setVisible] = useState(open && instantEnter);
  // Set when Escape starts the fade-out: the surface must not fade back in if
  // `open` toggles while the exit transition is still running.
  const [escapeClosing, setEscapeClosing] = useState(false);
  // Guards the unmount path so the fallback timer and transitionEnd can't both
  // fire onExited.
  const exitCompletedRef = useRef(false);
  // Overlays that clear their own context on close (e.g. the GitHub Actions
  // view) drop their children in the same render that flips `open` to false,
  // which would blank the surface before the fade-out ran. Keep the last open
  // children and render those for the duration of the exit transition.
  const [exitChildren, setExitChildren] = useState(children);
  if (open && exitChildren !== children) setExitChildren(children);

  // Mount immediately when opened (fade-in is scheduled by the frame effect
  // below); `instantEnter` batches the visible flip into the same render so
  // the surface never paints at opacity-0. Closing flips visible off so the
  // CSS fade-out runs before the transition-end handler unmounts.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      // Parent acknowledged close — reset the escape flag.
      setEscapeClosing(false);
      // Start fade-out
      setVisible(false);
    } else if (!escapeClosing) {
      setMounted(true);
      if (instantEnter) setVisible(true);
    }
  }

  // A completed exit must not block the next open's unmount path.
  useEffect(() => {
    if (open) exitCompletedRef.current = false;
  }, [open]);

  // Delay to allow the DOM to render at opacity-0 before transitioning
  useEffect(() => {
    if (!open || instantEnter || escapeClosing) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [open, instantEnter, escapeClosing]);

  // Browsers may omit transitionend when a tab is backgrounded, rendering is
  // throttled, or reduced-motion styles remove the transition. Never leave an
  // invisible full-window surface mounted indefinitely.
  useEffect(() => {
    if (!mounted || visible) return;
    const timer = setTimeout(() => {
      if (open && !escapeClosing) return;
      if (exitCompletedRef.current) return;
      exitCompletedRef.current = true;
      setMounted(false);
      onExited?.();
    }, EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [mounted, onExited, open, visible, escapeClosing]);

  // Close on Escape via the overlay escape stack — only the topmost overlay
  // dismisses, so a transient overlay floating above this one (e.g. the
  // browser drawer at z-60 above Settings at z-50) consumes Escape first.
  useEffect(() => {
    if (!open || !onExited) return;
    return pushEscapeHandler(() => {
      setEscapeClosing(true);
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
      {open ? children : exitChildren}
    </div>
  );
}
