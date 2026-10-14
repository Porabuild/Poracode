/**
 * Postcommit deleted-thread notification seam.
 *
 * Every DB-layer thread deletion (`dbDeleteThread`, `dbDeleteProject`,
 * `dbSyncAll`, `dbSyncChanges`, experiment-intent retirement) announces the
 * deleted row ids here. Deletions that happen only through a foreign-key
 * cascade (a project delete cascading its threads) are captured inside the
 * deleting transaction so the announcement includes them.
 *
 * Notification contract, read precisely:
 * - An announcement fires when the deleting write's own statement or
 *   transaction has returned. When the deleting call runs nested inside an
 *   OUTER transaction, the announcement still fires at that moment — and that
 *   outer transaction may then roll the deletion back, leaving the announced
 *   rows alive. The announcement is a commit CANDIDATE, not proof of commit.
 * - A mid-transaction refusal (a statement throws before the deleting
 *   transaction returns) never announces.
 * - Listeners run on the caller's synchronous DB turn: they must not block,
 *   and they must never trust the announcement — the durable live-row state,
 *   not the notification, is authoritative. The only production listener
 *   re-reads live rows before touching the filesystem.
 * - A throwing listener is isolated: its error is reported and never rethrown
 *   into the SQL caller (the delete has committed either way — a throw here
 *   must not falsely imply a rollback), and later listeners still run.
 */

type DeletedThreadIdsListener = (deletedThreadIds: readonly string[]) => void;

const listeners = new Set<DeletedThreadIdsListener>();

export function onThreadsDeleted(listener: DeletedThreadIdsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by the DB layer once a deleting write's transaction has returned. */
export function notifyThreadsDeleted(deletedThreadIds: readonly string[]): void {
  if (deletedThreadIds.length === 0) return;
  for (const listener of listeners) {
    try {
      listener(deletedThreadIds);
    } catch (error) {
      // Isolated on purpose: the SQL write is already committed (or an outer
      // transaction still owns it), so a listener bug must never surface as a
      // database failure or suppress the remaining listeners.
      console.error("[db] onThreadsDeleted listener failed:", error);
    }
  }
}
