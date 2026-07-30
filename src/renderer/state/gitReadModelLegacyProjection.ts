import type { GitStateSnapshot } from "@/shared/gitState";
import { useGitStore } from "./gitStore";

/**
 * Transitional adapter for existing Git surfaces while they migrate to
 * gitReadModel selectors. The host snapshot is authoritative; this is a
 * one-way projection and never feeds legacy cache state back to the host.
 */
export function projectGitReadModelIntoLegacyStore(snapshot: GitStateSnapshot): void {
  const store = useGitStore.getState();

  for (const project of Object.values(snapshot.projects)) {
    store.setProjectSnapshot(project.ref.projectId, {
      ...(project.status ? { status: project.status } : {}),
      ...(project.branches ? { branches: project.branches } : {}),
      ...(project.worktrees ? { worktrees: [...project.worktrees] } : {}),
      ...(project.ghAvailable !== undefined ? { ghAvailable: project.ghAvailable } : {}),
    });
  }

  for (const target of Object.values(snapshot.targets)) {
    if (target.status) {
      if (target.ref.worktreePath) {
        store.setWorktreeStatus(target.ref.worktreePath, target.status);
      } else {
        store.setStatus(target.ref.projectId, target.status);
      }
    }
    const pr = target.pullRequestKey ? snapshot.pullRequests[target.pullRequestKey] : undefined;
    const legacyPrKey = target.ref.worktreePath ?? target.ref.projectId;
    if (target.pullRequestKey === null) {
      store.setPrData(legacyPrKey, null);
    } else if (pr) {
      store.setPrData(legacyPrKey, pr.data);
      if (pr.details) {
        store.setPrDetails(`${target.ref.projectId}#${pr.ref.prNumber}`, pr.details);
      }
    }
  }
}
