import type { Thread } from "@/shared/contracts";

/**
 * Diff the renderer's persisted thread list against the rows currently in
 * SQLite (the state remote clients last saw via the shell snapshot) and return
 * the ids whose remote-visible metadata changed.
 *
 * The desktop renderer persists every thread-metadata change through
 * `dbSyncAll`, but none of those changes emit supervisor events — so without
 * this diff, remote clients (the PWA) only learned about renames, auto-titles,
 * done/star/archive toggles, status flips, and deletions on the next unrelated
 * refresh. The result feeds the same `remote-threads-changed` event that
 * remote-issued thread commands already publish.
 *
 * Compared fields are the ones the remote shell list renders. `updatedAt` is
 * deliberately excluded: it bumps on every touch and would broadcast an event
 * (→ remote refresh) for changes nobody can see.
 */
export function diffSyncedThreadIds(before: readonly Thread[], after: readonly Thread[]): string[] {
  return diffSyncedThreads(before, after).changedThreadIds;
}

export interface SyncedThreadDiff {
  readonly changedThreadIds: string[];
  /**
   * Threads whose unread-completion marker was explicitly cleared by opening
   * them on the desktop. Remote clients must not infer this from every `idle`
   * snapshot because ordinary runtime completion also persists as `idle`.
   */
  readonly viewedThreadIds: string[];
}

export function diffSyncedThreads(
  before: readonly Thread[],
  after: readonly Thread[],
): SyncedThreadDiff {
  const beforeById = new Map(before.map((thread) => [thread.id, thread]));
  const changed: string[] = [];
  const viewed: string[] = [];
  for (const thread of after) {
    const prior = beforeById.get(thread.id);
    beforeById.delete(thread.id);
    if (prior?.status === "finished" && thread.status === "idle") {
      viewed.push(thread.id);
    }
    if (
      !prior ||
      prior.title !== thread.title ||
      prior.status !== thread.status ||
      prior.done !== thread.done ||
      prior.starred !== thread.starred ||
      prior.archived !== thread.archived
    ) {
      changed.push(thread.id);
    }
  }
  // Ids left in the map no longer exist in the incoming list — deletions.
  for (const id of beforeById.keys()) {
    changed.push(id);
  }
  return { changedThreadIds: changed, viewedThreadIds: viewed };
}
