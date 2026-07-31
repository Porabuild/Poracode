import type { RemoteGitSummaries } from "@/shared/remote";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";

export function syncRemoteGitSummaries(desktopId: string, summaries: RemoteGitSummaries): void {
  const app = useAppStore.getState();
  const git = useGitStore.getState();
  const threadsByRemoteId = new Map(
    app.threads
      .filter((thread) => thread.remoteServerId === desktopId && thread.remoteId)
      .map((thread) => [thread.remoteId!, thread]),
  );
  const projectsById = new Map(
    app.projects
      .filter((project) => project.remoteServerId === desktopId)
      .map((project) => [project.id, project]),
  );
  const projectsToRefresh = new Map<string, Project>();

  for (const [remoteThreadId, summary] of Object.entries(summaries)) {
    const thread = threadsByRemoteId.get(remoteThreadId);
    if (!thread) continue;
    const current = thread.worktreePath
      ? git.worktreeStatuses[thread.worktreePath]
      : git.statuses[thread.projectId];
    if (!current) {
      const project = projectsById.get(thread.projectId);
      if (project) projectsToRefresh.set(project.id, project);
      continue;
    }
    const status = {
      ...current,
      isRepo: summary.isRepo,
      branch: summary.branch,
      ahead: summary.ahead,
      behind: summary.behind,
      totalInsertions: summary.totalInsertions,
      totalDeletions: summary.totalDeletions,
    };
    if (thread.worktreePath) {
      git.setWorktreeStatus(thread.worktreePath, status);
    } else {
      git.setStatus(thread.projectId, status);
    }
  }

  for (const project of projectsToRefresh.values()) {
    void refreshGitProject(project, "watcher", "status");
  }
}
