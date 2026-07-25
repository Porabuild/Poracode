import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, FocusEvent as ReactFocusEvent, ReactNode } from "react";
import { keyboardDebug } from "./composerKeyboardDebug";
import { recallKeyboardHeight } from "./keyboardFocusShared";
import { isAndroidRuntime } from "./mobilePlatform";
import { isTouchLikePointerEvent } from "./pointerModality";
import { suppressNextGhostTap } from "./suppressGhostTap";
import { useBubbleGrowAnimation } from "./useBubbleGrowAnimation";
import { getComposerInput, useComposerKeyboard } from "./useComposerKeyboard";

const KEYBOARD_VISIBILITY_OFFSET_VAR = "--m-keyboard-visibility-offset";
const COMPOSER_OVERLAY_SELECTOR = [
  '[data-slot^="popover-"]',
  '[data-slot$="-popover"]',
  '[role="menu"]',
  '[role="listbox"]',
  ".poracode-mention-popover",
].join(",");

function resetCompactComposerScroll(root: HTMLElement | null): void {
  const input = getComposerInput(root);
  if (!input) return;
  input.scrollTop = 0;
  input.scrollLeft = 0;
}

export function FloatingComposerDock(props: {
  readonly children: ReactNode;
  /**
   * Content pinned above the composer bubble, inside the dock. The bubble clips
   * its own overflow to the collapsed control line, so chrome that must stay
   * visible while collapsed (the action docks: auth, pending steer, runtime
   * requests) lives here — still inside the dock, so it rides the same keyboard
   * lift and sits above the collapse scrim.
   */
  readonly aboveBubble?: ReactNode | undefined;
  readonly keyboardKey: string | null | undefined;
  readonly scrimLabel: string;
  readonly collapsedTapLabel?: string | undefined;
  readonly dockClassName?: string | undefined;
  readonly bubbleClassName?: string | undefined;
  readonly expanded?: boolean | undefined;
  /**
   * Pin the dock collapsed: no expansion from a tap, a focus, or a controlled
   * `expanded`. Used while a blocking approval/question is open above the bubble
   * — the card owns the surface, and the composer must not open over it. The
   * collapsed pill stays usable as a one-line input (deny-with-feedback), so it
   * still takes the keyboard lift while focused.
   */
  readonly expansionLocked?: boolean | undefined;
  readonly focusOnExpand?: boolean | undefined;
  /**
   * Collapse on an outside press without mounting the blocking scrim, allowing
   * the original background interaction to continue. Used by desktop PWA
   * layouts; touch layouts retain the modal scrim and keyboard choreography.
   */
  readonly nonBlockingOutsidePress?: boolean | undefined;
  /** Collapse (and drop the scrim) when the composer input loses focus. */
  readonly collapseOnFocusLoss?: boolean | undefined;
  readonly onExpandedChange?: ((expanded: boolean) => void) | undefined;
  readonly onComposerFocusChange?: ((focused: boolean) => void) | undefined;
  /**
   * Reports the dock's rendered height (border-box px) as it grows and shrinks,
   * so the host view can keep floating chrome (e.g. the scroll-to-bottom pin,
   * the info chips) clear of the composer. Covers `aboveBubble` too — chrome
   * anchored to this height must clear the whole dock, not just the bubble.
   */
  readonly onDockHeightChange?: ((height: number) => void) | undefined;
}) {
  const dockRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [internalExpanded, setInternalExpanded] = useState(false);
  // Suppresses the expand transitions for the guarded-focus path: the input
  // must sit at its FINAL geometry before focus() runs inside the gesture, or
  // iOS evaluates the mid-animation position and pans the layout viewport to
  // reveal it (reads as the keyboard pushing the page). Cleared after the
  // expansion has painted so later offset reconciliation animates normally.
  const [instantExpand, setInstantExpand] = useState(false);
  const expansionLocked = props.expansionLocked === true;
  const expanded = expansionLocked ? false : (props.expanded ?? internalExpanded);
  const wasExpandedRef = useRef(expanded);
  const skipNextFocusOnExpandRef = useRef(false);
  const onComposerFocusChange = props.onComposerFocusChange;
  const androidRuntime = isAndroidRuntime();

  // The expanded contenteditable scrolls internally to keep the caret at the
  // end of a multiline draft. WebKit preserves that scrollTop after the editor
  // is clamped to one line, which makes the compact pill show whichever line
  // was last under the caret instead of the draft's first line. Reset before
  // the collapsed commit paints so the real first line is the one centered in
  // the compact control.
  useLayoutEffect(() => {
    if (expanded) return;
    resetCompactComposerScroll(bubbleRef.current);
  }, [expanded, props.keyboardKey]);

  const setExpanded = (next: boolean) => {
    if (next && expansionLocked) return;
    if (!next) {
      skipNextFocusOnExpandRef.current = false;
    }
    if (props.expanded === undefined) {
      setInternalExpanded(next);
    }
    props.onExpandedChange?.(next);
  };
  const preseedAndroidKeyboardOffset = () => {
    if (!androidRuntime) return;
    const rememberedHeight = recallKeyboardHeight();
    if (rememberedHeight > 0) {
      document.documentElement.style.setProperty(
        KEYBOARD_VISIBILITY_OFFSET_VAR,
        `${rememberedHeight}px`,
      );
    }
  };

  const { focusComposer, inputFocused, liftOffset, measuringKeyboard } = useComposerKeyboard(
    bubbleRef,
    props.keyboardKey,
    {
      onBeforeGuardedFocus: () => {
        preseedAndroidKeyboardOffset();
        keyboardDebug("dock-before-guarded-focus-expand", {
          expanded,
          controlled: props.expanded !== undefined,
        });
        skipNextFocusOnExpandRef.current = true;
        setInstantExpand(true);
        setExpanded(true);
        onComposerFocusChange?.(true);
      },
      onKeyboardProbeExpand: () => {
        // Mirror onBeforeGuardedFocus but WITHOUT setInstantExpand: during the
        // probe the focused element is the fixed primer, so iOS won't pan for
        // the composer's geometry and the expansion can animate in sync with
        // the keyboard rise. The probe-completion path calls onBeforeGuardedFocus
        // (instant) to assert final geometry right before the caret lands.
        preseedAndroidKeyboardOffset();
        keyboardDebug("dock-probe-expand-animated", {
          expanded,
          controlled: props.expanded !== undefined,
        });
        skipNextFocusOnExpandRef.current = true;
        setExpanded(true);
        onComposerFocusChange?.(true);
      },
      onKeyboardProbeStart: () => {
        preseedAndroidKeyboardOffset();
        keyboardDebug("dock-keyboard-probe-start-no-expand", {
          expanded,
          controlled: props.expanded !== undefined,
        });
        onComposerFocusChange?.(true);
      },
    },
  );

  useEffect(() => {
    if (!instantExpand) return;
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setInstantExpand(false));
    });
    return () => window.cancelAnimationFrame(raf);
  }, [instantExpand]);

  // Hiding the keyboard (dismiss key, tapping the iOS "Done" bar) never taps
  // the scrim, so nothing would collapse the dock: the shell compacts via
  // :focus-within CSS while the backdrop lingers. `inputFocused` is already
  // debounced against the guarded-focus dance, so its falling edge is the
  // collapse signal. Toolbar taps don't blur (React Aria presses keep the
  // editable focused), so they never trip this.
  const prevInputFocusedRef = useRef(inputFocused);
  const collapseOnFocusLoss = props.collapseOnFocusLoss;
  const onExpandedChange = props.onExpandedChange;
  const expandedControlled = props.expanded !== undefined;
  useEffect(() => {
    const lostFocus = prevInputFocusedRef.current && !inputFocused;
    prevInputFocusedRef.current = inputFocused;
    if (!collapseOnFocusLoss || !lostFocus || !expanded) return;
    if (!expandedControlled) setInternalExpanded(false);
    onExpandedChange?.(false);
    const active = document.activeElement;
    // The dismiss key hides the keyboard WITHOUT blurring; drop the leftover
    // focus so the :focus-within chrome collapses together with the dock.
    if (active instanceof HTMLElement && bubbleRef.current?.contains(active)) {
      active.blur();
    }
  }, [inputFocused, collapseOnFocusLoss, expanded, expandedControlled, onExpandedChange]);

  useEffect(() => {
    if (props.expanded === undefined) {
      setInternalExpanded(false);
    }
  }, [props.keyboardKey, props.expanded]);

  useEffect(() => {
    skipNextFocusOnExpandRef.current = false;
  }, [props.keyboardKey]);

  useEffect(() => {
    if (props.focusOnExpand && expanded && !wasExpandedRef.current) {
      if (skipNextFocusOnExpandRef.current) {
        keyboardDebug("dock-skip-focus-on-expand-after-guarded-focus");
      } else {
        onComposerFocusChange?.(true);
        focusComposer("focus-on-expand");
      }
    }
    wasExpandedRef.current = expanded;
  }, [expanded, focusComposer, props.focusOnExpand, onComposerFocusChange]);

  useEffect(() => {
    onComposerFocusChange?.(inputFocused);
  }, [inputFocused, onComposerFocusChange]);

  const onDockHeightChange = props.onDockHeightChange;
  useEffect(() => {
    const dock = dockRef.current;
    if (!onDockHeightChange || !dock) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) onDockHeightChange(entry.borderBoxSize?.[0]?.blockSize ?? dock.offsetHeight);
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, [onDockHeightChange]);

  useEffect(
    () => () => {
      onComposerFocusChange?.(false);
    },
    [onComposerFocusChange],
  );

  const collapse = () => {
    keyboardDebug("dock-scrim-collapse", { expanded, measuringKeyboard });
    setExpanded(false);
    onComposerFocusChange?.(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  const expandAndFocus = (pointerType?: string) => {
    focusComposer("compact-composer", pointerType);
  };

  const handleFocusCapture = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (expansionLocked) return;
    if (event.target instanceof HTMLElement && !expanded) {
      setExpanded(true);
    }
  };
  // The backdrop belongs to the whole focus sequence: it rises with the
  // keyboard during the cold measurement probe and stays up through the
  // expansion, so the probe → expand handoff never blinks it.
  const showScrim = expanded || measuringKeyboard;
  const nonBlockingOutsidePress = props.nonBlockingOutsidePress === true;
  useEffect(() => {
    if (!showScrim || !nonBlockingOutsidePress) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      // Containment is tested against the whole dock, not just the bubble: the
      // action docks (approvals, pending steer) render above the bubble but are
      // part of this composer surface. Answering an approval on the desktop PWA
      // must not read as an outside press and collapse the composer under it.
      if (!(target instanceof Node) || dockRef.current?.contains(target)) return;
      // Composer menus are portaled outside the bubble. They belong to the
      // current interaction and must not collapse their owning composer.
      if (target instanceof Element && target.closest(COMPOSER_OVERLAY_SELECTOR)) return;

      keyboardDebug("dock-background-collapse", { expanded, measuringKeyboard });
      skipNextFocusOnExpandRef.current = false;
      if (!expandedControlled) setInternalExpanded(false);
      onExpandedChange?.(false);
      onComposerFocusChange?.(false);
      (document.activeElement as HTMLElement | null)?.blur?.();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [
    expanded,
    expandedControlled,
    measuringKeyboard,
    nonBlockingOutsidePress,
    onComposerFocusChange,
    onExpandedChange,
    showScrim,
  ]);
  // A remembered keyboard height pre-positions the expanded dock during the
  // probe (liftOffset pins to it), so only a truly unknown height — a zero
  // lift — hides the dock until the measurement lands.
  const hideDockForMeasuring = measuringKeyboard && liftOffset === 0;
  // Measured-px height pin for the expand/collapse flip; null lets the CSS
  // (auto height, control-line/viewport max-height caps) own the bubble.
  const bubblePin = useBubbleGrowAnimation(bubbleRef, expanded, instantExpand);
  // Keep the expanded inner layout mounted while the outer bubble shrinks —
  // dropping data-expanded at the start would snap the toolbar/input to their
  // compact absolute positions inside a still-tall wrapper. data-collapsing
  // marks the shrink window so the CSS can cross-fade the chrome (toolbar out,
  // summary in, compact input metrics) in sync with the height tween; by the
  // time the pin releases everything already sits at compact values.
  const visuallyExpanded = expanded || bubblePin !== null;
  const bubbleStyle: CSSProperties = {};
  if (bubblePin !== null) {
    bubbleStyle.height = bubblePin.height;
    if (bubblePin.maxHeight !== null) bubbleStyle.maxHeight = bubblePin.maxHeight;
  }

  return (
    <>
      {showScrim && !nonBlockingOutsidePress ? (
        <button
          type="button"
          className="m-compose-scrim"
          aria-label={props.scrimLabel}
          onClick={collapse}
        />
      ) : null}
      <div
        ref={dockRef}
        className={props.dockClassName ?? "m-compose-dock"}
        data-expanded={visuallyExpanded || undefined}
        data-locked={expansionLocked || undefined}
        {...(expansionLocked && inputFocused && liftOffset > 0 ? { "data-lifted": "" } : {})}
        data-collapsing={(!expanded && bubblePin !== null) || undefined}
        data-android-runtime={androidRuntime || undefined}
        data-instant-expand={instantExpand || undefined}
        data-measuring-keyboard={hideDockForMeasuring || undefined}
        style={{ "--m-keyboard-offset": `${liftOffset}px` } as CSSProperties}
      >
        {props.aboveBubble}
        <div
          ref={bubbleRef}
          className={["m-compose-bubble", props.bubbleClassName].filter(Boolean).join(" ")}
          style={bubbleStyle}
          data-height-animating={bubblePin !== null || undefined}
          onFocusCapture={handleFocusCapture}
        >
          {props.children}
          {props.collapsedTapLabel && !visuallyExpanded ? (
            <button
              type="button"
              className="m-compose-tap"
              aria-label={props.collapsedTapLabel}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                expandAndFocus(event.pointerType);
                // Only touch gestures fire the delayed synthetic tap-end click;
                // arming for a mouse press would swallow a real next click.
                if (isTouchLikePointerEvent(event.nativeEvent)) suppressNextGhostTap();
              }}
              onClick={(event) => {
                const pointerType =
                  event.nativeEvent instanceof PointerEvent
                    ? event.nativeEvent.pointerType
                    : undefined;
                expandAndFocus(pointerType);
              }}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
