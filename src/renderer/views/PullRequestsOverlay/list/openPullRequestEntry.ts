import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import type { PullRequestEntry } from "./prListModel";

/**
 * Selects a listed review. The row's data seeds the detail before its own read
 * completes, and a local worktree on the head branch becomes the review location.
 */
export function openPullRequestEntry(entry: PullRequestEntry): void {
  const { project, summary } = entry;
  const prKey = buildBranchNamePrKey(project.id, summary.headBranch);
  const gitState = useGitStore.getState();
  const matchingWorktree = (gitState.worktrees[project.id] ?? []).find(
    (worktree) => !worktree.isMain && worktree.branch === summary.headBranch,
  );
  gitState.setPrData(prKey, summary.pr);
  usePanelStore.getState().setPrReviewContext({
    projectId: project.id,
    prNumber: summary.pr.number,
    prKey,
    ...(matchingWorktree ? { worktreePath: matchingWorktree.path } : {}),
    skipLocalSync: true,
  });
}
