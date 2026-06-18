import { useState } from "react";
import { AlertDialog, Checkbox } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";

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
      <AlertDialog.Container size="sm">
        <AlertDialog.Dialog className="sm:max-w-[420px] !p-4">
          <AlertDialog.Header className="gap-1">
            <AlertDialog.Heading>
              <Trans>Delete thread?</Trans>
            </AlertDialog.Heading>
            <p className="text-sm leading-5 text-muted">
              <Trans>
                This thread uses worktree{" "}
                <strong className="font-medium text-foreground">{props.worktreeBranch}</strong>.
                Also remove the worktree directory?
              </Trans>
            </p>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <Checkbox isSelected={dontAskAgain} onChange={setDontAskAgain}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Trans>Don&apos;t ask again</Trans>
            </Checkbox>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              <Trans comment="Dialog button: dismiss without deleting">Cancel</Trans>
            </Button>
            <Button variant="tertiary" className="text-warning" onPress={handleThreadOnly}>
              <Trans comment="Dialog button: delete the thread but keep the worktree directory">
                Thread Only
              </Trans>
            </Button>
            <Button variant="danger" onPress={handleThreadAndWorktree}>
              <Trans comment="Dialog button: delete the thread and remove its worktree directory">
                Thread + Worktree
              </Trans>
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
