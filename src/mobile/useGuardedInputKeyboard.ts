import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { RefObject } from "react";
import { focusWithoutScroll, lockComposeScroll, unlockComposeScroll } from "./composeScrollLock";
import {
  COLD_KEYBOARD_PROBE_TIMEOUT_MS,
  COLD_KEYBOARD_STABLE_MS,
  KEYBOARD_OPEN_THRESHOLD_PX,
  MIRRORED_POINTER_WINDOW_MS,
  afterTwoFrames,
  computeGuardedLiftOffset,
  focusKeyboardPrimer,
  getFocusSentinel,
  getKeyboardPrimer,
  isPrimerAbandoned,
  recallKeyboardHeight,
  rememberKeyboardHeight,
} from "./keyboardFocusShared";
import { isAndroidRuntime } from "./mobilePlatform";
import { isTouchCapableDevice, isTouchLikePointerEvent } from "./pointerModality";
import { suppressNextGhostTap } from "./suppressGhostTap";
import { useKeyboardGeometry } from "./useKeyboardOffset";

/**
 * Guarded keyboard focus for a plain bottom-anchored input (the files search
 * bar) — the same choreography as the composer ({@link useComposerKeyboard}),
 * slimmed to a single input with no expansion states:
 *
 * - Taps over the anchor are intercepted in the capture phase (preventDefault
 *   before native tap-focus — iOS pans the overflow-locked layout viewport for
 *   a natively focused bottom-edge input, and the offset lingers). Taps on
 *   buttons inside the anchor (clear ✕) pass through untouched.
 * - When the keyboard is closed, a fixed hidden primer raises it first; the
 *   real input is focused with preventScroll only after visualViewport reports
 *   a stable height. A remembered per-device height pre-lifts the bar during
 *   the probe. A probe that times out marks probes futile (hardware keyboard)
 *   until any keyboard height is observed again.
 * - `lockComposeScroll` re-asserts the page offset for the whole sequence and
 *   across the dismiss settle window; blur/dismiss unlocks and drops the lift.
 *
 * Returns `liftOffset` — the px to translate the bar up by, gated on focus so
 * it animates down with the keyboard.
 *
 * `key` retriggers the listener wiring when the hosting element is swapped
 * (e.g. the bar unmounts behind a fullscreen editor and remounts on close).
 */
