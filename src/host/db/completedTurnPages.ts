import type { PersistedCompletedTurn } from "./runtimeItems";
import {
  CATALOG_JSON_BOUND_FACTOR,
  HISTORY_COMPLETED_TURNS_MAX_LIMIT,
  HISTORY_TURN_ROW_ENVELOPE_BYTES,
} from "@/shared/remote/historyReadContract";
import { escapedUnitsLowerBound } from "@/shared/remote/catalogReadContract";
import { getSqlite } from "./connection";

/**
 * B4 bounded completed-turn reads.
 *
 * Completed turns are small control-plane rows keyed by `(thread_id, idx)`;
 * the continuation cursor is the exact `idx`, so a page never needs an
 * anchor-position association and turns without an `anchor_item_id` are
 * returned like any other. Phase 1 reads metadata plus SQLite-computed text
 * byte lengths (no row text into JS) so the page builder can pack by bytes;
 * phase 2 fetches exactly the packed indices.
 *
 * `idx` is renumbered by `replaceThreadCompletedTurnsInSqlite` (snapshot
 * replace) and turns are removed by truncate; the cursor is therefore only
 * meaningful against the committed turn rows at read time. A stale cursor can
 * return a truthful current page or an empty page, never a fabricated one.
 */

export interface CompletedTurnRowMeta {
  readonly idx: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly anchorItemId: string | null;
  /** Conservative serialized wire bound including the per-row envelope. */
  readonly boundWireBytes: number;
  /** Sound lower bound: the exact escaped literals of the three text fields,
   * all emitted verbatim by the turn wire schema. Never exceeds the row. */
  readonly lowerBoundWireBytes: number;
  /** Sound lower bound of `2 × serialized.length` for the same literals. */
  readonly lowerBoundDecodeBytes: number;
}

export interface DbCompletedTurnPhase1Query {
  /** Newest-first window size (1–500). */
  readonly limit: number;
  /** Exclusive upper bound: return turns with `idx < beforeIdx`. */
  readonly beforeIdx?: number;
}

export interface DbCompletedTurnPhase1Page {
  /** Newest-first candidate turns (`idx` DESC). */
  readonly rows: readonly CompletedTurnRowMeta[];
  /** True when a turn older than the returned candidate set exists. */
  readonly moreBeyondWindow: boolean;
}

interface CompletedTurnSqlRow {
  idx: number;
  started_at: string;
  ended_at: string;
  anchor_item_id: string | null;
  text_bytes: number;
  lower_wire: number | null;
  lower_cps: number | null;
}

function turnEscapedBytes(column: string): string {
  return (
    `CASE WHEN ${column} IS NULL OR ${column} = '' THEN 0 ` +
    `ELSE length(CAST(json_quote(${column}) AS BLOB)) END`
  );
}

function turnEscapedCodePoints(column: string): string {
  return `CASE WHEN ${column} IS NULL OR ${column} = '' THEN 0 ELSE length(json_quote(${column})) END`;
}

const TURN_LOWER_WIRE = `(${turnEscapedBytes("started_at")} + ${turnEscapedBytes("ended_at")} + ${turnEscapedBytes("anchor_item_id")})`;
const TURN_LOWER_CODE_POINTS = `(${turnEscapedCodePoints("started_at")} + ${turnEscapedCodePoints("ended_at")} + ${turnEscapedCodePoints("anchor_item_id")})`;

function assertPhase1Query(query: DbCompletedTurnPhase1Query): void {
  if (
    !Number.isSafeInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > HISTORY_COMPLETED_TURNS_MAX_LIMIT
  ) {
    throw new Error(
      `Completed-turn page limit must be an integer between 1 and ${HISTORY_COMPLETED_TURNS_MAX_LIMIT}.`,
    );
  }
  if (
    query.beforeIdx !== undefined &&
    (!Number.isSafeInteger(query.beforeIdx) || query.beforeIdx < 0)
  ) {
    throw new Error("Completed-turn cursor index must be a nonnegative integer.");
  }
}

