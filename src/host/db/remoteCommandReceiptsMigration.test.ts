import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbClaimRemoteCommand, type RemoteCommandReceiptIdentity } from "./remoteCommandReceipts";
import { LATEST_SCHEMA_VERSION } from "./migrations";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

const ROUTE = "/api/threads/t1/checkpoint-revert";

function identity(
  overrides: Partial<RemoteCommandReceiptIdentity> = {},
): RemoteCommandReceiptIdentity {
  return {
    route: overrides.route ?? ROUTE,
    principalId: overrides.principalId === undefined ? "session-a" : overrides.principalId,
    requestDigest: overrides.requestDigest === undefined ? "digest-1" : overrides.requestDigest,
  };
}

/**
 * Pre-upgrade regression guard for migration 47 (B2): a schema-46 database has
 * receipts without principal/digest binding and may hold an `in_progress` row
 * interrupted by a crash at the moment the upgrade started. Opening it with
 * current code must add the columns without losing rows, and must preserve the
 * interrupted row as `uncertain` — never delete it (a retry could re-execute an
 * external effect) and never attribute it to whichever principal retries.
 */
describe.skipIf(!sqliteAvailable)("remote command receipt migration v47", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-receipts-migration-"));
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

  function seedV46Database(): void {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE remote_command_receipts (
        command_id TEXT PRIMARY KEY,
        route TEXT NOT NULL,
        state TEXT NOT NULL,
        response TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
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
        updated_at INTEGER NOT NULL,
        provider_anchor_json TEXT
      );
    `);
    db.prepare("INSERT INTO app_state (key, value) VALUES ('schema_version', '46')").run();
    const now = Date.now();
    const insert = db.prepare(
      `INSERT INTO remote_command_receipts
         (command_id, route, state, response, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insert.run("legacy-interrupted", ROUTE, "in_progress", null, now, now);
    insert.run("legacy-completed", ROUTE, "completed", JSON.stringify({ ok: true }), now, now);
    insert.run("legacy-failed", ROUTE, "failed", null, now, now);
    insert.run("legacy-retryable", ROUTE, "retryable", null, now, now);
    db.close();
  }

  it("adds the binding columns and converts interrupted rows to unbound uncertain", () => {
    seedV46Database();
    // Migration 47 must remain ahead of the seeded schema. Later migrations
    // (48: durable canonical-gap evidence) do not change this receipt shape.
    expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(47);

    initDatabase(dbPath);
    const sqlite = getSqlite();
    const columns = (
      sqlite.pragma("table_info(remote_command_receipts)") as { name: string }[]
    ).map((column) => column.name);
    expect(columns).toContain("principal_id");
    expect(columns).toContain("request_digest");
    expect(
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_remote_command_receipts_principal'",
        )
        .get(),
    ).toBeDefined();
    const rows = sqlite
      .prepare(
        "SELECT command_id, state, principal_id, request_digest FROM remote_command_receipts ORDER BY command_id",
      )
      .all();
    expect(rows).toEqual([
      {
        command_id: "legacy-completed",
        state: "completed",
        principal_id: null,
        request_digest: null,
      },
      { command_id: "legacy-failed", state: "failed", principal_id: null, request_digest: null },
      {
        command_id: "legacy-interrupted",
        state: "uncertain",
        principal_id: null,
        request_digest: null,
      },
      {
        command_id: "legacy-retryable",
        state: "retryable",
        principal_id: null,
        request_digest: null,
      },
    ]);
  });

  it("serves the upgrade without deleting rows or trusting them to the retrying principal", () => {
    seedV46Database();
    initDatabase(dbPath);

    // The interrupted pre-upgrade command never runs again and never leaks a
    // cached result: it is a typed ambiguity for every principal.
    expect(dbClaimRemoteCommand("legacy-interrupted", identity())).toEqual({
      state: "uncertain",
      bound: false,
    });
    expect(dbClaimRemoteCommand("legacy-completed", identity())).toEqual({
      state: "uncertain",
      bound: false,
    });
    expect(
      dbClaimRemoteCommand("legacy-completed", identity(), {
        isLegacyCompletedResponseReplayable: () => true,
      }),
    ).toEqual({ state: "completed", response: { ok: true } });
    expect(dbClaimRemoteCommand("legacy-failed", identity())).toEqual({ state: "failed" });
    expect(dbClaimRemoteCommand("legacy-retryable", identity())).toEqual({ state: "claimed" });
  });
});
