import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbSyncChanges } from "./sync";
import { dbReadCatalogThreadPhase1, dbReadCatalogThreadPhase2 } from "./catalogReads";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";

describe.skipIf(!sqliteAvailable)("thread failure explanations", () => {
  let directory: string;
  let path: string;
  const thread = { ...testThread(), status: "error" as const, attention: "error" as const };
  const message = "Weekly quota exhausted. Choose another model or wait for the reset.";
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-thread-error-"));
    path = join(directory, "state.sqlite");
    initDatabase(path);
    dbUpsertProject(
      {
        id: thread.projectId,
        name: "Fixture",
        location: { kind: "posix", path: "/fixture" },
        createdAt: thread.createdAt,
      },
      0,
    );
    dbUpsertThread(thread, 0);
  });
  afterEach(() => {
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("keeps host failure details when a replica mirrors a row without them", () => {
    dbUpsertThread({ ...thread, errorMessage: message }, 0);
    dbSyncChanges({
      projects: [],
      threads: [{ thread, sortOrder: 0 }],
      deletedProjectIds: [],
      deletedThreadIds: [],
      viewJson: "{}",
    });
    expect(dbGetThread(thread.id)?.errorMessage).toBe(message);
  });

  it("includes and budgets the explanation in catalog refreshes", () => {
    dbUpsertThread({ ...thread, errorMessage: message }, 0);
    const first = dbReadCatalogThreadPhase1({ mode: "page", order: "manual", limit: 1 });
    const second = dbReadCatalogThreadPhase2(first.rows.map(({ id }) => id));
    expect(second[0]?.errorMessage).toBe(message);
    const bytes = first.rows[0]!.boundWireBytes;
    dbUpsertThread({ ...thread, errorMessage: message.repeat(100) }, 0);
    expect(
      dbReadCatalogThreadPhase1({ mode: "page", order: "manual", limit: 1 }).rows[0]!
        .boundWireBytes,
    ).toBeGreaterThan(bytes);
  });

  it("upgrades schema73 rows without inventing missing explanations", () => {
    getSqlite().exec(
      "ALTER TABLE threads DROP COLUMN error_message; UPDATE app_state SET value = '73' WHERE key = 'schema_version'",
    );
    closeDatabase();
    initDatabase(path);
    expect(dbGetThread(thread.id)).toMatchObject({ status: "error", title: thread.title });
    expect(dbGetThread(thread.id)).not.toHaveProperty("errorMessage");
    dbUpsertThread({ ...thread, errorMessage: message }, 0);
    closeDatabase();
    initDatabase(path);
    expect(dbGetThread(thread.id)?.errorMessage).toBe(message);
  });
});
