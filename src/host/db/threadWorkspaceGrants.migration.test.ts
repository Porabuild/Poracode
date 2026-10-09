import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  assertRequiredDatabaseSchema,
  DATABASE_MIGRATIONS,
  LATEST_SCHEMA_VERSION,
  repairSafeSchemaDrift,
  runDatabaseMigrations,
} from "./migrations";
import {
  createSchema53PayloadOriginDatabase,
  captureSchema53PayloadOriginEvidence,
} from "./runtimePayloadOrigins.testFixtures";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";
import { dbGetThread } from "./projectsThreads";
import {
  dbBeginThreadWorkspaceGrantOperation,
  dbGetUnresolvedThreadWorkspaceGrantOperation,
  dbMarkThreadWorkspaceGrantDispatched,
  dbReadThreadWorkspaceGrantOwner,
} from "./threadWorkspaceGrants";

let directory: string;
beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(join("tmp", "workspace-grant-migration-"));
});
afterEach(() => {
  closeDatabase();
  rmSync(directory, { recursive: true, force: true });
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});
function schema54() {
  const path = join(directory, "state.sqlite");
  const sqlite = createSchema53PayloadOriginDatabase(path);
  DATABASE_MIGRATIONS.find(({ version }) => version === 54)!.migrate(sqlite);
  sqlite.prepare("UPDATE app_state SET value = '54' WHERE key = 'schema_version'").run();
  return { sqlite, path };
}

describe("workspace grant migration 54 to 55", () => {
  it("upgrades real historical schema54, preserves old bytes and defaults only legacy grants", () => {
    const { sqlite, path } = schema54();
    try {
      const before = captureSchema53PayloadOriginEvidence(sqlite);
      expect(sqlite.prepare("PRAGMA table_info(threads)").all()).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "additional_directories" })]),
      );
      expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow(/additional_directories/);
      runDatabaseMigrations(sqlite, 54);
      assertRequiredDatabaseSchema(sqlite);
      expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
      expect(
        sqlite
          .prepare("SELECT additional_directories, workspace_grant_revision FROM threads")
          .all(),
      ).toEqual([
        { additional_directories: "[]", workspace_grant_revision: 0 },
        { additional_directories: "[]", workspace_grant_revision: 0 },
      ]);
      expect(
        sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
      ).toEqual({ value: String(LATEST_SCHEMA_VERSION) });
      expect(sqlite.prepare("SELECT * FROM thread_workspace_grant_operations").all()).toEqual([]);
    } finally {
      sqlite.close();
    }
    initDatabase(path, { schemaMode: "validate" });
    expect(dbGetThread("thread-1")).toMatchObject({
      additionalDirectories: [],
      workspaceGrantRevision: 0,
    });
    const { owner, revision } = dbReadThreadWorkspaceGrantOwner("thread-1");
    dbBeginThreadWorkspaceGrantOperation({
      threadId: "thread-1",
      operationToken: "crash",
      owner,
      expectedRevision: revision,
      candidate: [{ kind: "posix", path: "/pending" }],
    });
    dbMarkThreadWorkspaceGrantDispatched("thread-1", "crash");
    closeDatabase();
    initDatabase(path);
    expect(dbGetUnresolvedThreadWorkspaceGrantOperation("thread-1")?.state).toBe("dispatched");
    expect(dbGetThread("thread-1")?.additionalDirectories).toEqual([]);
  });

  it("rolls back columns, journal and version together if migration55 cannot commit", () => {
    const { sqlite } = schema54();
    try {
      sqlite.exec(`CREATE TRIGGER fail_schema55 BEFORE UPDATE OF value ON app_state
        WHEN NEW.key = 'schema_version' AND NEW.value = '55'
        BEGIN SELECT RAISE(ABORT, 'schema55 failure'); END;`);
      expect(() => runDatabaseMigrations(sqlite, 54)).toThrow("schema55 failure");
      expect(sqlite.prepare("PRAGMA table_info(threads)").all()).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "additional_directories" })]),
      );
      expect(
        sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE name = 'thread_workspace_grant_operations'",
          )
          .get(),
      ).toBeUndefined();
      expect(
        sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
      ).toEqual({ value: "54" });
      sqlite.exec("DROP TRIGGER fail_schema55");
      runDatabaseMigrations(sqlite, 54);
      assertRequiredDatabaseSchema(sqlite);
    } finally {
      sqlite.close();
    }
  });

  it("validate-only refuses schema54 without mutating it", () => {
    const { sqlite, path } = schema54();
    sqlite.close();
    expect(() => initDatabase(path, { schemaMode: "validate" })).toThrow(/schema is incomplete/);
    expect(
      getSqlite().prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
    ).toEqual({ value: "54" });
  });

  it.each([
    "workspace_grant_thread_retarget",
    "workspace_grant_project_delete",
    "workspace_grant_one_unresolved",
  ])("refuses missing custody guard %s even in repair mode", (name) => {
    const { sqlite, path } = schema54();
    runDatabaseMigrations(sqlite, 54);
    sqlite.exec(`DROP ${name.endsWith("unresolved") ? "INDEX" : "TRIGGER"} ${name}`);
    expect(() => repairSafeSchemaDrift(sqlite)).toThrow(/workspace grant custody/);
    expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow(/workspace grant custody/);
    sqlite.close();
    expect(() => initDatabase(path)).toThrow(/workspace grant custody/);
  });

  it("refuses missing committed columns instead of silently repairing lost authorization", () => {
    const { sqlite } = schema54();
    try {
      // A database falsely claiming 55 must not receive additive empty-grant repair.
      sqlite.prepare("UPDATE app_state SET value = '55' WHERE key = 'schema_version'").run();
      expect(() => repairSafeSchemaDrift(sqlite)).toThrow(/workspace grant custody/);
      expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow(/additional_directories/);
    } finally {
      sqlite.close();
    }
  });
});
