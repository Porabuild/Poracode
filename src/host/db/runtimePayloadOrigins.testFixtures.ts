import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  captureLegacyRuntimeStreamEvidence,
  createLegacyRuntimeStreamDatabase,
  seedLegacyRuntimeStreamEvidence,
} from "./runtimeStreamHeadMigration.testFixtures";
import {
  installTrustedRuntimePayloadOriginAfterCompleteWrite,
  type RuntimePayloadOrigin,
} from "./runtimePayloadOrigins";
import { appendRuntimeStreamHead, prepareRuntimeStreamHead } from "./runtimeStreamHeadStore";

export const ORIGIN_A: RuntimePayloadOrigin = {
  formatOwnerKey: "fixture.format-a",
  originFormatVersion: 1,
};
export const ORIGIN_B: RuntimePayloadOrigin = {
  formatOwnerKey: "fixture.format-b",
  originFormatVersion: 1,
};
export const LEGACY_SUMMARY_PAYLOAD =
  '{ "summary": {"added":0,"removed":0}, "source":"+first\\r\\n---literal\\r\\n🙂", "unknown":{"retained":true} }';

/**
 * Real schema-53 fixture: frozen old bootstrap + the historical prefix through
 * 52, then only published migration 53. Never create the current schema and
 * remove its new tables to pretend it is an old artifact.
 */
export function createSchema53PayloadOriginDatabase(path: string): InstanceType<typeof Database> {
  const sqlite = createLegacyRuntimeStreamDatabase(path);
  const migration53 = DATABASE_MIGRATIONS.find((migration) => migration.version === 53)!;
  sqlite.transaction(() => {
    migration53.migrate(sqlite);
    sqlite.prepare("UPDATE app_state SET value = '53' WHERE key = 'schema_version'").run();
  })();
  seedLegacyRuntimeStreamEvidence(sqlite);
  sqlite
    .prepare("UPDATE thread_runtime_items SET payload = ? WHERE item_id = 'growing'")
    .run(LEGACY_SUMMARY_PAYLOAD);
  sqlite.transaction(() => {
    const prepared = prepareRuntimeStreamHead(sqlite, {
      threadId: "thread-1",
      itemId: "growing",
      stream: "command_output",
    });
    if (prepared.kind !== "ready" || !prepared.head) throw new Error("Expected an old head.");
    appendRuntimeStreamHead(sqlite, prepared.head.head_id, "\r\nhead🙂\ud800");
  })();
  sqlite.exec(`INSERT INTO thread_runtime_items
    (thread_id, item_id, position, type, state, payload, streams)
    VALUES ('thread-1', 'tail-item', 8, 'assistant_message', 'started', '{}', '{}');
    INSERT INTO threads
      (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
    VALUES ('thread-2', 'project-1', 'Other thread', 'other-format', '{}', 'idle', 'none', '2026-01-01', '2026-01-01');`);
  return sqlite;
}

/** Byte receipts include raw JSON, canonical BLOB bytes, tail/state and gap/notice evidence. */
export function captureSchema53PayloadOriginEvidence(
  sqlite: InstanceType<typeof Database>,
): Record<string, unknown[]> {
  return {
    ...captureLegacyRuntimeStreamEvidence(sqlite),
    thread_runtime_item_stream_heads: sqlite
      .prepare("SELECT * FROM thread_runtime_item_stream_heads ORDER BY head_id")
      .all(),
    thread_runtime_item_stream_head_blocks: sqlite
      .prepare(
        "SELECT head_id, seq, chars, hex(data) AS data FROM thread_runtime_item_stream_head_blocks ORDER BY head_id, seq",
      )
      .all(),
  };
}

export function evidenceSha256(evidence: Record<string, unknown[]>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(evidence).map(([table, rows]) => [
      table,
      createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    ]),
  );
}

/** Test-only source assertion; production transport has not been wired. */
export function installFixtureOrigin(
  sqlite: InstanceType<typeof Database>,
  itemId = "growing",
  origin = ORIGIN_A,
  threadId = "thread-1",
): void {
  sqlite.transaction(() => {
    const row = sqlite
      .prepare("SELECT type, payload FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?")
      .get(threadId, itemId) as { type: string; payload: string | null };
    const write = sqlite
      .prepare("UPDATE thread_runtime_items SET payload = ? WHERE thread_id = ? AND item_id = ?")
      .run(row.payload, threadId, itemId);
    installTrustedRuntimePayloadOriginAfterCompleteWrite(sqlite, {
      threadId,
      itemId,
      itemType: row.type,
      installedPayload: row.payload,
      sqlChanges: write.changes,
      origin,
      custody: "captured-producer-complete-payload",
    });
  })();
}

export function originSchemaEvidence(sqlite: InstanceType<typeof Database>): unknown[] {
  return sqlite
    .prepare(`SELECT type, name, sql FROM sqlite_master
      WHERE name IN ('thread_runtime_item_payload_origins',
        'runtime_payload_origin_insert_reset', 'runtime_payload_origin_update_reset')
      ORDER BY name`)
    .all();
}
