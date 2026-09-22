import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { OfflineImportDatabase } from "@/backend/ownership/hostImportDatabase";
import { LATEST_SCHEMA_VERSION } from "./migrations";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { RuntimeDurableGapStore } from "./runtimeDurableGap";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { resetRuntimePersistenceForTests } from "./runtimePersistenceRuntime";

const GAP_TABLES = [
  "runtime_persistence_epoch",
  "thread_runtime_gaps",
  "thread_runtime_epoch_touches",
] as const;

const NOTICE_TABLE = "thread_runtime_gap_notices";
const PRE49_THREAD_ID = "thread-pre-49-gap";

/**
 * Pre-upgrade regression guard for migrations 48 (B1 durable canonical-gap
 * evidence) and 49 (GUI notice acknowledgement). A schema-47 profile has no
 * evidence tables: opening it with current code must append them
 * (forward-only), and a validate-only open must refuse the incomplete schema
 * instead of silently serving it. A schema-48 profile has the evidence tables
 * but no episode identity and no notice table: migration 49 must backfill
 * every existing gap row with a persisted UUID and add the one-row-per-thread
 * notice table.
 */
describe.skipIf(!sqliteAvailable)("runtime durable-gap migrations (48, 49)", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-gap-migration-"));
    dbPath = join(dir, "state.sqlite");
  });

  afterEach(() => {
    resetRuntimePersistenceForTests();
    try {
      closeDatabase();
    } catch {
      // A validate-only refusal leaves the handle open for custody; closing it
      // here releases the test process's copy.
    }
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function rawDatabase(): Database.Database {
    return new Database(dbPath, {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    });
  }

  function downgradeToSchema47WithoutEvidenceTables(): void {
    initDatabase(dbPath);
    closeDatabase();
    const raw = rawDatabase();
    for (const table of [NOTICE_TABLE, ...GAP_TABLES]) raw.exec(`DROP TABLE ${table}`);
    raw.prepare("UPDATE app_state SET value = '47' WHERE key = 'schema_version'").run();
    raw.close();
  }

  /**
   * Real schema-48 shape with one pre-existing gap row: rebuild
   * `thread_runtime_gaps` without `episode_id`, drop the (49-only) notice
   * table, and set the stored version back to 48. This is the exact forward
   * migration path a real 48 profile takes.
   */
  function downgradeToSchema48WithGapRow(): void {
    initDatabase(dbPath);
    dbUpsertProject(
      {
        id: "project-pre-49",
        name: "Pre-49 project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), id: PRE49_THREAD_ID, projectId: "project-pre-49" }, 0);
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_gaps
           (thread_id, reason, refused_events, refused_bytes, epoch, created_at, episode_id)
         VALUES (?, 'age', 3, 300, 2, 1234, '00000000-0000-4000-8000-000000000000')`,
      )
      .run(PRE49_THREAD_ID);
    closeDatabase();
    const raw = rawDatabase();
    raw.exec(`
      CREATE TABLE thread_runtime_gaps_pre49 (
        thread_id       TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
        reason          TEXT NOT NULL,
        refused_events  INTEGER NOT NULL DEFAULT 0,
        refused_bytes   INTEGER NOT NULL DEFAULT 0,
        epoch           INTEGER NOT NULL,
        created_at      INTEGER NOT NULL
      );
      INSERT INTO thread_runtime_gaps_pre49
        (thread_id, reason, refused_events, refused_bytes, epoch, created_at)
        SELECT thread_id, reason, refused_events, refused_bytes, epoch, created_at
        FROM thread_runtime_gaps;
      DROP TABLE thread_runtime_gaps;
      ALTER TABLE thread_runtime_gaps_pre49 RENAME TO thread_runtime_gaps;
      DROP TABLE ${NOTICE_TABLE};
      UPDATE app_state SET value = '48' WHERE key = 'schema_version';
    `);
    raw.close();
  }

  function tableExists(name: string, sqlite: Database.Database = rawDatabase()): boolean {
    const row = sqlite
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) as { ok: number } | undefined;
    return row !== undefined;
  }

  it("appends the evidence tables and the singleton epoch row to a schema-47 profile", () => {
    downgradeToSchema47WithoutEvidenceTables();
    expect(LATEST_SCHEMA_VERSION).toBe(49);

    initDatabase(dbPath);
    const sqlite = rawDatabase();
    try {
      for (const table of GAP_TABLES) {
        expect(
          sqlite
            .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
            .get(table),
        ).toBeDefined();
      }
      expect(
        sqlite.prepare("SELECT epoch, armed FROM runtime_persistence_epoch WHERE id = 1").get(),
      ).toEqual({ epoch: 0, armed: 0 });
      expect(
        sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
      ).toEqual({ value: "49" });
      expect(tableExists(NOTICE_TABLE, sqlite)).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("a validate-only open of a pre-48 profile refuses the incomplete schema", () => {
    downgradeToSchema47WithoutEvidenceTables();
    expect(() => initDatabase(dbPath, { schemaMode: "validate" })).toThrow(
      /Database schema is incomplete; missing:.*runtime_persistence_epoch/,
    );
  });

  it("a validate-only open of a pre-49 profile refuses before the migration runs", () => {
    downgradeToSchema48WithGapRow();
    expect(() => initDatabase(dbPath, { schemaMode: "validate" })).toThrow(
      /Database schema is incomplete; missing:.*episode_id/,
    );
  });

  it("migration 49 backfills every pre-49 gap row with a persisted UUID and keeps its counters", () => {
    downgradeToSchema48WithGapRow();
    initDatabase(dbPath);
    const sqlite = rawDatabase();
    try {
      const row = sqlite
        .prepare(
          `SELECT reason, refused_events, refused_bytes, epoch, created_at, episode_id
             FROM thread_runtime_gaps WHERE thread_id = ?`,
        )
        .get(PRE49_THREAD_ID) as {
        reason: string;
        refused_events: number;
        refused_bytes: number;
        epoch: number;
        created_at: number;
        episode_id: string | null;
      };
      expect(row).toMatchObject({
        reason: "age",
        refused_events: 3,
        refused_bytes: 300,
        epoch: 2,
        created_at: 1234,
      });
      expect(row.episode_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(row.episode_id).not.toBe("00000000-0000-4000-8000-000000000000");

      // Accumulation preserves the backfilled identity instead of re-minting.
      const store = new RuntimeDurableGapStore({ now: () => 9_999 });
      store.bind(sqlite);
      store.arm();
      store.persistGap(PRE49_THREAD_ID, "age", 4, 400);
      const accumulated = sqlite
        .prepare(
          "SELECT refused_events, refused_bytes, episode_id FROM thread_runtime_gaps WHERE thread_id = ?",
        )
        .get(PRE49_THREAD_ID) as {
        refused_events: number;
        refused_bytes: number;
        episode_id: string;
      };
      expect(accumulated.refused_events).toBe(7);
      expect(accumulated.refused_bytes).toBe(700);
      expect(accumulated.episode_id).toBe(row.episode_id);
      expect(tableExists(NOTICE_TABLE, sqlite)).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("reopening a migrated pre-49 profile preserves the backfilled identity and the notice table", () => {
    downgradeToSchema48WithGapRow();
    initDatabase(dbPath);
    closeDatabase();
    initDatabase(dbPath);
    const sqlite = rawDatabase();
    try {
      const first = sqlite
        .prepare("SELECT episode_id FROM thread_runtime_gaps WHERE thread_id = ?")
        .get(PRE49_THREAD_ID) as { episode_id: string };
      expect(first.episode_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(tableExists(NOTICE_TABLE, sqlite)).toBe(true);
      expect(
        sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
      ).toEqual({ value: "49" });
    } finally {
      sqlite.close();
    }
  });

  it("a thread delete cascades the gap, touch, and notice rows", () => {
    initDatabase(dbPath);
    dbUpsertProject(
      {
        id: "project-cascade",
        name: "Cascade project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), id: PRE49_THREAD_ID, projectId: "project-cascade" }, 0);
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO thread_runtime_gaps
           (thread_id, reason, refused_events, refused_bytes, epoch, created_at, episode_id)
         VALUES (?, 'age', 1, 10, 1, 1, ?)`,
      )
      .run(PRE49_THREAD_ID, "11111111-1111-4111-8111-111111111111");
    sqlite
      .prepare(
        "INSERT INTO thread_runtime_epoch_touches (thread_id, epoch, touched_at) VALUES (?, 1, 1)",
      )
      .run(PRE49_THREAD_ID);
    sqlite
      .prepare(
        `INSERT INTO ${NOTICE_TABLE}
           (thread_id, acknowledged_token, source, reason, refused_events, refused_bytes,
            acknowledged_count, first_acknowledged_at, last_acknowledged_at)
         VALUES (?, 'gap2:e11111111-1111-4111-8111-111111111111', 'exact', 'age', 1, 10, 1, 1, 1)`,
      )
      .run(PRE49_THREAD_ID);
    sqlite.prepare("DELETE FROM threads WHERE id = ?").run(PRE49_THREAD_ID);
    for (const table of ["thread_runtime_gaps", "thread_runtime_epoch_touches", NOTICE_TABLE]) {
      expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });

  it("an offline import open never arms or writes the runtime evidence", () => {
    initDatabase(dbPath);
    closeDatabase();
    const backupDir = join(dir, "backup");
    mkdirSync(backupDir);
    copyFileSync(dbPath, join(backupDir, "state.sqlite"));
    const imported = OfflineImportDatabase.open(backupDir);
    try {
      expect(imported.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    } finally {
      imported.close();
    }
    // The offline import reads schema/version only: the boot epoch row and the
    // touch set are exactly what the migrated profile left behind.
    const raw = rawDatabase();
    try {
      expect(
        raw.prepare("SELECT epoch, armed FROM runtime_persistence_epoch WHERE id = 1").get(),
      ).toEqual({ epoch: 0, armed: 0 });
      expect(raw.prepare("SELECT COUNT(*) AS n FROM thread_runtime_epoch_touches").get()).toEqual({
        n: 0,
      });
      expect(raw.prepare(`SELECT COUNT(*) AS n FROM ${NOTICE_TABLE}`).get()).toEqual({ n: 0 });
    } finally {
      raw.close();
    }
  });

  it("is safe to reopen: re-running the migration keeps evidence rows", () => {
    downgradeToSchema47WithoutEvidenceTables();
    initDatabase(dbPath);
    const sqlite = rawDatabase();
    sqlite
      .prepare(
        "INSERT INTO runtime_persistence_epoch (id, epoch, armed, armed_at) VALUES (1, 7, 1, 1) ON CONFLICT(id) DO UPDATE SET epoch = 7, armed = 1",
      )
      .run();
    sqlite.close();
    closeDatabase();

    initDatabase(dbPath);
    const reopened = rawDatabase();
    try {
      expect(
        reopened.prepare("SELECT epoch, armed FROM runtime_persistence_epoch WHERE id = 1").get(),
      ).toEqual({ epoch: 7, armed: 1 });
      for (const table of GAP_TABLES) expect(tableExists(table, reopened)).toBe(true);
      expect(tableExists(NOTICE_TABLE, reopened)).toBe(true);
    } finally {
      reopened.close();
    }
  });
});
