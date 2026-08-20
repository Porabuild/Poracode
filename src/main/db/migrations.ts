import Database from "better-sqlite3";

type SqliteDatabase = InstanceType<typeof Database>;

export interface DatabaseMigration {
  readonly version: number;
  readonly name: string;
  readonly migrate: (sqlite: SqliteDatabase) => void;
}

function columnNames(sqlite: SqliteDatabase, table: string): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function addColumnIfMissing(
  sqlite: SqliteDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  if (!columnNames(sqlite, table).has(column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function foldContextSuffix(sqlite: SqliteDatabase, table: string, column: string): void {
  const rows = sqlite
    .prepare(`SELECT rowid AS rowid, ${column} AS json FROM ${table} WHERE ${column} IS NOT NULL`)
    .all() as { rowid: number; json: string }[];
  const update = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
  const suffix = /\[([0-9]+[mk])\]$/i;
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.json);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const config = parsed as { model?: unknown; contextSize?: unknown };
    if (typeof config.model !== "string") continue;
    const match = config.model.match(suffix);
    if (!match) continue;
    config.model = config.model.slice(0, -match[0].length);
    if (typeof config.contextSize !== "string") {
      config.contextSize = match[1]!.toLowerCase();
    }
    update.run(JSON.stringify(config), row.rowid);
  }
}

function repairEmptyThreadModels(sqlite: SqliteDatabase): void {
  const rows = sqlite.prepare("SELECT rowid, config FROM threads").all() as {
    rowid: number;
    config: string;
  }[];
  const update = sqlite.prepare("UPDATE threads SET config = ? WHERE rowid = ?");
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.config);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const config = parsed as { model?: unknown };
    if (typeof config.model !== "string" || config.model.trim().length > 0) continue;
    config.model = "auto";
    update.run(JSON.stringify(config), row.rowid);
  }
}

/**
 * Append-only database history. Never reuse or reorder a version: add the next
 * integer at the end, even when repairing a migration that shipped previously.
 */
