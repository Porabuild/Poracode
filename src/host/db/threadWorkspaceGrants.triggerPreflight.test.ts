import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  assertRequiredDatabaseSchema,
  DATABASE_MIGRATIONS,
  repairSafeSchemaDrift,
  runDatabaseMigrations,
} from "./migrations";
import { createSchema53PayloadOriginDatabase } from "./runtimePayloadOrigins.testFixtures";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";
import {
  assertThreadWorkspaceGrantsSchema56,
  createThreadWorkspaceGrantsSchema56,
} from "./threadWorkspaceGrantsSchema56";

let directory: string;
const handles: InstanceType<typeof Database>[] = [];
beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  mkdirSync("tmp/devin", { recursive: true });
  directory = mkdtempSync("tmp/devin/workspace-owner56-trigger-fix-");
});
afterEach(() => {
  closeDatabase();
  for (const sqlite of handles.splice(0)) if (sqlite.open) sqlite.close();
  rmSync(directory, { recursive: true, force: true });
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});

function fixture(version: 54 | 55 | 56) {
  const path = join(directory, "state.sqlite");
  const sqlite = createSchema53PayloadOriginDatabase(path);
  handles.push(sqlite);
  for (const migration of DATABASE_MIGRATIONS) {
    if (migration.version <= 53 || migration.version > version) continue;
    migration.migrate(sqlite);
    sqlite
      .prepare("UPDATE app_state SET value = ? WHERE key = 'schema_version'")
      .run(String(migration.version));
  }
  return { sqlite, path };
}

function evidence(sqlite: InstanceType<typeof Database>) {
  return {
    schema: sqlite.prepare("SELECT * FROM sqlite_master ORDER BY name").all(),
    version: sqlite.prepare("SELECT * FROM app_state ORDER BY key").all(),
    threads: sqlite.prepare("SELECT * FROM threads ORDER BY id").all(),
    projects: sqlite.prepare("SELECT * FROM projects ORDER BY id").all(),
    journal: sqlite
      .prepare(
        "SELECT *, hex(owner_json), hex(candidate_json) FROM thread_workspace_grant_operations ORDER BY thread_id, operation_token",
      )
      .all(),
  };
}

function seedUnresolved(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`INSERT INTO thread_workspace_grant_operations
    (thread_id, operation_token, expected_revision, owner_json, candidate_json, state)
    VALUES ('thread-1', 'unresolved', 0, '[ "old owner 🙂" ]', '[ ]', 'ambiguous');`);
}

const staleRevisionWriter = `CREATE TRIGGER stale_revision_writer
  BEFORE UPDATE OF workspace_grant_revision ON threads
  BEGIN SELECT RAISE(IGNORE); END;`;
const staleJournalCleanup = `CREATE TRIGGER stale_journal_cleanup AFTER UPDATE ON threads
  BEGIN DELETE FROM thread_workspace_grant_operations WHERE thread_id = NEW.id; END;`;

