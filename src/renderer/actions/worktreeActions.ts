import { buildWorktreeLocation } from "@/shared/worktree";
import { errorDetail } from "@/shared/messages";
import type { Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads, runShellScriptToCompletion } from "@/renderer/utils/shellUtils";

export async function performWorktreeRemoval(
  project: Project,
  worktreePath: string,
  worktreeBranch?: string,
): Promise<void> {
  const resolvedWorktreeBranch = resolveWorktreeBranch(project.id, worktreePath, worktreeBranch);

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

  try {
    await readBridge().gitRemoveWorktree({
      projectLocation: project.location,
      path: worktreePath,
      force: true,
      deleteBranch: false,
    });
  } catch (err: unknown) {
    const branch = resolvedWorktreeBranch ?? worktreePath.split(/[/\\]/).pop() ?? worktreePath;
    useWorktreeDeleteStore.getState().setDialog({
      kind: "force-retry",
      projectId: project.id,
      worktreePath,
      worktreeBranch: branch,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (resolvedWorktreeBranch) {
    try {
      await readBridge().gitDeleteBranch({
        projectLocation: project.location,
        branch: resolvedWorktreeBranch,
        force: false,
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
        return;
      }
      if (!detail.toLowerCase().includes("not found")) {
        console.warn(`[renderer] failed to delete branch ${resolvedWorktreeBranch}:`, detail);
      }
    }

    void readBridge()
      .gitListBranches({ projectLocation: project.location, includeRemote: true })
      .then((branches) => useGitStore.getState().setBranches(project.id, branches))
      .catch(() => undefined);
  }
}

export function deleteWorktreeGroup(
  projectId: string,
  worktreePath: string,
  threadIds: string[],
): void {
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