export const DATABASE_MIGRATIONS = [
  {
    version: 2,
    name: "threads.done",
    migrate: (sqlite) =>
      addColumnIfMissing(sqlite, "threads", "done", "INTEGER NOT NULL DEFAULT 0"),
  },
  {
    version: 3,
    name: "threads.group_id",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "threads", "group_id", "TEXT"),
  },
  {
    version: 4,
    name: "threads.group_name",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "threads", "group_name", "TEXT"),
  },
  {
    version: 5,
    name: "projects.search_settings",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "projects", "search_settings", "TEXT"),
  },
  {
    version: 6,
    name: "threads.starred",
    migrate: (sqlite) =>
      addColumnIfMissing(sqlite, "threads", "starred", "INTEGER NOT NULL DEFAULT 0"),
  },
  {
    version: 7,
    name: "normalize model context suffixes",
    migrate: (sqlite) => {
      foldContextSuffix(sqlite, "threads", "config");
      foldContextSuffix(sqlite, "projects", "last_draft_config");
    },
  },
  {
    version: 8,
    name: "thread presentation",
    migrate: (sqlite) => {
      addColumnIfMissing(
        sqlite,
        "threads",
        "presentation_mode",
        "TEXT NOT NULL DEFAULT 'terminal'",
      );
      addColumnIfMissing(sqlite, "threads", "agent_instance_id", "TEXT");
    },
  },
  {
    version: 9,
    name: "thread runtime items",
    migrate: (sqlite) =>
      sqlite.exec(`
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
      `),
  },
  {
    version: 10,
    name: "thread runtime parent item",
    migrate: (sqlite) =>
      addColumnIfMissing(sqlite, "thread_runtime_items", "parent_item_id", "TEXT"),
  },
  {
    version: 11,
    name: "thread turn timestamps",
    migrate: (sqlite) => {
      addColumnIfMissing(sqlite, "threads", "active_turn_started_at", "TEXT");
      addColumnIfMissing(sqlite, "threads", "last_turn_started_at", "TEXT");
      addColumnIfMissing(sqlite, "threads", "last_turn_ended_at", "TEXT");
    },
  },
  {
    version: 12,
    name: "thread completed turns",
    migrate: (sqlite) =>
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS thread_completed_turns (
          thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
          idx INTEGER NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT NOT NULL,
          anchor_item_id TEXT,
          PRIMARY KEY (thread_id, idx)
        );
      `),
  },
  {
    version: 13,
    name: "projects.disabled",
    migrate: (sqlite) =>
      addColumnIfMissing(sqlite, "projects", "disabled", "INTEGER NOT NULL DEFAULT 0"),
  },
  {
    version: 14,
    name: "threads.done_at",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "threads", "done_at", "TEXT"),
  },
  {
    version: 15,
    name: "thread context usage",
    migrate: (sqlite) =>
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS thread_context_usage (
          thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
          usage TEXT NOT NULL
        );
      `),
  },
  {
    version: 16,
    name: "project notes",
    migrate: (sqlite) =>
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS project_notes (
          project_id TEXT PRIMARY KEY,
          doc TEXT,
          todos TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL
        );
      `),
  },
  {
    version: 19,
    name: "usage events",
    migrate: (sqlite) =>
      sqlite.exec(`
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
      `),
  },
  {
    version: 20,
    name: "thread status source",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "threads", "thread_status_source", "TEXT"),
  },
  {
    version: 21,
    name: "scheduled tasks",
    migrate: (sqlite) =>
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_tasks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          agent_kind TEXT NOT NULL,
          config TEXT NOT NULL,
          recurrence TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
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
      `),
  },
  {
    version: 22,
    name: "scheduled task runs",
    migrate: (sqlite) =>
      sqlite.exec(`
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
      `),
  },
  {
    version: 23,
    name: "scheduled task project",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "scheduled_tasks", "project_id", "TEXT"),
  },
  {
    version: 24,
    name: "project MCP servers",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "projects", "mcp_servers", "TEXT"),
  },
  {
    version: 25,
    name: "remote command receipts",
    migrate: (sqlite) =>
      sqlite.exec(`
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
      `),
  },
  {
    version: 26,
    name: "thread parent",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "threads", "parent_thread_id", "TEXT"),
  },
  {
    version: 27,
    name: "token usage ledger",
    migrate: (sqlite) =>
      sqlite.exec(`
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
      `),
  },
  {
    version: 28,
    name: "pull request watches",
    migrate: (sqlite) =>
      sqlite.exec(`
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
      `),
  },
  {
    version: 29,
    name: "project workspace",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "projects", "workspace_id", "TEXT"),
  },
  {
    version: 30,
    name: "repair empty thread models",
    migrate: repairEmptyThreadModels,
  },
  {
    version: 31,
    name: "project worktree location",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "projects", "worktree_location", "TEXT"),
  },
  {
    version: 32,
    name: "pr watch blocked reason",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "pr_watches", "blocked_reason", "TEXT"),
  },
  {
    version: 33,
    name: "project GitHub account",
    migrate: (sqlite) => addColumnIfMissing(sqlite, "projects", "gh_account", "TEXT"),
  },
] as const satisfies readonly DatabaseMigration[];

export const LATEST_SCHEMA_VERSION = DATABASE_MIGRATIONS[DATABASE_MIGRATIONS.length - 1]!.version;

export function validateMigrationRegistry(
  migrations: readonly Pick<DatabaseMigration, "version" | "name">[] = DATABASE_MIGRATIONS,
): void {
  let previousVersion = 0;
  const names = new Set<string>();
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previousVersion) {
      throw new Error(
        `Database migrations must have unique, strictly increasing integer versions; ` +
          `"${migration.name}" uses ${migration.version} after ${previousVersion}.`,
      );
    }
    if (names.has(migration.name)) {
      throw new Error(`Database migration name is duplicated: "${migration.name}".`);
    }
    names.add(migration.name);
    previousVersion = migration.version;
  }
}

