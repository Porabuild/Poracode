import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db.schema";
import { resetMainCreatedThreads } from "./mainCreatedThreads";
import {
  assertRequiredDatabaseSchema,
  repairSafeSchemaDrift,
  runDatabaseMigrations,
} from "./migrations";

let _db: ReturnType<typeof drizzle> | undefined;
let _sqlite: InstanceType<typeof Database> | undefined;

/**
 * Monotonic counter bumped ONLY by writes the profile actually reads — the
 * durable usage_events log (dbAppendUsageEvents) and identity edits. The profile
 * caches key on this, so high-frequency chat persistence (runtime snapshots/
 * turns) does NOT churn the cache during active sessions.
 */
let _profileDataGeneration = 0;
export function getProfileDataGeneration(): number {
  return _profileDataGeneration;
}
export function bumpProfileDataGeneration(): void {
  _profileDataGeneration++;
}

/** How long durable usage events are retained (well beyond the 364-day heatmap). */
const USAGE_EVENTS_RETENTION_DAYS = 730;
const REMOTE_COMMAND_RECEIPTS_RETENTION_DAYS = 30;

const HEADLESS_SERVER_ENV = "PORACODE_HEADLESS_SERVER";
const BETTER_SQLITE_NATIVE_BINDING_ENV = "PORACODE_BETTER_SQLITE3_NATIVE_BINDING";
const DEFAULT_SERVER_NATIVE_BINDING = join("dist", "server-native", "better_sqlite3.node");

export function resolveBetterSqliteNativeBindingOptions(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  bindingExists: (path: string) => boolean = existsSync,
  // db.ts is bundled to dist/main/*.cjs, so __dirname is the emitted dir.
  moduleDir = __dirname,
): ConstructorParameters<typeof Database>[1] | undefined {
  const explicit = env[BETTER_SQLITE_NATIVE_BINDING_ENV]?.trim();
  if (explicit) {
    if (!bindingExists(explicit)) {
      throw new Error(
        `${BETTER_SQLITE_NATIVE_BINDING_ENV} points to a file that does not exist: ${explicit}. ` +
          "Set it to a Node-ABI better_sqlite3.node built for this Node runtime, or unset it.",
      );
    }
    return { nativeBinding: explicit };
  }
  if (env[HEADLESS_SERVER_ENV] !== "1") return undefined;
  // The prepared Node-ABI binding may sit relative to the process CWD (repo
  // root, dev) OR relative to the emitted server bundle (packaged: server.cjs
  // in dist/main, so ../server-native/better_sqlite3.node). Launching the built
  // CLI from any other dir (systemd/launchd/cron) misses the cwd-relative path,
  // so probe both and prefer whichever exists.
  const candidates = [
    join(cwd, DEFAULT_SERVER_NATIVE_BINDING),
    join(moduleDir, "..", "server-native", "better_sqlite3.node"),
  ];
  const found = candidates.find((candidate) => bindingExists(candidate));
  return found ? { nativeBinding: found } : undefined;
}

function openDatabase(dbPath: string): InstanceType<typeof Database> {
  const options = resolveBetterSqliteNativeBindingOptions();
  try {
    return new Database(dbPath, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("NODE_MODULE_VERSION")) {
      throw new Error(
        [
          "better-sqlite3 native binding is not compatible with this Node runtime.",
          "For the headless server, run `pnpm run prepare:server-native` or set",
          `${BETTER_SQLITE_NATIVE_BINDING_ENV} to a Node-ABI better_sqlite3.node file.`,
        ].join(" "),
        { cause: error },
      );
    }
    throw error;
  }
}

