import { toError } from "@/shared/errorMessage";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { RUNTIME_HISTORY_NOTICE_REASONS } from "@/shared/runtimeHistoryNotice";
import {
  RuntimePersistenceUnknownThreadError,
  type RuntimeContaminationReason,
} from "./runtimePersistenceTypes";

/**
 * B1 durable canonical-gap evidence: the only reader/writer of the three
 * `runtime_persistence_*` / `thread_runtime_*` evidence tables.
 *
 * Contract (see `.agents/docs/versioning.md` and the B1 ratification):
 * - `arm()` commits the boot's root epoch with `armed = 1` before any canonical
 *   event can be admitted; `touch(T)` commits one row per thread per boot
 *   before the first accepted event of that thread in that boot.
 * - `resolve(T)` is bounded and read-only: one primary-key gap lookup, then one
 *   primary-key touch lookup. It never writes and never arms. A connection that
 *   has not armed uses a virtual boot epoch so a crashed boot's evidence is
 *   still visible.
 * - `persistGap` writes exact refusal evidence and throws on storage failure;
 *   the connection owner turns that into a bounded pending obligation. The
 *   first insert of a gap row allocates a persisted random UUID `episode_id`;
 *   accumulation preserves it, so a new episode after acknowledgment, reset, or
 *   delete always gets a fresh identity even under a frozen/backward clock.
 * - `disarmAfterCleanClose` deletes only this boot's touches and clears the
 *   armed flag in one transaction. It is a no-op when this boot never armed:
 *   a boot that could not arm must not erase the prior unclean state.
 * - A surviving touch whose epoch is not the current boot is unrepaired
 *   evidence: touches are deleted only by their own boot's clean close or an
 *   authoritative rebase. An exact gap row wins over any touch, in any epoch.
 */

const EPOCH_ROW_ID = 1;

export type RuntimeDurableGapDatabase = InstanceType<typeof Database>;

const SELECT_EPOCH_ROW = "SELECT epoch, armed FROM runtime_persistence_epoch WHERE id = ?";
const SELECT_GAP_ROW =
  "SELECT reason, refused_events, refused_bytes, epoch, created_at, episode_id FROM thread_runtime_gaps WHERE thread_id = ?";
const SELECT_FOREIGN_TOUCH =
  "SELECT epoch, touched_at FROM thread_runtime_epoch_touches WHERE thread_id = ? AND (? IS NULL OR epoch != ?) ORDER BY epoch LIMIT 1";
const SELECT_THREAD_ROW = "SELECT 1 AS ok FROM threads WHERE id = ?";

/** Derived resolution cache bound; entries are recomputable, never evidence. */
export const RUNTIME_DURABLE_GAP_RESOLUTION_CACHE_MAX_ENTRIES = 4_096;
/** Pending-obligation reserve bounds (evidence, never evicted). */
export const RUNTIME_DURABLE_GAP_PENDING_MAX_THREADS = 4_096;
export const RUNTIME_DURABLE_GAP_PENDING_MAX_BYTES = 1024 * 1024;
export const RUNTIME_DURABLE_GAP_PENDING_ENTRY_OVERHEAD_BYTES = 64;

/**
 * Persisted-reason classification, built from the shared reason tuple so a new
 * reason cannot be added to the wire vocabulary while this parser stays stale.
 * The tuple-derived union makes coverage exhaustive by construction.
 */
const KNOWN_CONTAMINATION_REASONS: ReadonlySet<string> = new Set(RUNTIME_HISTORY_NOTICE_REASONS);

export function isKnownContaminationReason(value: string): value is RuntimeContaminationReason {
  return KNOWN_CONTAMINATION_REASONS.has(value);
}

export interface RuntimeDurableGapBoot {
  /** Persisted epoch after bind (before this boot's arm). */
  readonly epoch: number;
  /** The prior boot did not cleanly close. */
  readonly priorArmed: boolean;
  readonly priorEpoch: number;
}

