import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FocusEvent as ReactFocusEvent, ReactNode } from "react";
import { keyboardDebug } from "./composerKeyboardDebug";
import { recallKeyboardHeight } from "./keyboardFocusShared";
import { isAndroidRuntime } from "./mobilePlatform";
import { suppressNextGhostTap } from "./suppressGhostTap";
import { useComposerKeyboard } from "./useComposerKeyboard";

const KEYBOARD_VISIBILITY_OFFSET_VAR = "--m-keyboard-visibility-offset";

export function FloatingComposerDock(props: {
  readonly children: ReactNode;
  readonly keyboardKey: string | null | undefined;
  readonly scrimLabel: string;
  readonly collapsedTapLabel?: string | undefined;
  readonly dockClassName?: string | undefined;
  readonly bubbleClassName?: string | undefined;
  readonly expanded?: boolean | undefined;
  readonly focusOnExpand?: boolean | undefined;
  /** Collapse (and drop the scrim) when the composer input loses focus. */
  readonly collapseOnFocusLoss?: boolean | undefined;
  readonly onExpandedChange?: ((expanded: boolean) => void) | undefined;
  readonly onComposerFocusChange?: ((focused: boolean) => void) | undefined;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [internalExpanded, setInternalExpanded] = useState(false);
  // Suppresses the expand transitions for the guarded-focus path: the input
  // must sit at its FINAL geometry before focus() runs inside the gesture, or
  // iOS evaluates the mid-animation position and pans the layout viewport to
  // reveal it (reads as the keyboard pushing the page). Cleared after the
  // expansion has painted so later offset reconciliation animates normally.
  const [instantExpand, setInstantExpand] = useState(false);
  const expanded = props.expanded ?? internalExpanded;
  const wasExpandedRef = useRef(expanded);
  const skipNextFocusOnExpandRef = useRef(false);
  const onComposerFocusChange = props.onComposerFocusChange;
  const androidRuntime = isAndroidRuntime();

  const setExpanded = (next: boolean) => {
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

  const expandAndFocus = () => {
    focusComposer("compact-composer");
  };

  const handleFocusCapture = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && !expanded) {
      setExpanded(true);
    }
  };
  // The backdrop belongs to the whole focus sequence: it rises with the
  // keyboard during the cold measurement probe and stays up through the
  // expansion, so the probe → expand handoff never blinks it.
  const showScrim = expanded || measuringKeyboard;
  // A remembered keyboard height pre-positions the expanded dock during the
  // probe (liftOffset pins to it), so only a truly unknown height — a zero
  // lift — hides the dock until the measurement lands.
  const hideDockForMeasuring = measuringKeyboard && liftOffset === 0;

  return (
    <>
      {showScrim ? (
        <button
          type="button"
          className="m-compose-scrim"
          aria-label={props.scrimLabel}
          onClick={collapse}
        />
      ) : null}
      <div
        className={props.dockClassName ?? "m-compose-dock"}
        data-expanded={expanded || undefined}
        data-android-runtime={androidRuntime || undefined}
        data-instant-expand={instantExpand || undefined}
        data-measuring-keyboard={hideDockForMeasuring || undefined}
        style={{ "--m-keyboard-offset": `${liftOffset}px` } as CSSProperties}
      >
        <div
          ref={bubbleRef}
          className={["m-compose-bubble", props.bubbleClassName].filter(Boolean).join(" ")}
          onFocusCapture={handleFocusCapture}
        >
          {props.children}
          {props.collapsedTapLabel && !expanded ? (
            <button
              type="button"
              className="m-compose-tap"
              aria-label={props.collapsedTapLabel}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                expandAndFocus();
                suppressNextGhostTap();
              }}
              onClick={expandAndFocus}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
