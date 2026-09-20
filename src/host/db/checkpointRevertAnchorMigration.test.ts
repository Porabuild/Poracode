import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import {
  dbGetCheckpointRevertOperation,
  dbUpdateCheckpointRevertPhases,
} from "./checkpointRevertOperations";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBindingEnv: string | undefined;
let sqliteAvailable = true;
try {
  new Database(":memory:").close();
} catch {
  if (existsSync(serverNativeBinding)) nativeBindingEnv = serverNativeBinding;
  else sqliteAvailable = false;
}

/**
 * Pre-upgrade regression guard for migration 46 (checkpoint revert provider
 * anchor, WS2 stage 3): a database at schema 45 holds journal rows without the
 * `provider_anchor_json` column. Opening it with current code must add the
 * column and keep the journalled rows readable and updatable — a crash-resume
 * against a pre-upgrade row must not lose its frozen plan.
 */
describe.skipIf(!sqliteAvailable)("checkpoint revert anchor migration", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-anchor-migration-"));
    dbPath = join(dir, "state.sqlite");
  });

  afterEach(() => {
    closeDatabase();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can still hold the -wal handle briefly; the temp dir is disposable.
    }
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function seedV45Database(): void {
    const db = new Database(dbPath);
    db.pragma("user_version = 45");
    // The v45 journal table shape: no provider_anchor_json column.
    db.exec(`
      CREATE TABLE checkpoint_revert_operations (
        operation_key TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        checkpoint_item_id TEXT NOT NULL,
        num_turns INTEGER NOT NULL,
        project_location_json TEXT,
        config_json TEXT,
        provider_phase TEXT NOT NULL,
        files_phase TEXT NOT NULL,
        truncate_phase TEXT NOT NULL,
        removed_anchors_json TEXT,
        outcome TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    db.prepare(
      `INSERT INTO checkpoint_revert_operations
         (operation_key, thread_id, checkpoint_item_id, num_turns,
          project_location_json, config_json, provider_phase, files_phase,
          truncate_phase, removed_anchors_json, outcome, created_at, updated_at)
       VALUES ('legacy-op', 'thread-1', 'checkpoint', 2,
               NULL, NULL, 'pending', 'pending', 'pending', NULL, 'running', 1, 1)`,
    ).run();
    db.close();
  }

  it("upgrades a schema-45 journal in place and keeps resumable rows anchor-capable", () => {
    seedV45Database();

    initDatabase(dbPath);
    const row = dbGetCheckpointRevertOperation("legacy-op");
    expect(row).not.toBeNull();
    expect(row?.providerAnchorJson).toBeNull();
    expect(row?.providerPhase).toBe("pending");
    expect(row?.numTurns).toBe(2);

    // The resumed row can carry an anchor like any post-upgrade operation.
    dbUpdateCheckpointRevertPhases("legacy-op", {
      providerAnchorJson: JSON.stringify({
        version: 1,
        data: { resumeSessionAt: "assistant-uuid-1", remainingTurns: 1 },
      }),
    });
    const updated = dbGetCheckpointRevertOperation("legacy-op");
    expect(updated?.providerAnchorJson).not.toBeNull();
    expect(JSON.parse(updated?.providerAnchorJson ?? "{}")).toEqual({
      version: 1,
      data: { resumeSessionAt: "assistant-uuid-1", remainingTurns: 1 },
    });
  });
});
