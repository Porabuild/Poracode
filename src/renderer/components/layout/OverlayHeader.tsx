import type { ReactNode } from "react";

/**
 * Shared header bar for overlay-style layouts (main app, git review, settings).
 * Acts as the window drag region; interactive children opt out via
 * `lightcode-overlay-header__controls`.
 */
export function OverlayHeader(props: {
  title: string;
  onTitleClick?: () => void;
  children?: ReactNode;
}) {
  const { title, onTitleClick, children } = props;

  return (
    <div
      className="lightcode-overlay-header flex shrink-0 items-center gap-3 bg-[var(--content-background)] px-4"
      style={{ height: "env(titlebar-area-height, 32px)" }}
    >
      {onTitleClick ? (
        <button
          type="button"
          className="lightcode-overlay-header__controls text-xs font-semibold uppercase tracking-[0.12em] text-muted hover:text-foreground transition-colors"
          onClick={onTitleClick}
        >
          {title}
        </button>
      ) : (
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</p>
      )}

      {children}

      <div className="flex-1" />
      {/* Space for native window buttons (minimize, maximize, close) */}
      <div className="w-[8rem] shrink-0" />
    </div>
  );
}
