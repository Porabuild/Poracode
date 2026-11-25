import { useLayoutEffect, useState } from "react";
import { Button, Checkbox } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { BottomSheet, BOTTOM_SHEET_EXIT_MS } from "@/renderer/components/common/BottomSheet";
import { ConfirmationPopover } from "@/renderer/components/common/ConfirmationPopover";
import { useResponsiveMenu } from "@/renderer/components/common/ResponsiveMenuSurface";
import { setConfirmThreadDelete } from "@/renderer/state/threadDeletePreference";

/** Extra time after a sheet's exit before a waiting sheet mounts anyway. */
const SHEET_HANDOFF_MARGIN_MS = 30;
/** Touch height, also where the compact `--m-tap-min` variable is undefined. */
const TAP_MIN_CLASS = "min-h-[var(--m-tap-min,2.75rem)]";

function DontAskAgainCheckbox(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Stretch the tappable label row to full width and touch height. */
  fullWidth?: boolean;
}) {
  return (
    <Checkbox
      isSelected={props.checked}
      onChange={props.onChange}
      {...(props.fullWidth ? { className: "w-full" } : {})}
    >
      <Checkbox.Content {...(props.fullWidth ? { className: `${TAP_MIN_CLASS} w-full` } : {})}>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Trans>Don&apos;t ask again</Trans>
      </Checkbox.Content>
    </Checkbox>
  );
}

/** Another compact sheet that is still on screen playing its exit animation. */
function isAnotherSheetClosing(): boolean {
  return document.querySelector(".m-sheet-backdrop[data-closing]") !== null;
}

/**
 * Holds back a sheet that was launched from a closing sheet until that exit
 * has played. Mounted on top of it, the new sheet counts as nested: its
 * backdrop stays transparent while the old one fades, and that invisible
 * backdrop already takes taps, so one dismisses a confirmation the user has
 * not seen yet. The wait is bounded, so a sheet that never leaves cannot
 * hold this one back.
 */
function useSheetHandoffReady(mobile: boolean): boolean {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    if (!mobile) return;
    if (!isAnotherSheetClosing()) {
      // eslint-disable-next-line react/set-state-in-effect -- sheet exit state is only readable after commit.
      setReady(true);
      return;
    }
    const timer = window.setTimeout(
      () => setReady(true),
      BOTTOM_SHEET_EXIT_MS + SHEET_HANDOFF_MARGIN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [mobile]);
  return ready;
}

/**
 * Asks before a thread is deleted. Desktop and wide layouts get a popover
 * anchored at the pointer or delete control. Compact and coarse-pointer
 * surfaces, where the thread menu is a bottom drawer, get the same
 * confirmation as a bottom drawer: a touch menu has nothing to anchor a
 * popover to, and the anchored one landed in the top-left corner.
 */
export function DeleteThreadPopover(props: {
  isOpen: boolean;
  /** Where the anchored popover points. Unused on compact surfaces. */
  anchorPosition: { x: number; y: number };
  /** Set only when confirming also removes the worktree directory. */
  worktreeBranch?: string;
  returnFocusElement?: HTMLElement;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const sheetReady = useSheetHandoffReady(mobile);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const title = t`Delete thread?`;
  const cancelLabel = t`Cancel`;
  const deleteLabel = t`Delete`;

  function handleDelete() {
    if (dontAskAgain) setConfirmThreadDelete(false);
    props.onDelete();
  }

  const body = props.worktreeBranch ? (
    <Trans>
      This will permanently delete the thread and remove worktree{" "}
      <strong className="font-medium text-foreground">{props.worktreeBranch}</strong>.
    </Trans>
  ) : (
    <Trans>This will permanently delete the thread.</Trans>
  );

  if (mobile) {
    if (!props.isOpen || !sheetReady) return null;
    const closeSheet = () => {
      props.onClose();
      if (props.returnFocusElement?.isConnected) {
        requestAnimationFrame(() => props.returnFocusElement?.focus({ preventScroll: true }));
      }
    };
    return (
      <BottomSheet label={title} onClose={closeSheet}>
        <div className="m-sheet-head">
          <span>{title}</span>
        </div>
        <div className="m-sheet-scroll">
          <p className="break-words px-2.5 pt-2 text-xs leading-5 text-muted">{body}</p>
          <div className="px-1.5">
            <DontAskAgainCheckbox checked={dontAskAgain} onChange={setDontAskAgain} fullWidth />
          </div>
          <div className="flex items-center justify-end gap-2 px-2.5 pb-1 pt-2">
            <Button
              size="sm"
              variant="ghost"
              className={`text-muted ${TAP_MIN_CLASS}`}
              onPress={closeSheet}
            >
              {cancelLabel}
            </Button>
            <Button size="sm" variant="danger" className={TAP_MIN_CLASS} onPress={handleDelete}>
              {deleteLabel}
            </Button>
          </div>
        </div>
      </BottomSheet>
    );
  }

  return (
    <ConfirmationPopover
      isOpen={props.isOpen}
      onOpenChange={(open) => !open && props.onClose()}
      anchorPosition={props.anchorPosition}
      className="w-80 max-w-[calc(100vw-16px)]"
      {...(props.returnFocusElement ? { returnFocusElement: props.returnFocusElement } : {})}
      title={title}
      body={body}
      actions={[
        {
          label: deleteLabel,
          variant: "danger",
          onPress: handleDelete,
        },
      ]}
    >
      <DontAskAgainCheckbox checked={dontAskAgain} onChange={setDontAskAgain} />
    </ConfirmationPopover>
  );
}
