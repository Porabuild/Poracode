import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { friendlyError } from "@/shared/messages";
import { generateWorktreeBranch } from "@/shared/worktreeBranch";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { reopenStoredThread, setThreadWorktree, unloadStoredThread } from "./threadActions";
import { createWorktree } from "./worktreeLaunchActions";
import { initializeCreatedWorktree } from "./worktreeInitialization";
import {
  isRemoteCommandOutcomeUncertainError,
  notifyThreadCommandOutcomeUncertain,
} from "./threadCommandOutcomeActions";

const movingThreadIds = new Set<string>();

/**
 * Move a main-checkout thread into a fresh git worktree on a new branch.
 * Active threads are relaunched there. `withChanges` MOVES the project's
 * uncommitted changes into the worktree, leaving the current branch clean.
 * Failures are toasted here.
 *
 * Local and remote share this path. Git create and thread metadata updates go
 * through helpers that route to the host when the project is projected.
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

  const wasActive = thread.status !== "inactive";
  // As with a new thread, only projected projects delegate setup to the host.
  // Managed desktop rows still persist through the host, but local setup must
  // use the same eager shell path as startThreadFromDraft, exactly once.
  const hostFollowUp = remoteOwner(thread) !== undefined;
  let unloaded = false;
  let assigned = false;
  movingThreadIds.add(threadId);
  try {
    const currentBranch = useGitStore.getState().statuses[project.id]?.branch;
    const branch = generateWorktreeBranch();
    const create = () =>
      createWorktree(project, {
        branch,
        ...(currentBranch ? { startPoint: currentBranch } : {}),
        createBranch: true,
        transferUncommitted: withChanges,
        keepChangesInSource: false,
      });
    const unload = async () => {
      await unloadStoredThread(threadId);
      unloaded = true;
    };
    let result: Awaited<ReturnType<typeof create>>;
    if (wasActive && !withChanges) {
      // A clean checkout doesn't mutate the source, so checkout and retirement
      // can overlap. Join both even on failure before retagging or relaunching.
      const [closed, created] = await Promise.allSettled([unload(), create()]);
      // A newly visible worktree may already be used by another thread or
      // contain edits. Failed shutdown cannot authorize force-removing it.
      if (closed.status === "rejected") throw closed.reason;
      if (created.status === "rejected") throw created.reason;
      result = created.value;
    } else {
      // Stashing must wait for a live agent to stop writing to the source.
      if (wasActive) await unload();
      result = await create();
    }
    if (!useAppStore.getState().threads.some((item) => item.id === threadId)) {
      // Another thread may have adopted this worktree while checkout ran.
      // Preserve it, including any transferred changes, after cancellation.
      return;
    }
    try {
      await setThreadWorktree(threadId, result.path, branch, {
        ...(hostFollowUp ? { isNewWorktree: true } : {}),
      });
    } catch (error) {
      // The host may have assigned the worktree while its response was lost.
      // Resuming with stale source metadata can start the agent in the wrong cwd.
      if (isRemoteCommandOutcomeUncertainError(error)) {
        notifyThreadCommandOutcomeUncertain();
        return;
      }
      throw error;
    }
    assigned = true;
    if (wasActive) reopenStoredThread(threadId);
    initializeCreatedWorktree(project, result.path);
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");

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
    if (unloaded && !assigned) reopenStoredThread(threadId);
    toast.danger(friendlyError(error));
  } finally {
    movingThreadIds.delete(threadId);
  }
}
