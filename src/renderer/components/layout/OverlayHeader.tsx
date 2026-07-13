import type { ReactNode } from "react";
import { isMac } from "@/renderer/bridge";
import {
  macosTrafficLightGutterClass,
  overlayHeaderStyle,
} from "@/renderer/components/layout/sidebarChrome";

/**
 * Shared header bar for overlay-style layouts (main app, git review, settings).
 * Acts as the window drag region; interactive children opt out via
 * `poracode-overlay-header__controls`.
 */
export function OverlayHeader(props: {
  title: string;
  onTitleClick?: () => void;
  children?: ReactNode;
}) {
  const { title, onTitleClick, children } = props;

  return (
    <div
      className="poracode-overlay-header flex shrink-0 items-center gap-3 bg-[var(--content-background)] px-2"
      style={overlayHeaderStyle()}
    >
      {/* Space for macOS traffic lights */}
      {isMac() && <div className={macosTrafficLightGutterClass} />}

      {onTitleClick ? (
        <button
          type="button"
          className="poracode-overlay-header__controls text-xs font-semibold leading-none uppercase tracking-[0.12em] text-muted hover:text-foreground transition-colors"
          onClick={onTitleClick}
        >
          {title}
        </button>
      ) : (
        <p className="text-xs font-semibold leading-none uppercase tracking-[0.12em] text-muted">
          {title}
        </p>
      )}

      {children}

      <div className="flex-1" />
    </div>
  );
}
