/**
 * B1 GUI durable-gap recovery: the node-free wire vocabulary for a durable
 * thread-level history-incomplete notice and its explicit acknowledgement.
 *
 * This module is imported by the host database layer and (later) by the remote
 * contract, the renderer clients, and iOS/Android: it must stay free of Node
 * builtins and of any database import. The host stores the durable rows; the
 * token is the opaque identity a client echoes back to acknowledge.
 *
 * Token versioning: the `gap2:` prefix is a wire generation. A future identity
 * revision mints `gap3:` and every reader refuses unknown prefixes instead of
 * guessing; a token is never re-derived from mutable state (no timestamp, no
 * count, no self-assembled hash).
 *
 * Sources:
 * - `exact`: a persisted `thread_runtime_gaps` row with a persisted random
 *   UUID episode identity (`gap2:e<uuid>`).
 * - `suspect`: a surviving epoch touch from a boot that did not cleanly close
 *   (`gap2:s<foreignEpoch>`); a boot epoch never re-arms to the same value in
 *   one database lineage.
 */

/**
 * Contamination reason vocabulary mirrored by the host persistence types and
 * the remote contract schema. This tuple is the ONE source: the type is
 * derived from it, the host's persisted-reason parser builds its runtime set
 * from it, and the wire schema enumerates it. Adding a reason here is
 * therefore exhaustive in all three places by construction.
 *
 * Kept here so the wire/client side can render a refusal without importing
 * the host database module. Unknown persisted reasons coerce to `"degraded"`
 * at the host boundary; readers never see a value outside this union.
 */
export const RUNTIME_HISTORY_NOTICE_REASONS = [
  "thread-events",
  "thread-bytes",
  "global-events",
  "global-bytes",
  "oversize",
  "age",
  "degraded",
  "rebase-dropped",
  "shutdown",
  "unclean-epoch",
] as const;

export type RuntimeHistoryNoticeReason = (typeof RUNTIME_HISTORY_NOTICE_REASONS)[number];

/** True for a reason this generation can render (persisted values may predate it). */
export function isRuntimeHistoryNoticeReason(value: unknown): value is RuntimeHistoryNoticeReason {
  return (
    typeof value === "string" &&
    (RUNTIME_HISTORY_NOTICE_REASONS as readonly string[]).includes(value)
  );
}

export type RuntimeHistoryNoticeSource = "exact" | "suspect";

/**
 * Bounded notice-existence lookup for live/replay scoping. `clean` is the only
 * value that lets canonical content through; `error` (a failed lookup, an
 * unbound store, or a malformed persisted token) MUST fail closed and be
 * treated as a notice.
 */
export type RuntimeHistoryNoticeLookup =
  | { kind: "notice" }
  | { kind: "clean" }
  | { kind: "error"; error: unknown };

export const RUNTIME_HISTORY_NOTICE_TOKEN_PREFIX = "gap2:";
export const RUNTIME_HISTORY_NOTICE_EXACT_TOKEN_PREFIX = "gap2:e";
export const RUNTIME_HISTORY_NOTICE_SUSPECT_TOKEN_PREFIX = "gap2:s";

const EPISODE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EPOCH_PATTERN = /^(0|[1-9]\d*)$/;

/** True for a persisted random UUID episode identity (case-insensitive). */
export function isRuntimeHistoryEpisodeId(value: unknown): value is string {
  return typeof value === "string" && EPISODE_ID_PATTERN.test(value);
}

/** Opaque exact-episode token: `gap2:e<episodeUuid>`. */
export function runtimeHistoryNoticeExactToken(episodeId: string): string {
  if (!isRuntimeHistoryEpisodeId(episodeId)) {
    throw new Error(`Runtime history episode identity is not a UUID: "${String(episodeId)}".`);
  }
  return `${RUNTIME_HISTORY_NOTICE_EXACT_TOKEN_PREFIX}${episodeId.toLowerCase()}`;
}

/** Opaque suspect-episode token: `gap2:s<foreignBootEpoch>`. */
export function runtimeHistoryNoticeSuspectToken(epoch: number): string {
  if (!Number.isSafeInteger(epoch) || epoch < 0) {
    throw new Error(`Runtime history suspect epoch is not a non-negative integer: ${epoch}.`);
  }
  return `${RUNTIME_HISTORY_NOTICE_SUSPECT_TOKEN_PREFIX}${epoch}`;
}

