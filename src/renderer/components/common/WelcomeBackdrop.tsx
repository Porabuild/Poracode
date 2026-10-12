import { useRef, type ReactNode } from "react";
import { WELCOME_BACKGROUND_CODE } from "@/renderer/views/welcomeBackgroundCode";

/**
 * The first-launch backdrop — gradient page wash, mouse-lit code wall, and
 * pointer glow — shared by the welcome overlay's visual language. Full-screen
 * pre-app surfaces reuse it so the first thing a user sees looks like the same
 * product regardless of which entry point they land on.
 *
 * Only the pointer light is driven here; `--comet-x/y` stay at their off-screen
 * default, so a surface without the welcome intro animation simply gets a
 * static wall lit by the cursor.
 */
export function WelcomeBackdrop(props: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  return (
    <div
      ref={containerRef}
      className={`poracode-welcome-page relative flex flex-col ${props.className ?? ""}`}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        posRef.current = { x: event.clientX, y: event.clientY };
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const container = containerRef.current;
          const pos = posRef.current;
          if (!container || !pos) return;
          // Cache the rect across frames; scroll/resize re-fires mousemove.
          rectRef.current ??= container.getBoundingClientRect();
          const rect = rectRef.current;
          container.style.setProperty("--mouse-x", `${pos.x - rect.left}px`);
          container.style.setProperty("--mouse-y", `${pos.y - rect.top}px`);
        });
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        rectRef.current = null;
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      }}
    >
      <div className="poracode-welcome-bg-glow pointer-events-none absolute inset-0 z-0" />
      <pre
        aria-hidden="true"
        className="poracode-welcome-code-wall pointer-events-none absolute inset-0 z-0 m-0 overflow-hidden p-8 opacity-50"
      >
        {WELCOME_BACKGROUND_CODE}
      </pre>
      {/* flex-1, not min-h-full: a percentage height would not resolve against
          the backdrop's min-height-only box. */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        {props.children}
      </div>
    </div>
  );
}
