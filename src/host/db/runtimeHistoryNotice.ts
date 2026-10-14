import type Database from "better-sqlite3";
import {
  isRuntimeHistoryEpisodeId,
  parseRuntimeHistoryNoticeToken,
  runtimeHistoryNoticeExactToken,
  runtimeHistoryNoticeSuspectToken,
  runtimeHistoryNoticeTokensEqual,
  type RuntimeHistoryGapAcknowledgeResult,
  type RuntimeHistoryGapDescriptor,
  type RuntimeHistoryNotice,
  type RuntimeHistoryNoticeLookup,
  type RuntimeHistoryNoticeSource,
} from "@/shared/runtimeHistoryNotice";
import {
  isKnownContaminationReason,
  withScopedBusyTimeout,
  type RuntimeDurableGapResolution,
} from "./runtimeDurableGap";
import {
  RuntimePersistenceDurableStateUnavailableError,
  RuntimePersistenceGapIdentityError,
} from "./runtimePersistenceTypes";

/**
 * Cohesive notice/acknowledgement half of the B1 durable-gap evidence: the
 * read-only descriptor and notice projections, the single synchronous
 * acknowledgement transaction, and the bounded derived notice-lookup cache
 * used by live/replay scoping.
 *
 * The boot-generation half (arm/touch/persistGap) stays in
 * `runtimeDurableGap.ts`; this module never arms and never touches. It reads
 * the current episode through the injected `resolve` port (the same ordering
 * the admission path uses) and, for the acknowledgement precondition, compares
 * the opaque exact/suspect token before any write.
 *
 * Acknowledgement transaction (one synchronous SQL transaction):
 * - exact token: `DELETE FROM thread_runtime_gaps WHERE thread_id AND
 *   episode_id` — exactly one row, else the whole transaction rolls back;
 * - suspect token: asserts no exact gap row appeared after the precondition;
 * - both: `DELETE FROM thread_runtime_epoch_touches WHERE thread_id AND epoch
 *   != <current boot epoch>` — the current boot's touch is preserved so a live
 *   producer stays covered;
 * - upsert the one-row-per-thread notice, accumulating counters (refused
 *   evidence plus folded pending-obligation and accepted-superseded counts).
 * No statement in this module can touch `thread_runtime_items`: committed
 * transcript bytes are never rewritten by an acknowledgement.
 *
 * The lookup cache is a bounded LRU of derived positive/negative lookups tied
 * to this store instance (and therefore to the bound database identity, since
 * every bind constructs a new store). Eviction, deletion, ack, and database
 * rebinding invalidate entries; a miss always re-queries the durable notice
 * table, so the cache can over-warn but can never produce a false clean answer.
 */

export const RUNTIME_HISTORY_NOTICE_LOOKUP_CACHE_MAX_ENTRIES = 4_096;

export interface RuntimeHistoryNoticeStoreOptions {
  now(): number;
  /** Current armed boot epoch, or null when this connection never armed. */
  currentEpoch(): number | null;
  /** Bounded read-only resolution over the gap/touch evidence. */
  resolve(threadId: string): RuntimeDurableGapResolution;
  /** Drop the shared derived resolution cache (stale after a rolled-back ack). */
  invalidateResolution(threadId: string): void;
  lookupCacheMaxEntries?: number;
}

export type { RuntimeHistoryNoticeLookup };

export interface RuntimeHistoryGapAcknowledgeExtras {
  /**
   * Pending (not yet durable) exact-gap obligation counts for this thread,
   * folded into the notice counters so the notice never undercounts loss.
   */
  pendingEvents: number;
  pendingBytes: number;
  /**
   * Accepted-but-uncommitted canonical events superseded by this applied
   * acknowledgement (counted before the transaction, discarded after it).
   */
  acceptedEvents: number;
  acceptedBytes: number;
}

interface NoticeRow {
  acknowledged_token: string;
  source: string;
  reason: string;
  refused_events: number;
  refused_bytes: number;
  acknowledged_count: number;
  first_acknowledged_at: number;
  last_acknowledged_at: number;
}

const SELECT_NOTICE_ROW =
  "SELECT acknowledged_token, source, reason, refused_events, refused_bytes, acknowledged_count, first_acknowledged_at, last_acknowledged_at FROM thread_runtime_gap_notices WHERE thread_id = ?";
const SELECT_NOTICE_EXISTS = "SELECT 1 AS ok FROM thread_runtime_gap_notices WHERE thread_id = ?";
const SELECT_GAP_EXISTS = "SELECT 1 AS ok FROM thread_runtime_gaps WHERE thread_id = ?";
const DELETE_GAP_BY_EPISODE =
  "DELETE FROM thread_runtime_gaps WHERE thread_id = ? AND episode_id = ?";