export function useGuardedInputKeyboard(
  anchorRef: RefObject<HTMLElement | null>,
  inputRef: RefObject<HTMLInputElement | null>,
  key?: string | null,
): { readonly inputFocused: boolean; readonly liftOffset: number } {
  const keyboardGeometry = useKeyboardGeometry();
  const rawKeyboardOffset = keyboardGeometry.visibilityOffset;
  const keyboardOffset = rawKeyboardOffset > KEYBOARD_OPEN_THRESHOLD_PX ? rawKeyboardOffset : 0;
  const rawKeyboardLiftOffset = keyboardGeometry.liftOffset;
  const keyboardLiftOffset =
    rawKeyboardLiftOffset > KEYBOARD_OPEN_THRESHOLD_PX ? rawKeyboardLiftOffset : 0;
  const useColdKeyboardPrimer = !isAndroidRuntime();
  const touchCapable = isTouchCapableDevice();
  const keyboardOffsetRef = useRef(keyboardOffset);
  const keyboardLiftOffsetRef = useRef(keyboardLiftOffset);
  keyboardOffsetRef.current = keyboardOffset;
  keyboardLiftOffsetRef.current = keyboardLiftOffset;

  const [inputFocused, setInputFocused] = useState(false);
  const [probeActive, setProbeActive] = useState(false);
  const pendingColdFocusRef = useRef(false);
  const stableTimerRef = useRef(0);
  const probeTimeoutRef = useRef(0);
  const probeFutileRef = useRef(false);
  // Lift used while the probe runs, captured when it starts, so an interim
  // measurement can't shift the visible bar mid-probe.
  const coldProbeLiftRef = useRef(0);

  const cancelColdProbe = () => {
    pendingColdFocusRef.current = false;
    window.clearTimeout(stableTimerRef.current);
    window.clearTimeout(probeTimeoutRef.current);
    setProbeActive(false);
  };

  const focusInputWithScrollLock = () => {
    const anchor = anchorRef.current;
    const input = inputRef.current;
    if (!anchor || !input) return;
    lockComposeScroll(anchor);
    // Route through the fixed sentinel so iOS never pans for the edit focus.
    focusWithoutScroll(getFocusSentinel(anchor));
    focusWithoutScroll(input);
    lockComposeScroll(anchor);
  };

  // The probe resolves here: the measured offset held stable for the settle
  // window, so it's the trustworthy per-device height — remember it, then hand
  // focus from the primer to the real input.
  const finishColdProbe = () => {
    if (!pendingColdFocusRef.current) return;
    pendingColdFocusRef.current = false;
    window.clearTimeout(stableTimerRef.current);
    window.clearTimeout(probeTimeoutRef.current);
    rememberKeyboardHeight(keyboardLiftOffsetRef.current);
    // The delayed synthesized click of the gesture that started the probe can
    // still arrive at the original coordinates — now over the list the lifted
    // bar slid away from. Swallow it.
    suppressNextGhostTap();
    flushSync(() => {
      setProbeActive(false);
      setInputFocused(true);
    });
    afterTwoFrames(() => {
      if (!inputRef.current?.isConnected) return;
      focusInputWithScrollLock();
    });
  };

  useEffect(() => {
    if (keyboardOffset <= 0) return;
    // A software keyboard exists after all — probes work on this device.
    probeFutileRef.current = false;
    // A probe in flight sees interim mid-animation sizes; it remembers the
    // stable value itself when it resolves.
    if (!pendingColdFocusRef.current) {
      rememberKeyboardHeight(keyboardLiftOffset);
      return;
    }
    window.clearTimeout(stableTimerRef.current);
    stableTimerRef.current = window.setTimeout(finishColdProbe, COLD_KEYBOARD_STABLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helper closures read current refs; keyed to viewport offset changes
  }, [keyboardLiftOffset, keyboardOffset]);

  // iOS's keyboard-dismiss key hides the keyboard WITHOUT blurring. Drop the
  // lifted/locked state when that happens so the bar rides down with it.
  const prevOffsetRef = useRef(keyboardOffset);
  useEffect(() => {
    const prev = prevOffsetRef.current;
    prevOffsetRef.current = keyboardOffset;
    if (prev > 0 && keyboardOffset === 0 && inputFocused && !pendingColdFocusRef.current) {
      unlockComposeScroll();
      setInputFocused(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed to keyboard open/close state
  }, [keyboardOffset, inputFocused]);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    let lastTouchStartAt = 0;

    const isPassThroughTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest("button") !== null;

    const runGuardedFocus = (event: TouchEvent | PointerEvent) => {
      const input = inputRef.current;
      if (!input || input.disabled) return;
      // The clear (✕) button and siblings must act normally, not steal focus.
      if (isPassThroughTarget(event.target)) return;

      if (pendingColdFocusRef.current) {
        event.preventDefault();
        event.stopPropagation();
        lockComposeScroll(anchor);
        focusKeyboardPrimer(anchor);
        return;
      }
      // Already focused with the keyboard up → native caret placement.
      if (document.activeElement === input && keyboardOffsetRef.current > 0) return;

      // Never let the input take the native tap-focus (iOS pans the page for
      // it); focus programmatically inside the gesture with the page locked
      // first — iOS pans in the frames before any effect could run.
      event.preventDefault();
      event.stopPropagation();
      lockComposeScroll(anchor);

      const probeCold =
        window.visualViewport !== undefined &&
        window.visualViewport !== null &&
        keyboardOffsetRef.current === 0 &&
        useColdKeyboardPrimer &&
        !probeFutileRef.current;
      if (probeCold) {
        coldProbeLiftRef.current = recallKeyboardHeight();
        flushSync(() => {
          setProbeActive(true);
          setInputFocused(true);
        });
        pendingColdFocusRef.current = true;
        window.clearTimeout(probeTimeoutRef.current);
        probeTimeoutRef.current = window.setTimeout(() => {
          // No keyboard ever reported (hardware keyboard) — stop probing and
          // stand down; the next tap focuses the input directly.
          probeFutileRef.current = true;
          getKeyboardPrimer(anchor).blur();
          cancelColdProbe();
          unlockComposeScroll();
          setInputFocused(false);
        }, COLD_KEYBOARD_PROBE_TIMEOUT_MS);
        focusKeyboardPrimer(anchor);
      } else {
        flushSync(() => {
          setProbeActive(false);
          setInputFocused(true);
        });
        cancelColdProbe();
        focusInputWithScrollLock();
      }
      // The gesture's tap-end click would land on whatever the lift slid under
      // the finger. Swallow that one click.
      suppressNextGhostTap();
    };

    const handleTouchStart = (event: TouchEvent) => {
      lastTouchStartAt = Date.now();
      runGuardedFocus(event);
    };
    const handlePointerDown = (event: PointerEvent) => {
      // Mouse clicks focus the plain input natively — the guarded dance only
      // exists for the software keyboard a touch tap summons.
      if (!isTouchLikePointerEvent(event)) return;
      // The pointerdown mirroring a just-handled touchstart must not re-run
      // the guard (or hand the input its native focus) — swallow it.
      if (lastTouchStartAt > 0 && Date.now() - lastTouchStartAt < MIRRORED_POINTER_WINDOW_MS) {
        if (!isPassThroughTarget(event.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      runGuardedFocus(event);
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (event.target !== inputRef.current) return;
      // No software keyboard means no post-focus viewport churn to fight.
      if (touchCapable) lockComposeScroll(anchor);
      setInputFocused(true);
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (event.target !== inputRef.current) return;
      unlockComposeScroll();
      cancelColdProbe();
      setInputFocused(false);
    };
    // The primer losing focus to anything but our input means the probe was
    // abandoned (a tap elsewhere) — stand down instead of stealing focus back.
    const handleDocumentFocusOut = (event: FocusEvent) => {
      if (!pendingColdFocusRef.current) return;
      if (!isPrimerAbandoned(event, (t) => t === inputRef.current)) return;
      cancelColdProbe();
      unlockComposeScroll();
      setInputFocused(false);
    };

    anchor.addEventListener("touchstart", handleTouchStart, { capture: true });
    anchor.addEventListener("pointerdown", handlePointerDown, true);
    anchor.addEventListener("focusin", handleFocusIn);
    anchor.addEventListener("focusout", handleFocusOut);
    document.addEventListener("focusout", handleDocumentFocusOut);
    return () => {
      anchor.removeEventListener("touchstart", handleTouchStart, true);
      anchor.removeEventListener("pointerdown", handlePointerDown, true);
      anchor.removeEventListener("focusin", handleFocusIn);
      anchor.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("focusout", handleDocumentFocusOut);
      window.clearTimeout(stableTimerRef.current);
      window.clearTimeout(probeTimeoutRef.current);
      pendingColdFocusRef.current = false;
      setProbeActive(false);
      unlockComposeScroll();
      setInputFocused(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners are scoped to the anchor node/key; handlers read current refs
  }, [anchorRef, inputRef, key]);

  const liftOffset = computeGuardedLiftOffset({
    focused: inputFocused,
    probing: probeActive,
    coldProbeLift: coldProbeLiftRef.current,
    keyboardOffset: keyboardLiftOffset,
    recalledHeight: useColdKeyboardPrimer ? recallKeyboardHeight() : 0,
  });
  return { inputFocused, liftOffset };
}
