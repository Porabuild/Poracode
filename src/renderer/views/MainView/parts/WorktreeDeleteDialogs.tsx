import { readBridge } from "@/renderer/bridge";
import { DeleteWorktreeDialog } from "@/renderer/views/MainView/parts/Sidebar/parts/DeleteWorktreeDialog";
import { ForceDeleteBranchDialog } from "@/renderer/views/MainView/parts/Sidebar/parts/ForceDeleteBranchDialog";

import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";

import { deleteThread } from "@/renderer/actions/threadActions";
import { deleteWorktreeGroup } from "@/renderer/actions/worktreeActions";

export type { WorktreeDeleteDialogState } from "@/renderer/state/worktreeDeleteStore";

export function WorktreeDeleteDialogs() {
  const worktreeDeleteDialog = useWorktreeDeleteStore((s) => s.dialog);
  const closeDialog = useWorktreeDeleteStore((s) => s.closeDialog);

  return (
    <>
      {worktreeDeleteDialog?.kind === "single-thread" && (
        <DeleteWorktreeDialog
          isOpen
          worktreeBranch={worktreeDeleteDialog.worktreeBranch}
          onClose={closeDialog}
          onDeleteThreadOnly={() => {
            deleteThread(worktreeDeleteDialog.threadId);
            closeDialog();
          }}
          onDeleteThreadAndWorktree={() => {
            // Delete this thread + all siblings sharing the worktree
            const siblings = useAppStore
              .getState()
              .threads.filter(
                (t) =>
                  t.worktreePath === worktreeDeleteDialog.worktreePath &&
                  t.id !== worktreeDeleteDialog.threadId,
              );
            deleteWorktreeGroup(worktreeDeleteDialog.projectId, worktreeDeleteDialog.worktreePath, [
              worktreeDeleteDialog.threadId,
              ...siblings.map((thread) => thread.id),
            ]);
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
            const project = useAppStore
              .getState()
              .projects.find((p) => p.id === worktreeDeleteDialog.projectId);
            if (project) {
              void readBridge()
                .gitDeleteBranch({
                  projectLocation: project.location,
                  branch: worktreeDeleteDialog.worktreeBranch,
                  force: true,
                })
                .then(() => {
                  void readBridge()
                    .gitListBranches({
                      projectLocation: project.location,
                      includeRemote: true,
                    })
                    .then((branches) => useGitStore.getState().setBranches(project.id, branches))
                    .catch(() => undefined);
                })
                .catch(() => undefined);
            }
            closeDialog();
          }}
        />
      )}
    </>
  );
}