const DELETE_FOREIGN_TOUCHES =
  "DELETE FROM thread_runtime_epoch_touches WHERE thread_id = ? AND epoch != ?";
const UPSERT_NOTICE = `INSERT INTO thread_runtime_gap_notices
     (thread_id, acknowledged_token, source, reason, refused_events, refused_bytes,
      acknowledged_count, first_acknowledged_at, last_acknowledged_at)
   VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
 ON CONFLICT(thread_id) DO UPDATE SET
   acknowledged_token = excluded.acknowledged_token,
   source = excluded.source,
   reason = excluded.reason,
   refused_events = thread_runtime_gap_notices.refused_events + excluded.refused_events,
   refused_bytes = thread_runtime_gap_notices.refused_bytes + excluded.refused_bytes,
   acknowledged_count = thread_runtime_gap_notices.acknowledged_count + 1,
   last_acknowledged_at = excluded.last_acknowledged_at`;

/** Internal rollback signal for the (single-threaded) episode-change guard. */
class EpisodeChangedRollback extends Error {}

export class RuntimeHistoryNoticeStore {
  private readonly options: RuntimeHistoryNoticeStoreOptions;
  private readonly lookupCache = new Map<string, boolean>();
  private readonly lookupCacheMaxEntries: number;

  constructor(
    private readonly sqlite: InstanceType<typeof Database>,
    options: RuntimeHistoryNoticeStoreOptions,
  ) {
    this.options = options;
    this.lookupCacheMaxEntries =
      options.lookupCacheMaxEntries ?? RUNTIME_HISTORY_NOTICE_LOOKUP_CACHE_MAX_ENTRIES;
  }

  /**
   * Ordinary SELECT-only descriptor read of the current unacknowledged
   * episode, or `null` when the thread is clean. Missing/malformed persisted
   * identity refuses typed instead of minting a token.
   */
  readDescriptor(threadId: string): RuntimeHistoryGapDescriptor | null {
    const resolution = this.options.resolve(threadId);
    if (resolution.kind === "error") {
      throw new RuntimePersistenceDurableStateUnavailableError(
        threadId,
        "gap-descriptor",
        resolution.error,
      );
    }
    if (resolution.kind === "clean") return null;
    if (resolution.kind === "exact") {
      if (!isRuntimeHistoryEpisodeId(resolution.episodeId)) {
        throw new RuntimePersistenceGapIdentityError(
          threadId,
          "the persisted gap row has no valid episode UUID",
        );
      }
      return {
        threadId,
        token: runtimeHistoryNoticeExactToken(resolution.episodeId),
        source: "exact",
        reason: resolution.reason,
        refusedEvents: resolution.refusedEvents,
        refusedBytes: resolution.refusedBytes,
        createdAt: resolution.createdAt,
      };
    }
    return {
      threadId,
      token: runtimeHistoryNoticeSuspectToken(resolution.epoch),
      source: "suspect",
      reason: "unclean-epoch",
      refusedEvents: 0,
      refusedBytes: 0,
      createdAt: resolution.touchedAt,
    };
  }

  /** Ordinary SELECT-only notice read; one row per thread. */
  readNotice(threadId: string): RuntimeHistoryNotice | null {
    const row = this.sqlite.prepare(SELECT_NOTICE_ROW).get(threadId) as NoticeRow | undefined;
    if (!row) return null;
    return this.noticeFromRow(threadId, row);
  }

  /**
   * Bounded derived lookup for live/replay scoping. A cache miss re-queries the
   * durable notice table; a read failure is returned as `error` so the caller
   * can fail closed (treat as notice) instead of assuming clean.
   */
  lookupNotice(threadId: string): RuntimeHistoryNoticeLookup {
    const cached = this.lookupCache.get(threadId);
    if (cached !== undefined) {
      this.lookupCache.delete(threadId);
      this.lookupCache.set(threadId, cached);
      return cached ? { kind: "notice" } : { kind: "clean" };
    }
    try {
      const row = this.sqlite.prepare(SELECT_NOTICE_EXISTS).get(threadId);
      const hasNotice = row !== undefined;
      this.cacheLookup(threadId, hasNotice);
      return hasNotice ? { kind: "notice" } : { kind: "clean" };
    } catch (error) {
      return { kind: "error", error };
    }
  }

  /** Drop one derived lookup (delete/cascade/rebase re-reads the durable row). */
  invalidateNotice(threadId: string): void {
    this.lookupCache.delete(threadId);
  }

  /** Drop every derived lookup (sync/bulk change/rebind). */
  invalidateAllNotices(): void {
    this.lookupCache.clear();
  }

