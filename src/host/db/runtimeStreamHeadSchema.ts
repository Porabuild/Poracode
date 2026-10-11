import type Database from "better-sqlite3";
import { HEAD_CHARS } from "./runtimeStreamCap";

/** One mutable UTF-16LE head block; closed blocks remain immutable. */
export const RUNTIME_STREAM_HEAD_BLOCK_CHARS = 8192;
export const RUNTIME_STREAM_HEAD_MAX_BLOCKS = Math.ceil(
  (HEAD_CHARS + 1) / RUNTIME_STREAM_HEAD_BLOCK_CHARS,
);

/**
 * Schema 53 adds lazy stream-head metadata and exact UTF-16 append blocks.
 * Creating the schema never parses, rewrites or duplicates existing JSON seeds,
 * tail chunks, stream state or durable gap evidence.
 */
export function createRuntimeStreamHeadSchema(sqlite: InstanceType<typeof Database>): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS thread_runtime_item_stream_heads (
      head_id INTEGER PRIMARY KEY,
      thread_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      stream_key TEXT NOT NULL,
      stream_order INTEGER NOT NULL CHECK(stream_order >= 0),
      seed_chars INTEGER NOT NULL CHECK(seed_chars >= 0),
      head_chars INTEGER NOT NULL CHECK(head_chars BETWEEN 0 AND ${HEAD_CHARS + 1} AND head_chars >= seed_chars),
      next_seq INTEGER NOT NULL CHECK(next_seq BETWEEN 0 AND ${RUNTIME_STREAM_HEAD_MAX_BLOCKS}),
      open_seq INTEGER,
      open_chars INTEGER NOT NULL CHECK(open_chars BETWEEN 0 AND ${RUNTIME_STREAM_HEAD_BLOCK_CHARS - 1}),
      head_wire_bytes INTEGER NOT NULL CHECK(head_wire_bytes BETWEEN 0 AND head_chars * 6),
      head_json_units INTEGER NOT NULL CHECK(head_json_units BETWEEN 0 AND head_chars * 6),
      head_has_content INTEGER NOT NULL CHECK(head_has_content IN (0,1)),
      head_last_unit INTEGER NOT NULL CHECK(
        (head_chars = 0 AND head_last_unit = -1) OR
        (head_chars > 0 AND head_last_unit BETWEEN 0 AND 65535)
      ),
      CHECK(
        (open_seq IS NULL AND open_chars = 0) OR
        (open_seq IS NOT NULL AND open_seq >= 0 AND open_seq = next_seq - 1 AND open_chars > 0)
      ),
      UNIQUE(thread_id, item_id, stream_key),
      UNIQUE(thread_id, item_id, stream_order),
      FOREIGN KEY(thread_id, item_id)
        REFERENCES thread_runtime_items(thread_id, item_id) ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE IF NOT EXISTS thread_runtime_item_stream_head_blocks (
      head_id INTEGER NOT NULL
        REFERENCES thread_runtime_item_stream_heads(head_id) ON DELETE CASCADE ON UPDATE CASCADE,
      seq INTEGER NOT NULL CHECK(seq BETWEEN 0 AND ${RUNTIME_STREAM_HEAD_MAX_BLOCKS - 1}),
      chars INTEGER NOT NULL CHECK(chars BETWEEN 1 AND ${RUNTIME_STREAM_HEAD_BLOCK_CHARS}),
      data BLOB NOT NULL CHECK(typeof(data) = 'blob' AND length(data) = chars * 2),
      PRIMARY KEY(head_id, seq)
    ) WITHOUT ROWID;
    CREATE TRIGGER IF NOT EXISTS runtime_stream_head_seed_reset
    BEFORE UPDATE OF streams ON thread_runtime_items BEGIN
      DELETE FROM thread_runtime_item_stream_heads
      WHERE thread_id = OLD.thread_id AND item_id = OLD.item_id;
    END;
  `);
}
