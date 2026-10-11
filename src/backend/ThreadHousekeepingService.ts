import {
  dbArchiveDoneThreads,
  dbIsThreadPurgeEligible,
  dbSelectPurgeCandidateThreadIds,
} from "@/host/db";
import { readPersistedExperiments } from "@/host/remote/experimentOwnership";

/**
 * Host-owned automatic thread housekeeping: the durable counterpart of the
 * renderer's startup purge and idle autoarchive, with the same policy.
 *
 * - **Retention parity**: archived rows are purged after
 *   {@link ARCHIVED_THREAD_PURGE_AFTER_DAYS}, autoarchive uses the configured
 *   `autoArchiveDoneAfterDays` (0 disables it), and the exact predicates
 *   (`COALESCE(done_at, updated_at)` / `COALESCE(archived_at, updated_at)`,
 *   starring excludes archiving) live in `@/host/db/threadHousekeeping`.
 * - **Custody, not raw DELETE**: deletion goes through `dbDeleteThread`, which
 *   refuses while a compound checkpoint revert is running, discards the
 *   thread's runtime writes, and forgets its gap/ownership markers. A refused
 *   row is skipped; the sweep continues with the next candidate.
 * - **Confirmed retirement**: the live runtime is closed through the
 *   confirmed-retirement supervisor call, which is invoked with the no-start
 *   option so a boot sweep can never fork a supervisor (H2). A no-start
 *   refusal counts as confirmed only when the lifecycle owner positively
 *   proves no process or transition can still act; a failed or unconfirmed
 *   retirement skips the row. A swallowed/unconfirmed close is never treated
 *   as proof that deletion is safe.
 * - **Experiment ownership**: candidate thread ids of a persisted experiment
 *   are never archived or purged by policy (the host's existing experiment
 *   guards already refuse archive/delete commands for them). This is a
 *   deliberate, recorded parity difference from the old renderer sweep, which
 *   had no experiment filter; an unreadable experiment store fails closed and
 *   leaves every row alone.
 * - **Recheck after await**: eligibility and ownership are re-read after the
 *   close await and immediately before the delete, so a concurrent unarchive,
 *   metadata edit, or experiment creation wins over the sweep.
 * - **Cancellation and join (H4)**: the owner sets `isCancelled` synchronously
 *   before its database closes; the sweep checks it before candidate
 *   reads/retirement and after every await, so a held retirement can never
 *   touch the database or publish after cancellation, and disposal joins the
 *   whole sweep.
 * - **Publication only**: archived/purged ids are published as a bounded
 *   `remote-threads-changed` membership event by the composition. Closing a
 *   local pane is a renderer projection concern and deliberately not host
 *   behavior.
 */

/** Archived rows older than this are purged. Policy constant, not a setting. */
export const ARCHIVED_THREAD_PURGE_AFTER_DAYS = 30;

export type ThreadHousekeepingSkipReason =
  | "experiment_owned"
  | "ownership_unavailable"
  | "retirement_unconfirmed"
  | "retirement_failed"
  | "predicate_changed"
  | "delete_blocked"
  | "cancelled";

export interface ThreadHousekeepingSkip {
  readonly threadId: string;
  readonly reason: ThreadHousekeepingSkipReason;
}

export interface ThreadHousekeepingReport {
  readonly archivedThreadIds: readonly string[];
  readonly purgedThreadIds: readonly string[];
  readonly skipped: readonly ThreadHousekeepingSkip[];
  /** The experiment store could not be read; the sweep was skipped entirely. */
  readonly experimentStateUnavailable: boolean;
  /**
   * H4: the owner began disposing. No further candidate/DB work ran after the
   * cancellation was observed, and no publication was attempted.
   */
  readonly cancelled: boolean;
}

export interface ThreadHousekeepingDependencies {
  /** Shared setting; 0 disables autoarchive (renderer parity). */
  getAutoArchiveDoneAfterDays(): number;
  now(): string;
  /**
   * H4 cancellation: the durable-services owner sets this synchronously before
   * its database closes. The sweep checks it before candidate reads/retirement
   * and after every await; `true` means stop immediately without touching the
   * database again.
   */
  isCancelled?(): boolean;
  /** Per-thread mutation lock: a launch/send/revert cannot interleave. */
  runThreadMutation<T>(threadId: string, operation: () => Promise<T>): Promise<T>;
  /** Close the live runtime and report confirmed retirement (never throws for
   * a merely unconfirmed kill; a rejection means the close itself failed). */
  closeThreadConfirmed(threadId: string): Promise<boolean>;
  /** Custody delete (`dbDeleteThread`); throws on a running revert. */
  deleteThread(threadId: string): void;
  publishThreadsChanged(threadIds: readonly string[]): void;
  reportError?(error: unknown): void;
}

