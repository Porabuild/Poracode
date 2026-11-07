import {
  applyGitStatePatch,
  emptyGitStateSnapshot,
  type GitStatePatch,
  type GitStateSnapshot,
} from "@/shared/gitState";
import { remoteProjectId } from "@/renderer/state/remoteProjection";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import {
  areBranchListsEqual,
  areGitStatusesEqual,
  arePrDataEqual,
  arePrDetailsEqual,
  areWorktreesEqual,
  useGitStore,
} from "@/renderer/state/gitStore";

const snapshots = new Map<string, GitStateSnapshot>();

/**
 * Project the host's Git read model into the legacy store.
 *
 * Remote patches re-send the accumulated model, so writing every entry on each
 * frame would let an unchanged (and possibly older) host row overwrite a newer
 * direct panel read. Compare against the previous snapshot, while allowing a
 * locally cleared worktree status to be restored.
 */
function projectSnapshot(
  desktopId: string,
  snapshot: GitStateSnapshot,
  previous?: GitStateSnapshot,
): void {
  const store = useGitStore.getState();

  for (const [key, project] of Object.entries(snapshot.projects)) {
    const projectId = remoteProjectId(desktopId, project.ref.projectId);
    const previousProject = previous?.projects[key];
    store.setGithubPollingProblem(projectId, project.githubPollingProblem ?? null);
    store.setProjectSnapshot(projectId, {
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
    const projectId = remoteProjectId(desktopId, target.ref.projectId);
    const previousTarget = previous?.targets[key];
    const worktreeStatusMissing = target.ref.worktreePath
      ? store.worktreeStatuses[target.ref.worktreePath] === undefined
      : false;
    if (
      target.status &&
      (worktreeStatusMissing || !areGitStatusesEqual(previousTarget?.status, target.status))
    ) {
      if (target.ref.worktreePath) {
        store.setWorktreeStatus(target.ref.worktreePath, target.status);
      } else {
        store.setStatus(projectId, target.status);
      }
    }
    const pr = target.pullRequestKey ? snapshot.pullRequests[target.pullRequestKey] : undefined;
    const previousPr = target.pullRequestKey
      ? previous?.pullRequests[target.pullRequestKey]
      : undefined;
    const associationChanged = target.pullRequestKey !== previousTarget?.pullRequestKey;
    const legacyPrKey = resolvePrKey(projectId, target.ref.worktreePath);
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
        store.setPrDetails(`${projectId}#${pr.ref.prNumber}`, pr.details);
      }
    }
  }
}

export function syncRemoteGitStateSnapshot(desktopId: string, snapshot: GitStateSnapshot): void {
  const current = snapshots.get(desktopId);
  if (current && snapshot.revision < current.revision) return;
  snapshots.set(desktopId, snapshot);
  projectSnapshot(desktopId, snapshot, current);
}

export function syncRemoteGitStatePatch(desktopId: string, patch: GitStatePatch): void {
  const current = snapshots.get(desktopId) ?? emptyGitStateSnapshot();
  const next = applyGitStatePatch(current, patch);
  if (next === current) return;
  snapshots.set(desktopId, next);
  projectSnapshot(desktopId, next, current);
}

export function clearRemoteGitState(desktopId?: string): void {
  if (desktopId) snapshots.delete(desktopId);
  else snapshots.clear();
}
