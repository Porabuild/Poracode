import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { RefObject } from "react";
import { describeElement, keyboardDebug } from "./composerKeyboardDebug";
import { focusWithoutScroll, lockComposeScroll, unlockComposeScroll } from "./composeScrollLock";
import {
  COLD_KEYBOARD_PROBE_TIMEOUT_MS,
  COLD_KEYBOARD_STABLE_MS,
  KEYBOARD_OPEN_THRESHOLD_PX,
  MIRRORED_POINTER_WINDOW_MS,
  afterNextFrame,
  afterTwoFrames,
  computeGuardedLiftOffset,
  focusKeyboardPrimer,
  getFocusSentinel,
  getKeyboardPrimer,
  isPrimerAbandoned,
  recallKeyboardHeight,
  rememberKeyboardHeight,
  resetKeyboardHeightMemoryForTests,
} from "./keyboardFocusShared";
import { isAndroidRuntime } from "./mobilePlatform";
import { suppressNextGhostTap } from "./suppressGhostTap";
import { useKeyboardGeometry } from "./useKeyboardOffset";

/** True when the element lives in the input area that summons the keyboard. */
function isKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("[data-composer-input-anchor]") !== null;
}

/*
 * The keyboard's height only becomes measurable AFTER its appear animation
 * ends (iOS reports the visual-viewport change once, at the end). A composer
 * sitting at the bottom edge would spend that whole animation underneath the
 * keyboard — and iOS pans the visual viewport to reveal a focused editable it
 * considers hidden, which reads as the page sliding. The height is stable per
 * device, so remember the last measured one and lift by it on later focuses.
 * Whenever a focus must raise the keyboard from closed, raise it with a fixed
 * hidden primer and focus the real composer input only after the measured
 * value arrives: focusing the editable while the keyboard is still rising
 * makes iOS pan the layout viewport (scrollY/innerHeight jump mid-animation)
 * and emit interim viewport sizes — on the first focus after load and on
 * every later focus from a dismissed keyboard alike. A remembered height
 * doesn't skip that probe — it pre-positions the visible dock during it, so
 * only the caret waits. Probes are disabled after one times out with no
 * keyboard (hardware keyboard: nothing will ever be measured) and re-enabled
 * the moment any keyboard height is observed.
 *
 * The primer element, thresholds, and height memory live in
 * keyboardFocusShared.ts, shared with the files-search guarded focus
 * (useGuardedInputKeyboard).
 */
const GUARDED_FOCUS_SETTLE_MS = 450;

export function resetComposerKeyboardMemoryForTests(): void {
  resetKeyboardHeightMemoryForTests();
}

/** Focus the composer's input (a contenteditable) inside `root`. */
function getComposerInput(root: HTMLElement | null): HTMLElement | null {
  return (
    root?.querySelector<HTMLElement>(
      '[data-composer-input-anchor] [contenteditable="true"], textarea:not(:disabled)',
    ) ?? null
  );
}

/** Focus through a fixed non-editable target so iOS does not pan before edit focus. */
function focusComposerInputFromNeutralTarget(root: HTMLElement | null): void {
  if (!root) return;
  const input = getComposerInput(root);
  if (!input) return;
  focusWithoutScroll(getFocusSentinel(root));
  focusWithoutScroll(input);
}

