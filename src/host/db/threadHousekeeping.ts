import { getSqlite } from "./connection";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";

/**
 * Host-owned thread housekeeping predicates, extracted from the renderer's
 * startup/idle sweeps so the same policy runs where the rows live:
 *
 * - autoarchive: `done && !archived && !starred` and
 *   `COALESCE(done_at, updated_at) <= cutoff` → flip `archived`/`archived_at`
 *   (exactly the renderer's `archiveOldDoneThreads`, which does not bump
 *   `updated_at`);
 * - purge: `archived = 1` and `COALESCE(archived_at, updated_at) <= cutoff`.
 *
 * Everything is a guarded single statement: a concurrent unarchive, star, or
 * metadata write that lands first simply stops matching. Callers still recheck
 * purge eligibility after every await before handing the id to the custody
 * delete path.
 */

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

/**
 * Flip `done`, unarchived, unstarred rows older than `cutoff` to archived.
 * Returns the ids that actually flipped. `excludeThreadIds` are rows whose
 * ownership (for example an experiment candidate) forbids a host policy flip.
 */
export function dbArchiveDoneThreads(input: {
  readonly now: string;
  readonly cutoff: string;
  readonly excludeThreadIds: readonly string[];
}): string[] {
  const sqlite = getSqlite();
  const exclusion =
    input.excludeThreadIds.length > 0
      ? ` AND id NOT IN (${placeholders(input.excludeThreadIds.length)})`
      : "";
  const candidates = (
    sqlite
      .prepare(
        `SELECT id FROM threads
          WHERE done = 1 AND archived = 0 AND starred = 0
            AND COALESCE(done_at, updated_at) <= ?${exclusion}
          ORDER BY id ASC`,
      )
      .all(input.cutoff, ...input.excludeThreadIds) as { id: string }[]
  ).map((row) => row.id);
  if (candidates.length === 0) return [];
  const result = sqlite
    .prepare(
      `UPDATE threads
         SET archived = 1, archived_at = ?
        WHERE id IN (${placeholders(candidates.length)})
          AND done = 1 AND archived = 0 AND starred = 0
          AND COALESCE(done_at, updated_at) <= ?`,
    )
    .run(input.now, ...candidates, input.cutoff);
  if (result.changes === 0) return [];
  // The statement is atomic and synchronous; every candidate still matches.
  notifyProjectThreadDataChanged();
  return candidates;
}

/** Archived rows whose retention window has elapsed, in deterministic id order. */
export function dbSelectPurgeCandidateThreadIds(cutoff: string): string[] {
  const rows = getSqlite()
    .prepare(
      `SELECT id FROM threads
        WHERE archived = 1 AND COALESCE(archived_at, updated_at) <= ?
        ORDER BY id ASC`,
    )
    .all(cutoff) as { id: string }[];
  return rows.map((row) => row.id);
}

/**
 * Recheck immediately before the destructive delete: the row must still exist,
 * still be archived, and still be outside the retention window. A concurrent
 * unarchive or metadata write wins.
 */
export function dbIsThreadPurgeEligible(threadId: string, cutoff: string): boolean {
  return (
    getSqlite()
      .prepare(
        `SELECT 1 FROM threads
          WHERE id = ? AND archived = 1 AND COALESCE(archived_at, updated_at) <= ?`,
      )
      .get(threadId, cutoff) !== undefined
  );
}
