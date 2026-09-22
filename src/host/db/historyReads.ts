import type Database from "better-sqlite3";
import {
  CATALOG_JSON_BOUND_FACTOR,
  CATALOG_ROW_ENVELOPE_BYTES,
  escapedUnitsLowerBound,
} from "@/shared/remote/catalogReadContract";
import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";
import { readStreamTails, streamHasContent } from "./runtimeStreamStore";
import {
  RUNTIME_PAGE_NAMED_TOOL_TYPES,
  chunkValues,
  classifyRuntimeTimelineEntry,
  mapRuntimeItemRow,
  placeholders,
  selectRuntimePageRows,
  type RuntimeTimelineItemRow,
  type RuntimeTimelineKind,
} from "./runtimeTimelineReads";
import type { PersistedRuntimeItem } from "./runtimeItems";

/**
 * B4 bounded history reads: metadata-only phase 1 (classification + size
 * bounds computed in SQLite, no payload text crosses into JS) and
 * fetch-by-key phase 2 for exactly the rows the page builder packed.
 *
 * The historical page reader (`dbReadThreadRuntimeItemsPage` in
 * `runtimeItems.ts`) selects `payload` and `streams` for every candidate row
 * before any byte decision. This module reproduces the exact same candidate
 * selection (tail window, group-boundary extension, target timeline entries)
 * and classification, but phase 1 reads only:
 *
 * - `item_id, position, type, state, parent_item_id` (small metadata),
 * - `length(CAST(payload/streams AS BLOB))` per row,
 * - `SUM(length(CAST(text AS BLOB)))` per item for appended stream tails,
 * - narrow probes for only the rows classification genuinely needs:
 *   `NAMED_TOOL_TYPES` (`payload.name` / sub-agent / inline-image checks) and
 *   completed `reasoning` rows (`streamHasContent`).
 *
 * The classification sets and the page-boundary constants intentionally mirror
 * `runtimeItems.ts` (which owns the legacy algorithm); `historyReads.test.ts`
 * pins behavior equivalence against the legacy reader so the two cannot drift.
 * No persistence, control, fence, or mutation logic is touched here.
 *
 * Phase-1 row bound derivation (same accounting as the catalog slice): stored
 * JSON text re-serializes to at most `6 × stored UTF-8 bytes`
 * (`CATALOG_JSON_BOUND_FACTOR`), appended tail text escapes into a JSON string
 * at at most `6 ×` its stored bytes, and the fixed row envelope covers keys,
 * punctuation and small raw columns. The bound is sound, not an estimate;
 * phase 2 re-measures exactly.
 */

/** Timeline row kind, shared with the legacy page reader. */
export type HistoryTimelineKind = RuntimeTimelineKind;

export interface HistoryPageRowMeta {
  readonly itemId: string;
  readonly position: number;
  readonly type: string;
  readonly state: string;
  readonly parentItemId: string | null;
  readonly kind: HistoryTimelineKind;
  /** Conservative serialized wire bound including the per-row envelope. */
  readonly boundWireBytes: number;
  /**
   * Conservative wire bound of the stream component alone (head + appended
   * tail). Used only for packing; a stream row is refused before its payload
   * fetch only when a sound lower bound proves it oversized.
   */
  readonly boundStreamWireBytes: number;
  /**
   * Sound lower bound of the serialized wire bytes: exact escaped literal size
   * of the verbatim row columns (`item_id`, `type`) plus the exact escaped
   * content of the appended stream tail (the tail is never schema-projected,
   * and chunk texts are whole code points, so escaping them separately then
   * concatenating is the same as escaping the assembled string). The head
   * stream values are measured exactly by
   * {@link dbMeasureHistoryStreamHeadEscaped} when a pre-fetch decision needs
   * them. Never exceeds the actual row size.
   */
  readonly lowerBoundWireBytes: number;
  /** Sound lower bound of `2 × serialized.length` for the same components. */
  readonly lowerBoundDecodeBytes: number;
  /**
   * True when any stream of the item has elided characters. The assembled
   * value then snaps to line boundaries and inserts a notice
   * (`joinWithElision`), which can REMOVE head/tail characters, so neither the
   * head nor the tail may contribute to a sound lower bound; such rows are
   * resolved by the exact phase-2 measurement instead.
   */
  readonly streamsElided: boolean;
}