export interface RuntimeDurableGapBindResult {
  readonly boot: RuntimeDurableGapBoot;
  /** Root arm committed for this boot. `bind` itself never arms. */
  readonly armed: boolean;
  readonly error?: unknown;
}

export type RuntimeDurableGapResolution =
  | { kind: "clean" }
  | {
      kind: "exact";
      reason: RuntimeContaminationReason;
      refusedEvents: number;
      refusedBytes: number;
      epoch: number;
      unknownReason: boolean;
      /**
       * Persisted random UUID episode identity. `null` only for corrupt state
       * (a row predating the migration that was never backfilled): descriptor
       * readers refuse typed instead of minting an unverifiable token, while
       * admission still treats the row as exact evidence.
       */
      episodeId: string | null;
      createdAt: number;
    }
  | { kind: "suspect"; epoch: number; touchedAt: number }
  | { kind: "error"; error: unknown };

/**
 * Decider-facing port. `runtimePersistenceAdmission` owns the ordering
 * (resolve -> touch -> enqueue); the store owns every SQL statement. A port
 * with no bound database is inert, which keeps direct controller unit harnesses
 * (an injected writer, no SQLite) behaviorally unchanged.
 */
export interface RuntimeDurableGapPort {
  /** Arm the boot if needed, then commit `touch(T)`; throws on storage failure. */
  armThread(threadId: string): void;
  /** Bounded read-only resolution, cached per boot; never throws. */
  resolve(threadId: string): RuntimeDurableGapResolution;
  /** Exact refusal evidence; never throws (records a pending obligation instead). */
  recordGap(
    threadId: string,
    reason: RuntimeContaminationReason,
    refusedEvents: number,
    refusedBytes: number,
  ): void;
  /** Classified health failure for a port operation that could not commit. */
  reportFailure(error: unknown): void;
}

export interface RuntimeDurableGapStoreOptions {
  now?: () => number;
  resolutionCacheMaxEntries?: number;
}

export class RuntimeDurableGapStore {
  private readonly now: () => number;
  private readonly resolutionCacheMaxEntries: number;
  private readonly resolutionCache = new Map<string, RuntimeDurableGapResolution>();
  /** Threads whose current-epoch touch committed in this boot (derived cache). */
  private readonly touchedThreads = new Set<string>();
  private sqlite: InstanceType<typeof Database> | null = null;
  private bindError: unknown;
  private boot: RuntimeDurableGapBoot = { epoch: 0, priorArmed: false, priorEpoch: 0 };
  /** Boot epoch used by read-only resolution before/without an arm. */
  private virtualEpoch: number | null = null;
  private currentEpoch: number | null = null;
  private armed = false;

  constructor(options: RuntimeDurableGapStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.resolutionCacheMaxEntries =
      options.resolutionCacheMaxEntries ?? RUNTIME_DURABLE_GAP_RESOLUTION_CACHE_MAX_ENTRIES;
  }

  /**
   * Read the singleton epoch row for a connection. Never throws and never
   * writes: a read failure is reported so the owner can enter the typed
   * degraded state while reads still resolve durably where possible.
   */
  bind(sqlite: InstanceType<typeof Database>): RuntimeDurableGapBindResult {
    this.sqlite = sqlite;
    this.bindError = undefined;
    this.currentEpoch = null;
    this.armed = false;
    this.resolutionCache.clear();
    this.touchedThreads.clear();
    try {
      const row = sqlite.prepare(SELECT_EPOCH_ROW).get(EPOCH_ROW_ID) as
        | { epoch: number; armed: number }
        | undefined;
      const epoch = row?.epoch ?? 0;
      const priorArmed = (row?.armed ?? 0) === 1;
      this.boot = { epoch, priorArmed, priorEpoch: epoch };
      // A persisted armed=1 boot did not cleanly close, so its touches (epoch
      // E) are suspect for a connection that never arms: the virtual current
      // epoch is E + 1. A cleanly closed row (armed=0) has no touches of its
      // own, so the virtual epoch is E and only older unrepaired touches are
      // suspect. No writes are reachable from here.
      this.virtualEpoch = priorArmed ? epoch + 1 : epoch;
      return { boot: this.boot, armed: false };
    } catch (error) {
      this.bindError = error;
      this.boot = { epoch: 0, priorArmed: false, priorEpoch: 0 };
      this.virtualEpoch = null;
      return { boot: this.boot, armed: false, error };
    }
  }

