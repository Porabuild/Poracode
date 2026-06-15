import type { CSSProperties } from "react";
import { isMac, isWindows } from "@/renderer/bridge";

/**
 * Shared left-sidebar chrome: main app thread list, overflow/git/settings/file-editor panels.
 * One place to tweak column padding, scroll gutter, and footer dividers.
 */

/**
 * macOS (hiddenInset) window controls sit in the top-left. Reserve enough width + gap so the
 * sidebar wordmark and actions are not tight against the traffic lights.
 */
export const macosTrafficLightGutterClass = "w-[68px] shrink-0" as const;

/**
 * Opt-in class for content elements that sit at the top-left of the main area when the sidebar
 * is collapsed on macOS — the matching CSS rule (gated by `[data-mac-collapsed]` on
 * `.lightcode-shell`) adds 28px of left padding so they clear the traffic-light controls. The
 * gate is pure CSS, so descendants don't subscribe to sidebar state.
 */
export const macosTrafficLightPadClass = "lightcode-mac-traffic-light-pad" as const;

/**
 * Inline styles for full-width overlay title rows: titlebar height plus right inset on
 * Windows/Linux (titleBarOverlay controls) so header actions stay clear of window buttons.
 */
export function overlayHeaderStyle(): CSSProperties {
  const height = "env(titlebar-area-height, 32px)";
  if (isMac()) {
    return { height };
  }
  return {
    height,
    paddingRight: isWindows()
      ? "max(calc(1rem + 4px), calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 4px))"
      : "max(1rem, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)))",
  };
}

/** Shared header bar for right/bottom dock panels (project name + tab/close icons). */
export const panelHeaderRowClass =
  "@container flex h-7 shrink-0 items-center gap-1.5 border-b border-[color:var(--border)] px-2";

/** Reset Tooltip.Trigger styling so it tracks an inline span tightly (used for project labels). */
export const panelHeaderTooltipTriggerResetClass =
  "min-w-0 shrink-0 justify-start rounded border-0 bg-transparent p-0 shadow-none outline-none";

/** Icon button in panel headers (tab toggles, close, expand). */
export const panelHeaderIconButtonClass =
  "inline-flex items-center justify-center rounded p-0.5 text-muted hover:text-foreground";

/** Tab-style icon button: accents when active, muted+hover otherwise. */
export function panelHeaderTabIconButtonClass(active: boolean) {
  return `inline-flex items-center justify-center rounded p-0.5 transition-colors ${
    active ? "text-accent" : "text-muted hover:text-foreground"
  }`;
}

/** Column shell (inset `px-2`); pair with `overlaySidebarSurfaceClass` for overlay/panel UIs. */
export const sidebarColumnLayoutClass = "flex h-full min-h-0 min-w-0 flex-col gap-3 px-2 pb-0 pt-0";

/**
 * Primary surface for overlay and docked tool panels (matches main content / thread area).
 * The `lightcode-overlay-surface` marker lets the translucent-sidebar CSS turn this
 * transparent when it sits inside the sidebar column, so overlay sidebars get the same
 * glass treatment as the main app sidebar (see styles.css).
 */
export const overlaySidebarSurfaceClass =
  "lightcode-overlay-surface bg-[var(--content-background)]";

/** File editor, git, settings overlays, etc.: layout + background. */
export const overlaySidebarColumnClass = `${sidebarColumnLayoutClass} ${overlaySidebarSurfaceClass}`;

/**
 * Right-docked git tool: same as {@link overlaySidebarColumnClass} but `px-0` on the column so
 * horizontal inset comes from row padding only (`useGitReviewRowPadX`), not column + row.
 */
export const gitPanelSidebarColumnClass = `flex h-full min-h-0 min-w-0 flex-col gap-0 ${overlaySidebarSurfaceClass} px-0 pb-0 pt-0`;

/**
 * Git review sidebar (used by both right-docked panel and full-page overlay).
 * `gap-0` because each section provides its own `border-t` + `py-2` rhythm.
 * `panel` keeps the column at `px-0` so file-row borders run edge-to-edge;
 * `overlay` uses `px-2` so traffic-light/header chrome stays clear.
 */
export function gitReviewColumnClass(mode: "panel" | "overlay") {
  return `flex h-full min-h-0 min-w-0 flex-col gap-0 ${overlaySidebarSurfaceClass} ${
    mode === "panel" ? "px-0" : "px-2"
  } pb-0 pt-0`;
}

/**
 * Main scroll/split region: horizontal inset is on the column; scroll handles scrollbar margin.
 * Matches the primary app `Sidebar` scroll area (incl. non-Windows `pr-2` / `-mr-2` gutter).
 */
export function sidebarBodyScrollClass() {
  return `min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-0 -mr-2 [scrollbar-gutter:stable] ${
    !isWindows() ? "pr-2" : ""
  }`.trim();
}

/**
 * Git review file list: same scroll behavior plus vertical spacing between staged/changes groups.
 * @see {sidebarBodyScrollClass}
 */
export function gitReviewSidebarListScrollClass() {
  return `${sidebarBodyScrollClass()} space-y-2`;
}

/**
 * Sticky/variable footers: Return to app, Hide sidebar, etc. Border spans column inset only.
 * @see {sidebarColumnLayoutClass}
 */
export const sidebarFooterNavClass =
  "shrink-0 space-y-1 border-t border-[var(--hairline)] pt-2 pb-2";

/**
 * Collapsed icon rail: bottom block (pr keeps icons off the right edge in the narrow column).
 * @see {sidebarColumnLayoutClass}
 */
export const sidebarIconRailFooterClass = "space-y-1 border-t border-[var(--hairline)] pt-2 pr-2";