export interface DbHistoryPagePhase1Query {
  readonly beforePosition?: number;
  /** Raw-row window size; mirrors the legacy reader's `limit` (1–500). */
  readonly limit: number;
  /** When set, fills the page by projected timeline entries (1–100). */
  readonly targetTimelineEntryCount?: number;
}

export interface DbHistoryPagePhase1 {
  /** Newest-first candidate rows (the legacy selection, byte-untouched). */
  readonly rows: readonly HistoryPageRowMeta[];
  /** True when a row older than the returned candidate set exists. */
  readonly moreBeyondWindow: boolean;
}

interface HistoryMetadataSqlRow {
  item_id: string;
  position: number;
  type: string;
  state: string;
  parent_item_id: string | null;
  payload_bytes: number;
  streams_bytes: number;
  base_lower_wire: number | null;
  base_lower_cps: number | null;
  elided_streams: number;
}

/** Materialized phase-2 row; identical shape to the shared timeline row. */
type HistoryMaterializedSqlRow = RuntimeTimelineItemRow;

const HISTORY_PROBE_BATCH = 400;
const HISTORY_ITEM_FETCH_BATCH = 500;

/** Stored and exact escaped/plain sizes of one item's appended stream tail. */
interface HistoryTailSize {
  readonly storedBytes: number;
  readonly escapedBytes: number;
  readonly escapedCodePoints: number;
}

/**
 * `item_id` and `type` are the only runtime-item columns the wire schema emits
 * verbatim without transformation (state is normalized, payload/streams are
 * structured). Their exact escaped literals are therefore a sound lower bound
 * contribution for every row.
 */
const HISTORY_VERBATIM_LOWER_WIRE =
  "(length(CAST(json_quote(item_id) AS BLOB)) + length(CAST(json_quote(type) AS BLOB)))";
const HISTORY_VERBATIM_LOWER_CODE_POINTS =
  "(length(json_quote(item_id)) + length(json_quote(type)))";

/**
 * Classification probes and size bounds for one phase-1 window. Holds the
 * thread's parent-id set (metadata only) and lazily probes payload/streams for
 * exactly the rows classification requires. The hidden/group/item decision
 * itself is the shared `classifyRuntimeTimelineEntry`, so this reader and the
 * legacy page reader cannot drift.
 */
class HistoryTimelineClassifier {
  private readonly childParentIds: ReadonlySet<string>;
  private readonly payloadById = new Map<string, unknown>();
  private readonly reasoningContentById = new Map<string, boolean>();
  private readonly tailSizeById = new Map<string, HistoryTailSize>();

  constructor(
    private readonly sqlite: InstanceType<typeof Database>,
    private readonly threadId: string,
  ) {
    this.childParentIds = new Set(
      (
        sqlite
          .prepare(
            "SELECT DISTINCT parent_item_id FROM thread_runtime_items WHERE thread_id = ? AND parent_item_id IS NOT NULL",
          )
          .all(threadId) as Array<{ parent_item_id: string }>
      ).map((row) => row.parent_item_id),
    );
  }

  /** Loads size bounds and narrow classification probes for a fresh batch. */
  ensure(rows: readonly HistoryMetadataSqlRow[]): void {
    if (rows.length === 0) return;
    this.ensureTailBytes(rows);
    this.ensurePayloadProbes(rows);
    this.ensureReasoningProbes(rows);
  }

