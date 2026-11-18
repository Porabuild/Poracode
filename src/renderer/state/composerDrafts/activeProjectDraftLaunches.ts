import { composerDraftStorage, type DraftCheckpoint } from "../composerDraftStorage";
import { notifyClientDraftSubmissions } from "./clientDraftSubmissions";

// A claimed submission can outlive its composer as the user navigates to the
// new thread. IndexedDB also retains claims from interrupted renderer sessions.
const activeLaunches = new Map<string, DraftCheckpoint>();

export function retainActiveProjectDraftLaunch(id: string, checkpoint: DraftCheckpoint) {
  activeLaunches.set(id, checkpoint);
  return () => {
    activeLaunches.delete(id);
    notifyClientDraftSubmissions();
  };
}

export function isActiveProjectDraftLaunch(id: string) {
  return activeLaunches.has(id);
}

export function isCurrentProjectDraftCheckpoint(checkpoint: DraftCheckpoint) {
  const current = composerDraftStorage()?.currentIdentity("project", checkpoint.ownerId);
  return current?.draftId === checkpoint.draftId && current.revision === checkpoint.revision;
}

export function activeProjectDraftLaunch(projectId: string) {
  for (const [id, checkpoint] of activeLaunches) {
    if (checkpoint.ownerId === projectId && isCurrentProjectDraftCheckpoint(checkpoint)) {
      return { id, checkpoint };
    }
  }
  return undefined;
}
