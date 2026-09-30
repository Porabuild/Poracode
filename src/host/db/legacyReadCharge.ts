import type Database from "better-sqlite3";
import { getSqlite } from "./connection";
import { THREAD_PAGE_ORDER_SQL } from "./projectsThreads";
import {
  LEGACY_RUNTIME_PAGE_LIMIT,
  LEGACY_RUNTIME_PAGE_TARGET_ENTRIES,
} from "./runtimeTimelineReads";

/**
 * B4 legacy bulk-read pre-check charges (H1).
 *
 * Each function measures the **parsed request selection**, not the whole table
 * by default: the stored UTF-8 byte length of the values the legacy reader
 * materializes for that request. The number is a **resource reservation** — a
 * sound lower bound on the data the read must load — and never a claim about
 * the serialized response size or the JS heap size. It is used only to refuse
 * reads whose reservation already exceeds
 * {@link LEGACY_READ_RESERVATION_MAX_BYTES} before anything is materialized;
 * ordinary legacy catalogs/histories return complete responses.
 *
 * Snapshot selection (`buildShellSnapshot`):
 *
 * - `projects` are always read with `SELECT *` for every row the response
 *   carries, so the full table stays charged for every variant.
 * - `threads` are charged for the exact `dbGetThreadsPage` window when the
 *   request carries a `threadLimit`: the first `limit` rows plus the single
 *   lookahead row better-sqlite3 materializes (`LIMIT limit + 1`, ordered by
 *   {@link THREAD_PAGE_ORDER_SQL}). Rows past the lookahead are never loaded,
 *   so a huge value on an unselected row cannot refuse the read. Without
 *   `threadLimit` the full `dbGetThreads` table is charged.
 * - Because the readers issue `SELECT *`, the column set is read from the live
 *   table projection (`PRAGMA table_info`): columns no row mapper reads
 *   (`threads.terminal_prompt`) and columns a mapper exposes only when set
 *   (`projects.icon`) are all charged, so the charge cannot drift from the
 *   schema.
 *
 * History selection (`buildThreadSnapshot`):
 *
 * - Without `runtimePage=1` every item and every appended stream tail of the
 *   thread is charged (`dbReadThreadRuntimeItems`).
 * - With `runtimePage=1` the reader pages the newest items: the first SQL
 *   window materializes the newest `LEGACY_RUNTIME_PAGE_LIMIT + 1` item rows
 *   (page + lookahead), and the selection always pushes at least
 *   `min(total, target)` newest rows into the returned page (a timeline entry
 *   is at most one row, and a target reached inside a group run only extends
 *   the page forward). The item projection is charged for the window rows and
 *   the appended stream tails only for that guaranteed `target` prefix;
 *   `parent_item_id` is part of the item projection.
 * - Completed turns are always read in full (`dbGetThreadCompletedTurns`) in
 *   both variants, so they stay fully charged.
 * - The stored terminal scrollback is charged unless `omitScrollback=1`: the
 *   builder never reads the transcript once explicitly omitted, but without
 *   the flag it falls back to `dbGetThreadTerminalScrollback`.
 * - The per-thread context-usage row is charged.
 *
 * Deliberately outside the reservation (a lower bound may omit; it must never
 * overstate): the page reader's metadata-only distinct `parent_item_id` scan
 * and its classification probes (they retain key metadata, not row payload
 * text; charging them would restore whole-thread costing for the `runtimePage`
 * variant), the single-row reads (the thread row and the `runtimePage`
 * variant's latest-goal row, which may also already be inside the charged
 * window), and the snapshot's bounded per-thread summaries scan.
 *
 * Numeric storage classes contribute zero: they carry no variable-length
 * stored text, so the driver materializes them as JS numbers rather than
 * retained strings. Only variable-length values are charged.
 *
 * All measurements are plain committed reads (no fence, no transaction held
 * across requests), done in SQLite so no column text crosses into JS.
 */

export interface LegacySnapshotCharge {
  readonly threadsStoredBytes: number;
  readonly projectsStoredBytes: number;
}

export interface LegacyHistoryCharge {
  readonly itemsStoredBytes: number;
  readonly streamTailStoredBytes: number;
  readonly completedTurnsStoredBytes: number;
  readonly scrollbackStoredBytes: number;
  readonly contextUsageStoredBytes: number;
}

/**
 * Selection of the legacy shell snapshot. `threadListLimit` mirrors the
 * handler's parsed `threadLimit`; absent means the unbounded full-list variant
 * (`dbGetThreads`).
 */
