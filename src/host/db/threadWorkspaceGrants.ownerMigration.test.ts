import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
import {
  createSchema53PayloadOriginDatabase,
  captureSchema53PayloadOriginEvidence,
} from "./runtimePayloadOrigins.testFixtures";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";
import {
  dbBeginThreadWorkspaceGrantOperation,
  dbCommitThreadWorkspaceGrants,
  dbGetThreadWorkspaceGrantOperation,
  dbGetUnresolvedThreadWorkspaceGrantOperation,
  dbMarkThreadWorkspaceGrantDispatched,
  dbReadThreadWorkspaceGrantOwner,
} from "./threadWorkspaceGrants";

let directory: string;
const handles: InstanceType<typeof Database>[] = [];
beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(join("tmp", "workspace-owner-migration-"));
});
afterEach(() => {
  closeDatabase();
  for (const sqlite of handles.splice(0)) if (sqlite.open) sqlite.close();
  rmSync(directory, { recursive: true, force: true });
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});

// Actual historical prefix, never latest schema with new columns removed.
function schema55() {
  const path = join(directory, "state.sqlite");
  const sqlite = createSchema53PayloadOriginDatabase(path);
  handles.push(sqlite);
  for (const schemaVersion of [54, 55]) {
    DATABASE_MIGRATIONS.find((migration) => migration.version === schemaVersion)!.migrate(sqlite);
    sqlite
      .prepare("UPDATE app_state SET value = ? WHERE key = 'schema_version'")
      .run(String(schemaVersion));
  }
  return { sqlite, path };
}
function version(sqlite: InstanceType<typeof Database>) {
  return sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get();
}
function journal(sqlite: InstanceType<typeof Database>) {
  return sqlite
    .prepare(
      "SELECT *, hex(owner_json) AS owner_bytes, hex(candidate_json) AS candidate_bytes FROM thread_workspace_grant_operations ORDER BY thread_id, operation_token",
    )
    .all();
}
function legacyOwner(sqlite: InstanceType<typeof Database>) {
  return (
    sqlite
      .prepare(`SELECT json_array(t.id, t.created_at, t.project_id, p.created_at,
    p.location_kind, p.location_path, p.location_distro, p.location_linux_path, p.location_unc_path,
    t.worktree_path, t.agent_kind, t.agent_instance_id, t.presentation_mode,
    json_extract(t.config, '$.executionEnvironment')) AS owner
    FROM threads t JOIN projects p ON p.id = t.project_id WHERE t.id = 'thread-1'`)
      .get() as { owner: string }
  ).owner;
}

