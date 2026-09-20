import type { RemoteGitSummaries } from "@/shared/remote";
import type { GitStatusResult } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";

export function syncRemoteGitSummaries(desktopId: string, summaries: RemoteGitSummaries): void {
  const app = useAppStore.getState();
  const git = useGitStore.getState();
  const threadsByRemoteId = new Map(
    app.threads
      .filter((thread) => thread.remoteServerId === desktopId && thread.remoteId)
      .map((thread) => [thread.remoteId!, thread]),
  );
  for (const [remoteThreadId, summary] of Object.entries(summaries)) {
    const thread = threadsByRemoteId.get(remoteThreadId);
    if (!thread) continue;
    const current = thread.worktreePath
      ? git.worktreeStatuses[thread.worktreePath]
      : git.statuses[thread.projectId];
    const files = current ? [...current.staged, ...current.unstaged] : [];
    const detailedInsertions = files.reduce((total, file) => total + file.insertions, 0);
    const detailedDeletions = files.reduce((total, file) => total + file.deletions, 0);
    const detailsMatchSummary =
      current !== undefined &&
      current.isRepo === summary.isRepo &&
      current.branch === summary.branch &&
      detailedInsertions === summary.totalInsertions &&
      detailedDeletions === summary.totalDeletions;
    const status: GitStatusResult = {
      ...(detailsMatchSummary && current.detail !== undefined
        ? { detail: current.detail }
        : { detail: "summary" as const }),
      isRepo: summary.isRepo,
      branch: summary.branch,
      tracking: current?.tracking ?? "",
      hasRemote: current?.hasRemote ?? false,
      remoteInfo: current?.remoteInfo ?? null,
      ahead: summary.ahead,
      behind: summary.behind,
      staged: current?.staged ?? [],
      unstaged: current?.unstaged ?? [],
      totalInsertions: summary.totalInsertions,
      totalDeletions: summary.totalDeletions,
      ...(current?.headSha !== undefined ? { headSha: current.headSha } : {}),
      ...(current?.mergeInProgress !== undefined
        ? { mergeInProgress: current.mergeInProgress }
        : {}),
      ...(current?.mergeMessage !== undefined ? { mergeMessage: current.mergeMessage } : {}),
      ...(current?.conflictFiles !== undefined ? { conflictFiles: current.conflictFiles } : {}),
    };
    if (thread.worktreePath) {
      git.setRemoteWorktreeSummary(thread.worktreePath, status);
    } else {
      git.setStatus(thread.projectId, status);
    }
  }
}