export interface LegacySnapshotChargeOptions {
  readonly threadListLimit?: number;
}

/**
 * Selection of the legacy thread history. `runtimePage` mirrors `runtimePage=1`
 * (page the newest item tail instead of every item), `omitScrollback` mirrors
 * `omitScrollback=1` (the builder never reads the stored transcript), and
 * `targetTimelineEntryCount` is the parsed `targetTimelineEntryCount` (the page
 * reader's default applies when absent).
 */
export interface LegacyHistoryChargeOptions {
  readonly runtimePage?: boolean;
  readonly omitScrollback?: boolean;
  readonly targetTimelineEntryCount?: number;
}

type SqliteDatabase = InstanceType<typeof Database>;

/**
 * Stored bytes of one materialized value: `0` for NULL and for numeric storage
 * classes (no retained text), otherwise the exact byte length of the value.
 */
function storedByteTerm(column: string): string {
  return (
    `CASE WHEN typeof(${column}) IN ('integer', 'real') THEN 0 ` +
    `ELSE length(CAST(COALESCE(${column}, '') AS BLOB)) END`
  );
}

function storedByteSum(columns: readonly string[]): string {
  return columns.map(storedByteTerm).join(" + ");
}

/** Schema-owned identifiers; quoted so a reserved word cannot break the SQL. */
function quotedIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableProjectionColumns(sqlite: SqliteDatabase, table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.length === 0) {
    throw new Error(`Table ${table} has no columns; the legacy read charge cannot be measured.`);
  }
  return rows.map((row) => quotedIdentifier(row.name));
}

function scalarBytes(sqlite: SqliteDatabase, sql: string, ...params: (string | number)[]): number {
  const row = sqlite.prepare(sql).get(...params) as { bytes: number | null } | undefined;
  return Number(row?.bytes ?? 0);
}

/**
 * The number of thread rows `dbGetThreadsPage` materializes for a page: the
 * requested page plus its one lookahead row. A caller-supplied value outside
 * the validated 1–200 range is clamped to the first row so a bad direct call
 * can never turn into a whole-table charge.
 */
function threadPageMaterializedRows(limit: number): number {
  return Number.isSafeInteger(limit) && limit >= 0 ? limit + 1 : 1;
}

/**
 * The guaranteed selected-row prefix of the `runtimePage` selection: the
 * selection pushes at least `min(total, target)` newest rows into the page, and
 * `mapRuntimeItemRows` reads their appended stream tails. A caller-supplied
 * value outside the validated 1–100 range charges no tails.
 */
function runtimePageTailRows(target: number | undefined): number {
  const resolved = target ?? LEGACY_RUNTIME_PAGE_TARGET_ENTRIES;
  return Number.isSafeInteger(resolved) && resolved > 0 ? resolved : 0;
}

const ITEM_PROJECTION = ["item_id", "type", "state", "payload", "streams", "parent_item_id"];
const STREAM_CHUNK_PROJECTION = ["item_id", "stream", "text"];
const STREAM_STATE_KEY_PROJECTION = ["item_id", "stream"];
const COMPLETED_TURN_PROJECTION = ["started_at", "ended_at", "anchor_item_id"];

function itemBytesTerm(): string {
  return storedByteSum(ITEM_PROJECTION.map(quotedIdentifier));
}

function streamChunkBytesTerm(): string {
  return storedByteSum(STREAM_CHUNK_PROJECTION.map(quotedIdentifier));
}

function streamStateKeyBytesTerm(): string {
  return storedByteSum(STREAM_STATE_KEY_PROJECTION.map(quotedIdentifier));
}

function completedTurnBytesTerm(): string {
  return storedByteSum(COMPLETED_TURN_PROJECTION.map(quotedIdentifier));
}

/** `SELECT item_id` subquery for the newest `LIMIT` rows of one thread. */
const NEWEST_ITEM_IDS_SQL = `SELECT item_id FROM thread_runtime_items
   WHERE thread_id = ? ORDER BY position DESC LIMIT ?`;

/**
 * Stored bytes of the legacy shell snapshot selection. `projects` are always
 * the full `SELECT *` table (`buildShellSnapshot` always calls
 * `dbGetProjects()`); `threads` follow the `threadLimit` page window above.
 */
