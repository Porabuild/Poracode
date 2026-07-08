/**
 * Primitives shared by every guarded keyboard focus on the phone shell — the
 * floating composer (useComposerKeyboard) and the files search bar
 * (useGuardedInputKeyboard). Both intercept the tap before native focus,
 * raise the keyboard through a hidden primer when it's closed, and lift their
 * chrome by a remembered per-device keyboard height. Keeping the primer
 * element, thresholds, and height memory here means both flows literally share
 * one primer node and one stored height.
 */

import { focusWithoutScroll } from "./composeScrollLock";
import { getMobileRuntimePlatform } from "./mobilePlatform";

/**
 * The keyboard's height only becomes measurable AFTER its appear animation
 * ends (iOS reports the visual-viewport change once, at the end). The height
 * is stable per device, so remember the last measured one and lift by it on
 * later focuses.
 */
const KEYBOARD_HEIGHT_KEY = "lightcode-mobile-keyboard-height";
const ANDROID_KEYBOARD_HEIGHT_KEY = `${KEYBOARD_HEIGHT_KEY}:android`;
/** Give up a cold-keyboard probe after this long with no measurement. */
export const COLD_KEYBOARD_PROBE_TIMEOUT_MS = 1_200;
/** The measured offset must hold this long before the real input is focused. */
export const COLD_KEYBOARD_STABLE_MS = 80;
/** Below this the visual-viewport delta is bar-chrome noise, not a keyboard. */
export const KEYBOARD_OPEN_THRESHOLD_PX = 120;
/**
 * A touchstart's mirrored pointerdown arrives within this window on iOS;
 * treat it as an echo of the touch already handled, not a new gesture.
 */
export const MIRRORED_POINTER_WINDOW_MS = 700;

let recalledKeyboardHeight: number | null = null;

function keyboardHeightStorageKey(): string {
  return getMobileRuntimePlatform() === "android"
    ? ANDROID_KEYBOARD_HEIGHT_KEY
    : KEYBOARD_HEIGHT_KEY;
}

export function recallKeyboardHeight(): number {
  if (recalledKeyboardHeight === null) {
    const raw = window.localStorage.getItem(keyboardHeightStorageKey());
    const parsed = raw ? Number(raw) : 0;
    recalledKeyboardHeight = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return recalledKeyboardHeight;
}

export function rememberKeyboardHeight(px: number): void {
  if (px <= 0 || px === recalledKeyboardHeight) return;
  recalledKeyboardHeight = px;
  try {
    window.localStorage.setItem(keyboardHeightStorageKey(), String(Math.round(px)));
  } catch {
    // Best-effort persistence; the module-level cache still covers the session.
  }
}

export function resetKeyboardHeightMemoryForTests(): void {
  recalledKeyboardHeight = null;
}

/**
 * The px to lift a guarded input's chrome by, gated on focus. While a cold
 * probe runs, pin the lift to the remembered height: iOS emits interim
 * viewport sizes during the first keyboard reveal, and following them live
 * would visibly bounce the dock. Once the probe hands focus to the real
 * input, the measured offset wins so a changed keyboard height reconciles
 * with a normal transition.
 */
export function computeGuardedLiftOffset(opts: {
  focused: boolean;
  probing: boolean;
  coldProbeLift: number;
  keyboardOffset: number;
  recalledHeight: number;
}): number {
  if (!opts.focused) return 0;
  if (opts.probing) return opts.coldProbeLift;
  return opts.keyboardOffset > 0 ? opts.keyboardOffset : opts.recalledHeight;
}

/** Fixed, invisible, non-editable focus target: focusing it never pans iOS. */
export function getFocusSentinel(root: HTMLElement): HTMLElement {
  const existing = document.querySelector<HTMLElement>("[data-composer-focus-sentinel]");
  if (existing) return existing;

  const sentinel = document.createElement("div");
  sentinel.tabIndex = -1;
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.setAttribute("data-composer-focus-sentinel", "");
  sentinel.style.position = "fixed";
  sentinel.style.top = "0";
  sentinel.style.left = "0";
  sentinel.style.width = "1px";
  sentinel.style.height = "1px";
  sentinel.style.opacity = "0";
  sentinel.style.pointerEvents = "none";
  (document.body ?? root).append(sentinel);
  return sentinel;
}

/**
 * Fixed, invisible input that raises the keyboard without iOS panning for it
 * (it sits at the top of the layout viewport, never under the keyboard). One
 * singleton per document, shared by every guarded-focus consumer.
 */
export function getKeyboardPrimer(root: HTMLElement): HTMLInputElement {
  const existing = document.querySelector<HTMLInputElement>("[data-composer-keyboard-primer]");
  if (existing) return existing;

  const primer = document.createElement("input");
  primer.type = "text";
  primer.tabIndex = -1;
  primer.setAttribute("aria-hidden", "true");
  primer.setAttribute("data-composer-keyboard-primer", "");
  primer.style.position = "fixed";
  primer.style.top = "0";
  primer.style.left = "0";
  primer.style.width = "1px";
  primer.style.height = "1px";
  primer.style.padding = "0";
  primer.style.border = "0";
  primer.style.opacity = "0";
  primer.style.fontSize = "16px";
  primer.style.pointerEvents = "none";
  (document.body ?? root).append(primer);
  return primer;
}

export function isKeyboardPrimer(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.hasAttribute("data-composer-keyboard-primer");
}

/**
 * True when a keyboard primer lost focus to something other than the real
 * input it was raising the keyboard for — a probe abandoned by a tap
 * elsewhere, distinct from the primer normally handing focus off to that
 * input. `relatedTargetOwnsFocus` tells the two apart per consumer (the
 * composer's input area vs. a single guarded input).
 */
export function isPrimerAbandoned(
  event: FocusEvent,
  relatedTargetOwnsFocus: (target: EventTarget | null) => boolean,
): boolean {
  return isKeyboardPrimer(event.target) && !relatedTargetOwnsFocus(event.relatedTarget);
}

export function focusKeyboardPrimer(root: HTMLElement): void {
  focusWithoutScroll(getKeyboardPrimer(root));
}

export function afterNextFrame(callback: () => void): void {
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(callback);
  } else {
    window.setTimeout(callback, 0);
  }
}

export function afterTwoFrames(callback: () => void): void {
  afterNextFrame(() => afterNextFrame(callback));
}
