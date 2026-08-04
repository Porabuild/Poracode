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
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads, runShellScriptToCompletion } from "@/renderer/utils/shellUtils";
import { showGitActionError } from "./gitCommandRunner";
import { cancelQueuedWorktreeSetup } from "./worktreeLaunchActions";

function refreshProjectBranches(project: Project): void {
  void readBridge()
    .gitListBranches({ projectLocation: project.location, includeRemote: true })
    .then((branches) => useGitStore.getState().setBranches(project.id, branches))
    .catch(() => undefined);
}

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

    refreshProjectBranches(project);
  }
  return true;
}

export async function forceDeleteBranch(projectId: string, branch: string): Promise<boolean> {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  if (!project) return false;

  try {
    await readBridge().gitDeleteBranch({
      projectLocation: project.location,
      branch,
      force: true,
    });
  } catch (error) {
    showGitActionError(error);
    return false;
  }

  refreshProjectBranches(project);
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
  const app = useAppStore.getState();
  const project = app.projects.find((p) => p.id === projectId);
  if (!project) return;

  const threadIdSet = new Set(threadIds);
  const groupThreads = app.threads.filter((thread) => threadIdSet.has(thread.id));
  const sampleThread = groupThreads.find((thread) => thread.worktreeBranch);

  const deleteThread = app.deleteThread;
  const owner = remoteOwner(project);
  if (owner) {
    const remoteThreadIds = groupThreads
      .map((thread) => remoteOwner(thread))
      .filter((threadOwner) => threadOwner?.desktopId === owner.desktopId)
      .map((threadOwner) => threadOwner!.remoteId);
    if (remoteThreadIds.length !== threadIds.length) return;
    void useRemoteServersStore
      .getState()
      .sendThreadCommand(owner.desktopId, {
        kind: "delete-worktree-group",
        threadId: remoteThreadIds[0]!,
        projectId: owner.remoteId,
        worktreePath,
        threadIds: remoteThreadIds,
      })
      .then(() => {
        for (const threadId of threadIds) useAppStore.getState().deleteThread(threadId);
      })
      .catch((error) => {
        toast.danger(errorDetail(error) || i18n._(msg`Unable to remove worktree.`));
      });
    return;
  }
  for (const threadId of threadIds) {
    deleteThread(threadId);
  }

  void (async () => {
    await closeThreads(threadIds);
    await performWorktreeRemoval(project, worktreePath, sampleThread?.worktreeBranch);
  })();
}