export function dbMeasureLegacySnapshotCharge(
  options: LegacySnapshotChargeOptions = {},
): LegacySnapshotCharge {
  const sqlite = getSqlite();
  const threadBytes = storedByteSum(tableProjectionColumns(sqlite, "threads"));
  const projects = scalarBytes(
    sqlite,
    `SELECT COALESCE(SUM(${storedByteSum(tableProjectionColumns(sqlite, "projects"))}), 0) AS bytes
       FROM projects`,
  );
  const threads =
    options.threadListLimit === undefined
      ? scalarBytes(sqlite, `SELECT COALESCE(SUM(${threadBytes}), 0) AS bytes FROM threads`)
      : scalarBytes(
          sqlite,
          `SELECT COALESCE(SUM(${threadBytes}), 0) AS bytes
             FROM (SELECT * FROM threads ORDER BY ${THREAD_PAGE_ORDER_SQL} LIMIT ?)`,
          threadPageMaterializedRows(options.threadListLimit),
        );
  return {
    threadsStoredBytes: threads,
    projectsStoredBytes: projects,
  };
}

/**
 * Stored bytes of one thread's legacy runtime history for the parsed request
 * selection (see the module doc for the exact windows). The default
 * (`runtimePage` absent) charges the complete unbounded variant: every item,
 * every stream tail, every completed turn, the scrollback and the context
 * usage — the complete set the undeclared `thread-history` read loads.
 */
export function dbMeasureLegacyHistoryCharge(
  threadId: string,
  options: LegacyHistoryChargeOptions = {},
): LegacyHistoryCharge {
  const sqlite = getSqlite();
  let items: number;
  let tails: number;
  if (options.runtimePage) {
    items = scalarBytes(
      sqlite,
      `SELECT COALESCE(SUM(${itemBytesTerm()}), 0) AS bytes
         FROM (
           SELECT ${ITEM_PROJECTION.map(quotedIdentifier).join(", ")}
           FROM thread_runtime_items
           WHERE thread_id = ?
           ORDER BY position DESC
           LIMIT ?
         )`,
      threadId,
      LEGACY_RUNTIME_PAGE_LIMIT + 1,
    );
    const tailRows = runtimePageTailRows(options.targetTimelineEntryCount);
    tails =
      tailRows === 0
        ? 0
        : scalarBytes(
            sqlite,
            `SELECT COALESCE(SUM(${streamChunkBytesTerm()}), 0) AS bytes
               FROM thread_runtime_item_stream_chunks
               WHERE thread_id = ? AND item_id IN (${NEWEST_ITEM_IDS_SQL})`,
            threadId,
            threadId,
            tailRows,
          ) +
          scalarBytes(
            sqlite,
            `SELECT COALESCE(SUM(${streamStateKeyBytesTerm()}), 0) AS bytes
               FROM thread_runtime_item_stream_state
               WHERE thread_id = ? AND elided_chars > 0 AND item_id IN (${NEWEST_ITEM_IDS_SQL})`,
            threadId,
            threadId,
            tailRows,
          );
  } else {
    items = scalarBytes(
      sqlite,
      `SELECT COALESCE(SUM(${itemBytesTerm()}), 0) AS bytes
         FROM thread_runtime_items WHERE thread_id = ?`,
      threadId,
    );
    tails =
      scalarBytes(
        sqlite,
        `SELECT COALESCE(SUM(${streamChunkBytesTerm()}), 0) AS bytes
           FROM thread_runtime_item_stream_chunks WHERE thread_id = ?`,
        threadId,
      ) +
      scalarBytes(
        sqlite,
        `SELECT COALESCE(SUM(${streamStateKeyBytesTerm()}), 0) AS bytes
           FROM thread_runtime_item_stream_state
           WHERE thread_id = ? AND elided_chars > 0`,
        threadId,
      );
  }
  const turns = scalarBytes(
    sqlite,
    `SELECT COALESCE(SUM(${completedTurnBytesTerm()}), 0) AS bytes
       FROM thread_completed_turns WHERE thread_id = ?`,
    threadId,
  );
  const scrollback =
    options.omitScrollback === true
      ? 0
      : scalarBytes(
          sqlite,
          `SELECT COALESCE(SUM(${storedByteTerm(quotedIdentifier("transcript"))}), 0) AS bytes
             FROM thread_terminal_scrollback WHERE thread_id = ?`,
          threadId,
        );
  const usage = scalarBytes(
    sqlite,
    `SELECT COALESCE(SUM(${storedByteTerm(quotedIdentifier("usage"))}), 0) AS bytes
       FROM thread_context_usage WHERE thread_id = ?`,
    threadId,
  );
  return {
    itemsStoredBytes: items,
    streamTailStoredBytes: tails,
    completedTurnsStoredBytes: turns,
    scrollbackStoredBytes: scrollback,
    contextUsageStoredBytes: usage,
  };
}