  private ensureTailBytes(rows: readonly HistoryMetadataSqlRow[]): void {
    const missing = rows
      .map((row) => row.item_id)
      .filter((itemId) => !this.tailSizeById.has(itemId));
    for (const chunk of chunkValues([...new Set(missing)], HISTORY_PROBE_BATCH)) {
      if (chunk.length === 0) continue;
      // `tail_bytes` keeps the historical stored-bytes term (upper-bound
      // packing and the SQL-shape guard); `tail_escaped_*` are the exact
      // escaped JSON sizes used for the sound lower bound. `json_quote` and
      // `JSON.stringify` emit identical canonical escapes for stored TEXT, and
      // chunks hold whole code points (`utf16SafeSliceEnd`), so escaping each
      // chunk and concatenating equals escaping the assembled tail. Whether a
      // stream is elided is read from `thread_runtime_item_stream_state` in the
      // metadata phase, because an elided stream is line-trimmed on assembly
      // and must not contribute to a lower bound.
      const tailRows = this.sqlite
        .prepare(
          `SELECT item_id, SUM(length(CAST(text AS BLOB))) AS tail_bytes,
                  SUM(length(CAST(json_quote(COALESCE(text, '')) AS BLOB)) - 2) AS tail_escaped_bytes,
                  SUM(length(json_quote(COALESCE(text, ''))) - 2) AS tail_escaped_code_points
           FROM thread_runtime_item_stream_chunks
           WHERE thread_id = ? AND item_id IN (${placeholders(chunk.length)})
           GROUP BY item_id`,
        )
        .all(this.threadId, ...chunk) as Array<{
        item_id: string;
        tail_bytes: number;
        tail_escaped_bytes: number;
        tail_escaped_code_points: number;
      }>;
      for (const row of tailRows) {
        this.tailSizeById.set(row.item_id, {
          storedBytes: Number(row.tail_bytes),
          escapedBytes: Number(row.tail_escaped_bytes),
          escapedCodePoints: Number(row.tail_escaped_code_points),
        });
      }
      for (const itemId of chunk) {
        if (!this.tailSizeById.has(itemId)) {
          this.tailSizeById.set(itemId, {
            storedBytes: 0,
            escapedBytes: 0,
            escapedCodePoints: 0,
          });
        }
      }
    }
  }

  private ensurePayloadProbes(rows: readonly HistoryMetadataSqlRow[]): void {
    const missing = rows
      .filter(
        (row) => RUNTIME_PAGE_NAMED_TOOL_TYPES.has(row.type) && !this.payloadById.has(row.item_id),
      )
      .map((row) => row.item_id);
    for (const chunk of chunkValues([...new Set(missing)], HISTORY_PROBE_BATCH)) {
      if (chunk.length === 0) continue;
      const payloadRows = this.sqlite
        .prepare(
          `SELECT item_id, payload FROM thread_runtime_items
           WHERE thread_id = ? AND item_id IN (${placeholders(chunk.length)})`,
        )
        .all(this.threadId, ...chunk) as Array<{ item_id: string; payload: string | null }>;
      for (const row of payloadRows) {
        this.payloadById.set(row.item_id, row.payload ? safeParse(row.payload) : undefined);
      }
      for (const itemId of chunk) {
        if (!this.payloadById.has(itemId)) this.payloadById.set(itemId, undefined);
      }
    }
  }

  private ensureReasoningProbes(rows: readonly HistoryMetadataSqlRow[]): void {
    const missing = rows.filter(
      (row) =>
        row.type === "reasoning" &&
        row.state === "completed" &&
        !this.reasoningContentById.has(row.item_id),
    );
    for (const chunk of chunkValues(
      missing.map((row) => row.item_id),
      HISTORY_PROBE_BATCH,
    )) {
      if (chunk.length === 0) continue;
      const headRows = this.sqlite
        .prepare(
          `SELECT item_id, streams FROM thread_runtime_items
           WHERE thread_id = ? AND item_id IN (${placeholders(chunk.length)})`,
        )
        .all(this.threadId, ...chunk) as Array<{ item_id: string; streams: string | null }>;
      const heads = new Map(headRows.map((row) => [row.item_id, row.streams]));
      for (const itemId of chunk) {
        const rawHead = heads.get(itemId);
        const head = rawHead ? safeParse(rawHead) : undefined;
        const reasoningText =
          head && typeof head === "object"
            ? (head as Record<string, unknown>).reasoning_text
            : undefined;
        this.reasoningContentById.set(
          itemId,
          streamHasContent(
            this.sqlite,
            this.threadId,
            itemId,
            "reasoning_text",
            typeof reasoningText === "string" ? reasoningText : undefined,
          ),
        );
      }
    }
  }

