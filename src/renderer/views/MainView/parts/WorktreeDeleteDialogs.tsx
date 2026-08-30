import { DeleteThreadPopover } from "@/renderer/views/MainView/parts/Sidebar/parts/DeleteThreadPopover";
import { ForceDeleteBranchDialog } from "@/renderer/views/MainView/parts/Sidebar/parts/ForceDeleteBranchDialog";

import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";

import { deleteThread } from "@/renderer/actions/threadActions";
import { forceDeleteBranch } from "@/renderer/actions/worktreeActions";

export type { WorktreeDeleteDialogState } from "@/renderer/state/worktreeDeleteStore";

export function WorktreeDeleteDialogs() {
  const worktreeDeleteDialog = useWorktreeDeleteStore((s) => s.dialog);
  const closeDialog = useWorktreeDeleteStore((s) => s.closeDialog);

  return (
    <>
      {worktreeDeleteDialog?.kind === "single-thread" && (
        <DeleteThreadPopover
          isOpen
          anchorPosition={worktreeDeleteDialog.anchorPosition}
          {...(worktreeDeleteDialog.worktreeBranch
            ? { worktreeBranch: worktreeDeleteDialog.worktreeBranch }
            : {})}
          {...(worktreeDeleteDialog.returnFocusElement
            ? { returnFocusElement: worktreeDeleteDialog.returnFocusElement }
            : {})}
          onClose={closeDialog}
          onDelete={() => {
            // Re-resolved against the live store: `deleteThread` keeps the
            // worktree if a sibling thread appeared while this was open.
            deleteThread(
              worktreeDeleteDialog.threadId,
              worktreeDeleteDialog.worktreePath,
              worktreeDeleteDialog.projectId,
            );
            closeDialog();
          }}
        />
      )}
      {worktreeDeleteDialog?.kind === "branch-unmerged" && (
        <ForceDeleteBranchDialog
          isOpen
          branch={worktreeDeleteDialog.worktreeBranch}
          errorMessage={worktreeDeleteDialog.error}
          onClose={closeDialog}
          onForceDelete={() => {
            void forceDeleteBranch(
              worktreeDeleteDialog.projectId,
              worktreeDeleteDialog.worktreeBranch,
            ).then((deleted) => {
              if (deleted) closeDialog();
            });
          }}
        />
      )}
    </>
  );
}
