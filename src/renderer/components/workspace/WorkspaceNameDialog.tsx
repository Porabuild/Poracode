import { useState } from "react";
import { Input, Label, Modal, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";

/**
 * Single-field dialog for naming a workspace, shared by "Add workspace" in the
 * sidebar switcher and "Rename" in the Workspaces settings section.
 */
export function WorkspaceNameDialog(props: {
  isOpen: boolean;
  mode: "create" | "rename";
  initialName?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { isOpen, mode, initialName = "", onSubmit, onClose } = props;
  const [name, setName] = useState(initialName);

  // Reset on each open so a cancelled edit doesn't leak into the next one.
  // A new initial name while open also resets, matching the previous effect.
  const [prevDialogKey, setPrevDialogKey] = useState({ open: isOpen, initial: initialName });
  if (prevDialogKey.open !== isOpen || prevDialogKey.initial !== initialName) {
    setPrevDialogKey({ open: isOpen, initial: initialName });
    if (isOpen) setName(initialName);
  }

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  function submit() {
    if (!canSubmit) return;
    onSubmit(trimmed);
    onClose();
  }

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[420px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              {mode === "create" ? <Trans>New workspace</Trans> : <Trans>Rename workspace</Trans>}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-5 pb-5 pt-2">
            <TextField
              value={name}
              onChange={setName}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            >
              <Label>
                <Trans>Name</Trans>
              </Label>
              <Input placeholder={t`Work`} />
            </TextField>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              <Trans>Cancel</Trans>
            </Button>
            <Button variant="primary" isDisabled={!canSubmit} onPress={submit}>
              {mode === "create" ? <Trans>Create</Trans> : <Trans>Save</Trans>}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