  /**
   * One synchronous acknowledgement transaction. Never partially applies:
   * `already`/`stale` and any SQL failure return or throw with zero writes and
   * zero derived-cache changes, so the caller cannot discard in-memory state
   * for an acknowledgement that did not commit.
   */
  acknowledge(
    threadId: string,
    requestedToken: string,
    extras: RuntimeHistoryGapAcknowledgeExtras,
  ): RuntimeHistoryGapAcknowledgeResult {
    const currentEpoch = this.options.currentEpoch();
    if (currentEpoch === null) {
      // Fail closed: an unarmed connection cannot preserve "the current boot's
      // touch" and must not write acknowledgement state.
      throw new RuntimePersistenceDurableStateUnavailableError(threadId, "acknowledge");
    }
    const existing = this.readNotice(threadId);
    // Idempotent retry: the stored token is the ack this request replays. It
    // wins over the current episode so a later episode B is never disturbed by
    // a retry of A. Compared by normalized identity, not raw bytes.
    if (existing && runtimeHistoryNoticeTokensEqual(existing.acknowledgedToken, requestedToken)) {
      return { outcome: "already", notice: existing };
    }
    const descriptor = this.readDescriptor(threadId);
    const requested = parseRuntimeHistoryNoticeToken(requestedToken);
    if (
      !requested ||
      descriptor === null ||
      !runtimeHistoryNoticeTokensEqual(descriptor.token, requestedToken)
    ) {
      return { outcome: "stale", current: descriptor };
    }
    const now = this.options.now();
    const refusedEvents = descriptor.refusedEvents + extras.pendingEvents + extras.acceptedEvents;
    const refusedBytes = descriptor.refusedBytes + extras.pendingBytes + extras.acceptedBytes;
    let notice: RuntimeHistoryNotice;
    try {
      notice = withScopedBusyTimeout(this.sqlite, () =>
        this.sqlite.transaction(() => {
          if (descriptor.source === "exact") {
            if (requested.kind !== "exact") throw new EpisodeChangedRollback();
            const deleted = this.sqlite
              .prepare(DELETE_GAP_BY_EPISODE)
              .run(threadId, requested.episodeId).changes;
            if (deleted !== 1) throw new EpisodeChangedRollback();
          } else if (this.sqlite.prepare(SELECT_GAP_EXISTS).get(threadId) !== undefined) {
            throw new EpisodeChangedRollback();
          }
          this.sqlite.prepare(DELETE_FOREIGN_TOUCHES).run(threadId, currentEpoch);
          this.sqlite
            .prepare(UPSERT_NOTICE)
            .run(
              threadId,
              descriptor.token,
              descriptor.source,
              descriptor.reason,
              refusedEvents,
              refusedBytes,
              now,
              now,
            );
          const row = this.sqlite.prepare(SELECT_NOTICE_ROW).get(threadId) as NoticeRow;
          return this.noticeFromRow(threadId, row);
        })(),
      );
    } catch (error) {
      if (error instanceof EpisodeChangedRollback) {
        this.options.invalidateResolution(threadId);
        return { outcome: "stale", current: this.readDescriptor(threadId) };
      }
      throw error;
    }
    this.cacheLookup(threadId, true);
    return {
      outcome: "applied",
      notice,
      descriptor,
      supersededAcceptedEvents: extras.acceptedEvents,
    };
  }

  /** The current derived-cache size (tests/diagnostics). */
  lookupCacheSize(): number {
    return this.lookupCache.size;
  }

  private noticeFromRow(threadId: string, row: NoticeRow): RuntimeHistoryNotice {
    const parsed = parseRuntimeHistoryNoticeToken(row.acknowledged_token);
    if (!parsed) {
      throw new RuntimePersistenceGapIdentityError(
        threadId,
        "the persisted notice token does not decode",
      );
    }
    if (row.source !== "exact" && row.source !== "suspect") {
      throw new RuntimePersistenceGapIdentityError(
        threadId,
        `the persisted notice source "${row.source}" is not a known source`,
      );
    }
    return {
      threadId,
      acknowledgedToken: row.acknowledged_token,
      source: row.source as RuntimeHistoryNoticeSource,
      reason: isKnownContaminationReason(row.reason) ? row.reason : "degraded",
      refusedEvents: row.refused_events,
      refusedBytes: row.refused_bytes,
      acknowledgedCount: row.acknowledged_count,
      firstAcknowledgedAt: row.first_acknowledged_at,
      lastAcknowledgedAt: row.last_acknowledged_at,
    };
  }

  private cacheLookup(threadId: string, hasNotice: boolean): void {
    this.lookupCache.delete(threadId);
    this.lookupCache.set(threadId, hasNotice);
    while (this.lookupCache.size > this.lookupCacheMaxEntries) {
      const oldest = this.lookupCache.keys().next().value;
      if (oldest === undefined) break;
      this.lookupCache.delete(oldest);
    }
  }
}
