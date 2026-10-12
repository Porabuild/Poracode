import type Database from "better-sqlite3";

/** Schema 52 keeps schema-51 transcripts readable until their first append.
 * New writes use bounded UTF-16 chunks; old code cannot read that layout. */
export function migrateTerminalScrollbackChunks(sqlite: InstanceType<typeof Database>): void {
  const columns = new Set(
    (
      sqlite.prepare("PRAGMA table_info(thread_terminal_scrollback)").all() as { name: string }[]
    ).map((row) => row.name),
  );
  for (const column of ["chunked", "stored_chars", "next_seq"] as const) {
    if (!columns.has(column)) {
      sqlite.exec(
        `ALTER TABLE thread_terminal_scrollback ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`,
      );
    }
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS thread_terminal_scrollback_chunks (
      thread_id TEXT NOT NULL REFERENCES thread_terminal_scrollback(thread_id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      chars INTEGER NOT NULL CHECK(chars > 0 AND chars <= 8192),
      data BLOB NOT NULL CHECK(length(data) = chars * 2),
      PRIMARY KEY(thread_id, seq)
    ) WITHOUT ROWID;
  `);
}
