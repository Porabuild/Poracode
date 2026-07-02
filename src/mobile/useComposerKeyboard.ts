import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { RefObject } from "react";
import { focusWithoutScroll, lockComposeScroll, unlockComposeScroll } from "./composeScrollLock";
import { suppressNextGhostTap } from "./suppressGhostTap";
import { useKeyboardOffset } from "./useKeyboardOffset";

/** True when the element lives in the input area that summons the keyboard. */
function isKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("[data-composer-input-anchor]") !== null;
}

/**
 * The keyboard's height only becomes measurable AFTER its appear animation
 * ends (iOS reports the visual-viewport change once, at the end). A composer
 * sitting at the bottom edge would spend that whole animation underneath the
 * keyboard — and iOS pans the visual viewport to reveal a focused editable it
 * considers hidden, which reads as the page sliding. The height is stable per
 * device, so remember the last measured one and lift by it optimistically the
 * moment focus lands; the measured value takes over once it arrives.
 */
const KEYBOARD_HEIGHT_KEY = "lightcode-mobile-keyboard-height";
const GUARDED_FOCUS_SETTLE_MS = 450;
let recalledKeyboardHeight: number | null = null;

function recallKeyboardHeight(): number {
  if (recalledKeyboardHeight === null) {
    const raw = window.localStorage.getItem(KEYBOARD_HEIGHT_KEY);
    const parsed = raw ? Number(raw) : 0;
    recalledKeyboardHeight = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return recalledKeyboardHeight;
}

function rememberKeyboardHeight(px: number): void {
  if (px <= 0 || px === recalledKeyboardHeight) return;
  recalledKeyboardHeight = px;
  try {
    window.localStorage.setItem(KEYBOARD_HEIGHT_KEY, String(Math.round(px)));
  } catch {
    // Best-effort persistence; the module-level cache still covers the session.
  }
}

/** Focus the composer's input (a contenteditable) inside `root`. */
function getComposerInput(root: HTMLElement | null): HTMLElement | null {
  return (
    root?.querySelector<HTMLElement>(
      '[data-composer-input-anchor] [contenteditable="true"], textarea',
    ) ?? null
  );
}

function getFocusSentinel(root: HTMLElement): HTMLElement {
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

/** Focus through a fixed non-editable target so iOS does not pan before edit focus. */
export function focusComposerInputFromNeutralTarget(root: HTMLElement | null): void {
  if (!root) return;
  const input = getComposerInput(root);
  if (!input) return;
  focusWithoutScroll(getFocusSentinel(root));
  focusWithoutScroll(input);
}

function afterNextFrame(callback: () => void): void {
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(callback);
  } else {
    window.setTimeout(callback, 0);
  }
}

interface ComposerKeyboardOptions {
  readonly onBeforeGuardedFocus?: () => void;
}

function focusComposerInputWithScrollLock(root: HTMLElement): void {
  lockComposeScroll(root);
  focusComposerInputFromNeutralTarget(root);
  lockComposeScroll(root);
}

/**
 * The one keyboard behavior shared by every mobile composer (the home bubble
 * and the live-thread composer host the same desktop composer, and must feel
 * like the same component):
 *
 * - A natively tap-focused input makes iOS pan the overflow-locked document,
 *   and the offset lingers after the keyboard goes. Taps over the input area
 *   are intercepted in the capture phase and re-issued as a programmatic
 *   focus with preventScroll — still inside the gesture, so the keyboard
 *   rises. Taps while already focused pass through (native caret placement).
 * - While the input holds focus, a scroll lock re-asserts the page offset
 *   (and keeps re-asserting across the keyboard-dismiss settle window).
 * - `liftOffset` is the keyboard height to translate the composer up by,
 *   gated on focus: iOS reports the visual-viewport change only AFTER the
 *   keyboard's dismiss animation, which would leave the composer hanging
 *   mid-screen — losing focus drops the lift immediately so the composer's
 *   transform transition animates down together with the keyboard.
 *
 * `key` retriggers the listener wiring when the hosting element is swapped
 * (e.g. the thread id changes or an empty state gives way to content).
 */
export function useComposerKeyboard(
  ref: RefObject<HTMLElement | null>,
  key: string | null | undefined,
  options: ComposerKeyboardOptions = {},
): { readonly inputFocused: boolean; readonly liftOffset: number } {
  const keyboardOffset = useKeyboardOffset();
  const keyboardOffsetRef = useRef(keyboardOffset);
  const [inputFocused, setInputFocused] = useState(false);
  const suppressNextFocusOutUnlockRef = useRef(false);
  const suppressNextKeyboardGoneCleanupRef = useRef(false);
  const guardedFocusSettleRef = useRef(false);
  const guardedFocusSettleTimerRef = useRef(0);
  const onBeforeGuardedFocusRef = useRef(options.onBeforeGuardedFocus);
  keyboardOffsetRef.current = keyboardOffset;
  onBeforeGuardedFocusRef.current = options.onBeforeGuardedFocus;

  const armGuardedFocusSettle = () => {
    guardedFocusSettleRef.current = true;
    window.clearTimeout(guardedFocusSettleTimerRef.current);
    guardedFocusSettleTimerRef.current = window.setTimeout(() => {
      guardedFocusSettleRef.current = false;
    }, GUARDED_FOCUS_SETTLE_MS);
  };

  useEffect(() => {
    if (keyboardOffset > 0) rememberKeyboardHeight(keyboardOffset);
  }, [keyboardOffset]);

  // iOS's keyboard-dismiss key hides the keyboard WITHOUT blurring, leaving
  // the editable as document.activeElement. Drop our lifted/locked state when
  // that happens, but don't blur the editor: the guarded pointerdown below can
  // safely refocus through the neutral sentinel. A delayed blur here races the
  // next touch-focus and can close the keyboard right after it opens.
  const prevOffsetRef = useRef(keyboardOffset);
  useEffect(() => {
    const prev = prevOffsetRef.current;
    prevOffsetRef.current = keyboardOffset;
    if (keyboardOffset > 0) {
      suppressNextKeyboardGoneCleanupRef.current = false;
      return;
    }
    if (prev > 0 && keyboardOffset === 0 && inputFocused) {
      if (suppressNextKeyboardGoneCleanupRef.current) {
        suppressNextKeyboardGoneCleanupRef.current = false;
        return;
      }
      unlockComposeScroll();
      setInputFocused(false);
    }
  }, [keyboardOffset, inputFocused]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!isKeyboardTarget(event.target)) return;
      const active = document.activeElement;
      const activeIsKeyboardTarget = isKeyboardTarget(active);
      if (activeIsKeyboardTarget && keyboardOffsetRef.current > 0) return;
      // Never let the input take the native tap-focus (iOS pans the page for
      // it); focus programmatically inside the gesture instead, with the page
      // locked first — iOS pans in the frames before any effect could run.
      event.preventDefault();
      event.stopPropagation();
      lockComposeScroll(root);
      if (activeIsKeyboardTarget && active instanceof HTMLElement) {
        suppressNextFocusOutUnlockRef.current = true;
      }
      // Match the collapsed composer path: never focus from the editable's
      // native tap. First focus a fixed, non-editable sentinel (which cannot
      // summon the keyboard or pan the page), optimistically lift the composer,
      // then focus the real input with preventScroll while still in the touch
      // gesture.
      suppressNextKeyboardGoneCleanupRef.current = true;
      armGuardedFocusSettle();
      flushSync(() => {
        onBeforeGuardedFocusRef.current?.();
        setInputFocused(true);
      });
      focusComposerInputWithScrollLock(root);
      // Focusing expands the composer while the finger is still down; the
      // gesture's synthetic tap-end click would land on whatever control the
      // expansion slid under the finger (opening a menu, or blurring the
      // input and collapsing right back). Swallow that one click.
      suppressNextGhostTap();
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!isKeyboardTarget(event.target)) return;
      lockComposeScroll(root);
      setInputFocused(true);
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (isKeyboardTarget(event.target) && !isKeyboardTarget(event.relatedTarget)) {
        if (suppressNextFocusOutUnlockRef.current) {
          suppressNextFocusOutUnlockRef.current = false;
          return;
        }
        if (guardedFocusSettleRef.current) {
          lockComposeScroll(root);
          afterNextFrame(() => {
            if (!root.isConnected || isKeyboardTarget(document.activeElement)) return;
            focusComposerInputWithScrollLock(root);
          });
          return;
        }
        unlockComposeScroll();
        setInputFocused(false);
      }
    };

    root.addEventListener("pointerdown", handlePointerDown, true);
    root.addEventListener("focusin", handleFocusIn);
    root.addEventListener("focusout", handleFocusOut);
    return () => {
      root.removeEventListener("pointerdown", handlePointerDown, true);
      root.removeEventListener("focusin", handleFocusIn);
      root.removeEventListener("focusout", handleFocusOut);
      window.clearTimeout(guardedFocusSettleTimerRef.current);
      guardedFocusSettleRef.current = false;
      unlockComposeScroll();
      setInputFocused(false);
    };
  }, [ref, key]);

  // Optimistic lift: rise by the remembered height in step with the keyboard
  // animation (the transform transition covers both), reconciled to the
  // measured offset once iOS reports it.
  const liftOffset = inputFocused
    ? keyboardOffset > 0
      ? keyboardOffset
      : recallKeyboardHeight()
    : 0;
  return { inputFocused, liftOffset };
}
