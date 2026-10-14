import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  assertRequiredDatabaseSchema,
  LATEST_SCHEMA_VERSION,
  runDatabaseMigrations,
} from "./migrations";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import { dbGetThreadRuntimeItemCommitted } from "./runtimeItemRead";
import { resetRuntimePersistenceForTests } from "./runtimePersistenceRuntime";
import { joinWithElision } from "./runtimeStreamCap";
import {
  captureLegacyRuntimeStreamEvidence,
  createLegacyRuntimeStreamDatabase,
  seedLegacyRuntimeStreamEvidence,
} from "./runtimeStreamHeadMigration.testFixtures";
import { readRuntimeStreamHeads } from "./runtimeStreamHeadRead";
import {
  RUNTIME_STREAM_HEAD_BLOCK_CHARS,
  RUNTIME_STREAM_HEAD_MAX_BLOCKS,
} from "./runtimeStreamHeadSchema";
import { appendRuntimeStreamHead, prepareRuntimeStreamHead } from "./runtimeStreamHeadStore";

type SqliteDatabase = InstanceType<typeof Database>;
const HEAD_TABLES = [
  "thread_runtime_item_stream_heads",
  "thread_runtime_item_stream_head_blocks",
] as const;

function headRows(sqlite: SqliteDatabase): unknown[][] {
  return HEAD_TABLES.map((table) => sqlite.prepare(`SELECT * FROM ${table}`).all());
}