  boundWireBytes(row: HistoryMetadataSqlRow): number {
    const tailStoredBytes = this.tailSizeById.get(row.item_id)?.storedBytes ?? 0;
    // Stored JSON text (`payload`, `streams` head) and raw appended tail text
    // both re-serialize into JSON at at most `6 × stored UTF-8 bytes`
    // (CATALOG_JSON_BOUND_FACTOR: control/lone-surrogate escaping and number
    // lexeme canonicalization). The envelope covers keys, punctuation, small
    // raw columns and elision markers. The bound is a packing estimate only;
    // hard rejection is decided by the exact lower bound / phase-2 measurement.
    return (
      CATALOG_ROW_ENVELOPE_BYTES +
      CATALOG_JSON_BOUND_FACTOR * (row.payload_bytes + row.streams_bytes + tailStoredBytes)
    );
  }

  boundStreamWireBytes(row: HistoryMetadataSqlRow): number {
    const tailStoredBytes = this.tailSizeById.get(row.item_id)?.storedBytes ?? 0;
    return (
      CATALOG_ROW_ENVELOPE_BYTES + CATALOG_JSON_BOUND_FACTOR * (row.streams_bytes + tailStoredBytes)
    );
  }

  /**
   * Sound lower bound of the serialized row: the exact escaped literals of
   * `item_id`/`type` (emitted verbatim by the wire schema) plus the exact
   * escaped content of the appended stream tail. The streams head is NOT
   * included; only {@link dbMeasureHistoryStreamHeadEscaped} adds it, exactly,
   * when a pre-fetch decision needs it.
   */
  lowerBoundSizes(row: HistoryMetadataSqlRow): { wireBytes: number; decodeBytes: number } {
    const baseWire = Number(row.base_lower_wire ?? 0);
    const baseCodePoints = Number(row.base_lower_cps ?? 0);
    const tail = this.tailSizeById.get(row.item_id) ?? {
      storedBytes: 0,
      escapedBytes: 0,
      escapedCodePoints: 0,
    };
    // An elided stream is assembled through `joinWithElision`, which can drop
    // the head's trailing partial line and the tail's leading partial line, so
    // neither component is a sound lower bound; the base literals still are.
    const streamsLowerBound = Number(row.elided_streams) > 0;
    const wireBytes = baseWire + (streamsLowerBound ? 0 : tail.escapedBytes);
    const codePoints = baseCodePoints + (streamsLowerBound ? 0 : tail.escapedCodePoints);
    return {
      wireBytes,
      decodeBytes: escapedUnitsLowerBound(codePoints, wireBytes) * 2,
    };
  }

  streamsElided(row: HistoryMetadataSqlRow): boolean {
    return Number(row.elided_streams) > 0;
  }

  /**
   * The shared hidden/group/item decision driven by metadata-only probes:
   * `payloadById` holds parsed payloads for named tool types only, and
   * `reasoningContentById` is only read for a completed `reasoning` row.
   */
  classify(row: HistoryMetadataSqlRow): HistoryTimelineKind {
    return classifyRuntimeTimelineEntry({
      itemId: row.item_id,
      type: row.type,
      state: row.state,
      parentItemId: row.parent_item_id,
      childParentIds: this.childParentIds,
      payload: () => {
        const parsed = this.payloadById.get(row.item_id);
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : undefined;
      },
      reasoningHasContent: () => this.reasoningContentById.get(row.item_id) === true,
    });
  }
}

