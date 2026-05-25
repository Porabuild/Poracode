import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { X } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import {
  useLoginTerminalStore,
  type LoginTerminalSession,
} from "@/renderer/state/loginTerminalStore";
import { XTermSurface, type XTermSurfaceHandle } from "@/renderer/components/terminal/XTermSurface";

/**
 * Transient terminal panel for one-shot login flows. Slides in from the right
 * at z-60 so it can sit on top of the Settings overlay (z-50) — the user
 * completes a TUI auth flow without losing their place in settings.
 *
 * Lifecycle: `runAgentLoginCommand` opens the store entry (and owns the shell
 * + completion watcher). This component renders the xterm for that shell and
 * forwards user-initiated close back through `onForceClose` so callers can
 * reset their pending state.
 */
export function LoginTerminalOverlay() {
  const active = useLoginTerminalStore((state) => state.active);
  const [renderedSession, setRenderedSession] = useState<LoginTerminalSession | null>(null);
  const [visible, setVisible] = useState(false);
  const xtermRef = useRef<XTermSurfaceHandle | null>(null);

  useEffect(() => {
    if (active) {
      setRenderedSession(active);
      // Double rAF: first frame commits the off-screen position to the DOM
      // (browser paints it), second frame flips to translateX(0) so the
      // transition has a starting point to animate from. A single rAF can be
      // batched into the same paint as the initial mount and skip the slide.
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
  }, [active]);

  useEffect(() => {
    if (!visible || !renderedSession) return;
    const timer = window.setTimeout(() => {
      xtermRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [visible, renderedSession]);

  // Close the underlying shell whenever we tear this session down — covers the
  // natural-completion path (watcher → store.close → animate out → unmount)
  // and the replace path (a new login session pushes onto the store before
  // this one finishes). The X-button path also calls closeThread; that
  // duplicate is safe (idempotent + caught).
  useEffect(() => {
    const id = renderedSession?.shellId;
    if (!id) return;
    return () => {
      void readBridge()
        .closeThread({ threadId: id })
        .catch(() => undefined);
    };
  }, [renderedSession?.shellId]);

  const closeSession = () => {
    if (!active) return;
    const session = active;
    void readBridge()
      .closeThread({ threadId: session.shellId })
      .catch(() => undefined);
    session.onForceClose?.();
    useLoginTerminalStore.getState().close();
  };

  // Intentionally no global Escape handler — Esc must reach the embedded TUI
  // (Gemini's auth picker, oauth-personal cancel, etc.). The X button is the
  // only way to dismiss this overlay.

  function handleTransitionEnd(event: React.TransitionEvent<HTMLDivElement>) {
    if (visible) return;
    if (event.propertyName !== "transform") return;
    if (renderedSession) {
      // Animation finished out — release the xterm. The shell, if still alive,
      // is closed by closeSession; this only happens when the store cleared
      // without going through closeSession (e.g. completion watcher).
      setRenderedSession(null);
    }
  }

  if (!renderedSession) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={closeSession}
        aria-hidden
      />
      <div
        data-overlay-surface="login-terminal"
        className="pointer-events-auto fixed bottom-8 right-8 top-8 flex w-[640px] max-w-[calc(100vw-4rem)] flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl will-change-transform"
        style={{
          // Inline transform avoids Tailwind arbitrary-value pitfalls with
          // `calc(...)` spaces. Off-screen state translates the panel its full
          // width PLUS the 2rem (right-8) margin so it disappears completely.
          transform: visible ? "translateX(0)" : "translateX(calc(100% + 2rem))",
          transition: "transform 300ms ease-out",
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="min-w-0">
            <p
              className={`truncate text-sm font-medium ${
                renderedSession.failedExitCode !== undefined ? "text-danger" : "text-foreground"
              }`}
            >
              {renderedSession.label} login
              {renderedSession.failedExitCode !== undefined ? " failed" : ""}
            </p>
            <p className="text-xs text-muted">
              {renderedSession.failedExitCode !== undefined
                ? `Exited with code ${renderedSession.failedExitCode}. Close to retry.`
                : "Complete the prompts in this terminal. Closes when finished."}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label="Close login terminal"
            onPress={closeSession}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 bg-[var(--content-background)] p-2">
          <XTermSurface
            key={renderedSession.shellId}
            ref={xtermRef}
            terminalId={renderedSession.shellId}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}
