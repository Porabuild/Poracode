import type Database from "better-sqlite3";
import { escapedUnitsLowerBound } from "@/shared/remote/catalogReadContract";
import { safeParse } from "./rowMappers";
import { readRuntimeSnapshot } from "./runtimeReadSnapshot";
import { isRuntimeStreamHeadIndexed, peekRuntimeStreamHead } from "./runtimeStreamHeadStore";
import { streamHasContent } from "./runtimeStreamStore";

type SqliteDatabase = InstanceType<typeof Database>;
const PROBE_BATCH = 400;

function indexedStreamHasContent(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
  stream: string,
): boolean | undefined {
  const indexedHead = peekRuntimeStreamHead(sqlite, { threadId, itemId, stream });
  if (indexedHead?.head_has_content === 1) return true;
  if (indexedHead || isRuntimeStreamHeadIndexed(sqlite, threadId, itemId)) {
    return streamHasContent(sqlite, threadId, itemId, stream);
  }
  return undefined;
}

function readLegacySeed(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
): string | null | undefined {
  return (
    sqlite
      .prepare("SELECT streams FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?")
      .get(threadId, itemId) as { streams: string | null } | undefined
  )?.streams;
}

/** Preserve forgiving legacy page classification without parsing a suppressed seed. */
export function runtimeStreamHasContent(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
  stream: string,
  legacySeed?: string | null,
): boolean {
  const indexed = indexedStreamHasContent(sqlite, threadId, itemId, stream);
  if (indexed !== undefined) return indexed;
  const seed = legacySeed === undefined ? readLegacySeed(sqlite, threadId, itemId) : legacySeed;
  const head = seed ? safeParse(seed) : undefined;
  const text =
    head && typeof head === "object" ? (head as Record<string, unknown>)[stream] : undefined;
  return streamHasContent(
    sqlite,
    threadId,
    itemId,
    stream,
    typeof text === "string" ? text : undefined,
  );
}

/**
 * Completion writes retain the released legacy refusal behavior: broken/null
 * seeds fail direct property access, and non-string values fail the tail
 * owner's trim. Read classification intentionally remains more forgiving.
 */
export function runtimeWriterStreamHasContent(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
  stream: string,
): boolean {
  const indexed = indexedStreamHasContent(sqlite, threadId, itemId, stream);
  if (indexed !== undefined) return indexed;
  const raw = readLegacySeed(sqlite, threadId, itemId);
  const seed = raw ? safeParse(raw) : {};
  return streamHasContent(
    sqlite,
    threadId,
    itemId,
    stream,
    (seed as Record<string, string>)[stream],
  );
}

/**
 * Only metadata-absent selected items load seed text. Indexed heads use their
 * content scalar and retained tails through the canonical content owner.
 */
export function readRuntimeStreamContentProbes(
  sqlite: SqliteDatabase,
  threadId: string,
  itemIds: readonly string[],
  stream: string,
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (let start = 0; start < itemIds.length; start += PROBE_BATCH) {
    const ids = [...new Set(itemIds.slice(start, start + PROBE_BATCH))];
    if (ids.length === 0) continue;
    const marks = ids.map(() => "?").join(", ");
    const rows = sqlite
      .prepare(`SELECT item_id, streams FROM thread_runtime_items i
      WHERE thread_id = ? AND item_id IN (${marks})
        AND NOT EXISTS (SELECT 1 FROM thread_runtime_item_stream_heads h
          WHERE h.thread_id = i.thread_id AND h.item_id = i.item_id)`)
      .all(threadId, ...ids) as Array<{ item_id: string; streams: string | null }>;
    const seeds = new Map(rows.map((row) => [row.item_id, row.streams]));
    for (const itemId of ids) {
      result.set(
        itemId,
        runtimeStreamHasContent(sqlite, threadId, itemId, stream, seeds.get(itemId)),
      );
    }
  }
  return result;
}

export interface RuntimeStreamHeadEscapedSizes {
  /** Escaped content only; excludes object keys and surrounding string quotes. */
  readonly wireBytes: number;
  readonly decodeBytes: number;
}

/** Scalar-only authoritative head charge, with the unchanged legacy JSON1 fallback. */
export function measureRuntimeStreamHeadEscaped(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
): RuntimeStreamHeadEscapedSizes {
  return readRuntimeSnapshot(sqlite, () => {
    const indexed = sqlite
      .prepare(`SELECT COUNT(*) AS stream_count,
        COALESCE(SUM(head_wire_bytes), 0) AS head_wire,
        COALESCE(SUM(head_json_units), 0) AS head_json_units
      FROM thread_runtime_item_stream_heads WHERE thread_id = ? AND item_id = ?`)
      .get(threadId, itemId) as {
      stream_count: number;
      head_wire: number;
      head_json_units: number;
    };
    if (indexed.stream_count > 0) {
      return {
        wireBytes: indexed.head_wire,
        decodeBytes: indexed.head_json_units * 2,
      };
    }
    const row = sqlite
      .prepare(`SELECT
        COALESCE(SUM(length(CAST(json_quote(j.value) AS BLOB)) - 2), 0) AS head_wire,
        COALESCE(SUM(length(json_quote(j.value)) - 2), 0) AS head_code_points
      FROM thread_runtime_items i JOIN json_each(
        CASE WHEN i.streams IS NOT NULL AND json_valid(i.streams) THEN i.streams ELSE '{}' END
      ) AS j
      WHERE i.thread_id = ? AND i.item_id = ? AND j.type = 'text'`)
      .get(threadId, itemId) as { head_wire: number; head_code_points: number } | undefined;
    const wireBytes = Number(row?.head_wire ?? 0);
    return {
      wireBytes,
      decodeBytes: escapedUnitsLowerBound(Number(row?.head_code_points ?? 0), wireBytes) * 2,
    };
  });
}