export type RuntimeHistoryNoticeParsedToken =
  | { kind: "exact"; episodeId: string }
  | { kind: "suspect"; epoch: number };

/**
 * Strict, fail-closed token parse. A malformed, unknown-version, or missing
 * token returns `null`; callers refuse instead of matching anything.
 */
export function parseRuntimeHistoryNoticeToken(
  token: unknown,
): RuntimeHistoryNoticeParsedToken | null {
  if (typeof token !== "string" || !token.startsWith(RUNTIME_HISTORY_NOTICE_TOKEN_PREFIX)) {
    return null;
  }
  const body = token.slice(RUNTIME_HISTORY_NOTICE_TOKEN_PREFIX.length);
  if (body.startsWith("e")) {
    const episodeId = body.slice(1);
    return isRuntimeHistoryEpisodeId(episodeId)
      ? { kind: "exact", episodeId: episodeId.toLowerCase() }
      : null;
  }
  if (body.startsWith("s")) {
    const raw = body.slice(1);
    if (!EPOCH_PATTERN.test(raw)) return null;
    const epoch = Number(raw);
    return Number.isSafeInteger(epoch) ? { kind: "suspect", epoch } : null;
  }
  return null;
}

/**
 * Normalized token equality: two spellings of the same episode match (exact
 * UUID case-insensitively, suspect epoch numerically), while malformed or
 * different-kind tokens never match. Idempotence compares identities, not the
 * exact bytes a client echoed.
 */
export function runtimeHistoryNoticeTokensEqual(a: unknown, b: unknown): boolean {
  const left = parseRuntimeHistoryNoticeToken(a);
  const right = parseRuntimeHistoryNoticeToken(b);
  if (!left || !right || left.kind !== right.kind) return false;
  return left.kind === "exact"
    ? left.episodeId === (right as { episodeId: string }).episodeId
    : left.epoch === (right as { epoch: number }).epoch;
}

/**
 * The current unacknowledged episode of one thread, as read by an ordinary
 * SELECT-only descriptor read. `token` is the opaque precondition a client
 * echoes to acknowledge this exact episode.
 */
export interface RuntimeHistoryGapDescriptor {
  threadId: string;
  token: string;
  source: RuntimeHistoryNoticeSource;
  reason: RuntimeHistoryNoticeReason;
  refusedEvents: number;
  refusedBytes: number;
  /** Episode open time (exact gap `created_at` or suspect touch `touched_at`). */
  createdAt: number;
}

/**
 * The durable thread-level history-incomplete notice: exactly one row per
 * thread. It survives normal turns, rebase, and truncation; only thread (or
 * project) deletion removes it. `refusedEvents`/`refusedBytes` are cumulative
 * lower bounds of lost canonical events: they include folded pending refusal
 * obligations and accepted-but-uncommitted events superseded by the
 * acknowledgement, and are exact only at each acknowledgement's delete time.
 */
export interface RuntimeHistoryNotice {
  threadId: string;
  /** The token of the most recently acknowledged episode (idempotence key). */
  acknowledgedToken: string;
  source: RuntimeHistoryNoticeSource;
  reason: RuntimeHistoryNoticeReason;
  refusedEvents: number;
  refusedBytes: number;
  /** How many episodes were acknowledged on this thread. */
  acknowledgedCount: number;
  firstAcknowledgedAt: number;
  lastAcknowledgedAt: number;
}

/**
 * Idempotence outcomes for an acknowledgement. `applied` means the notice was
 * recorded and the matching gap evidence cleared in one transaction (the
 * caller then supersedes its in-memory accepted prefix); `already` is a retry
 * of the notice's stored token (zero writes); `stale` means the requested
 * token does not match the current durable episode (zero writes, `current` is
 * the truthful state, `null` when the thread is clean).
 */
export type RuntimeHistoryGapAcknowledgeResult =
  | {
      outcome: "applied";
      notice: RuntimeHistoryNotice;
      /** The acknowledged episode descriptor (identity frozen at delete time). */
      descriptor: RuntimeHistoryGapDescriptor;
      /** Accepted-but-uncommitted events superseded by this acknowledgement. */
      supersededAcceptedEvents: number;
    }
  | { outcome: "already"; notice: RuntimeHistoryNotice }
  | { outcome: "stale"; current: RuntimeHistoryGapDescriptor | null };
