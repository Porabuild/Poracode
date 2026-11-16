import type Database from "better-sqlite3";

// The revision covers the persisted history payload, not live thread controls.
// SQL triggers also cover asynchronous writers and rollback/reset paths, in the
// same transaction as their writes. A recreated thread gets a new incarnation.
const HISTORY_TABLES = [
  "thread_runtime_items",
  "thread_runtime_item_stream_chunks",
  "thread_runtime_item_stream_state",
  "thread_runtime_item_stream_heads",
  "thread_runtime_item_payload_origins",
  "thread_runtime_item_image_refs",
  "thread_completed_turns",
  "thread_context_usage",
] as const;

function revisionTriggers(): { name: string; sql: string }[] {
  return [...HISTORY_TABLES, "thread_runtime_item_stream_head_blocks"].flatMap((table) =>
    (["INSERT", "UPDATE", "DELETE"] as const).map((operation) => {
      const rows =
        operation === "UPDATE" ? ["OLD", "NEW"] : [operation === "DELETE" ? "OLD" : "NEW"];
      const ids = rows.map((row) =>
        table === "thread_runtime_item_stream_head_blocks"
          ? `SELECT thread_id FROM thread_runtime_item_stream_heads WHERE head_id = ${row}.head_id`
          : `SELECT ${row}.thread_id`,
      );
      const name = `history_revision_${table}_${operation.toLowerCase()}`;
      return {
        name,
        sql: `CREATE TRIGGER IF NOT EXISTS ${name} ${operation === "DELETE" ? "BEFORE" : "AFTER"} ${operation} ON ${table} BEGIN
          INSERT INTO thread_history_revisions(thread_id)
          SELECT id FROM threads WHERE id IN (${ids.join(" UNION ")})
          ON CONFLICT(thread_id) DO UPDATE SET revision = revision + 1;
        END;`,
      };
    }),
  );
}

export function createHistoryCacheRevisionSchema(sqlite: InstanceType<typeof Database>): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS thread_history_revisions (
      thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE ON UPDATE CASCADE,
      incarnation TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0)
    );
    INSERT OR IGNORE INTO thread_history_revisions(thread_id) SELECT id FROM threads;
  `);
  for (const trigger of revisionTriggers()) sqlite.exec(trigger.sql);
}

export function assertHistoryCacheRevisionSchema(sqlite: InstanceType<typeof Database>): void {
  const definitions = new Map(
    (
      sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all() as {
        name: string;
        sql: string;
      }[]
    ).map(({ name, sql }) => [name, sql]),
  );
  const normalized = (sql: string) =>
    sql
      .replace(/\bIF NOT EXISTS\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/;$/, "");
  for (const { name, sql } of revisionTriggers()) {
    if (normalized(definitions.get(name) ?? "") !== normalized(sql))
      throw new Error(
        `Database schema has a missing or invalid history revision trigger: ${name}.`,
      );
  }
}

/** Read only inside the owning thread's committed-prefix history fence. */
export function readHistoryCacheRevision(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
): string | undefined {
  const row = sqlite
    .prepare(
      "SELECT incarnation || '.' || revision AS revision FROM thread_history_revisions WHERE thread_id = ?",
    )
    .get(threadId) as { revision: string } | undefined;
  return row?.revision;
}
