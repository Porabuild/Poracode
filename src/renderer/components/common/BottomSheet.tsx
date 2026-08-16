import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { SheetGrabber, useSheetGrabber } from "./useSheetGrabber";
import { lockMobileSheetViewport } from "./mobileSheetViewportLock";
import { useMobileSheetLayer } from "./mobileSheetStack";

/** Must match the shared sheet/backdrop exit keyframes in styles.css. */
export const BOTTOM_SHEET_EXIT_MS = 200;

export function BottomSheet(props: {
  readonly label: string;
  readonly closeLabel?: string;
  readonly fullScreen?: boolean;
  /**
   * Controlled visibility. Keep the component mounted and change this value so
   * feature-driven closes use the same exit animation as Escape, backdrop, and
   * drag dismissal.
   */
  readonly isOpen?: boolean;
  /** Supply only when the caller already owns the exit lifecycle. */
  readonly closing?: boolean;
  readonly resetOnOpen?: boolean;
  readonly sheetClassName?: string;
  readonly onClose: () => void;
  readonly children: ReactNode | ((state: { readonly expanded: boolean }) => ReactNode);
}) {
  const { t } = useLingui();
  const { onClose } = props;
  const controlled = props.isOpen !== undefined;
  const requestedOpen = props.isOpen ?? true;
  const [rendered, setRendered] = useState(requestedOpen);
  const [internalClosing, setInternalClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = Boolean(props.closing || internalClosing);
  const layer = useMobileSheetLayer(rendered);
  const openerRef = useRef<HTMLElement | null>(null);

  const finishClose = () => {
    exitTimer.current = null;
    setInternalClosing(false);
    setRendered(false);
  };

  const requestClose = () => {
    if (closing || exitTimer.current) return;

    if (controlled || props.closing !== undefined) {
      onClose();
      return;
    }

    // Legacy conditionally-mounted callers cannot remain in the tree after
    // onClose runs. Defer that notification until the shared exit motion has
    // finished so they still dismiss smoothly.
    setInternalClosing(true);
    exitTimer.current = setTimeout(() => {
      finishClose();
      onClose();
    }, BOTTOM_SHEET_EXIT_MS);
  };

  const { sheetRef, expanded, dragging, grabberHandlers } = useSheetGrabber({
    expandable: !props.fullScreen,
    closing,
    onClose: requestClose,
    resetOnOpen: props.resetOnOpen ?? requestedOpen,
  });
  const body = typeof props.children === "function" ? props.children({ expanded }) : props.children;

  useEffect(() => {
    if (!controlled) return;

    if (requestedOpen) {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setInternalClosing(false);
      setRendered(true);
      return;
    }

    if (!rendered || exitTimer.current) return;
    setInternalClosing(true);
    exitTimer.current = setTimeout(finishClose, BOTTOM_SHEET_EXIT_MS);
  }, [controlled, rendered, requestedOpen]);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!rendered) return;
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockViewport = lockMobileSheetViewport();
    return () => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.closest(".m-sheet-backdrop")) {
        activeElement.blur();
      }
      unlockViewport();
      const opener = openerRef.current;
      requestAnimationFrame(() => {
        // A closing action may intentionally hand focus to a newly mounted
        // control (for example, the compact thread-title rename input). Do not
        // steal that focus back to the sheet trigger.
        const currentActiveElement = document.activeElement;
        if (currentActiveElement instanceof HTMLElement && currentActiveElement !== document.body) {
          return;
        }
        if (!opener?.isConnected) return;
        const style = window.getComputedStyle(opener);
        if (style.display === "none" || style.visibility === "hidden") return;
        opener.focus();
      });
    };
  }, [rendered]);

  if (!rendered) return null;

  return (
    <Modal.Backdrop
      isOpen
      className="m-sheet-backdrop"
      data-closing={closing || undefined}
      data-covered={layer.covered || undefined}
      data-nested={layer.nested || undefined}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <Modal.Container className="contents">
        <Modal.Dialog className="contents" aria-label={props.label}>
          <div
            ref={sheetRef}
            className={`m-sheet${props.sheetClassName ? ` ${props.sheetClassName}` : ""}`}
            data-expanded={expanded || undefined}
            data-full-screen={props.fullScreen || undefined}
            data-dragging={dragging || undefined}
          >
            <Modal.CloseTrigger aria-label={props.closeLabel ?? t`Close`} className="sr-only" />
            <SheetGrabber handlers={grabberHandlers} />
            {body}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
