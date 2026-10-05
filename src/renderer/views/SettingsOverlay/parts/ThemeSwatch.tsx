import type { CSSProperties } from "react";

/**
 * Compact theme swatch: a sidebar strip + content area with an accent dot,
 * rendered with the preset's variant vars. Used inline (e.g. the collapsed
 * Theme row) to show the active theme at a glance.
 */
export function ThemeSwatch(props: { vars: CSSProperties; className?: string }) {
  return (
    <div
      className={`flex overflow-hidden rounded-md border border-border/60 ${props.className ?? "h-8 w-14"}`}
      style={props.vars}
    >
      <div
        className="flex w-1/3 flex-col justify-center gap-1 px-1"
        style={{ background: "var(--sidebar-background)" }}
      >
        <span className="h-1 w-full rounded-full" style={{ background: "var(--muted)" }} />
        <span className="h-1 w-2/3 rounded-full" style={{ background: "var(--muted)" }} />
      </div>
      <div
        className="flex flex-1 flex-col justify-center gap-1 px-1.5"
        style={{ background: "var(--content-background)" }}
      >
        <span className="h-1 w-3/4 rounded-full" style={{ background: "var(--foreground)" }} />
        <span className="h-1.5 w-1/2 rounded-sm" style={{ background: "var(--accent)" }} />
      </div>
    </div>
  );
}
