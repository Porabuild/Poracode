import type { ReactNode } from "react";

/**
 * Inline label chip. Matches the local `Badge` treatment used in
 * `components/mcp/McpServersManager.tsx` — HeroUI's `Badge` is an overlay badge
 * and renders outside its container here.
 */
export function PluginTag(props: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-md border border-[var(--hairline)] bg-surface-tertiary/60 px-1.5 py-0.5 text-[10px] font-medium text-muted">
      {props.children}
    </span>
  );
}
