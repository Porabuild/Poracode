import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FocusEvent as ReactFocusEvent, ReactNode } from "react";
import { lockComposeScroll } from "./composeScrollLock";
import { suppressNextGhostTap } from "./suppressGhostTap";
import { focusComposerInputFromNeutralTarget, useComposerKeyboard } from "./useComposerKeyboard";

export function FloatingComposerDock(props: {
  readonly children: ReactNode;
  readonly keyboardKey: string | null | undefined;
  readonly scrimLabel: string;
  readonly collapsedTapLabel?: string | undefined;
  readonly dockClassName?: string | undefined;
  readonly bubbleClassName?: string | undefined;
  readonly expanded?: boolean | undefined;
  readonly focusOnExpand?: boolean | undefined;
  readonly onExpandedChange?: ((expanded: boolean) => void) | undefined;
  readonly onComposerFocusChange?: ((focused: boolean) => void) | undefined;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = props.expanded ?? internalExpanded;
  const wasExpandedRef = useRef(expanded);
  const onComposerFocusChange = props.onComposerFocusChange;

  const setExpanded = (next: boolean) => {
    if (props.expanded === undefined) {
      setInternalExpanded(next);
    }
    props.onExpandedChange?.(next);
  };
  const { inputFocused, liftOffset } = useComposerKeyboard(bubbleRef, props.keyboardKey, {
    onBeforeGuardedFocus: () => setExpanded(true),
  });

  useEffect(() => {
    if (props.expanded === undefined) {
      setInternalExpanded(false);
    }
  }, [props.keyboardKey, props.expanded]);

  useEffect(() => {
    if (props.focusOnExpand && expanded && !wasExpandedRef.current) {
      focusComposerInputFromNeutralTarget(bubbleRef.current);
    }
    wasExpandedRef.current = expanded;
  }, [expanded, props.focusOnExpand]);

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
    setExpanded(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  const expandAndFocus = () => {
    lockComposeScroll(bubbleRef.current);
    setExpanded(true);
    focusComposerInputFromNeutralTarget(bubbleRef.current);
    lockComposeScroll(bubbleRef.current);
  };

  const handleFocusCapture = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && !expanded) {
      setExpanded(true);
    }
  };

  return (
    <>
      {expanded ? (
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