  /** Read-only boot metadata (diagnostics/tests). */
  getBindResult(): RuntimeDurableGapBindResult {
    return {
      boot: this.boot,
      armed: this.armed,
      ...(this.bindError !== undefined ? { error: this.bindError } : {}),
    };
  }

  isArmed(): boolean {
    return this.armed;
  }

  getCurrentEpoch(): number | null {
    return this.armed ? this.currentEpoch : null;
  }

  /**
   * Commit this boot's epoch with `armed = 1`. One UPSERT per boot. Throws on
   * storage failure; the caller keeps the boot unarmed so no canonical event
   * can be accepted.
   */
  arm(): void {
    const sqlite = this.requireBound();
    const now = this.now();
    withScopedBusyTimeout(sqlite, () =>
      sqlite.transaction(() => {
        sqlite
          .prepare(
            `INSERT INTO runtime_persistence_epoch (id, epoch, armed, armed_at)
                 VALUES (?, 1, 1, ?)
               ON CONFLICT(id) DO UPDATE SET epoch = epoch + 1, armed = 1, armed_at = excluded.armed_at`,
          )
          .run(EPOCH_ROW_ID, now);
      })(),
    );
    const row = sqlite.prepare(SELECT_EPOCH_ROW).get(EPOCH_ROW_ID) as
      | { epoch: number; armed: number }
      | undefined;
    if (!row || row.armed !== 1) {
      throw new Error("Runtime durable-gap epoch arm did not commit.");
    }
    this.boot = { epoch: row.epoch, priorArmed: false, priorEpoch: row.epoch };
    this.currentEpoch = row.epoch;
    this.armed = true;
    this.resolutionCache.clear();
    this.touchedThreads.clear();
  }

  /** Arm the boot if it is not armed yet; a retry is safe and idempotent. */
  ensureArmed(): void {
    if (this.armed) return;
    this.arm();
  }

  /**
   * Commit `touch(T, currentEpoch)` before the thread's first accepted event.
   * Requires an armed boot: the caller must have armed first, so acceptance
   * can never precede the epoch row. A thread with no `threads` row is refused
   * typed before any write: canonical evidence cannot be attached to a thread
   * that does not exist, and a gap row could never commit for it.
   */
  touch(threadId: string): void {
    const sqlite = this.requireBound();
    const epoch = this.requireArmedEpoch();
    // One write per thread per boot: the committed touch is the evidence, so a
    // later admission in the same boot is a cache hit and adds no SQL. The
    // existence probe also runs at most once per thread per boot.
    if (this.touchedThreads.has(threadId)) return;
    const known = sqlite.prepare(SELECT_THREAD_ROW).get(threadId);
    if (!known) throw new RuntimePersistenceUnknownThreadError(threadId);
    withScopedBusyTimeout(sqlite, () => {
      sqlite
        .prepare(
          `INSERT INTO thread_runtime_epoch_touches (thread_id, epoch, touched_at)
             VALUES (?, ?, ?)
           ON CONFLICT(thread_id, epoch) DO NOTHING`,
        )
        .run(threadId, epoch, this.now());
    });
    this.touchedThreads.add(threadId);
    this.resolutionCache.delete(threadId);
  }