describe("workspace custody trigger preflight", () => {
  it("rejects stale_revision_writer before accepting an ABA-vulnerable current schema", () => {
    const { sqlite } = fixture(56);
    sqlite.exec(staleRevisionWriter);
    const before = evidence(sqlite);
    expect(() => assertThreadWorkspaceGrantsSchema56(sqlite)).toThrow(
      /custody.*stale_revision_writer/,
    );
    expect(evidence(sqlite)).toEqual(before);
  });

  it.each(["creator", "registry"])(
    "rejects stale_journal_cleanup before %s backfill loses ambiguous custody",
    (entry) => {
      const { sqlite } = fixture(55);
      seedUnresolved(sqlite);
      sqlite.exec(staleJournalCleanup);
      const before = evidence(sqlite);
      expect(() =>
        entry === "creator"
          ? createThreadWorkspaceGrantsSchema56(sqlite)
          : runDatabaseMigrations(sqlite, 55),
      ).toThrow(/custody.*stale_journal_cleanup/);
      expect(evidence(sqlite)).toEqual(before);
    },
  );

  it.each([55, 56] as const)(
    "refuses schema%s safe repair before any DDL or row mutation",
    (version) => {
      const { sqlite } = fixture(version);
      // Repair would add a column and backfill archived_at, executing the cleanup.
      sqlite.exec(
        "ALTER TABLE threads DROP COLUMN done_at; UPDATE threads SET archived = 1, archived_at = NULL WHERE id = 'thread-1'",
      );
      seedUnresolved(sqlite);
      sqlite.exec(staleJournalCleanup);
      const before = evidence(sqlite);
      const bytes = sqlite.serialize();
      expect(() => repairSafeSchemaDrift(sqlite)).toThrow(/custody.*stale_journal_cleanup/);
      expect(evidence(sqlite)).toEqual(before);
      expect(sqlite.serialize()).toEqual(bytes);
    },
  );

  it.each(["migrate", "validate"] as const)(
    "refuses an extra persistent trigger during latest %s startup",
    (schemaMode) => {
      const { sqlite, path } = fixture(56);
      sqlite.exec("UPDATE threads SET archived = 1, archived_at = NULL WHERE id = 'thread-1'");
      seedUnresolved(sqlite);
      sqlite.exec(staleJournalCleanup);
      const before = evidence(sqlite);
      sqlite.close();
      expect(() => initDatabase(path, { schemaMode })).toThrow(/custody.*stale_journal_cleanup/);
      expect(evidence(getSqlite())).toEqual(before);
    },
  );

  it.each([
    [55, "threads"],
    [55, "PROJECTS"],
    [55, "Thread_Workspace_Grant_Operations"],
    [56, "threads"],
    [56, "PROJECTS"],
    [56, "Thread_Workspace_Grant_Operations"],
  ] as const)("closes schema%s persistent trigger inventory on %s", (version, table) => {
    const { sqlite } = fixture(version);
    sqlite.exec(
      `CREATE TRIGGER unexpected_authority_trigger AFTER UPDATE ON ${table} BEGIN SELECT 1; END;`,
    );
    const before = evidence(sqlite);
    const check =
      version === 56 ? assertRequiredDatabaseSchema : createThreadWorkspaceGrantsSchema56;
    expect(() => check(sqlite)).toThrow(/custody.*unexpected_authority_trigger/);
    expect(() => repairSafeSchemaDrift(sqlite)).toThrow(/custody.*unexpected_authority_trigger/);
    expect(evidence(sqlite)).toEqual(before);
  });

  it.each([
    [55, "workspace_grant_thread_retarget"],
    [56, "workspace_grant_metadata_update"],
  ] as const)("rejects altered known schema%s trigger %s before safe repair", (version, name) => {
    const { sqlite } = fixture(version);
    sqlite.exec("UPDATE threads SET archived = 1, archived_at = NULL WHERE id = 'thread-1'");
    seedUnresolved(sqlite);
    sqlite.exec(`DROP TRIGGER ${name}; CREATE TRIGGER ${name} AFTER UPDATE ON threads
      BEGIN DELETE FROM thread_workspace_grant_operations WHERE thread_id = NEW.id; END;`);
    const before = evidence(sqlite);
    expect(() => repairSafeSchemaDrift(sqlite)).toThrow(new RegExp(`custody.*${name}`));
    expect(evidence(sqlite)).toEqual(before);
  });

  it("permits TEMP fault injection and unrelated persistent triggers", () => {
    const { sqlite } = fixture(56);
    sqlite.exec(`CREATE TEMP TRIGGER transient_failure BEFORE UPDATE ON thread_workspace_grant_operations
      WHEN NEW.state = 'committed' BEGIN SELECT RAISE(ABORT, 'transient failure'); END;
      CREATE TRIGGER unrelated_trigger AFTER UPDATE ON app_state BEGIN SELECT 1; END;`);
    seedUnresolved(sqlite);
    assertRequiredDatabaseSchema(sqlite);
    repairSafeSchemaDrift(sqlite);
    const before = evidence(sqlite);
    expect(() =>
      sqlite.exec("UPDATE thread_workspace_grant_operations SET state = 'committed'"),
    ).toThrow(/transient failure/);
    expect(evidence(sqlite)).toEqual(before);
  });

  it("still repairs safe drift in pre55 databases with no workspace custody", () => {
    const { sqlite } = fixture(54);
    sqlite.exec(
      "ALTER TABLE threads DROP COLUMN done_at; UPDATE threads SET archived = 1, archived_at = NULL WHERE id = 'thread-1'",
    );
    repairSafeSchemaDrift(sqlite);
    expect(
      sqlite
        .prepare(
          "SELECT done_at, archived_at = updated_at AS repaired FROM threads WHERE id = 'thread-1'",
        )
        .get(),
    ).toEqual({ done_at: null, repaired: 1 });
  });

  it.each([55, 56] as const)(
    "refuses a schema%s claim with all workspace custody missing",
    (version) => {
      const { sqlite } = fixture(54);
      sqlite
        .prepare("UPDATE app_state SET value = ? WHERE key = 'schema_version'")
        .run(String(version));
      const bytes = sqlite.serialize();
      expect(() => repairSafeSchemaDrift(sqlite)).toThrow(/workspace grant/);
      expect(sqlite.serialize()).toEqual(bytes);
    },
  );

  it.each([
    "ALTER TABLE threads ADD COLUMN ADDITIONAL_DIRECTORIES TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE threads ADD COLUMN workspace_owner_incarnation TEXT NOT NULL DEFAULT ''",
    "CREATE TABLE THREAD_WORKSPACE_GRANT_OPERATIONS (thread_id TEXT)",
    "CREATE TRIGGER workspace_grant_owner_insert AFTER INSERT ON threads BEGIN SELECT 1; END;",
  ])("refuses partial workspace artifacts despite a pre55 version: %s", (sql) => {
    const { sqlite } = fixture(54);
    sqlite.exec(sql);
    const bytes = sqlite.serialize();
    expect(() => repairSafeSchemaDrift(sqlite)).toThrow(/workspace grant/);
    expect(sqlite.serialize()).toEqual(bytes);
  });
});
