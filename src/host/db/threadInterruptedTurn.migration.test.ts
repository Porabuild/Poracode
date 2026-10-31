import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { DATABASE_MIGRATIONS } from "./migrations";
import { dbGetThread, dbMarkLiveThreadsInactive } from "./projectsThreads";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import {
  createSchema53PayloadOriginDatabase,
  migrateSchema53FixtureThrough,
} from "./runtimePayloadOrigins.testFixtures";

describe.skipIf(!sqliteAvailable)("cut-off turn marker schema69", () => {
  let root: string;
  const previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  beforeEach(() => {
    mkdirSync("tmp", { recursive: true });
    root = mkdtempSync(join("tmp", "interrupted-turn-"));
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  });
  afterEach(() => {
    closeDatabase();
    rmSync(root, { recursive: true, force: true });
    if (previousBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
  });

  /** A real schema 68 artifact with one thread caught mid-turn. */
  function upgradeSchema68(): unknown[] {
    const path = join(root, "legacy.sqlite");
    const old = createSchema53PayloadOriginDatabase(path);
    migrateSchema53FixtureThrough(old, 68);
    expect(old.prepare("PRAGMA table_info(threads)").all()).not.toContainEqual(
      expect.objectContaining({ name: "interrupted_turn" }),
    );
    old.prepare("UPDATE threads SET status = 'working' WHERE id = 'thread-2'").run();
    const before = old.prepare("SELECT * FROM threads ORDER BY id").all();
    expect(
      DATABASE_MIGRATIONS.filter((migration) => migration.version > 68).map(
        (migration) => migration.version,
      ),
    ).toEqual([69]);
    old.close();
    initDatabase(path);
    return before;
  }

  it("advances a schema 68 artifact without inventing a turn to resume", () => {
    const before = upgradeSchema68();
    expect(getSqlite().prepare("SELECT * FROM threads ORDER BY id").all()).toEqual(
      before.map((row) => ({ ...(row as object), interrupted_turn: null })),
    );
    expect(dbGetThread("thread-2")).not.toHaveProperty("interruptedTurn");
    expect(
      getSqlite().prepare("SELECT value FROM app_state WHERE key='schema_version'").get(),
    ).toEqual({ value: "69" });
  });

  it("marks only turns still running at boot as cut off by the restart", () => {
    upgradeSchema68();
    getSqlite().prepare("UPDATE threads SET status = 'idle' WHERE id = 'thread-1'").run();
    dbMarkLiveThreadsInactive();
    expect(dbGetThread("thread-2")).toMatchObject({
      status: "inactive",
      interruptedTurn: "restart",
    });
    expect(dbGetThread("thread-1")).not.toHaveProperty("interruptedTurn");
  });

  it("preserves markers from the unpublished schema66 PR when applying migration69", () => {
    const path = join(root, "pr-build.sqlite");
    const old = createSchema53PayloadOriginDatabase(path);
    migrateSchema53FixtureThrough(old, 65);
    old.exec("ALTER TABLE threads ADD COLUMN interrupted_turn TEXT");
    old.prepare("UPDATE threads SET interrupted_turn = 'error' WHERE id = 'thread-1'").run();
    old.prepare("UPDATE app_state SET value = '66' WHERE key = 'schema_version'").run();
    old.close();
    initDatabase(path);
    expect(dbGetThread("thread-1")?.interruptedTurn).toBe("error");
    expect(
      getSqlite()
        .prepare("SELECT name FROM sqlite_master WHERE name LIKE '%catalog_manual' ORDER BY name")
        .all(),
    ).toEqual([{ name: "idx_projects_catalog_manual" }, { name: "idx_threads_catalog_manual" }]);
  });

  it("keeps an earlier failure across a restart", () => {
    upgradeSchema68();
    getSqlite()
      .prepare(
        "UPDATE threads SET status = 'idle', interrupted_turn = 'error' WHERE id = 'thread-1'",
      )
      .run();
    dbMarkLiveThreadsInactive();
    expect(dbGetThread("thread-1")?.interruptedTurn).toBe("error");
  });

  it("reads a marker from a newer release as nothing to resume", () => {
    upgradeSchema68();
    getSqlite()
      .prepare("UPDATE threads SET interrupted_turn = 'quota' WHERE id = 'thread-2'")
      .run();
    expect(dbGetThread("thread-2")).not.toHaveProperty("interruptedTurn");
  });
});
