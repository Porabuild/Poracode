import { AlertDialog } from "@heroui/react";
import { Button } from "../common/Button";

export function ForceDeleteBranchDialog(props: {
  isOpen: boolean;
  branch: string;
  errorMessage: string;
  onClose: () => void;
  onKeepBranch: () => void;
  onForceDelete: () => void;
}) {
  return (
    <AlertDialog.Backdrop isOpen={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>Branch not fully merged</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p>
              Branch <strong>{props.branch}</strong> has unmerged changes:
            </p>
            <p className="mt-1 text-sm text-muted">{props.errorMessage}</p>
            <p className="mt-2">Force delete? Unmerged changes will be lost.</p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={props.onKeepBranch}>
              Keep Branch
            </Button>
            <Button variant="danger" onPress={props.onForceDelete}>
              Force Delete
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
