import type { GitStateSnapshot } from "@/shared/gitState";
import { resolvePrKey } from "./gitSelectors";
import {
  areBranchListsEqual,
  areGitStatusesEqual,
  arePrDataEqual,
  arePrDetailsEqual,
  areWorktreesEqual,
  useGitStore,
} from "./gitStore";

/**
 * Transitional adapter for existing Git surfaces while they migrate to
 * gitReadModel selectors. The host snapshot is authoritative; this is a
 * one-way projection and never feeds legacy cache state back to the host.
 */
export function projectGitReadModelIntoLegacyStore(
  snapshot: GitStateSnapshot,
  previous?: GitStateSnapshot,
): void {
  const store = useGitStore.getState();

  for (const [key, project] of Object.entries(snapshot.projects)) {
    const previousProject = previous?.projects[key];
    store.setProjectSnapshot(project.ref.projectId, {
      ...(project.status && !areGitStatusesEqual(previousProject?.status, project.status)
        ? { status: project.status }
        : {}),
      ...(project.branches && !areBranchListsEqual(previousProject?.branches, project.branches)
        ? { branches: project.branches }
        : {}),
      ...(project.worktrees && !areWorktreesEqual(previousProject?.worktrees, project.worktrees)
        ? { worktrees: [...project.worktrees] }
        : {}),
      ...(project.ghAvailable !== undefined && project.ghAvailable !== previousProject?.ghAvailable
        ? { ghAvailable: project.ghAvailable }
        : {}),
    });
  }

  for (const [key, target] of Object.entries(snapshot.targets)) {
    const previousTarget = previous?.targets[key];
    if (target.status && !areGitStatusesEqual(previousTarget?.status, target.status)) {
      if (target.ref.worktreePath) {
        store.setWorktreeStatus(target.ref.worktreePath, target.status);
      } else {
        store.setStatus(target.ref.projectId, target.status);
      }
    }
    const pr = target.pullRequestKey ? snapshot.pullRequests[target.pullRequestKey] : undefined;
    const previousPr = target.pullRequestKey
      ? previous?.pullRequests[target.pullRequestKey]
      : undefined;
    const associationChanged = target.pullRequestKey !== previousTarget?.pullRequestKey;
    // Legacy readers key the project row by the `__branch:` sentinel, never the
    // bare project id.
    const legacyPrKey = resolvePrKey(target.ref.projectId, target.ref.worktreePath);
    if (target.pullRequestKey === null && associationChanged) {
      store.setPrData(legacyPrKey, null);
    } else if (pr) {
      if (associationChanged || !arePrDataEqual(previousPr?.data, pr.data)) {
        store.setPrData(legacyPrKey, pr.data);
      }
      if (
        pr.details &&
        (associationChanged || !arePrDetailsEqual(previousPr?.details, pr.details))
      ) {
        store.setPrDetails(`${target.ref.projectId}#${pr.ref.prNumber}`, pr.details);
      }
    }
  }
}
