import { memo } from "react";
import { AlertDialog, Checkbox, Tooltip } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { RotateCcw } from "lucide-react";
import { Button } from "@/renderer/components/common/Button";

/**
 * Revert affordance data handed to rows that can revert: the checkpoint item
 * and the shared request-revert entry point (opens the confirm dialog owned
 * by `MessageList`). Rows render their own `CheckpointRevertButton` from it;
 * the mobile PWA instead routes it through the long-press action sheet.
 */
export interface CheckpointRevertRequest {
  itemId: string;
  onRequestRevert: (itemId: string) => void;
}

export interface CheckpointGuard {
  scopeLabel: string;
  hasSharedTree: boolean;
  sharedThreadCount: number;
}

export const DEFAULT_CHECKPOINT_GUARD: CheckpointGuard = {
  scopeLabel: "this tree",
  hasSharedTree: false,
  sharedThreadCount: 0,
};

export function CheckpointRevertButton(props: {
  itemId: string;
  onRequestRevert: (itemId: string) => void;
}) {
  const { t } = useLingui();
  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger>
        <button
          type="button"
          aria-label={t`Revert to this checkpoint`}
          className="flex size-5 items-center justify-center rounded text-muted/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            props.onRequestRevert(props.itemId);
          }}
        >
          <RotateCcw className="size-3" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top">
        <Trans>Revert to this checkpoint</Trans>
      </Tooltip.Content>
    </Tooltip>
  );
}

// Memoized so it doesn't re-render with its (unconditionally mounted) parent on
// every frame of a panel resize while closed — its props are stable then, so
// `memo` skips the whole React-Aria overlay subtree. Kept mounted (not gated on
// `isOpen`) so HeroUI still plays the open/close transition.
export const RevertCheckpointDialog = memo(function RevertCheckpointDialog(props: {
  isOpen: boolean;
  dontAskAgain: boolean;
  checkpointGuard: CheckpointGuard;
  canRestoreFiles: boolean;
  errorMessage?: string | undefined;
  onDontAskAgainChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Backdrop isOpen={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <AlertDialog.Container size="sm">
        <AlertDialog.Dialog className="sm:max-w-[420px] !p-4">
          <AlertDialog.Header className="gap-1">
            <AlertDialog.Heading>
              <Trans>Revert to checkpoint?</Trans>
            </AlertDialog.Heading>
            <p className="text-sm leading-5 text-muted">
              <Trans>
                This removes later messages and restores files when a checkpoint snapshot is
                available.
              </Trans>
            </p>
          </AlertDialog.Header>
          <AlertDialog.Body>
            {!props.canRestoreFiles ? (
              <div className="rounded-lg border border-border bg-surface-container/70 px-2.5 py-2 text-xs leading-5 text-muted">
                <Trans>No file checkpoint is stored for this message.</Trans>
              </div>
            ) : null}
            {props.checkpointGuard.hasSharedTree ? (
              <div className="mt-2 rounded-lg border border-warning-soft-foreground/20 bg-warning-soft/60 px-2.5 py-2 text-xs leading-5 text-warning-soft-foreground">
                {props.checkpointGuard.sharedThreadCount === 1 ? (
                  <Trans>
                    Another chat uses this same tree. File restore could overwrite that chat&apos;s
                    changes.
                  </Trans>
                ) : (
                  <Plural
                    value={props.checkpointGuard.sharedThreadCount}
                    other="# other chats use this same tree. File restore could overwrite their changes."
                  />
                )}
              </div>
            ) : null}
            {props.errorMessage ? (
              <div className="mt-2 rounded-lg border border-danger-soft-foreground/20 bg-danger-soft/60 px-2.5 py-2 text-xs leading-5 text-danger-soft-foreground">
                {props.errorMessage}
              </div>
            ) : null}
            <div className="mt-2">
              <Checkbox isSelected={props.dontAskAgain} onChange={props.onDontAskAgainChange}>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Trans>Don&apos;t ask again</Trans>
              </Checkbox>
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              <Trans>Cancel</Trans>
            </Button>
            <Button variant="tertiary" onPress={props.onConfirm}>
              <RotateCcw className="size-3.5" />
              <Trans>Revert</Trans>
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
});
