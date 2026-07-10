import { Trans, useLingui } from "@lingui/react/macro";
import { ConfirmDialog } from "@/renderer/components/common/ConfirmDialog";

export function ForceDeleteBranchDialog(props: {
  isOpen: boolean;
  branch: string;
  errorMessage: string;
  onClose: () => void;
  onForceDelete: () => void;
}) {
  const { t } = useLingui();
  return (
    <ConfirmDialog
      isOpen={props.isOpen}
      title={t`Branch not fully merged`}
      body={
        <>
          <p>
            <Trans>
              Branch <strong>{props.branch}</strong> has unmerged changes:
            </Trans>
          </p>
          <p className="mt-1 text-sm text-muted">{props.errorMessage}</p>
          <p className="mt-2">
            <Trans>Force delete? Unmerged changes will be lost.</Trans>
          </p>
        </>
      }
      cancelLabel={t`Keep Branch`}
      confirmLabel={t`Force Delete`}
      onConfirm={props.onForceDelete}
      onClose={props.onClose}
    />
  );
}
