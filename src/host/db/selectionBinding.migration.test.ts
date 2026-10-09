import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DATABASE_MIGRATIONS,
  describeMigrationRollbackPolicy,
  runDatabaseMigrations,
} from "./migrations";
import { createSchema53PayloadOriginDatabase } from "./runtimePayloadOrigins.testFixtures";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";

let directory: string;
let sqlite: InstanceType<typeof Database> | undefined;
const priorNativeBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
beforeEach(() => {
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(join("tmp", "selection-schema57-"));
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
});
afterEach(() => {
  if (sqlite?.open) sqlite.close();
  sqlite = undefined;
  rmSync(directory, { recursive: true, force: true });
  if (priorNativeBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorNativeBinding;
});

it("advances the actual historical schema-56 prefix without backfilling selection data", () => {
  const db = createSchema53PayloadOriginDatabase(join(directory, "state.sqlite"));
  sqlite = db;
  for (const version of [54, 55, 56]) {
    const migration = DATABASE_MIGRATIONS.find((entry) => entry.version === version)!;
    db.transaction(() => {
      migration.migrate(db);
      db.prepare("UPDATE app_state SET value = ? WHERE key = 'schema_version'").run(
        String(version),
      );
    })();
  }
  // Raw bytes include both legacy controls and unsupported forward metadata.
  // A schema boundary does not authorize model reinterpretation or repair.
  const rawConfig =
    '{ "model":"opaque", "effort":"", "fast":false, "thinking":false, "contextSize":"default", "selectionBinding":{"version":200,"unknown":[false,""]} }';
  db.prepare("UPDATE threads SET config = ? WHERE id = 'thread-1'").run(rawConfig);
  const beforeThreads = db.prepare("SELECT * FROM threads ORDER BY id").all();
  const beforeProjects = db.prepare("SELECT * FROM projects ORDER BY id").all();
  const beforeSchema = db
    .prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name")
    .all();

  runDatabaseMigrations(db, 56);

  expect(db.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get()).toEqual({
    value: "57",
  });
  expect(db.prepare("SELECT * FROM threads ORDER BY id").all()).toStrictEqual(beforeThreads);
  expect(db.prepare("SELECT * FROM projects ORDER BY id").all()).toStrictEqual(beforeProjects);
  expect(
    db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all(),
  ).toStrictEqual(beforeSchema);
  expect(describeMigrationRollbackPolicy().find((entry) => entry.version === 57)).toMatchObject({
    rollback: "forward-only",
  });
});
