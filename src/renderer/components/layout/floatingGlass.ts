/**
 * Shared dark liquid-glass material for controls floating over app content.
 *
 * The marker classes resolve platform-specific tint, blur, edge, shadow, and
 * selected-state treatment in styles.css. Keep shape and placement classes on
 * each consumer so pills and circular scroll buttons can share one material
 * without sharing geometry.
 */
export const floatingGlassSurfaceClass =
  "poracode-floating-chrome border border-border/15 bg-[var(--floating-chrome-surface)] shadow-lg backdrop-blur-md";

/** Denser, still-dark selected state for a floating glass control. */
export const floatingGlassActiveClass = "poracode-floating-chrome--active";

/**
 * Composer bubbles (docks, changes): a quieter edge at rest that only firms up
 * on hover, so a row of pills does not read as a row of outlined buttons.
 */
export const floatingGlassBubbleClass = "poracode-floating-chrome--bubble";

/** Bubble whose panel is open: the glass takes a faint accent tint and edge. */
export const floatingGlassBubbleActiveClass = "poracode-floating-chrome--bubble-active";

/**
 * The composer-bubble base. Any new small control floating over content (a
 * pill, selector, or icon button) starts from one of these two shapes and adds
 * only its own padding, color, and placement, so every bubble shares the
 * material, height, type, and hover/selected behavior.
 *
 * Pill: 28px, content-sized, icon + label. Add horizontal padding (`px-2.5`).
 */
export const floatingBubblePillClass = `${floatingGlassSurfaceClass} ${floatingGlassBubbleClass} flex h-7 min-h-7 items-center gap-1.5 rounded-full text-xs font-medium transition-colors`;

/** Icon: 28px circle for a single glyph. Add a `text-*` tone if it needs one. */
export const floatingBubbleIconClass = `${floatingGlassSurfaceClass} ${floatingGlassBubbleClass} size-7 min-h-0 min-w-0 rounded-full p-0`;

/** Selected/open state for either shape; apply conditionally. */
export const floatingBubbleActiveClass = `${floatingGlassActiveClass} ${floatingGlassBubbleActiveClass}`;
