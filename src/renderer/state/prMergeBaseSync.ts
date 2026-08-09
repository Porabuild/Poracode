import type { PrData } from "@/shared/contracts";
import { pullMergedPrBaseIfPossible } from "@/renderer/actions/gitCommandRunner";
import { useAppStore } from "./appStore";

const pendingPrSyncs = new Map<string, Promise<void>>();
const projectSyncTails = new Map<string, Promise<void>>();

/** Safely sync one merged PR's base checkout, serialized with other merges for that project. */
export function syncMergedPrBase(projectId: string, pr: PrData): Promise<void> {
  const prKey = `${projectId}#${pr.number}`;
  const pending = pendingPrSyncs.get(prKey);
  if (pending) return pending;

  const previous = projectSyncTails.get(projectId) ?? Promise.resolve();
  const sync = previous
    .catch(() => undefined)
    .then(() => {
      const project = useAppStore
        .getState()
        .projects.find((candidate) => candidate.id === projectId);
      if (!project) return;
      return pullMergedPrBaseIfPossible(project.location, pr.baseBranch, projectId);
    });
  pendingPrSyncs.set(prKey, sync);
  projectSyncTails.set(projectId, sync);
  void sync.finally(() => {
    pendingPrSyncs.delete(prKey);
    if (projectSyncTails.get(projectId) === sync) projectSyncTails.delete(projectId);
  });
  return sync;
}
