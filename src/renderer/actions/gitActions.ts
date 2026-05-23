import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { usePullFromSourceDialogStore } from "@/renderer/state/pullFromSourceDialogStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads } from "@/renderer/utils/shellUtils";
import { performWorktreeRemoval } from "./worktreeActions";

function captureGitActionError(error: unknown): void {
  captureRendererException(error, { featureArea: "git" });
}

export function openGitReviewForWorktree(projectId: string, worktreePath: string): void {
  const mode = useSharedSettings.getState().gitReviewMode;
  const panelStore = usePanelStore.getState();
  panelStore.setGitReviewContext({ projectId, worktreePath });
  if (mode === "panel") {
    panelStore.setGitReviewAsPanel(true);
  } else {
    panelStore.setGitOverlayOpen(true);
  }
}

export function gitSync(projectId: string, worktreePath?: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const location = worktreePath
    ? buildWorktreeLocation(project.location, worktreePath)
    : project.location;
  void readBridge().gitSync({ projectLocation: location }).catch(captureGitActionError);
}

export function gitSyncRebase(projectId: string, worktreePath?: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const location = worktreePath
    ? buildWorktreeLocation(project.location, worktreePath)
    : project.location;
  void readBridge().gitSyncRebase({ projectLocation: location }).catch(captureGitActionError);
}

export function gitPush(projectId: string, worktreePath: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktreeBranch = resolveWorktreeBranch(projectId, worktreePath);
  if (!worktreeBranch) return;
  const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
  void readBridge()
    .gitPush({
      projectLocation: worktreeLocation,
      remote: "origin",
      branch: worktreeBranch,
      setUpstream: true,
    })
    .catch(captureGitActionError);
}

export function gitPull(projectId: string, worktreePath: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
  void readBridge()
    .gitPull({ projectLocation: worktreeLocation, remote: "origin" })
    .catch(captureGitActionError);
}

export function gitPullRebase(projectId: string, worktreePath: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
  void readBridge()
    .gitPullRebase({ projectLocation: worktreeLocation, remote: "origin" })
    .catch(captureGitActionError);
}

export function gitMergeToSource(projectId: string, worktreePath: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktreeBranch = resolveWorktreeBranch(projectId, worktreePath);
  if (!worktreeBranch) return;
  void (async () => {
    try {
      const { sourceBranch } = await readBridge().gitGetWorktreeSourceBranch({
        projectLocation: project.location,
        branch: worktreeBranch,
      });
      if (!sourceBranch) return;
      const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
      await readBridge().gitMergeToSource({
        projectLocation: project.location,
        worktreeLocation,
        worktreeBranch,
        sourceBranch,
      });
    } catch (error) {
      captureGitActionError(error);
      // ignored — user can open git review for details
    }
  })();
}

export function gitMergeAndRemove(projectId: string, worktreePath: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktreeBranch = resolveWorktreeBranch(projectId, worktreePath);
  if (!worktreeBranch) return;
  void (async () => {
    try {
      const { sourceBranch } = await readBridge().gitGetWorktreeSourceBranch({
        projectLocation: project.location,
        branch: worktreeBranch,
      });
      if (!sourceBranch) return;
      const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
      const result = await readBridge().gitMergeToSource({
        projectLocation: project.location,
        worktreeLocation,
        worktreeBranch,
        sourceBranch,
      });
      if (!result.merged) return;
      const allThreads = useAppStore.getState().threads;
      const siblings = allThreads.filter((t) => t.worktreePath === worktreePath);
      const deleteThread = useAppStore.getState().deleteThread;
      for (const sib of siblings) {
        deleteThread(sib.id);
      }
      await closeThreads(siblings.map((sib) => sib.id));
      await performWorktreeRemoval(project, worktreePath, worktreeBranch);
    } catch (error) {
      captureGitActionError(error);
      // ignored — user can open git review for details
    }
  })();
}

export function gitPullFromSource(projectId: string, worktreePath: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktreeBranch = resolveWorktreeBranch(projectId, worktreePath);
  if (!worktreeBranch) return;
  void (async () => {
    try {
      const { sourceBranch } = await readBridge().gitGetWorktreeSourceBranch({
        projectLocation: project.location,
        branch: worktreeBranch,
      });
      if (!sourceBranch) return;
      const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
      const result = await readBridge().gitPullFromSource({
        worktreeLocation,
        sourceBranch,
        preserveLocalChanges: false,
      });
      if (result.needsStash) {
        usePullFromSourceDialogStore.getState().setDialog({
          projectId,
          worktreePath,
          sourceBranch,
        });
        return;
      }
      if (result.conflicting) {
        openGitReviewForWorktree(projectId, worktreePath);
      }
    } catch (error) {
      captureGitActionError(error);
      // ignored — user can open git review for details
    }
  })();
}
