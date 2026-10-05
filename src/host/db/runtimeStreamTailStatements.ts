import type Database from "better-sqlite3";

type SqliteDatabase = InstanceType<typeof Database>;
const TRIM_SCAN_LIMIT = 64;

function createStatements(sqlite: SqliteDatabase) {
  return {
    state: sqlite.prepare(
      `SELECT next_seq, tail_chars, elided_chars FROM thread_runtime_item_stream_state
       WHERE thread_id = ? AND item_id = ? AND stream = ?`,
    ),
    insert: sqlite.prepare(
      `INSERT INTO thread_runtime_item_stream_chunks (thread_id, item_id, stream, seq, chars, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    updateState: sqlite.prepare(
      `INSERT INTO thread_runtime_item_stream_state
         (thread_id, item_id, stream, next_seq, tail_chars, elided_chars)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(thread_id, item_id, stream) DO UPDATE SET
         next_seq = excluded.next_seq,
         tail_chars = excluded.tail_chars,
         elided_chars = excluded.elided_chars`,
    ),
    oldest: sqlite.prepare(
      `SELECT seq, chars FROM thread_runtime_item_stream_chunks
       WHERE thread_id = ? AND item_id = ? AND stream = ?
       ORDER BY seq ASC LIMIT ${TRIM_SCAN_LIMIT}`,
    ),
    remove: sqlite.prepare(
      `DELETE FROM thread_runtime_item_stream_chunks
       WHERE thread_id = ? AND item_id = ? AND stream = ? AND seq = ?`,
    ),
  };
}

const statementSets = new WeakMap<SqliteDatabase, ReturnType<typeof createStatements>>();

/** Five fixed statements per handle; stream counters and text are never cached. */
export function runtimeStreamTailStatements(sqlite: SqliteDatabase) {
  let statements = statementSets.get(sqlite);
  if (!statements) {
    statements = createStatements(sqlite);
    statementSets.set(sqlite, statements);
  }
  return statements;
}