// Frozen schema55 artifact's startup guard. Both migration and validate-only
// consumers called this guard; a new shape must not be accepted by that artifact.
function schema55ArtifactVersionGuard(storedVersion: number): void {
  const LATEST_SCHEMA_VERSION = 55;
  if (!Number.isInteger(storedVersion) || storedVersion < 0) {
    throw new Error(`Invalid database schema version: ${storedVersion}.`);
  }
  if (storedVersion > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${storedVersion} is newer than supported schema ${LATEST_SCHEMA_VERSION}.`,
    );
  }
}

describe("workspace owner migration55 to 56", () => {
  it("freezes the exact schema55 creator and DDL source", () => {
    expect(
      createHash("sha256")
        .update(readFileSync(join(import.meta.dirname, "threadWorkspaceGrantsSchema55.ts")))
        .digest("hex"),
    ).toBe("fc3cc136331f44b85704719443beb7075d9b476d9d9a0151bf5ce7aa497ccca2");
    const { sqlite } = schema55();
    expect(sqlite.prepare("PRAGMA table_info(threads)").all()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "workspace_owner_incarnation" })]),
    );
    expect(version(sqlite)).toEqual({ value: "55" });
  });

  it.each(["thread", "project"])(
    "demonstrates the schema55 %s ABA hole and its schema56 fence",
    (kind) => {
      const { sqlite, path } = schema55();
      const before = legacyOwner(sqlite);
      const cycle =
        kind === "thread"
          ? "UPDATE threads SET agent_instance_id = 'other' WHERE id = 'thread-1'; UPDATE threads SET agent_instance_id = NULL WHERE id = 'thread-1';"
          : "UPDATE projects SET location_path = location_path || '/other' WHERE id = 'project-1'; UPDATE projects SET location_path = substr(location_path, 1, length(location_path) - 6) WHERE id = 'project-1';";
      sqlite.exec(cycle);
      expect(legacyOwner(sqlite)).toBe(before);
      expect(
        sqlite
          .prepare("SELECT workspace_grant_revision AS revision FROM threads WHERE id = 'thread-1'")
          .get(),
      ).toEqual({ revision: 0 });
      runDatabaseMigrations(sqlite, 55);
      sqlite.close();
      initDatabase(path, { schemaMode: "validate" });
      const current = dbReadThreadWorkspaceGrantOwner("thread-1");
      getSqlite().exec(cycle);
      const after = dbReadThreadWorkspaceGrantOwner("thread-1");
      expect(after.revision).toBe(2);
      expect(after.owner).not.toBe(current.owner);
      expect(after.hasCommittedScope).toBe(false);
      expect(() =>
        dbBeginThreadWorkspaceGrantOperation({
          threadId: "thread-1",
          operationToken: "stale",
          expectedRevision: current.revision,
          owner: after.owner,
          candidate: [],
        }),
      ).toThrow(/conflict/);
    },
  );

  it.each(["pending", "dispatched", "ambiguous"] as const)(
    "preserves exact historical bytes and %s custody without dispatching on the new owner",
    (state) => {
      const { sqlite, path } = schema55();
      const owner = legacyOwner(sqlite);
      // Seed actual old records, preserving whitespace and supplementary characters
      // to make reserialization or invented evidence visible.
      sqlite
        .prepare(
          "UPDATE threads SET additional_directories = ?, workspace_grant_revision = 1 WHERE id = 'thread-1'",
        )
        .run('[ { "kind": "posix", "path": "/old 🙂" } ]');
      const insert = sqlite.prepare(`INSERT INTO thread_workspace_grant_operations
      (thread_id, operation_token, expected_revision, owner_json, candidate_json, state) VALUES (?, ?, ?, ?, ?, ?)`);
      insert.run(
        "thread-1",
        "committed",
        0,
        owner,
        '[ { "kind": "posix", "path": "/old 🙂" } ]',
        "committed",
      );
      insert.run(
        "thread-1",
        "failed",
        1,
        owner,
        '[ { "kind": "posix", "path": "/failed" } ]',
        "failed",
      );
      insert.run(
        "thread-1",
        "unresolved",
        1,
        owner,
        '[ { "kind": "posix", "path": "/candidate" } ]',
        state,
      );
      const before = journal(sqlite);
      const evidence = captureSchema53PayloadOriginEvidence(sqlite);
      const grants = sqlite
        .prepare(
          "SELECT id, additional_directories, workspace_grant_revision FROM threads ORDER BY id",
        )
        .all();
      runDatabaseMigrations(sqlite, 55);
      assertRequiredDatabaseSchema(sqlite);
      expect(journal(sqlite)).toEqual(before);
      expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(evidence);
      expect(
        sqlite
          .prepare(
            "SELECT id, additional_directories, workspace_grant_revision FROM threads ORDER BY id",
          )
          .all(),
      ).toEqual(grants);
      expect(version(sqlite)).toEqual({ value: "56" });
      sqlite.close();
      initDatabase(path, { schemaMode: "validate" });
      const current = dbReadThreadWorkspaceGrantOwner("thread-1");
      expect(current).toMatchObject({
        revision: 1,
        hasCommittedScope: true,
        additionalDirectories: [{ kind: "posix", path: "/old 🙂" }],
      });
      expect(current.owner).not.toBe(owner);
      for (const token of ["committed", "failed", "unresolved"]) {
        const saved = dbGetThreadWorkspaceGrantOperation("thread-1", token)!;
        expect(dbBeginThreadWorkspaceGrantOperation(saved)).toEqual(saved);
        expect(() => dbMarkThreadWorkspaceGrantDispatched("thread-1", token)).toThrow(Error);
        expect(() => dbCommitThreadWorkspaceGrants("thread-1", token)).toThrow(Error);
      }
      expect(dbGetUnresolvedThreadWorkspaceGrantOperation("thread-1")?.state).toBe(state);
      expect(journal(getSqlite())).toEqual(before);
      expect(() => getSqlite().exec("DELETE FROM threads WHERE id = 'thread-1'")).toThrow(Error);
      expect(() =>
        getSqlite().exec("UPDATE threads SET agent_kind = 'other' WHERE id = 'thread-1'"),
      ).toThrow(/custody/);
      closeDatabase();
      initDatabase(path);
      expect(dbReadThreadWorkspaceGrantOwner("thread-1")).toEqual(current);
      expect(journal(getSqlite())).toEqual(before);
    },
  );

  it.each([
    [0, "[]", 0],
    [0, "[ ]", 0],
    [3, "[]", 1],
    [0, '[{"kind":"posix","path":"/old"}]', 1],
  ])(
    "backfills initialized only from old revision=%s or nonempty scope",
    (revision, dirs, initialized) => {
      const { sqlite } = schema55();
      sqlite
        .prepare(
          "UPDATE threads SET workspace_grant_revision = ?, additional_directories = ? WHERE id = 'thread-1'",
        )
        .run(revision, dirs);
      runDatabaseMigrations(sqlite, 55);
      expect(
        sqlite
          .prepare("SELECT workspace_grants_initialized FROM threads WHERE id = 'thread-1'")
          .get(),
      ).toEqual({ workspace_grants_initialized: initialized });
    },
  );

  it("revisits complete schema56 without reminting or reclassifying owner-only revisions", () => {
    const { sqlite } = schema55();
    runDatabaseMigrations(sqlite, 55);
    sqlite.exec("UPDATE threads SET agent_instance_id = 'other' WHERE id = 'thread-1'");
    const before = sqlite.prepare("SELECT * FROM threads ORDER BY id").all();
    runDatabaseMigrations(sqlite, 55);
    expect(sqlite.prepare("SELECT * FROM threads ORDER BY id").all()).toEqual(before);
    expect(
      sqlite
        .prepare("SELECT workspace_grants_initialized FROM threads WHERE id = 'thread-1'")
        .get(),
    ).toEqual({ workspace_grants_initialized: 0 });
  });

  it.each([
    "workspace_owner_incarnation TEXT NOT NULL DEFAULT ''",
    "workspace_grants_initialized INTEGER NOT NULL DEFAULT 0",
  ])("refuses partial migration custody with only %s", (column) => {
    const { sqlite } = schema55();
    sqlite.exec(`ALTER TABLE threads ADD COLUMN ${column}`);
    expect(() => runDatabaseMigrations(sqlite, 55)).toThrow(/workspace grant column/);
    expect(version(sqlite)).toEqual({ value: "55" });
  });

  it("rolls back minted incarnations, new columns, triggers and version atomically", () => {
    const { sqlite } = schema55();
    const oldSchema = sqlite.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all();
    sqlite.exec(
      `CREATE TRIGGER fail_schema56 BEFORE UPDATE OF value ON app_state WHEN NEW.key = 'schema_version' AND NEW.value = '56' BEGIN SELECT RAISE(ABORT, 'schema56 failure'); END;`,
    );
    expect(() => runDatabaseMigrations(sqlite, 55)).toThrow(/schema56 failure/);
    expect(version(sqlite)).toEqual({ value: "55" });
    sqlite.exec("DROP TRIGGER fail_schema56");
    expect(sqlite.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all()).toEqual(
      oldSchema,
    );
    runDatabaseMigrations(sqlite, 55);
    assertRequiredDatabaseSchema(sqlite);
  });

  it.each([
    "workspace_grant_thread_retarget",
    "workspace_grant_one_unresolved",
    "thread_workspace_grant_operations",
  ])("refuses migration from missing schema55 custody %s", (name) => {
    const { sqlite } = schema55();
    const type =
      name === "thread_workspace_grant_operations"
        ? "TABLE"
        : name.endsWith("unresolved")
          ? "INDEX"
          : "TRIGGER";
    sqlite.exec(`DROP ${type} ${name}`);
    expect(() => runDatabaseMigrations(sqlite, 55)).toThrow(
      /custody|no such table: main.thread_workspace_grant_operations/,
    );
    expect(version(sqlite)).toEqual({ value: "55" });
    expect(sqlite.prepare("PRAGMA table_info(threads)").all()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "workspace_owner_incarnation" })]),
    );
  });

  it.each([
    "workspace_grant_owner_insert",
    "workspace_grant_owner_immutable",
    "workspace_grant_metadata_insert",
    "workspace_grant_metadata_update",
    "workspace_grant_thread_owner_advance",
    "workspace_grant_project_owner_advance",
  ])("refuses missing schema56 trigger %s in repair and validate mode", (name) => {
    const { sqlite, path } = schema55();
    runDatabaseMigrations(sqlite, 55);
    sqlite.exec(`DROP TRIGGER ${name}`);
    expect(() => repairSafeSchemaDrift(sqlite)).toThrow(/custody/);
    expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow(/custody/);
    sqlite.close();
    expect(() => initDatabase(path, { schemaMode: "validate" })).toThrow(/custody/);
    closeDatabase();
    expect(() => initDatabase(path)).toThrow(/custody/);
  });

  it("refuses schema56 claims with missing new columns instead of minting replacement authority", () => {
    const { sqlite, path } = schema55();
    sqlite.exec("UPDATE app_state SET value = '56' WHERE key = 'schema_version'");
    expect(() => repairSafeSchemaDrift(sqlite)).toThrow(/workspace_owner_incarnation/);
    expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow(
      /workspace_owner_incarnation.*workspace_grants_initialized/,
    );
    sqlite.close();
    expect(() => initDatabase(path)).toThrow(/workspace_owner_incarnation/);
  });

  it("old schema55 artifacts refuse schema56 even though old tables and locks are intact", () => {
    const { sqlite } = schema55();
    schema55ArtifactVersionGuard(55);
    runDatabaseMigrations(sqlite, 55);
    expect(() =>
      schema55ArtifactVersionGuard(Number((version(sqlite) as { value: string }).value)),
    ).toThrow("Database schema 56 is newer than supported schema 55.");
  });
});