interface ComposerKeyboardOptions {
  readonly onBeforeGuardedFocus?: () => void;
  readonly onKeyboardProbeStart?: () => void;
  readonly onKeyboardProbeExpand?: () => void;
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
): {
  readonly focusComposer: (source?: string) => void;
  readonly inputFocused: boolean;
  readonly liftOffset: number;
  readonly measuringKeyboard: boolean;
} {
  const keyboardGeometry = useKeyboardGeometry();
  const rawKeyboardOffset = keyboardGeometry.visibilityOffset;
  const keyboardOffset = rawKeyboardOffset > KEYBOARD_OPEN_THRESHOLD_PX ? rawKeyboardOffset : 0;
  const rawKeyboardLiftOffset = keyboardGeometry.liftOffset;
  const keyboardLiftOffset =
    rawKeyboardLiftOffset > KEYBOARD_OPEN_THRESHOLD_PX ? rawKeyboardLiftOffset : 0;
  const useColdKeyboardPrimer = !isAndroidRuntime();
  const keyboardOffsetRef = useRef(keyboardOffset);
  const keyboardLiftOffsetRef = useRef(keyboardLiftOffset);
  const [inputFocused, setInputFocused] = useState(false);
  const [coldKeyboardProbeActive, setColdKeyboardProbeActive] = useState(false);
  const suppressNextFocusOutUnlockRef = useRef(false);
  const suppressNextKeyboardGoneCleanupRef = useRef(false);
  const guardedFocusSettleRef = useRef(false);
  const guardedFocusSettleTimerRef = useRef(0);
  const coldKeyboardStableTimerRef = useRef(0);
  const coldKeyboardProbeTimerRef = useRef(0);
  const pendingColdFocusRef = useRef(false);
  // Lift used while the probe runs, captured when it starts: the remembered
  // height must not shift under the visible dock mid-probe (interim
  // measurements update the remembered value only after the probe resolves).
  const coldProbeLiftRef = useRef(0);
  // True after a probe timed out with no keyboard measurement — a hardware
  // keyboard is attached, so further probes would stall every focus. Any
  // observed keyboard height flips it back.
  const probeFutileRef = useRef(false);
  const onBeforeGuardedFocusRef = useRef(options.onBeforeGuardedFocus);
  const onKeyboardProbeStartRef = useRef(options.onKeyboardProbeStart);
  const onKeyboardProbeExpandRef = useRef(options.onKeyboardProbeExpand);
  keyboardOffsetRef.current = keyboardOffset;
  keyboardLiftOffsetRef.current = keyboardLiftOffset;
  onBeforeGuardedFocusRef.current = options.onBeforeGuardedFocus;
  onKeyboardProbeStartRef.current = options.onKeyboardProbeStart;
  onKeyboardProbeExpandRef.current = options.onKeyboardProbeExpand;

  const armGuardedFocusSettle = () => {
    guardedFocusSettleRef.current = true;
    window.clearTimeout(guardedFocusSettleTimerRef.current);
    guardedFocusSettleTimerRef.current = window.setTimeout(() => {
      guardedFocusSettleRef.current = false;
    }, GUARDED_FOCUS_SETTLE_MS);
  };

  const shouldProbeColdKeyboard = () =>
    window.visualViewport !== undefined &&
    window.visualViewport !== null &&
    keyboardOffsetRef.current === 0 &&
    useColdKeyboardPrimer &&
    !probeFutileRef.current;

  const cancelColdKeyboardProbe = (reason: string) => {
    if (pendingColdFocusRef.current || coldKeyboardProbeActive) {
      keyboardDebug("probe-cancel", { reason });
    }
    pendingColdFocusRef.current = false;
    window.clearTimeout(coldKeyboardStableTimerRef.current);
    window.clearTimeout(coldKeyboardProbeTimerRef.current);
    setColdKeyboardProbeActive(false);
  };

  const focusComposerAfterColdKeyboardProbe = (root: HTMLElement) => {
    if (!pendingColdFocusRef.current) {
      keyboardDebug("real-focus-skip", { reason: "no-pending-probe" });
      return;
    }
    keyboardDebug("real-focus-prepare", {
      rootConnected: root.isConnected,
      keyboardOffset: keyboardOffsetRef.current,
      keyboardLiftOffset: keyboardLiftOffsetRef.current,
      recalledHeight: recallKeyboardHeight(),
    });
    pendingColdFocusRef.current = false;
    window.clearTimeout(coldKeyboardStableTimerRef.current);
    window.clearTimeout(coldKeyboardProbeTimerRef.current);
    // The offset has now been stable for the settle window — this is the
    // trustworthy per-device height (interim mid-animation values are not).
    rememberKeyboardHeight(keyboardLiftOffsetRef.current);
    armGuardedFocusSettle();
    // The expansion (and the full-screen scrim) render hundreds of ms after
    // the tap that started the probe — past the ghost-tap guard armed at
    // pointerdown. iOS can still deliver the gesture's delayed synthesized
    // click at the original coordinates, which the scrim would catch as a
    // collapse (blurring the freshly focused input). Re-arm for that click.
    suppressNextGhostTap();
    flushSync(() => {
      onBeforeGuardedFocusRef.current?.();
      setColdKeyboardProbeActive(false);
      setInputFocused(true);
    });
    afterTwoFrames(() => {
      if (!root.isConnected) {
        keyboardDebug("real-focus-skip", { reason: "root-disconnected" });
        return;
      }
      keyboardDebug("real-focus-run", {
        keyboardOffset: keyboardOffsetRef.current,
        input: describeElement(getComposerInput(root)),
      });
      focusComposerInputWithScrollLock(root);
      keyboardDebug("real-focus-done");
    });
  };

  const scheduleColdKeyboardStableFocus = (root: HTMLElement) => {
    window.clearTimeout(coldKeyboardStableTimerRef.current);
    keyboardDebug("stable-focus-scheduled", {
      delayMs: COLD_KEYBOARD_STABLE_MS,
      keyboardOffset,
      rawKeyboardOffset,
      pendingColdFocus: pendingColdFocusRef.current,
    });
    coldKeyboardStableTimerRef.current = window.setTimeout(() => {
      keyboardDebug("stable-focus-fired", {
        keyboardOffset: keyboardOffsetRef.current,
        pendingColdFocus: pendingColdFocusRef.current,
      });
      focusComposerAfterColdKeyboardProbe(root);
    }, COLD_KEYBOARD_STABLE_MS);
  };

  const scheduleColdKeyboardProbeTimeout = (root: HTMLElement) => {
    window.clearTimeout(coldKeyboardProbeTimerRef.current);
    keyboardDebug("probe-timeout-scheduled", { delayMs: COLD_KEYBOARD_PROBE_TIMEOUT_MS });
    coldKeyboardProbeTimerRef.current = window.setTimeout(() => {
      keyboardDebug("probe-timeout-fired", {
        keyboardOffset: keyboardOffsetRef.current,
        pendingColdFocus: pendingColdFocusRef.current,
      });
      probeFutileRef.current = true;
      getKeyboardPrimer(root).blur();
      cancelColdKeyboardProbe("timeout");
      unlockComposeScroll();
      setInputFocused(false);
    }, COLD_KEYBOARD_PROBE_TIMEOUT_MS);
  };

  const runGuardedFocus = (
    root: HTMLElement,
    source: string,
    event?: PointerEvent | TouchEvent,
  ): boolean => {
    const target = event?.target ?? null;
    if (event && !isKeyboardTarget(target)) return false;
    keyboardDebug("start-keyboard-target", {
      source,
      target: describeElement(target instanceof Element ? target : null),
      rawKeyboardOffset,
      keyboardOffset: keyboardOffsetRef.current,
      recalledHeight: recallKeyboardHeight(),
      probeFutile: probeFutileRef.current,
      programmatic: event === undefined,
    });
    // A disabled composer (inactive thread) renders its editable with
    // contentEditable=false, so nothing here can take focus — expanding
    // would only relocate the dock with no keyboard behind it.
    const composerInput = getComposerInput(root);
    if (!composerInput) {
      keyboardDebug("start-skip", { source, reason: "no-composer-input" });
      return false;
    }

    if (pendingColdFocusRef.current) {
      event?.preventDefault();
      event?.stopPropagation();
      lockComposeScroll(root);
      keyboardDebug("start-skip", { source, reason: "pending-cold-focus" });
      focusKeyboardPrimer(root);
      return true;
    }

    const active = document.activeElement;
    const activeIsKeyboardTarget = isKeyboardTarget(active);
    if (activeIsKeyboardTarget && keyboardOffsetRef.current > 0) {
      keyboardDebug(event ? "start-native-caret" : "start-skip", {
        source,
        reason: "already-focused-keyboard-visible",
      });
      return false;
    }
    // Never let the input take the native tap-focus (iOS pans the page for
    // it); focus programmatically inside the gesture instead, with the page
    // locked first — iOS pans in the frames before any effect could run.
    event?.preventDefault();
    event?.stopPropagation();
    lockComposeScroll(root);
    if (activeIsKeyboardTarget && active instanceof HTMLElement) {
      suppressNextFocusOutUnlockRef.current = true;
    }
    // Match the collapsed composer path: never focus from the editable's
    // native tap. When this is a cold first focus, raise the keyboard through
    // a fixed primer first and wait for visualViewport before touching the
    // real composer input; otherwise focus the real input immediately.
    suppressNextKeyboardGoneCleanupRef.current = true;
    const probeColdKeyboard = shouldProbeColdKeyboard();
    keyboardDebug("guarded-focus-decision", {
      source,
      probeColdKeyboard,
      activeIsKeyboardTarget,
      keyboardOffset: keyboardOffsetRef.current,
      recalledHeight: recallKeyboardHeight(),
      probeFutile: probeFutileRef.current,
      input: describeElement(composerInput),
    });
    if (probeColdKeyboard) {
      coldProbeLiftRef.current = recallKeyboardHeight();
      flushSync(() => {
        // With a remembered height the dock can expand right away at that
        // lift while the primer raises the keyboard — only the caret waits
        // for the measurement. The focused element during the probe is the
        // fixed primer, so iOS won't pan for the composer geometry: the
        // expansion can ANIMATE (onKeyboardProbeExpand) rather than snap. The
        // probe-completion path calls onBeforeGuardedFocus again to assert the
        // final geometry instantly right before the caret lands. Without a
        // remembered height there is no safe position, so the probe-start path
        // keeps the dock hidden until the offset is known.
        if (recallKeyboardHeight() > 0) {
          (onKeyboardProbeExpandRef.current ?? onBeforeGuardedFocusRef.current)?.();
        } else {
          onKeyboardProbeStartRef.current?.();
        }
        setColdKeyboardProbeActive(true);
        setInputFocused(true);
      });
      pendingColdFocusRef.current = true;
      scheduleColdKeyboardProbeTimeout(root);
      keyboardDebug("primer-focus-run", { primer: describeElement(getKeyboardPrimer(root)) });
      focusKeyboardPrimer(root);
      keyboardDebug("primer-focus-done");
    } else {
      armGuardedFocusSettle();
      flushSync(() => {
        onBeforeGuardedFocusRef.current?.();
        setColdKeyboardProbeActive(false);
        setInputFocused(true);
      });
      cancelColdKeyboardProbe("warm-focus");
      keyboardDebug("warm-real-focus-run", { input: describeElement(composerInput) });
      focusComposerInputWithScrollLock(root);
      keyboardDebug("warm-real-focus-done");
    }
    // Focusing expands the composer while the finger is still down; the
    // gesture's synthetic tap-end click would land on whatever control the
    // expansion slid under the finger (opening a menu, or blurring the
    // input and collapsing right back). Swallow that one click.
    if (event) suppressNextGhostTap();
    return true;
  };

  const focusComposer = (source = "programmatic") => {
    const root = ref.current;
    keyboardDebug("programmatic-focus-request", {
      source,
      rootConnected: root?.isConnected ?? false,
    });
    if (!root) return;
    runGuardedFocus(root, source);
  };

  useEffect(() => {
    keyboardDebug("offset-change", {
      rawKeyboardOffset,
      rawKeyboardLiftOffset,
      keyboardOffset,
      keyboardLiftOffset,
      pendingColdFocus: pendingColdFocusRef.current,
      coldKeyboardProbeActive,
      inputFocused,
      recalledHeight: recallKeyboardHeight(),
    });
    if (keyboardOffset > 0) {
      // A software keyboard exists after all — probes work on this device.
      probeFutileRef.current = false;
      // A probe in flight sees interim mid-animation sizes; it remembers the
      // stable value itself when it resolves.
      if (!pendingColdFocusRef.current) {
        rememberKeyboardHeight(useColdKeyboardPrimer ? keyboardLiftOffset : keyboardOffset);
      }
      keyboardDebug("keyboard-measured", {
        rawKeyboardOffset,
        rawKeyboardLiftOffset,
        keyboardOffset,
        keyboardLiftOffset,
        pendingColdFocus: pendingColdFocusRef.current,
      });
      const root = ref.current;
      if (root) {
        scheduleColdKeyboardStableFocus(root);
      } else {
        cancelColdKeyboardProbe("measured-without-root");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debug logs and helper closures read current refs; this effect is keyed to viewport offset changes
  }, [keyboardLiftOffset, keyboardOffset, rawKeyboardLiftOffset, rawKeyboardOffset, ref]);

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
        keyboardDebug("keyboard-gone-cleanup-suppressed", { prev, keyboardOffset });
        suppressNextKeyboardGoneCleanupRef.current = false;
        return;
      }
      keyboardDebug("keyboard-gone-cleanup", { prev, keyboardOffset });
      unlockComposeScroll();
      cancelColdKeyboardProbe("keyboard-gone");
      setInputFocused(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup helper reads current refs; this effect is keyed to keyboard open/close state
  }, [keyboardOffset, inputFocused]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let lastTouchStartAt = 0;

    const handleTouchStart = (event: TouchEvent) => {
      if (!isKeyboardTarget(event.target)) return;
      lastTouchStartAt = Date.now();
      runGuardedFocus(root, "touchstart", event);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (lastTouchStartAt > 0 && Date.now() - lastTouchStartAt < MIRRORED_POINTER_WINDOW_MS) {
        if (isKeyboardTarget(event.target)) {
          keyboardDebug("pointerdown-skip-after-touchstart", {
            target: describeElement(event.target instanceof Element ? event.target : null),
          });
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      runGuardedFocus(root, "pointerdown", event);
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!isKeyboardTarget(event.target)) return;
      keyboardDebug("focusin-composer", {
        target: describeElement(event.target instanceof Element ? event.target : null),
      });
      lockComposeScroll(root);
      setInputFocused(true);
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (isKeyboardTarget(event.target) && !isKeyboardTarget(event.relatedTarget)) {
        keyboardDebug("focusout-composer", {
          target: describeElement(event.target instanceof Element ? event.target : null),
          relatedTarget: describeElement(
            event.relatedTarget instanceof Element ? event.relatedTarget : null,
          ),
          guardedSettle: guardedFocusSettleRef.current,
          suppressNext: suppressNextFocusOutUnlockRef.current,
        });
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
        cancelColdKeyboardProbe("composer-focusout");
        setInputFocused(false);
      }
    };
    const handleDocumentFocusOut = (event: FocusEvent) => {
      if (!pendingColdFocusRef.current) return;
      if (!isPrimerAbandoned(event, isKeyboardTarget)) return;
      keyboardDebug("primer-focusout-cancel", {
        relatedTarget: describeElement(
          event.relatedTarget instanceof Element ? event.relatedTarget : null,
        ),
      });
      cancelColdKeyboardProbe("primer-focusout");
      unlockComposeScroll();
      setInputFocused(false);
    };

    root.addEventListener("touchstart", handleTouchStart, { capture: true });
    root.addEventListener("pointerdown", handlePointerDown, true);
    root.addEventListener("focusin", handleFocusIn);
    root.addEventListener("focusout", handleFocusOut);
    document.addEventListener("focusout", handleDocumentFocusOut);
    return () => {
      root.removeEventListener("touchstart", handleTouchStart, true);
      root.removeEventListener("pointerdown", handlePointerDown, true);
      root.removeEventListener("focusin", handleFocusIn);
      root.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("focusout", handleDocumentFocusOut);
      window.clearTimeout(guardedFocusSettleTimerRef.current);
      window.clearTimeout(coldKeyboardStableTimerRef.current);
      window.clearTimeout(coldKeyboardProbeTimerRef.current);
      pendingColdFocusRef.current = false;
      guardedFocusSettleRef.current = false;
      setColdKeyboardProbeActive(false);
      unlockComposeScroll();
      setInputFocused(false);
      keyboardDebug("cleanup");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners are scoped to the composer root/key; handlers read current refs
  }, [ref, key]);

  const measuringKeyboard = inputFocused && coldKeyboardProbeActive;
  const liftOffset = computeGuardedLiftOffset({
    focused: inputFocused,
    probing: measuringKeyboard,
    coldProbeLift: coldProbeLiftRef.current,
    keyboardOffset: keyboardLiftOffset,
    recalledHeight: useColdKeyboardPrimer ? recallKeyboardHeight() : 0,
  });
  return {
    focusComposer,
    inputFocused,
    liftOffset,
    measuringKeyboard,
  };
}
