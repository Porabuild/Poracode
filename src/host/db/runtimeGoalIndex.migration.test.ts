import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runDatabaseMigrations } from "./migrations";
import {
  createSchema53PayloadOriginDatabase,
  migrateSchema53FixtureThrough,
} from "./runtimePayloadOrigins.testFixtures";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";

let directory: string;
let sqlite: InstanceType<typeof Database> | undefined;
const priorBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
beforeEach(() => {
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(join("tmp", "goal-schema58-"));
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
});
afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
  rmSync(directory, { recursive: true, force: true });
  if (priorBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorBinding;
});

it("upgrades the historical schema57 without rewriting rows and indexes goal hits and misses", () => {
  const db = createSchema53PayloadOriginDatabase(join(directory, "state.sqlite"));
  sqlite = db;
  migrateSchema53FixtureThrough(db, 57);
  expect(
    db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_runtime_items_thread_goal'").get(),
  ).toBeUndefined();
  db.exec(`INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams)
    VALUES ('thread-1', 'goal-old', 20, 'goal', 'completed', '{"title":"old"}', '{}'),
      ('thread-1', 'goal-latest', 30, 'goal', 'completed', '{"title":"latest"}', '{}'),
      ('thread-1', 'newer-message', 40, 'assistant_message', 'completed', '{}', '{}')`);
  const before = db
    .prepare("SELECT * FROM thread_runtime_items ORDER BY thread_id, position")
    .all();
  runDatabaseMigrations(db, 57);
  expect(
    db.prepare("SELECT * FROM thread_runtime_items ORDER BY thread_id, position").all(),
  ).toEqual(before);
  expect(db.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get()).toEqual({
    value: "66",
  });
  const query =
    "SELECT item_id, type, state, payload, streams, parent_item_id FROM thread_runtime_items WHERE thread_id = ? AND type = 'goal' ORDER BY position DESC LIMIT 1";
  expect(db.prepare(query).get("thread-1")).toMatchObject({ item_id: "goal-latest" });
  expect(db.prepare(query).get("thread-2")).toBeUndefined();
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all("thread-2") as { detail: string }[];
  expect(plan.map(({ detail }) => detail).join(" ")).toContain("idx_runtime_items_thread_goal");
});