/** Phase 1: newest-first metadata + exact text byte lengths. */
export function dbReadCompletedTurnPhase1(
  threadId: string,
  query: DbCompletedTurnPhase1Query,
): DbCompletedTurnPhase1Page {
  assertPhase1Query(query);
  const sqlite = getSqlite();
  const textByteSum = `length(CAST(COALESCE(started_at, '') AS BLOB)) +
     length(CAST(COALESCE(ended_at, '') AS BLOB)) +
     length(CAST(COALESCE(anchor_item_id, '') AS BLOB))`;
  const window = (
    query.beforeIdx === undefined
      ? sqlite
          .prepare(
            `SELECT idx, started_at, ended_at, anchor_item_id,
                    ${textByteSum} AS text_bytes,
                    ${TURN_LOWER_WIRE} AS lower_wire,
                    ${TURN_LOWER_CODE_POINTS} AS lower_cps
             FROM thread_completed_turns
             WHERE thread_id = ?
             ORDER BY idx DESC
             LIMIT ?`,
          )
          .all(threadId, query.limit + 1)
      : sqlite
          .prepare(
            `SELECT idx, started_at, ended_at, anchor_item_id,
                    ${textByteSum} AS text_bytes,
                    ${TURN_LOWER_WIRE} AS lower_wire,
                    ${TURN_LOWER_CODE_POINTS} AS lower_cps
             FROM thread_completed_turns
             WHERE thread_id = ? AND idx < ?
             ORDER BY idx DESC
             LIMIT ?`,
          )
          .all(threadId, query.beforeIdx, query.limit + 1)
  ) as CompletedTurnSqlRow[];
  return {
    rows: window.slice(0, query.limit).map((row) => {
      const lowerBoundWireBytes = Number(row.lower_wire ?? 0);
      const lowerBoundCodePoints = Number(row.lower_cps ?? 0);
      return {
        idx: row.idx,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        anchorItemId: row.anchor_item_id,
        boundWireBytes:
          HISTORY_TURN_ROW_ENVELOPE_BYTES + CATALOG_JSON_BOUND_FACTOR * Number(row.text_bytes),
        lowerBoundWireBytes,
        lowerBoundDecodeBytes:
          escapedUnitsLowerBound(lowerBoundCodePoints, lowerBoundWireBytes) * 2,
      };
    }),
    moreBeyondWindow: window.length > query.limit,
  };
}

/** Materialized turn row; `idx` is stripped by the wire schema before emit. */
export interface MaterializedCompletedTurn extends PersistedCompletedTurn {
  readonly idx: number;
}

/** Phase 2: fetch exactly the packed indices and restore the requested order. */
export function dbReadCompletedTurnPhase2(
  threadId: string,
  indices: readonly number[],
): MaterializedCompletedTurn[] {
  if (indices.length === 0) return [];
  const sqlite = getSqlite();
  const byIdx = new Map<number, CompletedTurnSqlRow>();
  for (let start = 0; start < indices.length; start += 500) {
    const chunk = indices.slice(start, start + 500);
    const marks = chunk.map(() => "?").join(", ");
    const rows = sqlite
      .prepare(
        `SELECT idx, started_at, ended_at, anchor_item_id, 0 AS text_bytes,
                NULL AS lower_wire, NULL AS lower_cps
         FROM thread_completed_turns
         WHERE thread_id = ? AND idx IN (${marks})`,
      )
      .all(threadId, ...chunk) as CompletedTurnSqlRow[];
    for (const row of rows) byIdx.set(row.idx, row);
  }
  return indices.flatMap((idx) => {
    const row = byIdx.get(idx);
    return row
      ? [
          {
            idx: row.idx,
            startedAt: row.started_at,
            endedAt: row.ended_at,
            anchorItemId: row.anchor_item_id,
          },
        ]
      : [];
  });
}
