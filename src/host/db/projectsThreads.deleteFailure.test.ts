import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbDeleteProject, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbApplyThreadRuntimeEvents, dbHasPendingThreadRuntimeWrites } from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { resetRuntimePersistenceForTests } from "./runtimePersistenceRuntime";

describe.skipIf(!sqliteAvailable)("project deletion transaction", () => {
  let directory: string;
  let previousBinding: string | undefined;

  beforeEach(() => {
    previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-project-delete-"));
    initDatabase(join(directory, "state.sqlite"));
    resetRuntimePersistenceForTests();
    dbUpsertProject(
      {
        id: "project-1",
        name: "Deletion transaction",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
    getSqlite()
      .prepare("INSERT INTO project_notes (project_id, doc, todos, updated_at) VALUES (?, ?, ?, ?)")
      .run("project-1", "Keep these notes if deletion fails", "[]", "2026-01-01T00:00:00.000Z");
  });

  afterEach(() => {
    getSqlite().exec("DROP TRIGGER IF EXISTS refuse_project_notes_delete");
    resetRuntimePersistenceForTests();
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    if (previousBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
  });

  it("rolls back the project and thread cascade when notes deletion fails, then retries safely", () => {
    expect(
      dbApplyThreadRuntimeEvents("thread-1", [
        {
          type: "item.started",
          threadId: "thread-1",
          itemId: "pending-item",
          itemType: "assistant_message",
        },
      ]),
    ).toMatchObject({ kind: "accepted" });
    getSqlite().exec(`
      CREATE TRIGGER refuse_project_notes_delete BEFORE DELETE ON project_notes
      BEGIN SELECT RAISE(ABORT, 'notes deletion refused'); END;
    `);

    expect(() => dbDeleteProject("project-1")).toThrow("notes deletion refused");
    expect(
      getSqlite().prepare("SELECT id FROM projects WHERE id = ?").get("project-1"),
    ).toBeTruthy();
    expect(getSqlite().prepare("SELECT id FROM threads WHERE id = ?").get("thread-1")).toBeTruthy();
    expect(dbHasPendingThreadRuntimeWrites("thread-1")).toBe(true);
    expect(
      getSqlite().prepare("SELECT thread_id FROM thread_runtime_epoch_touches").all(),
    ).toHaveLength(1);

    getSqlite().exec("DROP TRIGGER refuse_project_notes_delete");
    dbDeleteProject("project-1");
    expect(getSqlite().prepare("SELECT id FROM projects").all()).toHaveLength(0);
    expect(getSqlite().prepare("SELECT id FROM threads").all()).toHaveLength(0);
    expect(getSqlite().prepare("SELECT project_id FROM project_notes").all()).toHaveLength(0);
    expect(
      getSqlite().prepare("SELECT thread_id FROM thread_runtime_epoch_touches").all(),
    ).toHaveLength(0);
    expect(dbHasPendingThreadRuntimeWrites("thread-1")).toBe(false);
  });
});
