import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import { dbGetCheckpointRevertOperation } from "./checkpointRevertOperations";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

describe.skipIf(!sqliteAvailable)("checkpoint revert dispatch migration", () => {
  let directory: string;
  let databasePath: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-revert-dispatch-"));
    databasePath = join(directory, "state.sqlite");
    initDatabase(databasePath);
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("fences only unresolved positive-turn plans without an absolute anchor from schema 50", () => {
    const database = new Database(
      databasePath,
      nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {},
    );
    database.pragma("user_version = 50");
    database.prepare("UPDATE app_state SET value = '50' WHERE key = 'schema_version'").run();
    const insert = database.prepare(`
      INSERT INTO checkpoint_revert_operations
        (operation_key, thread_id, checkpoint_item_id, num_turns,
         project_location_json, config_json, provider_anchor_json,
         provider_phase, files_phase, truncate_phase, outcome, created_at, updated_at)
      VALUES (?, 'thread', 'checkpoint', ?, '{"kind":"posix","path":"/project"}',
        '{}', ?, ?, 'pending', 'pending', ?, ?, ?)
    `);
    const createdAt = Date.now();
    const updatedAt = createdAt + 10;
    const cases = [
      ["running", 2, null, "pending", "running", "ambiguous"],
      ["failed", 2, null, "pending", "failed", "ambiguous"],
      ["zero", 0, null, "pending", "running", "pending"],
      ["anchored", 2, '{"version":1,"data":{}}', "pending", "running", "pending"],
      ["provider-completed", 2, null, "completed", "running", "completed"],
      ["provider-failed", 2, null, "failed", "failed", "failed"],
      ["settled", 2, null, "pending", "completed", "pending"],
    ] as const;
    for (const [key, turns, anchor, phase, outcome] of cases) {
      insert.run(key, turns, anchor, phase, outcome, createdAt, updatedAt);
    }
    database.close();

    initDatabase(databasePath);
    for (const [key, turns, anchor, , outcome, expectedPhase] of cases) {
      expect(dbGetCheckpointRevertOperation(key)).toMatchObject({
        providerPhase: expectedPhase,
        outcome,
        numTurns: turns,
        providerAnchorJson: anchor,
        projectLocationJson: '{"kind":"posix","path":"/project"}',
        configJson: "{}",
        filesPhase: "pending",
        truncatePhase: "pending",
        createdAt,
        updatedAt,
      });
    }
    closeDatabase();
    initDatabase(databasePath);
    expect(dbGetCheckpointRevertOperation("running")?.providerPhase).toBe("ambiguous");
  });
});
