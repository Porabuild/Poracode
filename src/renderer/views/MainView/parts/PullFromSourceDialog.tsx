import { useState } from "react";
import { AlertDialog, toast } from "@heroui/react";
import { buildWorktreeLocation } from "@/shared/worktree";
import { friendlyError, msg } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { openGitReviewForWorktree } from "@/renderer/actions/gitActions";
import { Button } from "@/renderer/components/common/Button";
import { useAppStore } from "@/renderer/state/appStore";
import { usePullFromSourceDialogStore } from "@/renderer/state/pullFromSourceDialogStore";

export function PullFromSourceDialog() {
  const dialog = usePullFromSourceDialogStore((s) => s.dialog);
  const closeDialog = usePullFromSourceDialogStore((s) => s.closeDialog);
  const project = useAppStore((s) => s.projects.find((p) => p.id === dialog?.projectId));
  const [isPulling, setIsPulling] = useState(false);

  if (!dialog || !project) return null;

  const activeDialog = dialog;
  const activeProject = project;

  function handleClose() {
    closeDialog();
  }

  async function handleStashPullReapply() {
    setIsPulling(true);
    try {
      const stashPreservedMessage = msg("git.pull.stashPreserved");
      const result = await readBridge().gitPullFromSource({
        worktreeLocation: buildWorktreeLocation(activeProject.location, activeDialog.worktreePath),
        sourceBranch: activeDialog.sourceBranch,
        preserveLocalChanges: true,
      });
      closeDialog();
      if (result.conflicting) {
        const detail = result.conflictFiles?.length
          ? `\nConflicts:\n${result.conflictFiles.join("\n")}`
          : "";
        const stashNote = result.stashPreserved ? `\n${stashPreservedMessage}` : "";
        toast.danger((result.error ?? msg("git.merge.conflicts")) + detail + stashNote);
        openGitReviewForWorktree(activeDialog.projectId, activeDialog.worktreePath);
        activeDialog.onComplete?.();
        return;
      }
      if (!result.merged) {
        const fallback = msg("git.pull.failed", { detail: msg("git.merge.failed") });
        const message = result.error ?? fallback;
        const stashNote =
          result.stashPreserved && !message.includes(stashPreservedMessage)
            ? `\n${stashPreservedMessage}`
            : "";
        toast.danger(message + stashNote);
        return;
      }
      activeDialog.onComplete?.();
    } catch (error) {
      console.error("[git] stash pull from source failed", error);
      toast.danger(friendlyError(error));
    } finally {
      setIsPulling(false);
    }
  }

  const dialogContent = (
    <>
      <AlertDialog.Header className="gap-1">
        <AlertDialog.Heading>Pull from {activeDialog.sourceBranch}?</AlertDialog.Heading>
        <p className="text-sm leading-5 text-muted">
          This worktree has local changes. Lightcode can temporarily stash them, pull from{" "}
          {activeDialog.sourceBranch}, then re-apply your changes.
        </p>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <Button slot="close" variant="ghost" className="text-muted" isDisabled={isPulling}>
          Cancel
        </Button>
        <Button variant="tertiary" onPress={handleStashPullReapply} isPending={isPulling}>
          Stash & Pull
        </Button>
      </AlertDialog.Footer>
    </>
  );

  return (
    <AlertDialog.Backdrop isOpen onOpenChange={(open) => !open && handleClose()}>
      <AlertDialog.Container size="sm">
        <AlertDialog.Dialog className="sm:max-w-[420px] !p-4">{dialogContent}</AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
