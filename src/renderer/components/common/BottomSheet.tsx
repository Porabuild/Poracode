import { useEffect, useRef, type ReactNode } from "react";
import { Modal } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { SheetGrabber, useSheetGrabber } from "./useSheetGrabber";
import { lockMobileSheetViewport } from "./mobileSheetViewportLock";

export function BottomSheet(props: {
  readonly label: string;
  readonly closeLabel?: string;
  readonly fullScreen?: boolean;
  readonly closing?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const { t } = useLingui();
  const { onClose } = props;
  const openerRef = useRef<HTMLElement | null>(null);
  const { sheetRef, expanded, dragging, grabberHandlers } = useSheetGrabber({
    expandable: !props.fullScreen,
    closing: props.closing,
    onClose,
  });

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockViewport = lockMobileSheetViewport();
    return () => {
      unlockViewport();
      const opener = openerRef.current;
      requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, []);

  return (
    <Modal.Backdrop
      isOpen
      className="m-sheet-backdrop"
      data-closing={props.closing || undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container className="contents">
        <Modal.Dialog className="contents" aria-label={props.label}>
          <div
            ref={sheetRef}
            className="m-sheet"
            data-expanded={expanded || undefined}
            data-full-screen={props.fullScreen || undefined}
            data-dragging={dragging || undefined}
          >
            <Modal.CloseTrigger aria-label={props.closeLabel ?? t`Close`} className="sr-only" />
            <SheetGrabber handlers={grabberHandlers} />
            {props.children}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
