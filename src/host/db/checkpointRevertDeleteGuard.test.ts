import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  dbClaimCheckpointRevertOperation,
  dbFindRunningCheckpointRevertForThreads,
  dbGetCheckpointRevertOperation,
  dbUpdateCheckpointRevertPhases,
  ThreadCheckpointRevertActiveError,
} from "./checkpointRevertOperations";
import { dbDeleteProject, dbDeleteThread } from "./projectsThreads";
import { dbSyncChanges } from "./sync";

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
 * Delete-mid-revert coordination (Gates 2-3 Batch 3): a thread or project must
 * not be deleted while a compound checkpoint revert is mid-flight — the
 * revert's file-restore phase would otherwise run into a deleted project's
 * path. The journal row claimed at revert start is the durable per-thread
 * claim; deletes consult it and refuse with the typed operator remedy.
 */
describe.skipIf(!sqliteAvailable)("delete-mid-revert guard", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-revert-delete-guard-"));
    dbPath = join(dir, "state.sqlite");
    initDatabase(dbPath);
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

  function seedProjectThread(projectId: string, threadId: string): void {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO projects (id, name, location_kind, location_linux_path, created_at)
         VALUES (?, ?, 'local', '/repo', ?)`,
      )
      .run(projectId, "project", new Date().toISOString());
    sqlite
      .prepare(
        `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
         VALUES (?, ?, ?, 'claude', '{}', 'inactive', 'none', ?, ?)`,
      )
      .run(threadId, projectId, "thread", new Date().toISOString(), new Date().toISOString());
  }

  function claimRunningRevert(threadId: string): string {
    const claim = dbClaimCheckpointRevertOperation({
      operationKey: `op-${threadId}`,
      threadId,
      checkpointItemId: "checkpoint-item",
      projectLocationJson: JSON.stringify({ kind: "local", linuxPath: "/repo" }),
      configJson: null,
    });
    return claim.row.operationKey;
  }

  it("refuses dbDeleteThread while a compound revert is running", () => {
    seedProjectThread("p1", "t1");
    const operationKey = claimRunningRevert("t1");

    let caught: unknown;
    try {
      dbDeleteThread("t1");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ThreadCheckpointRevertActiveError);
    const refused = caught as ThreadCheckpointRevertActiveError;
    expect(refused.code).toBe("CHECKPOINT_REVERT_ACTIVE");
    expect(refused.message).toMatch(/Re-run the checkpoint revert/u);
    // Nothing was deleted behind the operation.
    expect(getSqlite().prepare("SELECT COUNT(*) AS n FROM threads WHERE id = 't1'").get()).toEqual({
      n: 1,
    });
    expect(dbGetCheckpointRevertOperation(operationKey)?.outcome).toBe("running");
  });

  it("refuses dbDeleteProject when any of its threads has a running revert", () => {
    seedProjectThread("p1", "t1");
    seedProjectThread("p1", "t2");
    claimRunningRevert("t2");

    expect(() => dbDeleteProject("p1")).toThrow(ThreadCheckpointRevertActiveError);
    expect(dbFindRunningCheckpointRevertForThreads(["t1", "t2"]).threadIds).toEqual(["t2"]);
    expect(getSqlite().prepare("SELECT COUNT(*) AS n FROM projects WHERE id = 'p1'").get()).toEqual(
      { n: 1 },
    );
    expect(getSqlite().prepare("SELECT COUNT(*) AS n FROM threads").get()).toEqual({ n: 2 });
  });

  it("allows deletion once the revert settles", () => {
    seedProjectThread("p1", "t1");
    const operationKey = claimRunningRevert("t1");
    dbUpdateCheckpointRevertPhases(operationKey, {
      providerPhase: "completed",
      filesPhase: "completed",
      truncatePhase: "completed",
      outcome: "completed",
    });

    expect(() => dbDeleteThread("t1")).not.toThrow();
    expect(getSqlite().prepare("SELECT COUNT(*) AS n FROM threads WHERE id = 't1'").get()).toEqual({
      n: 0,
    });
  });

  it("keeps blocking a crash-orphaned running row until an attempt settles it", () => {
    seedProjectThread("p1", "t1");
    const operationKey = claimRunningRevert("t1");
    // Simulated process death mid-revert: the row stays `running` with no live
    // operation. Deletion stays refused — the remedy is one revert retry,
    // whose resume settles the row (a missing checkpoint settles as a
    // completed noop in the host's mutation owner).
    expect(() => dbDeleteThread("t1")).toThrow(ThreadCheckpointRevertActiveError);

    dbUpdateCheckpointRevertPhases(operationKey, {
      truncatePhase: "noop",
      outcome: "completed",
    });
    expect(() => dbDeleteThread("t1")).not.toThrow();
  });

  it("the sync mirror settles running reverts for authority-deleted threads (no stale block)", () => {
    seedProjectThread("p1", "t1");
    seedProjectThread("p1", "t2");
    const operationKey = claimRunningRevert("t2");

    // The authoritative mirror says t2 is deleted: the sync path applies the
    // delete directly (it is not the interactive delete path) and must settle
    // the doomed revert row inside the same transaction.
    dbSyncChanges({
      projects: [],
      threads: [],
      deletedProjectIds: [],
      deletedThreadIds: ["t2"],
      projectOrder: undefined,
      threadOrder: undefined,
      viewJson: "{}",
    });

    expect(getSqlite().prepare("SELECT COUNT(*) AS n FROM threads WHERE id = 't2'").get()).toEqual({
      n: 0,
    });
    expect(dbGetCheckpointRevertOperation(operationKey)?.outcome).toBe("ambiguous");
    // The settled row no longer refuses the project delete.
    expect(() => dbDeleteProject("p1")).not.toThrow();
  });

  it("does not block deletes for threads without journal rows", () => {
    seedProjectThread("p1", "t1");
    claimRunningRevert("other-thread");

    expect(dbFindRunningCheckpointRevertForThreads(["t1"]).threadIds).toEqual([]);
    expect(() => dbDeleteThread("t1")).not.toThrow();
  });
});