function assertPhase1Query(query: DbHistoryPagePhase1Query): void {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 500) {
    throw new Error("History page limit must be an integer between 1 and 500.");
  }
  if (
    query.targetTimelineEntryCount !== undefined &&
    (!Number.isSafeInteger(query.targetTimelineEntryCount) ||
      query.targetTimelineEntryCount < 1 ||
      query.targetTimelineEntryCount > 100)
  ) {
    throw new Error("targetTimelineEntryCount must be an integer between 1 and 100.");
  }
}

/**
 * Phase 1 for one history page. Returns the legacy candidate selection as
 * metadata rows (newest first) with classification and conservative wire
 * bounds. The caller packs these rows against its soft target and then fetches
 * only the packed ids through {@link dbReadThreadHistoryPhase2}.
 */
export function dbReadThreadHistoryPagePhase1(
  threadId: string,
  query: DbHistoryPagePhase1Query,
): DbHistoryPagePhase1 {
  assertPhase1Query(query);
  const sqlite = getSqlite();
  const classifier = new HistoryTimelineClassifier(sqlite, threadId);
  const readTailRows = sqlite.prepare(
    `SELECT item_id, position, type, state, parent_item_id,
            length(CAST(COALESCE(payload, '') AS BLOB)) AS payload_bytes,
            length(CAST(COALESCE(streams, '') AS BLOB)) AS streams_bytes,
            ${HISTORY_VERBATIM_LOWER_WIRE} AS base_lower_wire,
            ${HISTORY_VERBATIM_LOWER_CODE_POINTS} AS base_lower_cps,
            (SELECT COUNT(*) FROM thread_runtime_item_stream_state s
              WHERE s.thread_id = thread_runtime_items.thread_id
                AND s.item_id = thread_runtime_items.item_id
                AND s.elided_chars > 0) AS elided_streams
     FROM thread_runtime_items
     WHERE thread_id = ?
     ORDER BY position DESC
     LIMIT ?`,
  );
  const readOlderRows = sqlite.prepare(
    `SELECT item_id, position, type, state, parent_item_id,
            length(CAST(COALESCE(payload, '') AS BLOB)) AS payload_bytes,
            length(CAST(COALESCE(streams, '') AS BLOB)) AS streams_bytes,
            ${HISTORY_VERBATIM_LOWER_WIRE} AS base_lower_wire,
            ${HISTORY_VERBATIM_LOWER_CODE_POINTS} AS base_lower_cps,
            (SELECT COUNT(*) FROM thread_runtime_item_stream_state s
              WHERE s.thread_id = thread_runtime_items.thread_id
                AND s.item_id = thread_runtime_items.item_id
                AND s.elided_chars > 0) AS elided_streams
     FROM thread_runtime_items
     WHERE thread_id = ? AND position < ?
     ORDER BY position DESC
     LIMIT ?`,
  );
  const readRows = (cursor: number | undefined, rowLimit: number): HistoryMetadataSqlRow[] => {
    const rows = (
      cursor === undefined
        ? readTailRows.all(threadId, rowLimit)
        : readOlderRows.all(threadId, cursor, rowLimit)
    ) as HistoryMetadataSqlRow[];
    classifier.ensure(rows);
    return rows;
  };

  const selection = selectRuntimePageRows({
    readRows,
    isTimelineGroup: (row) => classifier.classify(row) !== "item",
    classify: (row) => classifier.classify(row),
    ...(query.beforePosition !== undefined ? { beforePosition: query.beforePosition } : {}),
    limit: query.limit,
    ...(query.targetTimelineEntryCount !== undefined
      ? { targetTimelineEntryCount: query.targetTimelineEntryCount }
      : {}),
  });

  return {
    rows: selection.rows.map((row) => {
      const lower = classifier.lowerBoundSizes(row);
      return {
        itemId: row.item_id,
        position: row.position,
        type: row.type,
        state: row.state,
        parentItemId: row.parent_item_id,
        kind: classifier.classify(row),
        boundWireBytes: classifier.boundWireBytes(row),
        boundStreamWireBytes: classifier.boundStreamWireBytes(row),
        lowerBoundWireBytes: lower.wireBytes,
        lowerBoundDecodeBytes: lower.decodeBytes,
        streamsElided: classifier.streamsElided(row),
      };
    }),
    moreBeyondWindow: selection.hasMore,
  };
}

