/**
 * Shared dark liquid-glass material for controls floating over app content.
 *
 * The marker classes resolve platform-specific tint, blur, edge, shadow, and
 * selected-state treatment in styles.css. Keep shape and placement classes on
 * each consumer so pills, circular scroll buttons, and vertical rails can share
 * one material without sharing geometry.
 */
export const floatingGlassSurfaceClass =
  "poracode-floating-chrome border border-border/15 bg-[var(--floating-chrome-surface)] shadow-lg backdrop-blur-md";

/** Denser, still-dark selected state for a floating glass control. */
export const floatingGlassActiveClass = "poracode-floating-chrome--active";
