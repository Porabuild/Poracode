import Database from "better-sqlite3";
import { DATABASE_MIGRATIONS } from "./migrations";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";
import { HEAD_CHARS } from "./runtimeStreamCap";

/**
 * Frozen schema-52 bootstrap. Applying only the historical registry prefix
 * creates a real old storage shape without ever creating schema-53 tables.
 */
const SCHEMA_52_BOOTSTRAP = `
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
      archived_at TEXT,
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
    CREATE TABLE IF NOT EXISTS thread_terminal_scrollback (
      thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
      transcript TEXT NOT NULL,
      output_length INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS thread_runtime_item_stream_chunks (
      thread_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      stream TEXT NOT NULL,
      seq INTEGER NOT NULL,
      chars INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (thread_id, item_id, stream, seq),
      FOREIGN KEY (thread_id, item_id)
        REFERENCES thread_runtime_items (thread_id, item_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS thread_runtime_item_stream_state (
      thread_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      stream TEXT NOT NULL,
      next_seq INTEGER NOT NULL,
      tail_chars INTEGER NOT NULL,
      elided_chars INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (thread_id, item_id, stream),
      FOREIGN KEY (thread_id, item_id)
        REFERENCES thread_runtime_items (thread_id, item_id) ON DELETE CASCADE
    );
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
    CREATE TABLE IF NOT EXISTS main_created_threads (
      thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE
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
      blocked_reason TEXT,
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
  `;

/** Fixture versions whose stream storage differs from schema 53. */
export function createLegacyRuntimeStreamDatabase(
  path: string,
  version: 35 | 52 = 52,
): InstanceType<typeof Database> {
  const sqlite = new Database(path, {
    ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
  });
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_52_BOOTSTRAP);
  if (version === 35) {
    sqlite.exec(`
      DROP TABLE thread_runtime_item_stream_state;
      DROP TABLE thread_runtime_item_stream_chunks;
    `);
  }
  for (const migration of DATABASE_MIGRATIONS) {
    if (migration.version > version) break;
    sqlite.transaction(() => {
      migration.migrate(sqlite);
      sqlite
        .prepare(
          "INSERT INTO app_state (key, value) VALUES ('schema_version', ?) " +
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(String(migration.version));
    })();
  }
  return sqlite;
}

export function seedLegacyRuntimeStreamThread(sqlite: InstanceType<typeof Database>): void {
  sqlite.exec(`
    INSERT INTO projects (id, name, location_kind, location_path, created_at)
      VALUES ('project-1', 'Legacy fixture', 'posix', '/tmp/legacy-stream-fixture', '2026-01-01');
    INSERT INTO threads (
      id, project_id, title, agent_kind, config, status, attention, presentation_mode,
      created_at, updated_at
    ) VALUES (
      'thread-1', 'project-1', 'Legacy stream fixture', 'fixture', '{}', 'working',
      'working', 'gui', '2026-01-01', '2026-01-01'
    );
  `);
}

export function seedLegacyRuntimeStreamEvidence(sqlite: InstanceType<typeof Database>): string {
  seedLegacyRuntimeStreamThread(sqlite);
  const seed = JSON.stringify({
    assistant_text: "s".repeat(HEAD_CHARS - 3) + "🙂\n",
    reasoning_text: "",
    command_output: "old-head",
  });
  sqlite
    .prepare(`
    INSERT INTO thread_runtime_items
      (thread_id, item_id, position, type, state, payload, streams, parent_item_id)
    VALUES ('thread-1', 'growing', 7, 'assistant_message', 'updated', ?, ?, 'parent-1')
  `)
    .run('{"preserved":true,"unknown":{"value":1}}', seed);
  sqlite.exec(`
    INSERT INTO thread_runtime_item_stream_chunks VALUES
      ('thread-1', 'growing', 'assistant_text', 7, 2, 'a' || char(10)),
      ('thread-1', 'growing', 'assistant_text', 8, 5, 'tail' || char(10));
    INSERT INTO thread_runtime_item_stream_state VALUES
      ('thread-1', 'growing', 'assistant_text', 9, 7, 20);
    INSERT INTO thread_completed_turns VALUES
      ('thread-1', 0, '2026-01-01', '2026-01-02', 'growing');
    INSERT INTO thread_context_usage VALUES ('thread-1', '{"tokens":17}');
    UPDATE runtime_persistence_epoch SET epoch = 8, armed = 1, armed_at = 1234 WHERE id = 1;
    INSERT INTO thread_runtime_gaps
      (thread_id, reason, refused_events, refused_bytes, epoch, created_at, episode_id)
    VALUES ('thread-1', 'age', 3, 300, 8, 1234, '11111111-1111-4111-8111-111111111111');
    INSERT INTO thread_runtime_epoch_touches VALUES ('thread-1', 8, 1234);
    INSERT INTO thread_runtime_gap_notices
      (thread_id, acknowledged_token, source, reason, refused_events, refused_bytes,
       acknowledged_count, first_acknowledged_at, last_acknowledged_at)
    VALUES ('thread-1', 'gap2:e22222222-2222-4222-8222-222222222222', 'exact', 'age', 2, 200,
      1, 1230, 1230);
  `);
  return seed;
}

const LEGACY_EVIDENCE_TABLES = [
  "thread_runtime_items",
  "thread_runtime_item_stream_chunks",
  "thread_runtime_item_stream_state",
  "thread_completed_turns",
  "thread_context_usage",
  "thread_terminal_scrollback",
  "thread_terminal_scrollback_chunks",
  "runtime_persistence_epoch",
  "thread_runtime_gaps",
  "thread_runtime_epoch_touches",
  "thread_runtime_gap_notices",
] as const;

export function captureLegacyRuntimeStreamEvidence(
  sqlite: InstanceType<typeof Database>,
): Record<string, unknown[]> {
  return Object.fromEntries(
    LEGACY_EVIDENCE_TABLES.map((table) => [table, sqlite.prepare(`SELECT * FROM ${table}`).all()]),
  );
}