  /**
   * Bounded, read-only resolution for one thread. Exact gap evidence wins over
   * touches in any epoch; otherwise any touch whose epoch is not the current
   * boot (or any touch at all when the boot could not arm) is suspect.
   */
  resolve(threadId: string): RuntimeDurableGapResolution {
    const cached = this.resolutionCache.get(threadId);
    if (cached) {
      this.resolutionCache.delete(threadId);
      this.resolutionCache.set(threadId, cached);
      return cached;
    }
    const sqlite = this.sqlite;
    if (!sqlite || this.bindError !== undefined) {
      return {
        kind: "error",
        error: this.bindError ?? new Error("Runtime durable-gap store is not bound."),
      };
    }
    try {
      const gap = sqlite.prepare(SELECT_GAP_ROW).get(threadId) as
        | {
            reason: string;
            refused_events: number;
            refused_bytes: number;
            epoch: number;
            created_at: number;
            episode_id: string | null;
          }
        | undefined;
      let resolution: RuntimeDurableGapResolution;
      if (gap) {
        resolution = {
          kind: "exact",
          reason: isKnownContaminationReason(gap.reason) ? gap.reason : "degraded",
          refusedEvents: gap.refused_events,
          refusedBytes: gap.refused_bytes,
          epoch: gap.epoch,
          unknownReason: !isKnownContaminationReason(gap.reason),
          episodeId: gap.episode_id,
          createdAt: gap.created_at,
        };
      } else {
        const currentEpoch = this.armed ? this.currentEpoch : this.virtualEpoch;
        const touch = sqlite
          .prepare(SELECT_FOREIGN_TOUCH)
          .get(threadId, currentEpoch, currentEpoch) as
          | { epoch: number; touched_at: number }
          | undefined;
        resolution = touch
          ? { kind: "suspect", epoch: touch.epoch, touchedAt: touch.touched_at }
          : { kind: "clean" };
      }
      this.cacheResolution(threadId, resolution);
      return resolution;
    } catch (error) {
      return { kind: "error", error };
    }
  }

  /**
   * Commit exact gap evidence. One UPSERT per refusal; counts accumulate while
   * the same gap survives, and the first insert allocates the persisted random
   * UUID episode identity that accumulation then preserves. Throws on storage
   * failure (the caller owns the bounded pending obligation).
   */
  persistGap(
    threadId: string,
    reason: RuntimeContaminationReason,
    refusedEvents: number,
    refusedBytes: number,
  ): void {
    const sqlite = this.requireBound();
    const epoch = this.armed ? (this.currentEpoch ?? 0) : (this.virtualEpoch ?? 0);
    withScopedBusyTimeout(sqlite, () => {
      sqlite
        .prepare(
          `INSERT INTO thread_runtime_gaps
             (thread_id, reason, refused_events, refused_bytes, epoch, created_at, episode_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(thread_id) DO UPDATE SET
             reason = excluded.reason,
             refused_events = thread_runtime_gaps.refused_events + excluded.refused_events,
             refused_bytes = thread_runtime_gaps.refused_bytes + excluded.refused_bytes,
             epoch = excluded.epoch`,
        )
        .run(threadId, reason, refusedEvents, refusedBytes, epoch, this.now(), randomUUID());
    });
    this.resolutionCache.delete(threadId);
  }

  /**
   * Clean-close finalize: delete this boot's touches and clear the armed flag in
   * one transaction. No-op when this boot never armed (the prior unclean state
   * must survive a boot that could not itself arm).
   */
  disarmAfterCleanClose(): void {
    if (!this.armed || this.currentEpoch === null) return;
    const sqlite = this.requireBound();
    const epoch = this.currentEpoch;
    withScopedBusyTimeout(sqlite, () => {
      sqlite.transaction(() => {
        sqlite.prepare("DELETE FROM thread_runtime_epoch_touches WHERE epoch = ?").run(epoch);
        sqlite
          .prepare("UPDATE runtime_persistence_epoch SET armed = 0, armed_at = NULL WHERE id = ?")
          .run(EPOCH_ROW_ID);
      })();
    });
    this.armed = false;
    this.currentEpoch = null;
    this.resolutionCache.clear();
    this.touchedThreads.clear();
  }

