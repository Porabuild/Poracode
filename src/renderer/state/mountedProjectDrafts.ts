import type { DraftContent } from "./slices/types";
import { mergeDraftContent, remapProjectRecord } from "./projectReferences";

interface MountedProjectDraft {
  read(): DraftContent | null;
  restore(content: DraftContent): void;
  /** The replacement owns this snapshot; the old unmount must not save it again. */
  transfer(): void;
}

const mountedDrafts = new Map<string, Set<MountedProjectDraft>>();

/** Imperative composers own live text until navigation saves it to the draft store. */
export function registerMountedProjectDraft(
  projectId: string,
  draft: MountedProjectDraft,
): () => void {
  const drafts = mountedDrafts.get(projectId) ?? new Set<MountedProjectDraft>();
  drafts.add(draft);
  mountedDrafts.set(projectId, drafts);
  return () => {
    drafts.delete(draft);
    if (drafts.size === 0) mountedDrafts.delete(projectId);
  };
}

/** Snapshot before changing view IDs, then restore any canonical composer that stays mounted. */
export function transferMountedProjectDrafts(
  stored: Record<string, DraftContent>,
  duplicateIds: ReadonlyMap<string, string>,
): Record<string, DraftContent> {
  if (duplicateIds.size === 0) return stored;
  const contents = { ...stored };
  const affected = new Set([...duplicateIds.keys(), ...duplicateIds.values()]);
  for (const projectId of affected) {
    let liveContent: DraftContent | undefined;
    for (const draft of mountedDrafts.get(projectId) ?? []) {
      const live = draft.read();
      if (!live) continue;
      liveContent = liveContent ? mergeDraftContent(liveContent, live) : live;
    }
    // Mounted composers own the current text; a stored snapshot may predate their latest edit.
    if (liveContent) contents[projectId] = liveContent;
  }
  const remapped = remapProjectRecord(contents, duplicateIds, mergeDraftContent);
  for (const projectId of affected) {
    for (const draft of mountedDrafts.get(projectId) ?? []) {
      if (duplicateIds.has(projectId)) draft.transfer();
      else if (remapped[projectId]) draft.restore(remapped[projectId]);
    }
  }
  return remapped;
}
