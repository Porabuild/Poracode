import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import { ensureConversationSearchGeneration } from "./conversationSearchSchema";
import { LATEST_SCHEMA_VERSION } from "./migrations";
import {
  createSchema53PayloadOriginDatabase,
  migrateSchema53FixtureThrough,
} from "./runtimePayloadOrigins.testFixtures";
import { dbReadRunningToolCallItems } from "./runtimeItems";

const startupQueries = [
  {
    statement: /^DELETE FROM usage_events\b/i,
    parameters: [0],
    index: "idx_usage_events_ts",
    plan: "SEARCH usage_events USING INDEX idx_usage_events_ts",
  },
  {
    statement: /^SELECT thread_id, item_id, payload\s+FROM thread_runtime_items\b/i,
    parameters: [],
    index: "idx_runtime_items_tool_calls",
    plan: "USING INDEX idx_runtime_items_tool_calls",
  },
  {
    statement: /^DELETE FROM runtime_inline_image_blobs\b/i,
    parameters: [256],
    index: "idx_runtime_inline_image_blob_hash",
    plan: "USING COVERING INDEX idx_runtime_inline_image_blob_hash",
  },
] as const;

it("uses maintenance indexes for the startup statements on an existing current-schema database", () => {
  mkdirSync("tmp", { recursive: true });
  const dir = mkdtempSync(join("tmp", "startup-indexes-"));
  const path = join(dir, "state.sqlite");
  const legacy = createSchema53PayloadOriginDatabase(path);
  try {
    migrateSchema53FixtureThrough(legacy, LATEST_SCHEMA_VERSION);
    ensureConversationSearchGeneration(legacy);
    legacy
      .prepare("INSERT INTO usage_events (ts, kind, value) VALUES (?, 'tokens_v2', 10)")
      .run(Date.now());
    legacy.exec(`
      INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams)
        VALUES ('thread-1', 'old-tool', 50, 'tool_call', 'completed', '{"status":"running"}', '{}');
      INSERT INTO runtime_inline_image_blobs
        (blob_hash, encoding, mime, raw_bytes, inline_utf8_bytes)
        VALUES (printf('%064d', 1), 'raw_base64', 'image/png', x'01', 4);
      INSERT INTO thread_runtime_item_image_refs (thread_id, item_id, path_json, blob_hash)
        VALUES ('thread-1', 'old-tool', '["image"]', printf('%064d', 1));
    `);
    const snapshotRows = (db: typeof legacy) => [
      db.prepare("SELECT * FROM usage_events ORDER BY id").all(),
      db.prepare("SELECT * FROM thread_runtime_items ORDER BY thread_id, position").all(),
      db.prepare("SELECT * FROM runtime_inline_image_blobs ORDER BY blob_hash").all(),
    ];
    const before = snapshotRows(legacy);
    legacy.exec(`
      INSERT INTO usage_events (ts, kind, value) VALUES (0, 'tokens_v2', 10);
      INSERT INTO runtime_inline_image_blobs
        (blob_hash, encoding, mime, raw_bytes, inline_utf8_bytes)
        VALUES (printf('%064d', 2), 'raw_base64', 'image/png', x'02', 4);
    `);
    legacy.close();

    const validated = initDatabase(path, { schemaMode: "validate" });
    const findIndex = validated.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?",
    );
    for (const { index } of startupQueries) expect(findIndex.get(index)).toBeUndefined();
    closeDatabase();

    // Check the SQL the owner prepares, before it runs. That also catches an
    // index build moved below the maintenance it is meant to speed up.
    const prepare = Database.prototype.prepare;
    const plans = new Map<string, string>();
    const spy = vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql,
    ) {
      const query = startupQueries.find(({ statement }) => statement.test(sql));
      if (query) {
        const explain = prepare.call(this, `EXPLAIN QUERY PLAN ${sql}`) as Database.Statement<
          number[],
          { detail: string }
        >;
        const rows = explain.all(...query.parameters);
        plans.set(query.index, rows.map(({ detail }) => detail).join("\n"));
      }
      return prepare.call(this, sql);
    });
    try {
      const db = initDatabase(path);
      expect(db.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get()).toEqual({
        value: String(LATEST_SCHEMA_VERSION),
      });
      expect(snapshotRows(db)).toEqual(before);
      expect(dbReadRunningToolCallItems()).toContainEqual({
        threadId: "thread-1",
        itemId: "old-tool",
        payload: { status: "running" },
      });
      for (const { index, plan } of startupQueries) expect(plans.get(index)).toContain(plan);
    } finally {
      spy.mockRestore();
    }
  } finally {
    if (legacy.open) legacy.close();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("opens the database and rolls back partial index creation when the optional build fails", () => {
  const exec = Database.prototype.exec;
  const error = new Error("fixture index build failure");
  const spy = vi.spyOn(Database.prototype, "exec").mockImplementation(function (
    this: Database.Database,
    sql,
  ) {
    const result = exec.call(this, sql);
    if (sql.includes("CREATE INDEX IF NOT EXISTS idx_usage_events_ts")) throw error;
    return result;
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const db = initDatabase(":memory:");
    expect(warn).toHaveBeenCalledWith("[db] could not build startup maintenance indexes:", error);
    expect(db.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get()).toEqual({
      value: String(LATEST_SCHEMA_VERSION),
    });
    expect(
      db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_usage_events_ts'").get(),
    ).toBeUndefined();
  } finally {
    closeDatabase();
    warn.mockRestore();
    spy.mockRestore();
  }
});
