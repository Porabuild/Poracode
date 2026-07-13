// Phase-locks the working-icon shine sweep across every on-screen instance.
//
// The sweep is a `steps()` (≈20fps) transform animation on the
// `.poracode-provider-icon__mask-scan::before` pseudo-element (see styles.css).
// A `steps()` animation only produces a compositor frame when its value
// actually changes, so a single icon redraws ~20×/s. But a working thread shows
// its icon in several places at once (sidebar row + recent-threads row + ...),
// and each CSS animation starts when its element mounts — so the instances step
// at slightly different instants and the compositor ends up drawing ~20fps ×
// (number of instances).
//
// Pinning every instance's `startTime` to the document timeline origin makes
// them all share one clock: identical duration + identical steps + identical
// phase ⇒ they change value at the exact same instants, so the compositor
// coalesces them into a single redraw per step (true ~20fps total, regardless
// of how many working icons are visible).

const MASK_SCAN_ANIMATION_NAME = "poracode-provider-icon-mask-scan";

/**
 * Ref callback for the `.poracode-provider-icon__mask-scan` span. Snaps the
 * pseudo-element's shine animation onto the shared document-timeline phase.
 */
export function syncMaskScanPhase(node: HTMLElement | null): void {
  if (!node || typeof node.getAnimations !== "function") return;
  // `subtree: true` includes the span's own `::before` pseudo-element animation.
  for (const animation of node.getAnimations({ subtree: true })) {
    if ((animation as CSSAnimation).animationName !== MASK_SCAN_ANIMATION_NAME) continue;
    try {
      // currentTime then equals document.timeline.currentTime for every
      // instance ⇒ same phase. (% duration gives the on-screen sweep position.)
      animation.startTime = 0;
    } catch {
      // startTime is read-only for some timeline states; a transiently
      // out-of-phase sweep is harmless, so ignore.
    }
  }
}
