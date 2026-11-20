import type Database from "better-sqlite3";
import { getSqlite } from "./connection";

// Use a versioned app_state namespace. Completed imports from older builds
// have no journal entry. Read-only and validate-only opens leave it alone.
const PENDING_SESSION_IMPORT_PREFIX = "host-session-import-pending:v1:";

export function markSessionImportPending(threadId: string, createdAt: string): void {
  getSqlite()
    .prepare("INSERT INTO app_state (key, value) VALUES (?, ?)")
    .run(PENDING_SESSION_IMPORT_PREFIX + threadId, createdAt);
}

export function clearPendingSessionImport(threadId: string): void {
  getSqlite()
    .prepare("DELETE FROM app_state WHERE key = ?")
    .run(PENDING_SESSION_IMPORT_PREFIX + threadId);
}

export function isSessionImportPending(threadId: string): boolean {
  return (
    getSqlite()
      .prepare("SELECT 1 FROM app_state WHERE key = ?")
      .get(PENDING_SESSION_IMPORT_PREFIX + threadId) !== undefined
  );
}

/** A new writer can discard only provisional rows made by an interrupted import. */
export function recoverInterruptedSessionImports(sqlite: InstanceType<typeof Database>): void {
  sqlite
    .transaction(() => {
      const rows = sqlite
        .prepare("SELECT key, value FROM app_state WHERE key GLOB ?")
        .all(PENDING_SESSION_IMPORT_PREFIX + "*") as { key: string; value: string }[];
      if (rows.length === 0) return;
      const discard = sqlite.prepare(`
      DELETE FROM threads
      WHERE id = ? AND created_at = ?
        AND CASE WHEN json_valid(config) THEN json_extract(config, '$.importedFrom.importedAt') END = ?
        AND NOT EXISTS (
          SELECT 1 FROM thread_runtime_items
          WHERE thread_id = threads.id AND item_id NOT GLOB 'import-*'
        )
    `);
      const clear = sqlite.prepare("DELETE FROM app_state WHERE key = ?");
      for (const { key, value } of rows) {
        const threadId = key.slice(PENDING_SESSION_IMPORT_PREFIX.length);
        discard.run(threadId, value, value);
        clear.run(key);
      }
    })
    .immediate();
}