export function initDatabase(dbPath: string) {
  console.log(`[db] opening ${dbPath}`);
  const sqlite = openDatabase(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  _sqlite = sqlite;
  _db = drizzle({ client: sqlite, schema });

  // Create tables if they don't exist.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location_kind TEXT NOT NULL,
      location_path TEXT,
      location_distro TEXT,
      location_linux_path TEXT,
      location_unc_path TEXT,
      last_draft_config TEXT,
      scripts TEXT,
      worktree_location TEXT,
      workspace_id TEXT,
      mcp_servers TEXT,
      disabled INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      agent_kind TEXT NOT NULL,
      config TEXT NOT NULL,
      status TEXT NOT NULL,
      attention TEXT NOT NULL,
      can_resume_with_config INTEGER NOT NULL DEFAULT 0,
      session_ref TEXT,
      terminal_prompt TEXT,
      worktree_path TEXT,
      worktree_branch TEXT,
      pr_number INTEGER,
      archived INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0,
      done_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      active_turn_started_at TEXT,
      last_turn_started_at TEXT,
      last_turn_ended_at TEXT
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS thread_runtime_items (
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      type TEXT NOT NULL,
      state TEXT NOT NULL,
      payload TEXT,
      streams TEXT,
      PRIMARY KEY (thread_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_runtime_items_thread_pos
      ON thread_runtime_items (thread_id, position);
    CREATE TABLE IF NOT EXISTS thread_completed_turns (
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      anchor_item_id TEXT,
      PRIMARY KEY (thread_id, idx)
    );
    CREATE TABLE IF NOT EXISTS thread_context_usage (
      thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
      usage TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_notes (
      project_id TEXT PRIMARY KEY,
      doc TEXT,
      todos TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      mode TEXT,
      fast INTEGER NOT NULL DEFAULT 0,
      effort TEXT,
      name TEXT,
      value INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_usage_events_kind ON usage_events (kind);
    CREATE TABLE IF NOT EXISTS usage_token_ledger (
      provider TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      last_counter INTEGER NOT NULL,
      PRIMARY KEY (provider, scope_id, epoch)
    );
    CREATE TABLE IF NOT EXISTS usage_token_samples (
      sample_id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      agent_kind TEXT NOT NULL,
      config TEXT NOT NULL,
      recurrence TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      project_id TEXT,
      next_run_at TEXT,
      last_run_at TEXT,
      last_completed_at TEXT,
      last_status TEXT NOT NULL DEFAULT 'never',
      last_result TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run
      ON scheduled_tasks (enabled, next_run_at);
    CREATE TABLE IF NOT EXISTS scheduled_task_runs (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      summary TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_schedule
      ON scheduled_task_runs (schedule_id, started_at DESC);
    CREATE TABLE IF NOT EXISTS pr_watches (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      pr_number INTEGER NOT NULL,
      head_branch TEXT NOT NULL,
      worktree_path TEXT,
      watch_enabled INTEGER NOT NULL DEFAULT 1,
      auto_merge INTEGER NOT NULL DEFAULT 0,
      agent_kind TEXT,
      config TEXT,
      last_comment_cursor TEXT,
      last_review_comment_cursor TEXT,
      last_review_cursor TEXT,
      last_check_key TEXT,
      active_thread_id TEXT,
      last_error TEXT,
      PRIMARY KEY (project_id, pr_number)
    );
    CREATE TABLE IF NOT EXISTS remote_command_receipts (
      command_id TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      state TEXT NOT NULL,
      response TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_remote_command_receipts_updated
      ON remote_command_receipts (updated_at);
  `);

  const storedVersion = Number(
    (
      sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get() as
        | { value: string }
        | undefined
    )?.value ?? "0",
  );

  runDatabaseMigrations(sqlite, storedVersion);
  repairSafeSchemaDrift(sqlite);
  assertRequiredDatabaseSchema(sqlite);

  // Bound the durable usage log: drop events older than the retention window so
  // a long-lived install can't accumulate unboundedly (aggregation reads scan
  // this table). Runs once per startup; cheap on a bounded table. Migration and
  // schema validation above guarantee this table exists, so SQLite failures here
  // must remain observable instead of being mistaken for legacy schema drift.
  const cutoff = Date.now() - USAGE_EVENTS_RETENTION_DAYS * 86_400_000;
  sqlite.prepare("DELETE FROM usage_events WHERE ts < ?").run(cutoff);

  const receiptCutoff = Date.now() - REMOTE_COMMAND_RECEIPTS_RETENTION_DAYS * 86_400_000;
  sqlite.prepare("DELETE FROM remote_command_receipts WHERE updated_at < ?").run(receiptCutoff);

  console.log("[db] initialized");
  return _db;
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized");
  return _db;
}

/**
 * Raw better-sqlite3 handle for modules that issue prepared statements directly.
 * Throws with the same message as {@link getDb} when the database is not open.
 */
export function getSqlite(): InstanceType<typeof Database> {
  if (!_sqlite) throw new Error("Database not initialized");
  return _sqlite;
}

export function closeDatabase() {
  const sqlite = _sqlite;
  if (sqlite) {
    // With journal_mode=WAL + synchronous=NORMAL, committed transactions live
    // in the -wal file and only become durable across an OS crash/power loss
    // after a checkpoint. Fold the WAL back into the main db on shutdown so the
    // most recent writes (threads/messages the user just made) are not at risk
    // if `close()`'s implicit checkpoint is skipped on an unclean exit.
    try {
      sqlite.pragma("wal_checkpoint(TRUNCATE)");
    } catch (error) {
      console.error("[db] wal_checkpoint on close failed:", error);
    }
    sqlite.close();
  }
  _sqlite = undefined;
  _db = undefined;
  resetMainCreatedThreads();
}