  /** After an applied authoritative rebase: drop only the derived cache entry. */
  forgetThread(threadId: string): void {
    this.resolutionCache.delete(threadId);
    this.touchedThreads.delete(threadId);
  }

  /** True when the resolution cache currently holds the thread (tests). */
  hasCachedResolution(threadId: string): boolean {
    return this.resolutionCache.has(threadId);
  }

  private cacheResolution(threadId: string, resolution: RuntimeDurableGapResolution): void {
    this.resolutionCache.set(threadId, resolution);
    while (this.resolutionCache.size > this.resolutionCacheMaxEntries) {
      const oldest = this.resolutionCache.keys().next().value;
      if (oldest === undefined) break;
      this.resolutionCache.delete(oldest);
    }
  }

  private requireBound(): InstanceType<typeof Database> {
    if (!this.sqlite || this.bindError !== undefined) {
      throw toError(this.bindError ?? new Error("Runtime durable-gap store is not bound."));
    }
    return this.sqlite;
  }

  private requireArmedEpoch(): number {
    if (!this.armed || this.currentEpoch === null) {
      throw new Error(
        "Runtime durable-gap boot is not armed; a touch requires the root arm first.",
      );
    }
    return this.currentEpoch;
  }
}

/**
 * Join an authoritative-rebase transaction that the caller already owns. Exact
 * gap evidence is always cleared; this boot's touch is preserved when it
 * existed before the transaction so a live producer stays covered (the parent's
 * stronger invariant), while touches from the crashed/older epochs are
 * removed. `currentEpoch` is the runtime owner's armed boot epoch, or null when
 * no boot has armed (clear every touch).
 */
export function clearThreadDurableGapRowsInTransaction(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  currentEpoch: number | null,
): void {
  withScopedBusyTimeout(sqlite, () => {
    sqlite.prepare("DELETE FROM thread_runtime_gaps WHERE thread_id = ?").run(threadId);
    sqlite
      .prepare(
        "DELETE FROM thread_runtime_epoch_touches WHERE thread_id = ? AND (? IS NULL OR epoch != ?)",
      )
      .run(threadId, currentEpoch, currentEpoch);
  });
}

/**
 * Run a durable write with a short scoped busy timeout and restore the
 * connection's previous value. The host is single-threaded and synchronous, so
 * no other writer observes the temporary value; admission can then refuse
 * typed on contention instead of blocking a producer batch for the full
 * connection patience. Exported so the notice/acknowledgement store shares the
 * exact same write-contention policy.
 */
export function withScopedBusyTimeout<T>(
  sqlite: InstanceType<typeof Database>,
  operation: () => T,
): T {
  let previous: number | undefined;
  try {
    const read = sqlite.pragma("busy_timeout", { simple: true });
    previous = typeof read === "number" ? read : undefined;
  } catch {
    previous = undefined;
  }
  try {
    sqlite.pragma("busy_timeout = 0");
    return operation();
  } finally {
    if (previous !== undefined) {
      try {
        sqlite.pragma(`busy_timeout = ${previous}`);
      } catch {
        // The connection is gone; nothing to restore.
      }
    }
  }
}

/**
 * Ownership identity for pending obligations. Same file path (including the
 * in-memory sentinel) is the same durable root: an obligation recorded on one
 * handle may be flushed into a later handle for the same root, but a process-
 * global reserve must never write one root's obligation into another root that
 * happens to reuse a thread id.
 */
export function identityOfRuntimeDatabase(sqlite: InstanceType<typeof Database>): unknown {
  const name = (sqlite as { name?: unknown }).name;
  return typeof name === "string" && name.length > 0 ? name : sqlite;
}
