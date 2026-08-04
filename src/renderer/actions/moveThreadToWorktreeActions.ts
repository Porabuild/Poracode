import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { friendlyError } from "@/shared/messages";
import { generateWorktreeBranch } from "@/shared/worktreeBranch";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { reopenStoredThread, unloadStoredThread } from "./threadActions";
import {
  createWorktree,
  primeWorktreeGitState,
  runWorktreeSetupScript,
} from "./worktreeLaunchActions";

const movingThreadIds = new Set<string>();

/**
 * Move a main-checkout thread into a fresh git worktree on a new branch.
 * Active threads are relaunched there. `withChanges` MOVES the project's
 * uncommitted changes into the worktree, leaving the current branch clean.
 * Failures are toasted here.
 */
export async function moveThreadToWorktree(threadId: string, withChanges: boolean): Promise<void> {
  if (movingThreadIds.has(threadId)) return;
  const store = useAppStore.getState();
  const thread = store.threads.find((item) => item.id === threadId);
  if (!thread || thread.worktreePath) return;
  const project = store.projects.find((item) => item.id === thread.projectId);
  if (!project) return;

  if (thread.status === "launching") {
    toast.info(i18n._(msg`Wait for the thread to finish starting before moving it to a worktree.`));
    return;
  }

  movingThreadIds.add(threadId);
  try {
    // Re-tagging only sticks for a stopped thread — unload any live runtime first.
    if (thread.status !== "inactive") {
      await unloadStoredThread(threadId);
    }
    const currentBranch = useGitStore.getState().statuses[project.id]?.branch;
    const branch = generateWorktreeBranch();
    const result = await createWorktree(project, {
      branch,
      ...(currentBranch ? { startPoint: currentBranch } : {}),
      createBranch: true,
      transferUncommitted: withChanges,
      keepChangesInSource: false,
    });
    useAppStore.getState().setThreadWorktree(threadId, result.path, branch);
    if (thread.status !== "inactive") reopenStoredThread(threadId);
    void primeWorktreeGitState(project, result.path);
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
    const setupScript = project.scripts?.setupScript;
    if (setupScript) {
      void runWorktreeSetupScript(project, result.path, setupScript);
    }

    if (withChanges) {
      // `newBranch` keeps the msgid identical to the BranchSelector conflict
      // toast so its translations are reused.
      const newBranch = branch;
      if (result.changesTransferred === false) {
        toast.danger(
          i18n._(
            msg`Created a worktree on "${newBranch}", but the changes conflicted and remain in a git stash — resolve them in the worktree.`,
          ),
        );
      } else if (currentBranch) {
        toast.success(
          i18n._(
            msg`Moved the thread and your changes to a new worktree on "${newBranch}". "${currentBranch}" is now clean.`,
          ),
        );
      } else {
        toast.success(
          i18n._(msg`Moved the thread and your changes to a new worktree on "${newBranch}".`),
        );
      }
    } else {
      toast.success(i18n._(msg`Moved the thread to a new worktree on "${branch}".`));
    }
  } catch (error) {
    toast.danger(friendlyError(error));
  } finally {
    movingThreadIds.delete(threadId);
  }
}
