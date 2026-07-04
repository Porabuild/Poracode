import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { isRemoteSession } from "@/renderer/bridge";

/** The placement union HeroUI's popover accepts, derived from the component. */
type Placement = ComponentProps<typeof Popover.Content>["placement"];

/**
 * How long the drawer's slide-out runs before it unmounts. Must match the
 * `m-sheet-out` / `m-sheet-backdrop-out` animation duration in
 * `src/mobile/styles.css` (and mirrors `SHEET_EXIT_MS` in the mobile shell's
 * own `useSheet`). The timer — not `animationend` — drives the unmount so it
 * still fires under reduced motion, where the animation is disabled.
 */
const SHEET_EXIT_MS = 200;

/**
 * A composer/menu popover on desktop that becomes a bottom drawer in the mobile
 * PWA. Popovers anchored to a tiny toolbar trigger are cramped and fiddly to tap
 * on a phone; a full-width bottom sheet gives roomy targets and matches the rest
 * of the mobile shell.
 *
 * The sheet reuses the shell's `.m-sheet*` styles from `src/mobile/styles.css`.
 * Those only ship in the PWA bundle, but this branch only renders when
 * {@link isRemoteSession} is true (i.e. the PWA), so the classes are always
 * present where they're used.
 *
 * The menu owns its own open state (so it keeps working identically on desktop);
 * it must wire its trigger button to call `onOpenChange(true)` on press when
 * {@link useResponsiveMenu} reports `mobile`, since the sheet path doesn't use
 * HeroUI's `Popover.Trigger` press handling.
 */
export function ResponsiveMenuSurface(props: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Trigger button. On desktop it is wrapped by `Popover.Trigger`. */
  readonly trigger: ReactNode;
  /** Menu body, rendered inside the popover dialog or the drawer. */
  readonly children: ReactNode;
  /** Accessible name + heading for the drawer (mobile only). */
  readonly label: string;
  /** Desktop popover placement. */
  readonly placement?: Placement;
  /** Desktop `Popover.Content` className. */
  readonly contentClassName?: string;
  /** Desktop `Popover.Dialog` className. */
  readonly dialogClassName?: string;
  /** Applied to `Popover.Trigger` (desktop) / the trigger wrapper (mobile). */
  readonly triggerClassName?: string;
}) {
  const { t } = useLingui();
  const mobile = isRemoteSession();

  // Keep the drawer mounted through its slide-out. `rendered` stays true for
  // SHEET_EXIT_MS after `isOpen` goes false; `closing` toggles `data-closing`
  // so the CSS exit keyframes run before React unmounts the portal (without
  // this, closing the drawer unmounts it synchronously and no animation plays).
  const [rendered, setRendered] = useState(props.isOpen);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!mobile) return;
    if (props.isOpen) {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setClosing(false);
      setRendered(true);
    } else if (rendered && !exitTimer.current) {
      setClosing(true);
      exitTimer.current = setTimeout(() => {
        exitTimer.current = null;
        setClosing(false);
        setRendered(false);
      }, SHEET_EXIT_MS);
    }
    return () => {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
    };
  }, [mobile, props.isOpen, rendered]);

  // Close the drawer on Escape (mobile path only; HeroUI handles it on desktop).
  useEffect(() => {
    if (!mobile || !props.isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobile, props.isOpen, props]);

  if (!mobile) {
    return (
      <Popover isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
        <Popover.Trigger {...(props.triggerClassName ? { className: props.triggerClassName } : {})}>
          {props.trigger}
        </Popover.Trigger>
        {props.isOpen ? (
          <Popover.Content
            placement={props.placement ?? "top start"}
            {...(props.contentClassName ? { className: props.contentClassName } : {})}
          >
            <Popover.Dialog
              {...(props.dialogClassName ? { className: props.dialogClassName } : {})}
            >
              {props.children}
            </Popover.Dialog>
          </Popover.Content>
        ) : null}
      </Popover>
    );
  }

  return (
    <>
      {props.triggerClassName ? (
        <div className={props.triggerClassName}>{props.trigger}</div>
      ) : (
        props.trigger
      )}
      {rendered
        ? // Portal to <body>: the composer animates with CSS transforms, which
          // would otherwise become the containing block for the sheet's
          // `position: fixed` and break its full-screen backdrop.
          createPortal(
            <div className="m-sheet-backdrop" data-closing={closing || undefined}>
              <button
                type="button"
                className="m-sheet-scrim"
                aria-label={t`Close`}
                onClick={() => props.onOpenChange(false)}
              />
              <div className="m-sheet" role="dialog" aria-label={props.label}>
                <div className="m-sheet-head">
                  <span className="truncate">{props.label}</span>
                  <button
                    type="button"
                    className="m-sheet-close"
                    aria-label={t`Close`}
                    onClick={() => props.onOpenChange(false)}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Whether composer menus should render as a mobile drawer instead of a popover. */
export function useResponsiveMenu(): { readonly mobile: boolean } {
  return { mobile: isRemoteSession() };
}
