import type Database from "better-sqlite3";

const INLINE_IMAGE_SCHEMA = [
  {
    name: "runtime_inline_image_blobs",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS runtime_inline_image_blobs (
      blob_hash TEXT PRIMARY KEY CHECK(
        typeof(blob_hash) = 'text'
        AND length(blob_hash) = 64
        AND blob_hash NOT GLOB '*[^0-9a-f]*'
      ),
      encoding TEXT NOT NULL CHECK(encoding IN ('data_url', 'raw_base64', 'raw_svg')),
      header TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL CHECK(typeof(mime) = 'text' AND length(mime) > 0),
      raw_bytes BLOB NOT NULL CHECK(typeof(raw_bytes) = 'blob' AND length(raw_bytes) > 0),
      inline_utf8_bytes INTEGER NOT NULL CHECK(
        typeof(inline_utf8_bytes) = 'integer'
        AND inline_utf8_bytes > 0
      ),
      width INTEGER CHECK(width IS NULL OR (typeof(width) = 'integer' AND width > 0)),
      height INTEGER CHECK(height IS NULL OR (typeof(height) = 'integer' AND height > 0))
    ) WITHOUT ROWID;`,
  },
  {
    name: "thread_runtime_item_image_refs",
    type: "table",
    sql: `CREATE TABLE IF NOT EXISTS thread_runtime_item_image_refs (
      thread_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      path_json TEXT NOT NULL CHECK(typeof(path_json) = 'text' AND length(path_json) >= 3),
      blob_hash TEXT NOT NULL REFERENCES runtime_inline_image_blobs(blob_hash),
      PRIMARY KEY (thread_id, item_id, path_json),
      FOREIGN KEY (thread_id, item_id)
        REFERENCES thread_runtime_items(thread_id, item_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) WITHOUT ROWID;`,
  },
  {
    name: "idx_runtime_item_image_refs_blob",
    type: "index",
    sql: `CREATE INDEX IF NOT EXISTS idx_runtime_item_image_refs_blob
      ON thread_runtime_item_image_refs (blob_hash);`,
  },
] as const;

export function createRuntimeInlineImageSchema(sqlite: InstanceType<typeof Database>): void {
  for (const entry of INLINE_IMAGE_SCHEMA) sqlite.exec(entry.sql);
}

function normalizedSchemaSql(sql: string): string {
  return sql
    .replace(/\bIF NOT EXISTS\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "");
}

export function assertRuntimeInlineImageSchema(sqlite: InstanceType<typeof Database>): void {
  const select = sqlite.prepare("SELECT type, sql FROM sqlite_master WHERE name = ?");
  for (const entry of INLINE_IMAGE_SCHEMA) {
    const row = select.get(entry.name) as { type: string; sql: string | null } | undefined;
    if (
      !row ||
      row.type !== entry.type ||
      row.sql === null ||
      normalizedSchemaSql(row.sql) !== normalizedSchemaSql(entry.sql)
    ) {
      throw new Error(
        `Database inline image storage schema is incomplete or invalid: ${entry.name}.`,
      );
    }
  }
}
