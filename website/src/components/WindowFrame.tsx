/**
 * A premium macOS-style window frame for wrapping app screenshots / live mock
 * surfaces on the marketing site. Renders the traffic-light chrome, an optional
 * center title (Geist Mono), an optional browser URL bar, and a soft indigo
 * ambient glow + hairline so the framed media reads as a real floating window.
 */
import type { ReactNode } from "react";

export function WindowFrame({
  children,
  title,
  url,
  glow = true,
  className,
}: {
  children: ReactNode;
  title?: string;
  url?: string;
  glow?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      {glow ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(55%_50%_at_50%_35%,rgba(139,123,255,0.22),transparent)] blur-2xl"
        />
      ) : null}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-tile shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85)]">
        {/* titlebar */}
        <div className="relative flex h-9 items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          {url ? (
            <div className="ml-3 flex h-6 flex-1 items-center gap-2 rounded-md border border-white/[0.06] bg-night/60 px-3 font-mono text-[11px] text-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {url}
            </div>
          ) : title ? (
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-tight text-dim">
              {title}
            </span>
          ) : null}
        </div>
        {/* body */}
        <div className="bg-night">{children}</div>
      </div>
      {/* bottom edge-light */}
      <div className="pointer-events-none absolute inset-x-8 -bottom-px h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
    </div>
  );
}
