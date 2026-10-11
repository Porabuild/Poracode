import type Database from "better-sqlite3";
import {
  RUNTIME_PAYLOAD_FORMAT_OWNER_KEY_MAX_LENGTH,
  RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION,
} from "./runtimePayloadOrigins";

const ORIGIN_SCHEMA = [
  {
    name: "thread_runtime_item_payload_origins",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS thread_runtime_item_payload_origins (
      thread_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      format_owner_key TEXT NOT NULL CHECK(
        typeof(format_owner_key) = 'text'
        AND length(CAST(format_owner_key AS BLOB)) BETWEEN 1 AND ${RUNTIME_PAYLOAD_FORMAT_OWNER_KEY_MAX_LENGTH}
        AND instr(format_owner_key, char(0)) = 0
        AND substr(format_owner_key, 1, 1) GLOB '[a-z0-9]'
        AND format_owner_key NOT GLOB '*[^a-z0-9._/-]*'
      ),
      origin_format_version INTEGER NOT NULL CHECK(
        typeof(origin_format_version) = 'integer'
        AND origin_format_version = ${RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION}
      ),
      PRIMARY KEY(thread_id, item_id),
      FOREIGN KEY(thread_id, item_id)
        REFERENCES thread_runtime_items(thread_id, item_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) WITHOUT ROWID;`,
  },
  {
    name: "runtime_payload_origin_insert_reset",
    type: "trigger",
    // AFTER is essential: INSERT OR IGNORE on an existing item preserves proof.
    sql: `CREATE TRIGGER IF NOT EXISTS runtime_payload_origin_insert_reset
      AFTER INSERT ON thread_runtime_items BEGIN
        DELETE FROM thread_runtime_item_payload_origins
          WHERE thread_id = NEW.thread_id AND item_id = NEW.item_id;
      END;`,
  },
  {
    name: "runtime_payload_origin_update_reset",
    type: "trigger",
    // Column assignment invalidates even identical bytes. A key move cascades
    // first; clear BOTH keys so no old or moved proof licenses the new install.
    sql: `CREATE TRIGGER IF NOT EXISTS runtime_payload_origin_update_reset
      AFTER UPDATE OF payload, type, thread_id, item_id ON thread_runtime_items BEGIN
        DELETE FROM thread_runtime_item_payload_origins
          WHERE thread_id = OLD.thread_id AND item_id = OLD.item_id;
        DELETE FROM thread_runtime_item_payload_origins
          WHERE thread_id = NEW.thread_id AND item_id = NEW.item_id;
      END;`,
  },
] as const;

/** Schema 54 starts empty; historical payloads and all stream/gap evidence stay intact. */
export function createRuntimePayloadOriginSchema(sqlite: InstanceType<typeof Database>): void {
  for (const entry of ORIGIN_SCHEMA) sqlite.exec(entry.sql);
}

function normalizedSchemaSql(sql: string): string {
  return sql
    .replace(/\bIF NOT EXISTS\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "");
}

/** Columns alone cannot validate custody: the composite FK, bounds and resets are required. */
export function assertRuntimePayloadOriginSchema(sqlite: InstanceType<typeof Database>): void {
  const select = sqlite.prepare("SELECT type, sql FROM sqlite_master WHERE name = ?");
  for (const entry of ORIGIN_SCHEMA) {
    const row = select.get(entry.name) as { type: string; sql: string | null } | undefined;
    if (
      !row ||
      row.type !== entry.type ||
      row.sql === null ||
      normalizedSchemaSql(row.sql) !== normalizedSchemaSql(entry.sql)
    ) {
      throw new Error(
        `Database payload origin custody schema is incomplete or invalid: ${entry.name}.`,
      );
    }
  }
}
