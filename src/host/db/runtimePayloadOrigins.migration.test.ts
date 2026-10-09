import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  assertRequiredDatabaseSchema,
  LATEST_SCHEMA_VERSION,
  runDatabaseMigrations,
} from "./migrations";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import { readRuntimePayloadOrigin } from "./runtimePayloadOrigins";
import { assertRuntimePayloadOriginSchema } from "./runtimePayloadOriginsSchema";
import {
  captureSchema53PayloadOriginEvidence,
  createSchema53PayloadOriginDatabase,
  evidenceSha256,
  installFixtureOrigin,
  LEGACY_SUMMARY_PAYLOAD,
  ORIGIN_A,
  originSchemaEvidence,
} from "./runtimePayloadOrigins.testFixtures";

type SqliteDatabase = InstanceType<typeof Database>;

describe.skipIf(!sqliteAvailable)("runtime payload origin migration 54", () => {
  let directory: string;
  let path: string;
  let handles: SqliteDatabase[];

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    mkdirSync("tmp", { recursive: true });
    directory = mkdtempSync(join("tmp", "origin-migration-"));
    path = join(directory, "state.sqlite");
    handles = [];
  });

  afterEach(() => {
    closeDatabase();
    for (const sqlite of handles) if (sqlite.open) sqlite.close();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function schema53() {
    const sqlite = createSchema53PayloadOriginDatabase(path);
    handles.push(sqlite);
    return sqlite;
  }

  it("migrates actual schema53 and reopens without changing payload, head, tail or gap bytes", async () => {
    const sqlite = schema53();
    const receiptPath = process.env.PORACODE_ORIGIN_STORAGE_CONSERVATION_RECEIPT;
    expect(originSchemaEvidence(sqlite)).toEqual([]);
    expect(
      sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
    ).toEqual({ value: "53" });
    const before = captureSchema53PayloadOriginEvidence(sqlite);
    if (receiptPath) {
      await sqlite.backup(join(dirname(receiptPath), "origin-storage-schema53.sqlite"));
    }
    runDatabaseMigrations(sqlite, 53);
    expect(sqlite.prepare("SELECT * FROM thread_runtime_item_payload_origins").all()).toEqual([]);
    expect(LATEST_SCHEMA_VERSION).toBe(57);
    expect(readRuntimePayloadOrigin(sqlite, "thread-1", "growing")).toBeUndefined();
    const afterMigration = captureSchema53PayloadOriginEvidence(sqlite);
    expect(afterMigration).toEqual(before);
    sqlite.close();
    initDatabase(path, { schemaMode: "validate" });
    const reopened = captureSchema53PayloadOriginEvidence(getSqlite());
    expect(reopened).toEqual(before);
    expect(readRuntimePayloadOrigin(getSqlite(), "thread-1", "growing")).toBeUndefined();
    expect(
      getSqlite()
        .prepare("SELECT payload FROM thread_runtime_items WHERE item_id = 'growing'")
        .get(),
    ).toEqual({ payload: LEGACY_SUMMARY_PAYLOAD });
    closeDatabase();
    initDatabase(path);
    expect(captureSchema53PayloadOriginEvidence(getSqlite())).toEqual(before);
    if (receiptPath) {
      writeFileSync(
        receiptPath,
        JSON.stringify(
          {
            sourceSchema: 53,
            migratedSchema: LATEST_SCHEMA_VERSION,
            rowCounts: Object.fromEntries(
              Object.entries(before).map(([table, rows]) => [table, rows.length]),
            ),
            before: evidenceSha256(before),
            afterMigration: evidenceSha256(afterMigration),
            afterValidateReopen: evidenceSha256(reopened),
            afterReopen: evidenceSha256(captureSchema53PayloadOriginEvidence(getSqlite())),
          },
          null,
          2,
        ) + "\n",
      );
    }
  });

  it("uses identical origin DDL and constraints for an upgraded database and fresh bootstrap", () => {
    const sqlite = schema53();
    runDatabaseMigrations(sqlite, 53);
    expect(() => assertRuntimePayloadOriginSchema(sqlite)).not.toThrow();
    const fresh = initDatabase(join(directory, "fresh.sqlite"));
    expect(originSchemaEvidence(fresh)).toEqual(originSchemaEvidence(sqlite));
    expect(() => assertRequiredDatabaseSchema(fresh)).not.toThrow();
    expect(
      fresh.prepare("PRAGMA foreign_key_list(thread_runtime_item_payload_origins)").all(),
    ).toMatchObject([
      {
        table: "thread_runtime_items",
        from: "thread_id",
        to: "thread_id",
        on_delete: "CASCADE",
        on_update: "CASCADE",
      },
      {
        table: "thread_runtime_items",
        from: "item_id",
        to: "item_id",
        on_delete: "CASCADE",
        on_update: "CASCADE",
      },
    ]);
  });

  it("refuses validate-only schema53 until origin custody has migrated", () => {
    schema53().close();
    expect(() => initDatabase(path, { schemaMode: "validate" })).toThrow(/payload_origins/);
    closeDatabase();
    expect(() => initDatabase(path)).not.toThrow();
  });

  it("rolls back origin DDL and schema version together when the schema54 version write fails", () => {
    const sqlite = schema53();
    const before = captureSchema53PayloadOriginEvidence(sqlite);
    sqlite.exec(`CREATE TRIGGER fail_schema54 BEFORE UPDATE OF value ON app_state
      WHEN NEW.key = 'schema_version' AND NEW.value = '54' BEGIN
        SELECT RAISE(ABORT, 'schema54 failure'); END;`);
    expect(() => runDatabaseMigrations(sqlite, 53)).toThrow("schema54 failure");
    expect(originSchemaEvidence(sqlite)).toEqual([]);
    expect(
      sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
    ).toEqual({ value: "53" });
    expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
    sqlite.exec("DROP TRIGGER fail_schema54");
    runDatabaseMigrations(sqlite, 53);
    expect(() => assertRequiredDatabaseSchema(sqlite)).not.toThrow();
  });

  it.each(["migrate", "validate"] as const)(
    "refuses an unknown newer schema in %s mode",
    (schemaMode) => {
      const sqlite = schema53();
      runDatabaseMigrations(sqlite, 53);
      sqlite
        .prepare("UPDATE app_state SET value = ? WHERE key = 'schema_version'")
        .run(String(LATEST_SCHEMA_VERSION + 1));
      sqlite.close();
      expect(() => initDatabase(path, { schemaMode })).toThrow(/newer than supported/);
    },
  );

  it("preserves valid origins in a physical SQLite backup and VACUUM copy", async () => {
    const sqlite = schema53();
    runDatabaseMigrations(sqlite, 53);
    installFixtureOrigin(sqlite);
    const before = captureSchema53PayloadOriginEvidence(sqlite);
    const copies = [join(directory, "backup.sqlite"), join(directory, "vacuum.sqlite")];
    await sqlite.backup(copies[0]!);
    sqlite.prepare("VACUUM INTO ?").run(copies[1]!);
    for (const copy of copies) {
      const copied = new Database(copy, {
        ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
      });
      handles.push(copied);
      expect(() => assertRequiredDatabaseSchema(copied)).not.toThrow();
      expect(readRuntimePayloadOrigin(copied, "thread-1", "growing")).toEqual(ORIGIN_A);
      expect(captureSchema53PayloadOriginEvidence(copied)).toEqual(before);
    }
    const receiptPath = process.env.PORACODE_ORIGIN_STORAGE_CONSERVATION_RECEIPT;
    if (receiptPath) {
      await sqlite.backup(join(dirname(receiptPath), "origin-storage-schema54-proved.sqlite"));
    }
  });
});
