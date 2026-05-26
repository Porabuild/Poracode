import { AlertDialog, Checkbox, Tooltip } from "@heroui/react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/renderer/components/common/Button";

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
  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger>
        <button
          type="button"
          aria-label="Revert to this checkpoint"
          className="flex size-5 items-center justify-center rounded text-muted/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            props.onRequestRevert(props.itemId);
          }}
        >
          <RotateCcw className="size-3" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top">Revert to this checkpoint</Tooltip.Content>
    </Tooltip>
  );
}

export function RevertCheckpointDialog(props: {
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
            <AlertDialog.Heading>Revert to checkpoint?</AlertDialog.Heading>
            <p className="text-sm leading-5 text-muted">
              This removes later messages and restores files when a checkpoint snapshot is
              available.
            </p>
          </AlertDialog.Header>
          <AlertDialog.Body>
            {!props.canRestoreFiles ? (
              <div className="rounded-lg border border-border bg-surface-container/70 px-2.5 py-2 text-xs leading-5 text-muted">
                No file checkpoint is stored for this message.
              </div>
            ) : null}
            {props.checkpointGuard.hasSharedTree ? (
              <div className="mt-2 rounded-lg border border-warning-soft-foreground/20 bg-warning-soft/60 px-2.5 py-2 text-xs leading-5 text-warning-soft-foreground">
                {props.checkpointGuard.sharedThreadCount === 1
                  ? "Another chat uses this same tree. File restore could overwrite that chat's changes."
                  : `${props.checkpointGuard.sharedThreadCount} other chats use this same tree. File restore could overwrite their changes.`}
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
                Don&apos;t ask again
              </Checkbox>
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              Cancel
            </Button>
            <Button variant="tertiary" onPress={props.onConfirm}>
              <RotateCcw className="size-3.5" />
              Revert
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
