/**
 * How long to keep the guard armed waiting for the synthetic ghost click.
 * Mobile browsers dispatch the synthesized tap-end `click` ~100-300ms after
 * `touchend`, so 400ms leaves a safety margin. The guard disarms the instant
 * that click arrives, so this value only bounds the wait when the browser
 * generates no ghost click at all — in which case the guard simply no-ops.
 */
const GHOST_TAP_WINDOW_MS = 400;

/** The currently-armed guard, if any. Kept so a re-arm replaces (never stacks). */
let activeDisarm: (() => void) | null = null;

/**
 * Suppresses the single synthetic "ghost" click that mobile browsers fire at
 * the end of the touch gesture which just expanded a composer.
 *
 * The composer focuses (and expands) on `pointerdown` — tap-start — so the
 * keyboard rises inside the gesture. The matching `click` (tap-end) is then
 * dispatched to whichever element now sits under the finger, and after the
 * expansion that's a toolbar control (opening a menu the user never chose) or
 * a spot outside the input (blurring it, collapsing the composer right back).
 *
 * Arms a one-shot, capture-phase `click` listener that swallows exactly that
 * next click and then disarms, so genuine later taps still work (those arrive
 * as a fresh gesture after this guard is gone). A safety timeout disarms the
 * guard if no ghost click ever arrives; re-arming replaces any armed guard.
 */
export function suppressNextGhostTap(): () => void {
  activeDisarm?.();

  let timeoutId = 0;

  function swallow(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    disarm();
  }

  function disarm() {
    window.clearTimeout(timeoutId);
    document.removeEventListener("click", swallow, true);
    if (activeDisarm === disarm) activeDisarm = null;
  }

  document.addEventListener("click", swallow, true);
  timeoutId = window.setTimeout(disarm, GHOST_TAP_WINDOW_MS);
  activeDisarm = disarm;

  return disarm;
}
