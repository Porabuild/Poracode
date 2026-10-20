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
  directory = mkdtempSync(join("tmp", "reasoning-schema61-"));
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
});
afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
  rmSync(directory, { recursive: true, force: true });
  if (priorBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorBinding;
});

it("repairs schema60 thoughts only inside recorded completed turns without changing their content", () => {
  const db = createSchema53PayloadOriginDatabase(join(directory, "state.sqlite"));
  sqlite = db;
  migrateSchema53FixtureThrough(db, 60);
  // The app can upgrade while a newer provider turn survives on its server.
  db.prepare("UPDATE threads SET status = 'working' WHERE id = 'thread-1'").run();
  db.exec(`INSERT INTO thread_runtime_items
    (thread_id, item_id, position, type, state, payload, streams, parent_item_id)
    VALUES
      ('thread-1', 'empty-thought', 20, 'reasoning', 'started', '{}', '{}', NULL),
      ('thread-1', 'streamed-thought', 21, 'reasoning', 'updated', '{}', '{"reasoning_text":"keep me"}', NULL),
      ('thread-1', 'child-thought', 22, 'reasoning', 'started', '{}', '{}', 'tool-parent'),
      ('thread-1', 'background-command', 23, 'command_execution', 'started', '{}', '{}', NULL),
      ('thread-1', 'tool-parent', 24, 'tool_call', 'started', '{}', '{}', NULL),
      ('thread-1', 'mcp-tool', 25, 'mcp_tool_call', 'updated', '{"status":"running"}', '{}', NULL),
      ('thread-1', 'file-edit', 26, 'file_change', 'started', '{"status":"running"}', '{}', NULL),
      ('thread-1', 'final-message', 27, 'assistant_message', 'completed', '{}', '{}', NULL),
      ('thread-1', 'new-thought', 28, 'reasoning', 'updated', '{}', '{}', NULL),
      ('thread-2', 'unsettled-thought', 20, 'reasoning', 'started', '{}', '{}', NULL);
    INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
    VALUES ('thread-1', 100, 1, 2, 'final-message'), ('thread-2', 100, 1, 2, 'missing-anchor');`);
  const before = db
    .prepare("SELECT * FROM thread_runtime_items ORDER BY thread_id, position")
    .all() as {
    item_id: string;
    state: string;
  }[];

  runDatabaseMigrations(db, 60);

  const repaired = new Set(["empty-thought", "streamed-thought"]);
  expect(
    db.prepare("SELECT * FROM thread_runtime_items ORDER BY thread_id, position").all(),
  ).toEqual(
    before.map((row) => (repaired.has(row.item_id) ? { ...row, state: "completed" } : row)),
  );
  expect(db.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get()).toEqual({
    value: "64",
  });
});
