/**
 * Input-modality classification for the PWA.
 *
 * The guarded keyboard choreography (primer probes, scroll locks, ghost-tap
 * suppression — see useComposerKeyboard/useGuardedInputKeyboard) exists to
 * tame the software keyboard that a touch tap summons. On a mouse-driven
 * desktop browser there is no software keyboard: the probe stalls the first
 * focus for its full timeout, the ghost-tap guard can eat a real click, and
 * the focus guards fight hardware-keyboard Tab navigation. The hooks
 * therefore bypass the whole choreography for mouse input:
 *
 * - Pure mouse devices (no touch capability at all) get fully native focus
 *   behavior — no capture-phase listeners, no tap shield.
 * - Hybrid devices (touch screen + mouse) keep the guarded path for touch
 *   taps and take a plain programmatic focus for mouse clicks, decided
 *   per-event via `pointerType`.
 */

let touchCapableOverrideForTests: boolean | null = null;

export function setTouchCapableOverrideForTests(value: boolean | null): void {
  touchCapableOverrideForTests = value;
}

/**
 * True when the device can produce touch input at all (phones, tablets,
 * touch-screen laptops). Deliberately capability-based, not UA-based: a
 * hybrid still needs the touch keyboard workarounds for its touch taps.
 */
export function isTouchCapableDevice(): boolean {
  if (touchCapableOverrideForTests !== null) return touchCapableOverrideForTests;
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) return true;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(any-pointer: coarse)").matches;
  }
  return false;
}

/** True when a pointer event came from a finger or stylus rather than a mouse. */
export function isTouchLikePointerEvent(event: PointerEvent): boolean {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

/**
 * Reflects touch capability onto <html data-touch-device> so the stylesheet
 * can scope touch-only workarounds (e.g. the composer's unfocused tap shield,
 * which would otherwise block native mouse caret placement).
 */
export function markTouchCapabilityOnRoot(doc: Document = document): void {
  doc.documentElement.toggleAttribute("data-touch-device", isTouchCapableDevice());
}
