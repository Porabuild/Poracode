import { toast } from "@heroui/react";
import type {
  GitMergeToSourcePayload,
  GitMergeToSourceResult,
  GitPullFromSourcePayload,
  GitPullFromSourceResult,
  GitPushPayload,
  GitSyncPayload,
  ProjectLocation,
} from "@/shared/contracts";
import { friendlyError, msg } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useGitStore } from "@/renderer/state/gitStore";

export type GitSyncCommand = "pull" | "pullRebase" | "push" | "sync" | "syncRebase";
export type SyncAction = "push" | "pull" | "sync";

export function deriveSyncAction(hasTracking: boolean, ahead: number, behind: number): SyncAction {
  if (!hasTracking) return "push";
  if (ahead > 0 && behind === 0) return "push";
  if (behind > 0 && ahead === 0) return "pull";
  return "sync";
}

export function showGitActionError(
  error: unknown,
  options?: { logPrefix?: string; capture?: boolean },
): void {
  if (options?.logPrefix) {
    console.error(options.logPrefix, error);
  }
  if (options?.capture) {
    captureRendererException(error, { featureArea: "git" });
  }
  toast.danger(friendlyError(error));
}

export function showGitOperationFailure(result: { error?: string }): void {
  toast.danger(result.error ?? msg("git.merge.failed"));
}

export async function runGitSyncCommand(input: {
  command: GitSyncCommand;
  projectLocation: ProjectLocation;
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
}): Promise<void> {
  const { command, projectLocation } = input;
  switch (command) {
    case "pull":
      await readBridge().gitPull(buildGitSyncPayload(projectLocation, input.remote));
      return;
    case "pullRebase":
      await readBridge().gitPullRebase(buildGitSyncPayload(projectLocation, input.remote));
      return;
    case "push":
      await readBridge().gitPush(buildGitPushPayload(input));
      return;
    case "sync":
      await readBridge().gitSync(buildGitSyncPayload(projectLocation, input.remote));
      return;
    case "syncRebase":
      await readBridge().gitSyncRebase(buildGitSyncPayload(projectLocation, input.remote));
      return;
  }
}

export async function runGitMergeToSource(
  payload: GitMergeToSourcePayload,
): Promise<GitMergeToSourceResult> {
  return readBridge().gitMergeToSource(payload);
}

export async function runGitPullFromSource(
  payload: GitPullFromSourcePayload,
): Promise<GitPullFromSourceResult> {
  return readBridge().gitPullFromSource(payload);
}

export async function pullMergedPrBaseIfPossible(
  projectLocation: ProjectLocation,
  baseBranch: string,
): Promise<void> {
  try {
    const status = await readBridge().getGitStatus({ projectLocation, detail: "summary" });
    if (
      status.branch !== baseBranch ||
      !status.hasRemote ||
      !status.tracking ||
      status.ahead > 0 ||
      status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.mergeInProgress
    ) {
      return;
    }

    const separator = status.tracking.indexOf("/");
    if (separator <= 0) return;
    await runGitSyncCommand({
      command: "pull",
      projectLocation,
      remote: status.tracking.slice(0, separator),
    });
  } catch (error) {
    console.warn("[git] post-merge pull skipped", error);
  }
}

/**
 * Refresh one worktree directly after a renderer-initiated Git mutation.
 * Remote PWA clients do not receive the desktop's noisy `git-changed` watcher
 * event, so conflict controls and diffs must not rely on that event to replace
 * their cached pre-operation status.
 */
export async function refreshGitStatusForWorktree(
  worktreeLocation: ProjectLocation,
  worktreePath: string,
): Promise<void> {
  try {
    const status = await readBridge().getGitStatus({ projectLocation: worktreeLocation });
    useGitStore.getState().setWorktreeStatus(worktreePath, status);
  } catch (error) {
    console.warn(`[git] worktree status refresh failed path=${worktreePath}`, error);
  }
}

function buildGitSyncPayload(projectLocation: ProjectLocation, remote?: string): GitSyncPayload {
  return {
    projectLocation,
    ...(remote ? { remote } : {}),
  };
}

function buildGitPushPayload(input: {
  projectLocation: ProjectLocation;
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
}): GitPushPayload {
  return {
    projectLocation: input.projectLocation,
    ...(input.remote ? { remote: input.remote } : {}),
    ...(input.branch ? { branch: input.branch } : {}),
    ...(input.setUpstream !== undefined ? { setUpstream: input.setUpstream } : {}),
  };
}
