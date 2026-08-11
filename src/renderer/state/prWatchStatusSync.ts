import type { PrData } from "@/shared/contracts";
import type { PrWatchStatusEvent } from "@/shared/ipc";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "./appStore";
import { buildBranchNamePrKey, buildBranchPrKey } from "./gitSelectors";
import { useGitStore } from "./gitStore";
import { syncMergedPrBase } from "./prMergeBaseSync";

/**
 * Keeps the git store's PR snapshot in step with the PR-watch loop.
 *
 * A watched PR is polled in the main process, not by the renderer's own refresh
 * cycle: the pending-PR poll only follows PRs whose checks are still running, so
 * once checks turn green nothing re-reads the PR until the next periodic remote
 * fetch (minutes later). An auto-merge lands inside that window, which left the
 * sidebar badge and git panel showing a green *open* PR for a PR that was
 * already merged — visibly at odds with the thread the same merge marked done.
 *
 * The watch loop refetches the PR every tick anyway, so this just writes what it
 * saw into every key that addresses this PR. Both stores dedupe equal values, so
 * an unchanged poll costs no re-render.
 */

/** Every prData key that addresses this PR: worktree paths, branch name, project branch. */
function collectPrKeys(event: PrWatchStatusEvent): Set<string> {
  const keys = new Set<string>([buildBranchNamePrKey(event.projectId, event.headBranch)]);
  if (event.worktreePath) keys.add(event.worktreePath);
  if (useGitStore.getState().statuses[event.projectId]?.branch === event.headBranch) {
    keys.add(buildBranchPrKey(event.projectId));
  }
  for (const thread of useAppStore.getState().threads) {
    if (thread.projectId !== event.projectId || !thread.worktreePath) continue;
    if (thread.worktreeBranch === event.headBranch || thread.prNumber === event.prNumber) {
      keys.add(thread.worktreePath);
    }
  }
  return keys;
}

function applyPrWatchStatus(event: PrWatchStatusEvent): void {
  if (event.pr.state === "merged") void syncMergedPrBase(event.projectId, event.pr);
  const gitStore = useGitStore.getState();
  const updates: Record<string, PrData> = {};
  for (const key of collectPrKeys(event)) {
    // A key already holding a different PR belongs to newer work on the same
    // branch (a reopened worktree, a follow-up PR) — leave it to the refresh
    // that discovered it rather than overwriting it with the watched PR.
    const cached = gitStore.prData[key];
    if (cached && cached.number !== event.prNumber) continue;
    updates[key] = event.pr;
  }
  if (Object.keys(updates).length > 0) gitStore.setPrDataBatch(updates);
  if (event.details) gitStore.setPrDetails(`${event.projectId}#${event.prNumber}`, event.details);
}

/** Starts the sync. Runtime-owner only, so a remote session never duplicates it. */
export function startPrWatchStatusSync(): () => void {
  return readBridge().onPrWatchStatus(applyPrWatchStatus);
}