function headSchema(sqlite: SqliteDatabase): unknown[] {
  return [
    sqlite
      .prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
      WHERE tbl_name IN ('thread_runtime_item_stream_heads', 'thread_runtime_item_stream_head_blocks')
        OR name = 'runtime_stream_head_seed_reset' ORDER BY name`)
      .all(),
    ...HEAD_TABLES.map((table) => [
      sqlite.prepare(`PRAGMA table_info(${table})`).all(),
      sqlite.prepare(`PRAGMA foreign_key_list(${table})`).all(),
      sqlite.prepare(`PRAGMA index_list(${table})`).all(),
    ]),
  ];
}

function append(sqlite: SqliteDatabase, delta: string, itemId = "growing") {
  return sqlite
    .transaction(() => {
      const prepared = prepareRuntimeStreamHead(sqlite, {
        threadId: "thread-1",
        itemId,
        stream: "command_output",
      });
      if (prepared.kind !== "ready" || !prepared.head)
        throw new Error("Expected an eligible head.");
      return appendRuntimeStreamHead(sqlite, prepared.head.head_id, delta);
    })
    .immediate();
}

function readHeads(sqlite: SqliteDatabase) {
  return sqlite.transaction(() => {
    const row = sqlite
      .prepare(`SELECT item_id, streams FROM thread_runtime_items
      WHERE thread_id = 'thread-1' AND item_id = 'growing'`)
      .get() as {
      item_id: string;
      streams: string;
    };
    return readRuntimeStreamHeads(sqlite, "thread-1", [row]).get(row.item_id);
  })();
}

describe.skipIf(!sqliteAvailable)("runtime growing-head migration 53", () => {
  let directory: string;
  let path: string;
  let handles: SqliteDatabase[];

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    resetRuntimePersistenceForTests();
    directory = mkdtempSync(join(tmpdir(), "poracode-head-migration-"));
    path = join(directory, "state.sqlite");
    handles = [];
  });

  afterEach(() => {
    resetRuntimePersistenceForTests();
    closeDatabase();
    for (const sqlite of handles) if (sqlite.open) sqlite.close();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function legacy() {
    const sqlite = createLegacyRuntimeStreamDatabase(path);
    handles.push(sqlite);
    const seed = seedLegacyRuntimeStreamEvidence(sqlite);
    return { sqlite, seed };
  }

  it("leaves real schema-52 seeds, tails, item metadata and durable gap evidence unchanged", () => {
    const { sqlite, seed } = legacy();
    const before = captureLegacyRuntimeStreamEvidence(sqlite);
    expect(
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE name LIKE 'thread_runtime_item_stream_head%'",
        )
        .all(),
    ).toEqual([]);
    runDatabaseMigrations(sqlite, 52);
    expect(captureLegacyRuntimeStreamEvidence(sqlite)).toEqual(before);
    expect(headRows(sqlite)).toEqual([[], []]);
    expect(
      sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
    ).toEqual({ value: String(LATEST_SCHEMA_VERSION) });
    sqlite.close();

    initDatabase(path, { schemaMode: "validate" });
    expect(captureLegacyRuntimeStreamEvidence(getSqlite())).toEqual(before);
    expect(readHeads(getSqlite())).toEqual(JSON.parse(seed));
    const seedStreams = JSON.parse(seed) as Record<string, string>;
    expect(dbGetThreadRuntimeItemCommitted("thread-1", "growing")?.streams).toEqual({
      ...seedStreams,
      assistant_text: joinWithElision(seedStreams.assistant_text!, "a\ntail\n", 20),
    });
    closeDatabase();
    initDatabase(path);
    expect(captureLegacyRuntimeStreamEvidence(getSqlite())).toEqual(before);
    expect(headRows(getSqlite())).toEqual([[], []]);
  });

  it("uses identical columns, foreign keys, indexes, constraints and trigger on fresh bootstrap", () => {
    const { sqlite } = legacy();
    runDatabaseMigrations(sqlite, 52);
    const upgraded = headSchema(sqlite);
    const fresh = initDatabase(join(directory, "fresh.sqlite"));
    expect(headSchema(fresh)).toEqual(upgraded);
    expect(() => assertRequiredDatabaseSchema(fresh)).not.toThrow();
  });

  it("refuses validate-only schema 52 until the head schema has migrated", () => {
    const { sqlite } = legacy();
    sqlite.close();
    expect(() => initDatabase(path, { schemaMode: "validate" })).toThrow(
      /schema is incomplete; missing:.*stream_heads/,
    );
    closeDatabase();
    const migrated = initDatabase(path);
    expect(() => assertRequiredDatabaseSchema(migrated)).not.toThrow();
  });

  it("rolls back migration DDL and schema version together on a failed version write", () => {
    const { sqlite } = legacy();
    const before = captureLegacyRuntimeStreamEvidence(sqlite);
    sqlite.exec(`CREATE TRIGGER fail_schema53 BEFORE UPDATE OF value ON app_state
      WHEN NEW.key = 'schema_version' AND NEW.value = '53' BEGIN
        SELECT RAISE(ABORT, 'schema53 failure');
      END;`);
    expect(() => runDatabaseMigrations(sqlite, 52)).toThrow("schema53 failure");
    expect(
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE name LIKE 'thread_runtime_item_stream_head%' OR name = 'runtime_stream_head_seed_reset'",
        )
        .all(),
    ).toEqual([]);
    expect(
      sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
    ).toEqual({ value: "52" });
    expect(captureLegacyRuntimeStreamEvidence(sqlite)).toEqual(before);
    sqlite.exec("DROP TRIGGER fail_schema53");
    expect(() => runDatabaseMigrations(sqlite, 52)).not.toThrow();
  });

  it("initializes a legacy seed lazily and rolls back first-append metadata and blocks together", () => {
    const { sqlite, seed } = legacy();
    runDatabaseMigrations(sqlite, 52);
    const before = captureLegacyRuntimeStreamEvidence(sqlite);
    sqlite.exec(`CREATE TRIGGER fail_head_block BEFORE INSERT ON thread_runtime_item_stream_head_blocks
      BEGIN SELECT RAISE(ABORT, 'head block failure'); END;`);
    const delta = "\ud800x\udfff🙂";
    expect(() => append(sqlite, delta)).toThrow("head block failure");
    expect(headRows(sqlite)).toEqual([[], []]);
    expect(captureLegacyRuntimeStreamEvidence(sqlite)).toEqual(before);
    sqlite.exec("DROP TRIGGER fail_head_block");
    const result = append(sqlite, delta);
    expect(result.remainder).toBe("");
    expect(result.head).toMatchObject({ seed_chars: 8, head_chars: 8 + delta.length, next_seq: 1 });
    const expectedHeads = {
      ...(JSON.parse(seed) as Record<string, string>),
      command_output: "old-head" + delta,
    };
    expect(readHeads(sqlite)).toEqual(expectedHeads);
    expect(
      sqlite.prepare("SELECT streams FROM thread_runtime_items WHERE item_id = 'growing'").get(),
    ).toEqual({ streams: seed });
    expect(captureLegacyRuntimeStreamEvidence(sqlite)).toEqual(before);
    sqlite.close();
    initDatabase(path, { schemaMode: "validate" });
    expect(readHeads(getSqlite())).toEqual(expectedHeads);
  });

  it.each(["migrate", "validate"] as const)(
    "refuses a newer schema in %s mode with every required column present",
    (schemaMode) => {
      const { sqlite } = legacy();
      runDatabaseMigrations(sqlite, 52);
      append(sqlite, "new content");
      sqlite
        .prepare("UPDATE app_state SET value = ? WHERE key = 'schema_version'")
        .run(String(LATEST_SCHEMA_VERSION + 1));
      const before = headRows(sqlite);
      expect(() => assertRequiredDatabaseSchema(sqlite)).not.toThrow();
      sqlite.close();
      expect(() => initDatabase(path, { schemaMode })).toThrow(
        new RegExp(
          `schema ${LATEST_SCHEMA_VERSION + 1} is newer than supported schema ${LATEST_SCHEMA_VERSION}`,
        ),
      );
      expect(headRows(getSqlite())).toEqual(before);
      expect(
        getSqlite().prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
      ).toEqual({ value: String(LATEST_SCHEMA_VERSION + 1) });
    },
  );

  it("resets overlays for an identical seed assignment, preserves tails, and rolls the reset back atomically", () => {
    const { sqlite, seed } = legacy();
    runDatabaseMigrations(sqlite, 52);
    append(sqlite, "overlay");
    const before = headRows(sqlite);
    const legacyBefore = captureLegacyRuntimeStreamEvidence(sqlite);
    const reset = sqlite.prepare(
      "UPDATE thread_runtime_items SET streams = ? WHERE item_id = 'growing'",
    );
    expect(() =>
      sqlite.transaction(() => {
        reset.run(seed);
        throw new Error("reset failure");
      })(),
    ).toThrow("reset failure");
    expect(headRows(sqlite)).toEqual(before);
    sqlite
      .prepare("UPDATE thread_runtime_items SET state = 'completed' WHERE item_id = 'growing'")
      .run();
    expect(headRows(sqlite)).toEqual(before);
    reset.run(seed);
    expect(headRows(sqlite)).toEqual([[], []]);
    const after = captureLegacyRuntimeStreamEvidence(sqlite);
    expect(after.thread_runtime_item_stream_chunks).toEqual(
      legacyBefore.thread_runtime_item_stream_chunks,
    );
    expect(after.thread_runtime_item_stream_state).toEqual(
      legacyBefore.thread_runtime_item_stream_state,
    );
    expect(readHeads(sqlite)).toEqual(JSON.parse(seed));
  });

  it("cascades key-only item moves, head ids and item deletion through the canonical block foreign keys", () => {
    const { sqlite } = legacy();
    runDatabaseMigrations(sqlite, 52);
    sqlite.exec(`INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, streams)
      VALUES ('thread-1', 'movable', 8, 'assistant_message', 'started', '{}')`);
    const { head } = append(sqlite, "move", "movable");
    sqlite
      .prepare("UPDATE thread_runtime_items SET item_id = 'moved' WHERE item_id = 'movable'")
      .run();
    expect(
      sqlite
        .prepare("SELECT item_id FROM thread_runtime_item_stream_heads WHERE head_id = ?")
        .get(head.head_id),
    ).toEqual({ item_id: "moved" });
    const movedId = head.head_id + 1000;
    sqlite
      .prepare("UPDATE thread_runtime_item_stream_heads SET head_id = ? WHERE head_id = ?")
      .run(movedId, head.head_id);
    expect(
      sqlite.prepare("SELECT head_id FROM thread_runtime_item_stream_head_blocks").all(),
    ).toEqual([{ head_id: movedId }]);
    sqlite.prepare("DELETE FROM thread_runtime_items WHERE item_id = 'moved'").run();
    expect(headRows(sqlite)).toEqual([[], []]);
  });

  it("bounds metadata and physical block sequences to the retained head", () => {
    const { sqlite } = legacy();
    runDatabaseMigrations(sqlite, 52);
    const { head } = append(sqlite, "bounded");
    expect(RUNTIME_STREAM_HEAD_MAX_BLOCKS).toBe(32);
    expect(() =>
      sqlite
        .prepare("UPDATE thread_runtime_item_stream_heads SET next_seq = ? WHERE head_id = ?")
        .run(RUNTIME_STREAM_HEAD_MAX_BLOCKS + 1, head.head_id),
    ).toThrow(/CHECK constraint failed/);
    const insert = sqlite.prepare(
      "INSERT INTO thread_runtime_item_stream_head_blocks (head_id, seq, chars, data) VALUES (?, ?, 1, ?)",
    );
    for (const seq of [-1, RUNTIME_STREAM_HEAD_MAX_BLOCKS]) {
      expect(() => insert.run(head.head_id, seq, Buffer.from("x", "utf16le"))).toThrow(
        /CHECK constraint failed/,
      );
    }
  });

  it.each([
    [0, Buffer.alloc(0)],
    [RUNTIME_STREAM_HEAD_BLOCK_CHARS + 1, Buffer.alloc((RUNTIME_STREAM_HEAD_BLOCK_CHARS + 1) * 2)],
    [1, Buffer.alloc(1)],
    [1, "xx"],
  ])("rejects a malformed head block with %i chars", (chars, data) => {
    const { sqlite } = legacy();
    runDatabaseMigrations(sqlite, 52);
    const { head } = append(sqlite, "valid");
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO thread_runtime_item_stream_head_blocks (head_id, seq, chars, data) VALUES (?, 1, ?, ?)",
        )
        .run(head.head_id, chars, data),
    ).toThrow(/CHECK constraint failed/);
  });
});