/**
 * Phase 2: fetch exactly the packed item ids (chunk-bounded `IN (...)`),
 * materialize with appended stream tails, and restore the requested key order.
 * Missing ids (removed between phase 1 and phase 2) are skipped, never
 * fabricated.
 */
export function dbReadThreadHistoryPhase2(
  threadId: string,
  itemIds: readonly string[],
): PersistedRuntimeItem[] {
  if (itemIds.length === 0) return [];
  const sqlite = getSqlite();
  const byId = new Map<string, HistoryMaterializedSqlRow>();
  for (const chunk of chunkValues(itemIds, HISTORY_ITEM_FETCH_BATCH)) {
    const rows = sqlite
      .prepare(
        `SELECT item_id, type, state, payload, streams, parent_item_id
         FROM thread_runtime_items
         WHERE thread_id = ? AND item_id IN (${placeholders(chunk.length)})`,
      )
      .all(threadId, ...chunk) as HistoryMaterializedSqlRow[];
    for (const row of rows) byId.set(row.item_id, row);
  }
  const ordered = itemIds.flatMap((itemId) => {
    const row = byId.get(itemId);
    return row ? [row] : [];
  });
  const tails = readStreamTails(
    sqlite,
    threadId,
    ordered.map((row) => row.item_id),
  );
  return ordered.map((row) => mapRuntimeItemRow(row, tails.get(row.item_id)));
}

/** Exact escaped size of one runtime item's streams-head values. */
export interface HistoryStreamHeadEscapedSizes {
  /** Exact escaped content bytes of the head values (`JSON.stringify` charge). */
  readonly wireBytes: number;
  /** Sound lower bound of `2 × serialized.length` for the same values. */
  readonly decodeBytes: number;
}

/**
 * Measures one item's streams-head values exactly, entirely inside SQLite:
 * `json_each` walks the stored head object, the `json_valid`/`NULL` guard
 * mirrors `safeParse`'s fallback to `{}`, and only numeric sums return to JS.
 * No head or payload text crosses into JS for this probe, so a hostile head
 * cannot be materialized just to decide a pre-fetch refusal.
 *
 * The head is stored as JSON text; `json_quote` re-escapes the parsed value
 * canonically, which is exactly what `JSON.stringify` emits for the same
 * string, so this is the exact charge of the head component. The caller adds
 * it to the tail lower bound (the elision notice, when present, only grows the
 * assembled value).
 */
export function dbMeasureHistoryStreamHeadEscaped(
  threadId: string,
  itemId: string,
): HistoryStreamHeadEscapedSizes {
  const row = getSqlite()
    .prepare(
      `SELECT COALESCE(SUM(length(CAST(json_quote(j.value) AS BLOB)) - 2), 0) AS head_wire,
              COALESCE(SUM(length(json_quote(j.value)) - 2), 0) AS head_code_points
       FROM thread_runtime_items i
       JOIN json_each(
         CASE WHEN i.streams IS NOT NULL AND json_valid(i.streams) THEN i.streams ELSE '{}' END
       ) AS j
       WHERE i.thread_id = ? AND i.item_id = ? AND j.type = 'text'`,
    )
    .get(threadId, itemId) as { head_wire: number; head_code_points: number } | undefined;
  const wireBytes = Number(row?.head_wire ?? 0);
  const codePoints = Number(row?.head_code_points ?? 0);
  return { wireBytes, decodeBytes: escapedUnitsLowerBound(codePoints, wireBytes) * 2 };
}