function daysAgo(now: string, days: number): string {
  return new Date(Date.parse(now) - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Candidate thread ids of every persisted experiment; null when unreadable. */
function readProtectedThreadIds(
  dependencies: ThreadHousekeepingDependencies,
): ReadonlySet<string> | null {
  try {
    return new Set(
      readPersistedExperiments().flatMap((experiment) =>
        experiment.candidates.map((candidate) => candidate.threadId),
      ),
    );
  } catch (error) {
    dependencies.reportError?.(error);
    return null;
  }
}

async function purgeOne(
  dependencies: ThreadHousekeepingDependencies,
  threadId: string,
  cutoff: string,
): Promise<"purged" | ThreadHousekeepingSkipReason> {
  try {
    return await dependencies.runThreadMutation(threadId, async () => {
      // Cancellation is checked before the custody reads: a disposing owner's
      // database must not be touched at all, and the lock never runs a late
      // delete/publication.
      if (dependencies.isCancelled?.()) return "cancelled";
      // Ownership and eligibility are re-read under the per-thread lock, before
      // and after the close await: a concurrent write always wins.
      const protectedBefore = readProtectedThreadIds(dependencies);
      if (protectedBefore === null) return "ownership_unavailable";
      if (protectedBefore.has(threadId)) return "experiment_owned";
      if (!dbIsThreadPurgeEligible(threadId, cutoff)) return "predicate_changed";

      let confirmed: boolean;
      try {
        confirmed = await dependencies.closeThreadConfirmed(threadId);
      } catch (error) {
        dependencies.reportError?.(error);
        return "retirement_failed";
      }
      // After the await the owner may have begun disposing: no eligibility
      // re-read, no delete, no publication.
      if (dependencies.isCancelled?.()) return "cancelled";
      if (!confirmed) return "retirement_unconfirmed";

      const protectedAfter = readProtectedThreadIds(dependencies);
      if (protectedAfter === null) return "ownership_unavailable";
      if (protectedAfter.has(threadId)) return "experiment_owned";
      if (!dbIsThreadPurgeEligible(threadId, cutoff)) return "predicate_changed";

      try {
        dependencies.deleteThread(threadId);
      } catch (error) {
        // Per-row isolation: a running checkpoint revert (or any other refused
        // delete) skips this row and never kills the sweep.
        dependencies.reportError?.(error);
        return "delete_blocked";
      }
      return "purged";
    });
  } catch (error) {
    // The mutation lock itself refused (disposed client or a control
    // cancellation): skip this row, keep the sweep alive. A refusal while the
    // owner is disposing is expected teardown, not a reportable failure.
    if (dependencies.isCancelled?.()) return "cancelled";
    dependencies.reportError?.(error);
    return "retirement_failed";
  }
}

/**
 * Run one housekeeping sweep. Never throws for a single row: every refusal is
 * reported in the result and the row is left untouched. H4 cancellation stops
 * the sweep before further reads/retirement and suppresses publication.
 */
export async function runThreadHousekeeping(
  dependencies: ThreadHousekeepingDependencies,
): Promise<ThreadHousekeepingReport> {
  const cancelled = (): boolean => dependencies.isCancelled?.() === true;
  if (cancelled()) {
    return {
      archivedThreadIds: [],
      purgedThreadIds: [],
      skipped: [],
      experimentStateUnavailable: false,
      cancelled: true,
    };
  }
  const now = dependencies.now();
  const protectedIds = readProtectedThreadIds(dependencies);
  if (protectedIds === null) {
    return {
      archivedThreadIds: [],
      purgedThreadIds: [],
      skipped: [],
      experimentStateUnavailable: true,
      cancelled: false,
    };
  }

  const archivedThreadIds: string[] = [];
  const autoArchiveDoneAfterDays = dependencies.getAutoArchiveDoneAfterDays();
  if (autoArchiveDoneAfterDays > 0) {
    archivedThreadIds.push(
      ...dbArchiveDoneThreads({
        now,
        cutoff: daysAgo(now, autoArchiveDoneAfterDays),
        excludeThreadIds: [...protectedIds],
      }),
    );
  }

  const purgeCutoff = daysAgo(now, ARCHIVED_THREAD_PURGE_AFTER_DAYS);
  const purgedThreadIds: string[] = [];
  const skipped: ThreadHousekeepingSkip[] = [];
  if (!cancelled()) {
    for (const threadId of dbSelectPurgeCandidateThreadIds(purgeCutoff)) {
      // Cancellation before every candidate read/retirement: a disposal that
      // started mid-sweep must never touch the database again.
      if (cancelled()) break;
      if (protectedIds.has(threadId)) {
        skipped.push({ threadId, reason: "experiment_owned" });
        continue;
      }
      if (!dbIsThreadPurgeEligible(threadId, purgeCutoff)) {
        skipped.push({ threadId, reason: "predicate_changed" });
        continue;
      }
      const outcome = await purgeOne(dependencies, threadId, purgeCutoff);
      if (outcome === "purged") purgedThreadIds.push(threadId);
      else skipped.push({ threadId, reason: outcome });
    }
  }

  const wasCancelled = cancelled();
  const changedThreadIds = [...archivedThreadIds, ...purgedThreadIds];
  if (changedThreadIds.length > 0 && !wasCancelled) {
    try {
      dependencies.publishThreadsChanged(changedThreadIds);
    } catch (error) {
      // The rows are already committed; a failed publication is reported and
      // cannot roll them back. Clients reconcile on the next snapshot/event.
      dependencies.reportError?.(error);
    }
  }

  return {
    archivedThreadIds,
    purgedThreadIds,
    skipped,
    experimentStateUnavailable: false,
    cancelled: wasCancelled,
  };
}
