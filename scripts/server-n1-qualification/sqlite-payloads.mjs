/**
 * sqlite seeding + fingerprints for the published N-1 gate. The receipt is
 * seeded ONCE on the N-1 install; every fingerprint read is read-only so a
 * surviving row can never be one this script re-inserted after the upgrade.
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function openProfileDatabase(dataRoot) {
  let Database;
  try {
    Database = createRequire(join(REPO_ROOT, "package.json"))("better-sqlite3");
  } catch (error) {
    const failure = new Error(
      `better-sqlite3 is not loadable from the checkout (${error?.message ?? error}); ` +
        "install dependencies first — payload assertions must never be skipped",
    );
    failure.code = "SQLITE_UNAVAILABLE";
    throw failure;
  }
  const path = join(dataRoot, "state.sqlite");
  if (!existsSync(path)) {
    const failure = new Error(`profile database is missing at ${path}`);
    failure.code = "SQLITE_UNAVAILABLE";
    throw failure;
  }
  return { database: new Database(path), path };
}

/**
 * Seed an interrupted command receipt directly into the N-1 profile database
 * (the same narrow extraction the upgrade integration tests use). Runs ONCE,
 * on the N-1 install only — the post-upgrade pass fingerprints read-only, so
 * a surviving row can never be confused with one this script re-inserted.
 */
export function seedReceipt({ database, shellId, receiptId }) {
  const tableRow = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'remote_command_receipts'",
    )
    .get();
  if (!tableRow) return { seeded: false, reason: "remote_command_receipts table absent on N-1" };
  const columns = database.prepare("PRAGMA table_info(remote_command_receipts)").all();
  const names = new Set(columns.map((column) => column.name));
  const hasBaseColumns = [
    "command_id",
    "route",
    "state",
    "response",
    "created_at",
    "updated_at",
  ].every((name) => names.has(name));
  if (!hasBaseColumns) {
    return { seeded: false, reason: `receipt columns unusable: ${[...names].sort().join(",")}` };
  }
  database
    .prepare(
      "INSERT OR REPLACE INTO remote_command_receipts " +
        "(command_id, route, state, response, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)",
    )
    .run(
      receiptId,
      `/api/threads/${shellId}/checkpoint-revert`,
      "in_progress",
      Date.now(),
      Date.now(),
    );
  return { seeded: true, commandId: receiptId };
}

/** Read-only fingerprint of every seeded payload family (never mutates). */
export function fingerprintPayloads({
  database,
  shellId,
  projectPath,
  receiptId,
  goalMarker,
  scrollbackMarker,
}) {
  const tableExists = (name) =>
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) !== undefined;
  const fingerprint = {
    schemaVersion:
      database.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get()?.value ??
      null,
    project: database
      .prepare("SELECT id, name, location_path FROM projects WHERE location_path = ?")
      .get(projectPath),
    thread: database
      .prepare("SELECT id, agent_kind, status FROM threads WHERE id = ?")
      .get(shellId),
    scrollbackMarker: tableExists("thread_terminal_scrollback")
      ? database
          .prepare(
            "SELECT instr(transcript, ?) AS hit FROM thread_terminal_scrollback WHERE thread_id = ?",
          )
          .get(scrollbackMarker, shellId)?.hit
      : null,
    receipt: tableExists("remote_command_receipts")
      ? database
          .prepare("SELECT command_id, state FROM remote_command_receipts WHERE command_id = ?")
          .get(receiptId)
      : null,
    goalItem: null,
  };
  if (goalMarker && tableExists("thread_runtime_items")) {
    // Goals persist as runtime items on the shapes this repo ships; the LIKE
    // scan is tolerant to payload-shape drift between N-1 and candidate.
    fingerprint.goalItem = database
      .prepare(
        "SELECT item_id, type, state FROM thread_runtime_items WHERE thread_id = ? AND payload LIKE ?",
      )
      .get(shellId, `%${goalMarker}%`);
  }
  return fingerprint;
}
