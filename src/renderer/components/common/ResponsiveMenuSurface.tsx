import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Modal, Popover, useMediaQuery } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { isRemoteSession } from "@/renderer/bridge";
import { SheetGrabber, useSheetGrabber } from "@/renderer/components/common/useSheetGrabber";
import { lockMobileSheetViewport } from "./mobileSheetViewportLock";

/** The placement union HeroUI's popover accepts, derived from the component. */
type Placement = ComponentProps<typeof Popover.Content>["placement"];

/**
 * How long the drawer's slide-out runs before it unmounts. Must match the
 * `m-sheet-out` / `m-sheet-backdrop-out` animation duration in
 * `src/renderer/styles.css`. The timer — not `animationend` — drives the unmount so it
 * still fires under reduced motion, where the animation is disabled.
 */
const SHEET_EXIT_MS = 200;
const DESKTOP_POINTER_QUERY = "(min-width: 768px) and (hover: hover) and (pointer: fine)";

function useCompactMenuSurface(): boolean {
  const compact = useCompactLayout();
  const desktopPointer = useMediaQuery(DESKTOP_POINTER_QUERY);
  return compact || (isRemoteSession() && !desktopPointer);
}

/**
 * A composer/menu popover with a bottom-drawer presentation for coarse input.
 * Popovers anchored to a tiny toolbar trigger are cramped and fiddly to tap
 * on a phone; a full-width bottom sheet gives roomy targets and matches the rest
 * of the mobile shell.
 *
 * The sheet reuses the canonical renderer's `.m-sheet*` styles.
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
  readonly children: ReactNode | ((state: { readonly expanded: boolean }) => ReactNode);
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
  const mobile = useCompactMenuSurface();

  // Keep the drawer mounted through its slide-out. `rendered` stays true for
  // SHEET_EXIT_MS after `isOpen` goes false; `closing` toggles `data-closing`
  // so the CSS exit keyframes run before React unmounts the portal (without
  // this, closing the drawer unmounts it synchronously and no animation plays).
  const [rendered, setRendered] = useState(props.isOpen);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const { sheetRef, expanded, dragging, grabberHandlers } = useSheetGrabber({
    expandable: true,
    closing,
    onClose: () => props.onOpenChange(false),
    resetOnOpen: mobile && props.isOpen,
  });
  const body =
    typeof props.children === "function"
      ? props.children({ expanded: mobile ? expanded : false })
      : props.children;
  const mobilePortalTarget = mobile
    ? (document.querySelector<HTMLElement>(".poracode-shell") ??
      document.querySelector<HTMLElement>(".m-shell") ??
      document.body)
    : null;

  useEffect(() => {
    if (!mobile) return;
    if (props.isOpen) {
      if (!rendered) {
        openerRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
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

  useEffect(() => {
    if (rendered || !mobile) return;
    const opener = openerRef.current;
    openerRef.current = null;
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  }, [mobile, rendered]);

  // iOS can pan the layout document when an input inside a fixed sheet gains
  // focus. Blur before the sheet disappears, then keep restoring the opening
  // offset while the keyboard's delayed dismissal geometry settles.
  useEffect(() => {
    if (!mobile || !props.isOpen) return;
    const unlockViewport = lockMobileSheetViewport();
    return () => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.closest(".m-sheet-backdrop")) {
        activeElement.blur();
      }
      unlockViewport();
    };
  }, [mobile, props.isOpen]);

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
              {body}
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
      {rendered && mobilePortalTarget ? (
        // Portal to the top-level mobile shell, outside the transformed
        // composer. Keeping the sheet in the page compositor preserves
        // Safari's transparent floating toolbar; tests/non-shell consumers
        // fall back to <body> above.
        <Modal.Backdrop
          isOpen={rendered}
          className="m-sheet-backdrop"
          data-closing={closing || undefined}
          UNSTABLE_portalContainer={mobilePortalTarget}
          onOpenChange={(open) => {
            if (!open) props.onOpenChange(false);
          }}
        >
          <Modal.Container className="contents">
            <Modal.Dialog className="contents" aria-label={props.label}>
              <div
                ref={sheetRef}
                className="m-sheet"
                data-expanded={expanded || undefined}
                data-dragging={dragging || undefined}
              >
                <Modal.CloseTrigger aria-label={t`Close`} className="sr-only" />
                <SheetGrabber handlers={grabberHandlers} />
                <div className="m-sheet-head">
                  <span className="truncate">{props.label}</span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">{body}</div>
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
    </>
  );
}

/** Whether composer menus should render as a compact drawer instead of a popover. */
export function useResponsiveMenu(): { readonly mobile: boolean } {
  return { mobile: useCompactMenuSurface() };
}
