import type Database from "better-sqlite3";
import { safeParse } from "./rowMappers";
import {
  assertRuntimeStreamHeadBlock,
  assertRuntimeStreamHeadMetadata,
  decodeRuntimeStreamKey,
  encodeRuntimeStreamKey,
  isRuntimeStreamHeadSeed,
  RUNTIME_STREAM_HEAD_METADATA_COLUMNS,
  type RuntimeStreamHeadMetadata,
} from "./runtimeStreamHeadCodec";
import { RUNTIME_STREAM_HEAD_BLOCK_CHARS } from "./runtimeStreamHeadSchema";

type SqliteDatabase = InstanceType<typeof Database>;
const READ_BATCH = 400;

export interface RuntimeStreamHeadSeedRow {
  readonly item_id: string;
  readonly streams: string | null;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

/** Scalar/key projection only; no JSON seed or head BLOB crosses into JS. */
export function readRuntimeStreamHeadMetadata(
  sqlite: SqliteDatabase,
  threadId: string,
  itemIds: readonly string[],
): Map<string, RuntimeStreamHeadMetadata[]> {
  const result = new Map<string, RuntimeStreamHeadMetadata[]>();
  const ids = [...new Set(itemIds)];
  for (let start = 0; start < ids.length; start += READ_BATCH) {
    const batch = ids.slice(start, start + READ_BATCH);
    const rows = sqlite
      .prepare(
        `SELECT ${RUNTIME_STREAM_HEAD_METADATA_COLUMNS}
         FROM thread_runtime_item_stream_heads
         WHERE thread_id = ? AND item_id IN (${placeholders(batch.length)})
         ORDER BY item_id, stream_order`,
      )
      .all(threadId, ...batch) as RuntimeStreamHeadMetadata[];
    for (const head of rows) {
      assertRuntimeStreamHeadMetadata(head);
      const item = result.get(head.item_id) ?? [];
      item.push(head);
      result.set(head.item_id, item);
    }
  }
  return result;
}

interface HeadParts {
  readonly head: RuntimeStreamHeadMetadata;
  readonly stream: string;
  readonly parts: string[];
  chars: number;
  nextSeq: number;
}

/**
 * Effective heads only; tails/elision remain the existing reader's responsibility.
 * Select the supplied seed rows in the same synchronous read transaction when
 * another connection may write. Metadata-absent legacy parse shapes are retained.
 */
export function readRuntimeStreamHeads(
  sqlite: SqliteDatabase,
  threadId: string,
  rows: readonly RuntimeStreamHeadSeedRow[],
): Map<string, unknown> {
  if (rows.length === 0) return new Map();
  const read = () => readHeadsInSnapshot(sqlite, threadId, rows);
  return sqlite.inTransaction ? read() : sqlite.transaction(read)();
}

function readHeadsInSnapshot(
  sqlite: SqliteDatabase,
  threadId: string,
  rows: readonly RuntimeStreamHeadSeedRow[],
): Map<string, unknown> {
  const seeds = new Map(rows.map((row) => [row.item_id, row.streams]));
  const metadata = readRuntimeStreamHeadMetadata(sqlite, threadId, [...seeds.keys()]);
  const result = new Map<string, unknown>();
  const partsByHead = new Map<number, HeadParts>();
  for (const [itemId, rawSeed] of seeds) {
    const seed = rawSeed ? safeParse(rawSeed) : {};
    const heads = metadata.get(itemId);
    if (!heads) {
      result.set(itemId, seed);
      continue;
    }
    if (!isRuntimeStreamHeadSeed(seed))
      throw new Error("Invalid indexed runtime stream head seed.");
    const indexedKeys = new Set(heads.map((head) => head.stream_key));
    if (Object.keys(seed).some((key) => !indexedKeys.has(encodeRuntimeStreamKey(key)))) {
      throw new Error("Incomplete runtime stream head seed index.");
    }
    result.set(itemId, {});
    for (const head of heads) {
      const stream = decodeRuntimeStreamKey(head.stream_key);
      const visibleSeed = head.seed_chars > 0 ? seed[stream] : "";
      if (typeof visibleSeed !== "string" || visibleSeed.length !== head.seed_chars) {
        throw new Error("Invalid runtime stream head seed length.");
      }
      partsByHead.set(head.head_id, {
        head,
        stream,
        parts: visibleSeed.length > 0 ? [visibleSeed] : [],
        chars: head.seed_chars,
        nextSeq: 0,
      });
    }
  }

  const headIds = [...partsByHead.keys()];
  for (let start = 0; start < headIds.length; start += READ_BATCH) {
    const batch = headIds.slice(start, start + READ_BATCH);
    const blocks = sqlite
      .prepare(
        `SELECT head_id, seq, chars, data FROM thread_runtime_item_stream_head_blocks
         WHERE head_id IN (${placeholders(batch.length)}) ORDER BY head_id, seq`,
      )
      .all(...batch) as Array<{ head_id: number; seq: number; chars: number; data: Buffer }>;
    for (const block of blocks) {
      assertRuntimeStreamHeadBlock(block);
      const item = partsByHead.get(block.head_id)!;
      const { head } = item;
      if (
        block.seq !== item.nextSeq ||
        block.seq >= head.next_seq ||
        (block.seq < head.next_seq - 1 && block.chars !== RUNTIME_STREAM_HEAD_BLOCK_CHARS) ||
        (block.seq === head.open_seq && block.chars !== head.open_chars)
      ) {
        throw new Error("Invalid runtime stream head block sequence.");
      }
      item.parts.push(block.data.toString("utf16le"));
      item.chars += block.chars;
      item.nextSeq += 1;
    }
  }
  for (const { head, stream, parts, chars, nextSeq } of partsByHead.values()) {
    if (chars !== head.head_chars || nextSeq !== head.next_seq) {
      throw new Error("Invalid runtime stream head block length.");
    }
    const text = parts.join("");
    if ((text.length > 0 ? text.charCodeAt(text.length - 1) : -1) !== head.head_last_unit) {
      throw new Error("Invalid runtime stream head last unit.");
    }
    // Own data properties preserve JS enumeration while avoiding prototype setters.
    Object.defineProperty(result.get(head.item_id), stream, {
      value: text,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

export interface RuntimeStreamHeadStorageSize {
  /** Variable keys actually selected by readRuntimeStreamHeadMetadata. */
  readonly metadataKeyBytes: number;
  readonly blockBytes: number;
  readonly streamCount: number;
  readonly blockCount: number;
  readonly headChars: number;
  readonly headWireBytes: number;
  readonly headJsonUnits: number;
}

/**
 * SQL-only stored key/BLOB payload bytes, excluding SQLite pages, indexes, WAL
 * and heap/RSS. Charge seed JSON separately when the item projection loads it,
 * including legacy text masked by a per-stream replacement.
 */
export function measureRuntimeStreamHeadStorage(
  sqlite: SqliteDatabase,
  threadId: string,
  itemIds: readonly string[],
): Map<string, RuntimeStreamHeadStorageSize> {
  const result = new Map<string, RuntimeStreamHeadStorageSize>();
  const ids = [...new Set(itemIds)];
  for (let start = 0; start < ids.length; start += READ_BATCH) {
    const batch = ids.slice(start, start + READ_BATCH);
    const rows = sqlite
      .prepare(
        `SELECT h.item_id,
           SUM(length(CAST(h.thread_id AS BLOB)) + length(CAST(h.item_id AS BLOB)) +
               length(CAST(h.stream_key AS BLOB))) AS metadataKeyBytes,
           COUNT(*) AS streamCount, SUM(h.head_chars) AS headChars,
           SUM(h.head_wire_bytes) AS headWireBytes, SUM(h.head_json_units) AS headJsonUnits,
           SUM((SELECT COALESCE(SUM(length(b.data)), 0)
                FROM thread_runtime_item_stream_head_blocks b WHERE b.head_id = h.head_id)) AS blockBytes,
           SUM((SELECT COUNT(*) FROM thread_runtime_item_stream_head_blocks b
                WHERE b.head_id = h.head_id)) AS blockCount
         FROM thread_runtime_item_stream_heads h
         WHERE h.thread_id = ? AND h.item_id IN (${placeholders(batch.length)}) GROUP BY h.item_id`,
      )
      .all(threadId, ...batch) as Array<RuntimeStreamHeadStorageSize & { item_id: string }>;
    for (const row of rows) {
      result.set(row.item_id, {
        metadataKeyBytes: row.metadataKeyBytes,
        blockBytes: row.blockBytes,
        streamCount: row.streamCount,
        blockCount: row.blockCount,
        headChars: row.headChars,
        headWireBytes: row.headWireBytes,
        headJsonUnits: row.headJsonUnits,
      });
    }
  }
  return result;
}
