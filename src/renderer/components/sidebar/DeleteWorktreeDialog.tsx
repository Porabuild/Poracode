import { useState } from "react";
import { AlertDialog, Checkbox } from "@heroui/react";
import { Button } from "../common/Button";

const PREF_KEY = "lightcode-delete-worktree-pref";

export type WorktreeDeletePref = "thread-only" | "thread-and-worktree";

export function readWorktreeDeletePref(): WorktreeDeletePref | null {
  const raw = localStorage.getItem(PREF_KEY);
  if (raw === "thread-only" || raw === "thread-and-worktree") return raw;
  return null;
}

export function DeleteWorktreeDialog(props: {
  isOpen: boolean;
  worktreeBranch: string;
  onClose: () => void;
  onDeleteThreadOnly: (dontAskAgain: boolean) => void;
  onDeleteThreadAndWorktree: (dontAskAgain: boolean) => void;
}) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  function handleThreadOnly() {
    if (dontAskAgain) localStorage.setItem(PREF_KEY, "thread-only");
    props.onDeleteThreadOnly(dontAskAgain);
  }

  function handleThreadAndWorktree() {
    if (dontAskAgain) localStorage.setItem(PREF_KEY, "thread-and-worktree");
    props.onDeleteThreadAndWorktree(dontAskAgain);
  }

  return (
    <AlertDialog.Backdrop isOpen={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>Delete thread?</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p>
              This thread uses worktree <strong>{props.worktreeBranch}</strong>. Also remove the
              worktree directory?
            </p>
            <div className="mt-3">
              <Checkbox isSelected={dontAskAgain} onChange={setDontAskAgain}>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                Don&apos;t ask again
              </Checkbox>
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="tertiary">
              Cancel
            </Button>
            <Button variant="secondary" onPress={handleThreadOnly}>
              Thread Only
            </Button>
            <Button variant="danger" onPress={handleThreadAndWorktree}>
              Thread + Worktree
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
