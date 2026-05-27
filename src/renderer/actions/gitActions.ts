import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { startPostPushPrStatusRefresh } from "@/renderer/state/gitRefresh";
import { usePanelStore } from "@/renderer/state/panelStore";
import { usePullFromSourceDialogStore } from "@/renderer/state/pullFromSourceDialogStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads } from "@/renderer/utils/shellUtils";
import {
  runGitMergeToSource,
  runGitPullFromSource,
  runGitSyncCommand,
  showGitActionError,
  showGitOperationFailure,
} from "./gitCommandRunner";
import { performWorktreeRemoval } from "./worktreeActions";

function captureGitActionError(error: unknown): void {
  showGitActionError(error, { capture: true });
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
  void runGitSyncCommand({ command: "sync", projectLocation: location }).catch(
    captureGitActionError,
  );
}

export function gitSyncRebase(projectId: string, worktreePath?: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const location = worktreePath
    ? buildWorktreeLocation(project.location, worktreePath)
    : project.location;
  void runGitSyncCommand({ command: "syncRebase", projectLocation: location }).catch(
    captureGitActionError,
  );
}

export function gitPush(projectId: string, worktreePath: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktreeBranch = resolveWorktreeBranch(projectId, worktreePath);
  if (!worktreeBranch) return;
  const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
  void runGitSyncCommand({
    command: "push",
    projectLocation: worktreeLocation,
    remote: "origin",
    branch: worktreeBranch,
    setUpstream: true,
  })
    .then(() => {
      startPostPushPrStatusRefresh({
        projectId,
        projectLocation: project.location,
        prKey: worktreePath,
        branch: worktreeBranch,
      });
    })
    .catch(captureGitActionError);
}

export function gitPull(projectId: string, worktreePath: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
  void runGitSyncCommand({
    command: "pull",
    projectLocation: worktreeLocation,
    remote: "origin",
  }).catch(captureGitActionError);
}

export function gitPullRebase(projectId: string, worktreePath: string): void {
  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
  void runGitSyncCommand({
    command: "pullRebase",
    projectLocation: worktreeLocation,
    remote: "origin",
  }).catch(captureGitActionError);
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
      await runGitMergeToSource({
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
      const result = await runGitMergeToSource({
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
      const result = await runGitPullFromSource({
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
        return;
      }
      if (!result.merged) {
        showGitOperationFailure(result);
      }
    } catch (error) {
      captureGitActionError(error);
    }
  })();
}
