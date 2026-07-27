import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { buildWorktreeLocation } from "@/shared/worktree";
import { errorDetail } from "@/shared/messages";
import type { Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads, runShellScriptToCompletion } from "@/renderer/utils/shellUtils";
import { cancelQueuedWorktreeSetup } from "./worktreeLaunchActions";

export async function performWorktreeRemoval(
  project: Project,
  worktreePath: string,
  worktreeBranch?: string,
  expectedOwnerToken?: string,
): Promise<boolean> {
  const resolvedWorktreeBranch = resolveWorktreeBranch(project.id, worktreePath, worktreeBranch);

  await prepareWorktreeRemoval(project, worktreePath);

  try {
    await readBridge().gitRemoveWorktree({
      projectLocation: project.location,
      path: worktreePath,
      force: true,
      deleteBranch: false,
      ...(resolvedWorktreeBranch ? { expectedBranch: resolvedWorktreeBranch } : {}),
      ...(expectedOwnerToken ? { expectedOwnerToken } : {}),
    });
  } catch (err: unknown) {
    const detail = errorDetail(err);
    if (!detail.toLowerCase().includes("not found")) {
      console.warn(`[renderer] failed to remove worktree ${worktreePath}:`, detail);
      toast.danger(detail || i18n._(msg`Unable to remove worktree.`));
      return false;
    }
  }

  if (resolvedWorktreeBranch) {
    // Force-delete unless an unmerged PR exists. A merged PR (the purple badge)
    // is safe to drop even when git's local history doesn't show it as merged
    // (squash/rebase merges), and a branch with no PR at all shouldn't nag the
    // user with a "not fully merged" error. Only an open/draft/closed PR -- work
    // that was meant to land but hasn't -- soft-deletes so the user is prompted
    // before discarding it.
    const prState = useGitStore.getState().prData[worktreePath]?.state;
    const hasUnmergedPr = prState !== undefined && prState !== "merged";
    try {
      await readBridge().gitDeleteBranch({
        projectLocation: project.location,
        branch: resolvedWorktreeBranch,
        force: !hasUnmergedPr,
        ...(expectedOwnerToken ? { expectedOwnerToken } : {}),
      });
    } catch (err: unknown) {
      const detail = errorDetail(err);
      if (detail.includes("not fully merged")) {
        useWorktreeDeleteStore.getState().setDialog({
          kind: "branch-unmerged",
          projectId: project.id,
          worktreeBranch: resolvedWorktreeBranch,
          error: detail,
        });
        return false;
      }
      if (!detail.toLowerCase().includes("not found")) {
        console.warn(`[renderer] failed to delete branch ${resolvedWorktreeBranch}:`, detail);
        return false;
      }
    }

    void readBridge()
      .gitListBranches({ projectLocation: project.location, includeRemote: true })
      .then((branches) => useGitStore.getState().setBranches(project.id, branches))
      .catch(() => undefined);
  }
  return true;
}

export async function prepareWorktreeRemoval(
  project: Project,
  worktreePath: string,
): Promise<void> {
  cancelQueuedWorktreeSetup(project, worktreePath);

  const cleanupScript = project.scripts?.cleanupScript;
  if (cleanupScript) {
    const wtLocation = buildWorktreeLocation(project.location, worktreePath);
    const cleanupShellId = `shell:${crypto.randomUUID()}`;
    await runShellScriptToCompletion(cleanupShellId, wtLocation, cleanupScript).catch((error) => {
      console.warn(`[renderer] cleanup script failed for ${worktreePath}:`, error);
    });
  }

  const termStore = useDevTerminalStore.getState();
  const removedTabIds = termStore.removeTabsForWorktree(worktreePath);
  await closeThreads(removedTabIds);

  if (termStore.isOpen && termStore.activeWorktreePath === worktreePath) {
    termStore.closePanel();
  }

  useGitStore.getState().clearWorktreeStatus(worktreePath);

  const panelStore = usePanelStore.getState();
  const { gitReviewContext, filesPanelContext } = panelStore;
  if (gitReviewContext?.worktreePath === worktreePath) {
    panelStore.setGitOverlayOpen(false);
    panelStore.setGitReviewContext(null);
  }
  if (filesPanelContext?.worktreePath === worktreePath) {
    panelStore.setFilesPanelContext(null);
    useFileEditorStore.getState().clearSession();
  }
}

export function deleteWorktreeGroup(
  projectId: string,
  worktreePath: string,
  threadIds: string[],
): void {
  if (threadIds.some((threadId) => findExperimentByThreadId(threadId))) return;
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;

  const sampleThread = useAppStore
    .getState()
    .threads.find((t) => threadIds.includes(t.id) && t.worktreeBranch);

  const deleteThread = useAppStore.getState().deleteThread;
  for (const threadId of threadIds) {
    deleteThread(threadId);
  }

  void (async () => {
    await closeThreads(threadIds);
    await performWorktreeRemoval(project, worktreePath, sampleThread?.worktreeBranch);
  })();
}
