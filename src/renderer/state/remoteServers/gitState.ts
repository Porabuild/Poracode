import {
  applyGitStatePatch,
  emptyGitStateSnapshot,
  type GitStatePatch,
  type GitStateSnapshot,
} from "@/shared/gitState";
import { remoteProjectId } from "@/renderer/state/remoteProjection";
import { resolvePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";

const snapshots = new Map<string, GitStateSnapshot>();

function projectSnapshot(desktopId: string, snapshot: GitStateSnapshot): void {
  const store = useGitStore.getState();

  for (const project of Object.values(snapshot.projects)) {
    const projectId = remoteProjectId(desktopId, project.ref.projectId);
    store.setProjectSnapshot(projectId, {
      ...(project.status ? { status: project.status } : {}),
      ...(project.branches ? { branches: project.branches } : {}),
      ...(project.worktrees ? { worktrees: [...project.worktrees] } : {}),
      ...(project.ghAvailable !== undefined ? { ghAvailable: project.ghAvailable } : {}),
    });
  }

  for (const target of Object.values(snapshot.targets)) {
    const projectId = remoteProjectId(desktopId, target.ref.projectId);
    if (target.status) {
      if (target.ref.worktreePath) {
        store.setWorktreeStatus(target.ref.worktreePath, target.status);
      } else {
        store.setStatus(projectId, target.status);
      }
    }
    const pr = target.pullRequestKey ? snapshot.pullRequests[target.pullRequestKey] : undefined;
    const legacyPrKey = resolvePrKey(projectId, target.ref.worktreePath);
    if (target.pullRequestKey === null) {
      store.setPrData(legacyPrKey, null);
    } else if (pr) {
      store.setPrData(legacyPrKey, pr.data);
      if (pr.details) store.setPrDetails(`${projectId}#${pr.ref.prNumber}`, pr.details);
    }
  }
}

export function syncRemoteGitStateSnapshot(desktopId: string, snapshot: GitStateSnapshot): void {
  const current = snapshots.get(desktopId);
  if (current && snapshot.revision < current.revision) return;
  snapshots.set(desktopId, snapshot);
  projectSnapshot(desktopId, snapshot);
}

export function syncRemoteGitStatePatch(desktopId: string, patch: GitStatePatch): void {
  const current = snapshots.get(desktopId) ?? emptyGitStateSnapshot();
  const next = applyGitStatePatch(current, patch);
  if (next === current) return;
  snapshots.set(desktopId, next);
  projectSnapshot(desktopId, next);
}

export function clearRemoteGitState(desktopId?: string): void {
  if (desktopId) snapshots.delete(desktopId);
  else snapshots.clear();
}