function writeSchemaVersion(sqlite: SqliteDatabase, version: number): void {
  sqlite
    .prepare(
      "INSERT INTO app_state (key, value) VALUES ('schema_version', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(String(version));
}

export function runDatabaseMigrations(sqlite: SqliteDatabase, storedVersion: number): void {
  validateMigrationRegistry();
  if (!Number.isInteger(storedVersion) || storedVersion < 0) {
    throw new Error(`Invalid database schema version: ${storedVersion}.`);
  }
  if (storedVersion > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${storedVersion} is newer than supported schema ${LATEST_SCHEMA_VERSION}.`,
    );
  }

  for (const migration of DATABASE_MIGRATIONS) {
    if (migration.version <= storedVersion) continue;
    sqlite.transaction(() => {
      migration.migrate(sqlite);
      writeSchemaVersion(sqlite, migration.version);
    })();
  }
}

const SAFE_COLUMN_REPAIRS = [
  ["projects", "search_settings", "TEXT"],
  ["projects", "worktree_location", "TEXT"],
  ["projects", "mcp_servers", "TEXT"],
  ["projects", "gh_account", "TEXT"],
  ["projects", "workspace_id", "TEXT"],
  ["projects", "disabled", "INTEGER NOT NULL DEFAULT 0"],
  ["threads", "done", "INTEGER NOT NULL DEFAULT 0"],
  ["threads", "done_at", "TEXT"],
  ["threads", "group_id", "TEXT"],
  ["threads", "group_name", "TEXT"],
  ["threads", "starred", "INTEGER NOT NULL DEFAULT 0"],
  ["threads", "presentation_mode", "TEXT NOT NULL DEFAULT 'terminal'"],
  ["threads", "agent_instance_id", "TEXT"],
  ["threads", "thread_status_source", "TEXT"],
  ["threads", "parent_thread_id", "TEXT"],
  ["threads", "active_turn_started_at", "TEXT"],
  ["threads", "last_turn_started_at", "TEXT"],
  ["threads", "last_turn_ended_at", "TEXT"],
  ["thread_runtime_items", "parent_item_id", "TEXT"],
  ["scheduled_tasks", "project_id", "TEXT"],
  ["pr_watches", "blocked_reason", "TEXT"],
] as const;

/**
 * Repair additive schema drift even when app_state incorrectly says the latest
 * migration ran. These definitions are deliberately limited to columns SQLite
 * can add without transforming or discarding existing user data.
 */
export function repairSafeSchemaDrift(sqlite: SqliteDatabase): void {
  sqlite.transaction(() => {
    for (const [table, column, definition] of SAFE_COLUMN_REPAIRS) {
      addColumnIfMissing(sqlite, table, column, definition);
    }
  })();
}

const REQUIRED_COLUMNS = {
  projects: [
    "id",
    "name",
    "location_kind",
    "location_path",
    "location_distro",
    "location_linux_path",
    "location_unc_path",
    "last_draft_config",
    "scripts",
    "search_settings",
    "worktree_location",
    "mcp_servers",
    "gh_account",
    "workspace_id",
    "disabled",
    "sort_order",
    "created_at",
  ],
  threads: [
    "id",
    "project_id",
    "title",
    "agent_kind",
    "agent_instance_id",
    "config",
    "status",
    "attention",
    "thread_status_source",
    "can_resume_with_config",
    "session_ref",
    "terminal_prompt",
    "worktree_path",
    "worktree_branch",
    "pr_number",
    "group_id",
    "group_name",
    "parent_thread_id",
    "archived",
    "done",
    "done_at",
    "starred",
    "presentation_mode",
    "sort_order",
    "created_at",
    "updated_at",
    "active_turn_started_at",
    "last_turn_started_at",
    "last_turn_ended_at",
  ],
  thread_runtime_items: [
    "thread_id",
    "item_id",
    "position",
    "type",
    "state",
    "payload",
    "streams",
    "parent_item_id",
  ],
  scheduled_tasks: [
    "id",
    "name",
    "prompt",
    "agent_kind",
    "config",
    "recurrence",
    "enabled",
    "project_id",
    "next_run_at",
    "last_run_at",
    "last_completed_at",
    "last_status",
    "last_result",
    "last_error",
    "created_at",
    "updated_at",
  ],
  pr_watches: [
    "project_id",
    "pr_number",
    "head_branch",
    "worktree_path",
    "watch_enabled",
    "auto_merge",
    "agent_kind",
    "config",
    "last_comment_cursor",
    "last_review_comment_cursor",
    "last_review_cursor",
    "last_check_key",
    "active_thread_id",
    "last_error",
    "blocked_reason",
  ],
} as const;

export function assertRequiredDatabaseSchema(sqlite: SqliteDatabase): void {
  const missing: string[] = [];
  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const actualColumns = columnNames(sqlite, table);
    for (const column of requiredColumns) {
      if (!actualColumns.has(column)) {
        missing.push(`${table}.${column}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`Database schema is incomplete; missing: ${missing.join(", ")}.`);
  }
}
