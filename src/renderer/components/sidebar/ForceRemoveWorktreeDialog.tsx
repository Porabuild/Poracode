import { AlertDialog } from "@heroui/react";
import { Button } from "../common/Button";

export function ForceRemoveWorktreeDialog(props: {
  isOpen: boolean;
  worktreeBranch: string;
  errorMessage: string;
  onClose: () => void;
  onForceRemove: () => void;
}) {
  return (
    <AlertDialog.Backdrop isOpen={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>Worktree removal failed</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p>
              Could not remove worktree <strong>{props.worktreeBranch}</strong>:
            </p>
            <p className="mt-1 text-sm text-muted">{props.errorMessage}</p>
            <p className="mt-2">Force remove? This cannot be undone.</p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="tertiary">
              Cancel
            </Button>
            <Button variant="danger" onPress={props.onForceRemove}>
              Force Remove
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
