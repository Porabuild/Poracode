import { useEffect, useState, type ReactNode } from "react";

/**
 * Shared overlay wrapper with fade-in/fade-out animation.
 * Renders children in a fixed full-screen container and animates
 * opacity on mount/unmount.
 */
export function OverlayShell(props: { open: boolean; onExited?: () => void; children: ReactNode }) {
  const { open, onExited, children } = props;
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  // Mount immediately when opened, fade in on next frame
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Delay to allow the DOM to render at opacity-0 before transitioning
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    // Start fade-out
    setVisible(false);
  }, [open]);

  // Unmount after fade-out transition completes
  function handleTransitionEnd() {
    if (!visible) {
      setMounted(false);
      onExited?.();
    }
  }

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-background transition-opacity duration-150 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onTransitionEnd={handleTransitionEnd}
    >
      {children}
    </div>
  );
}
