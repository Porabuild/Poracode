import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { asc, eq } from "drizzle-orm";
import type {
  ProjectLocation,
  Project,
  ProjectNotes,
  Thread,
  ThreadContextUsage,
} from "@/shared/contracts";
import * as schema from "./db.schema";

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

const HEADLESS_SERVER_ENV = "LIGHTCODE_HEADLESS_SERVER";
const BETTER_SQLITE_NATIVE_BINDING_ENV = "LIGHTCODE_BETTER_SQLITE3_NATIVE_BINDING";
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
  `);

  // Baseline schema version for future DB migrations.
  // New upgrade steps should live behind this gate when we need them.
  const SCHEMA_VERSION = 19;

  const storedVersion = Number(
    (
      sqlite.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get() as
        | { value: string }
        | undefined
    )?.value ?? "0",
  );

  if (storedVersion < 2) {
    const cols = sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "done")) {
      sqlite.exec("ALTER TABLE threads ADD COLUMN done INTEGER NOT NULL DEFAULT 0");
    }
  }

  if (storedVersion < 3) {
    const cols = sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "group_id")) {
      sqlite.exec("ALTER TABLE threads ADD COLUMN group_id TEXT");
    }
  }

  if (storedVersion < 4) {
    const cols = sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "group_name")) {
      sqlite.exec("ALTER TABLE threads ADD COLUMN group_name TEXT");
    }
  }

  if (storedVersion < 5) {
    const cols = sqlite.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "search_settings")) {
      sqlite.exec("ALTER TABLE projects ADD COLUMN search_settings TEXT");
    }
  }

  if (storedVersion < 6) {
    const cols = sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "starred")) {
      sqlite.exec("ALTER TABLE threads ADD COLUMN starred INTEGER NOT NULL DEFAULT 0");
    }
  }

  if (storedVersion < 7) {
    // Fold model-id context-size suffixes (e.g. `claude-opus-4-7[1m]`) into a
    // separate `contextSize` field so the UI can pick model and context size
    // independently. Adapter argv reattaches the suffix at PTY launch.
    foldContextSuffix(sqlite, "threads", "config");
    foldContextSuffix(sqlite, "projects", "last_draft_config");
  }

  if (storedVersion < 8) {
    // Per-thread presentation mode (terminal vs renderer-native chat) +
    // optional reference to a user-registered ACP instance.
    const cols = sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "presentation_mode")) {
      sqlite.exec(
        "ALTER TABLE threads ADD COLUMN presentation_mode TEXT NOT NULL DEFAULT 'terminal'",
      );
    }
    if (!cols.some((c) => c.name === "agent_instance_id")) {
      sqlite.exec("ALTER TABLE threads ADD COLUMN agent_instance_id TEXT");
    }
  }

  if (storedVersion < 9) {
    // Persisted canonical chat items per thread (chat-mode hydration on reopen).
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
    `);
  }

  if (storedVersion < 10) {
    // Sub-agent grouping: child items (from Claude `Task` tool use) carry the
    // parent tool_call's id so the chat timeline groups them under their
    // parent on reload, matching live behaviour.
    const cols = sqlite.prepare("PRAGMA table_info(thread_runtime_items)").all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "parent_item_id")) {
      sqlite.exec("ALTER TABLE thread_runtime_items ADD COLUMN parent_item_id TEXT");
    }
  }

  if (storedVersion < 11) {
    const cols = sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "active_turn_started_at")) {
      sqlite.exec("ALTER TABLE threads ADD COLUMN active_turn_started_at TEXT");
    }
    if (!cols.some((c) => c.name === "last_turn_started_at")) {
      sqlite.exec("ALTER TABLE threads ADD COLUMN last_turn_started_at TEXT");
    }
    if (!cols.some((c) => c.name === "last_turn_ended_at")) {
      sqlite.exec("ALTER TABLE threads ADD COLUMN last_turn_ended_at TEXT");
    }
  }

  if (storedVersion < 12) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS thread_completed_turns (
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        anchor_item_id TEXT,
        PRIMARY KEY (thread_id, idx)
      );
    `);
  }

  if (storedVersion < SCHEMA_VERSION) {
    if (storedVersion < 13) {
      const cols = sqlite.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
      if (!cols.some((c) => c.name === "disabled")) {
        sqlite.exec("ALTER TABLE projects ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0");
      }
    }

    if (storedVersion < 14) {
      const cols = sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
      if (!cols.some((c) => c.name === "done_at")) {
        sqlite.exec("ALTER TABLE threads ADD COLUMN done_at TEXT");
      }
    }

    if (storedVersion < 15) {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS thread_context_usage (
          thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
          usage TEXT NOT NULL
        );
      `);
    }

    if (storedVersion < 16) {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS project_notes (
          project_id TEXT PRIMARY KEY,
          doc TEXT,
          todos TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL
        );
      `);
    }

    if (storedVersion < 19) {
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
      `);
    }

    sqlite
      .prepare(
        "INSERT INTO app_state (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(String(SCHEMA_VERSION));
  }

  // Bound the durable usage log: drop events older than the retention window so
  // a long-lived install can't accumulate unboundedly (aggregation reads scan
  // this table). Runs once per startup; cheap on a bounded table.
  try {
    const cutoff = Date.now() - USAGE_EVENTS_RETENTION_DAYS * 86_400_000;
    sqlite.prepare("DELETE FROM usage_events WHERE ts < ?").run(cutoff);
  } catch {
    // usage_events may not exist on a partially-migrated db; ignore.
  }

  console.log("[db] initialized");
  return _db;
}

function foldContextSuffix(sqlite: InstanceType<typeof Database>, table: string, column: string) {
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
    const cfg = parsed as { model?: unknown; contextSize?: unknown };
    if (typeof cfg.model !== "string") continue;
    const match = cfg.model.match(suffix);
    if (!match) continue;
    cfg.model = cfg.model.slice(0, -match[0].length);
    if (typeof cfg.contextSize !== "string") {
      cfg.contextSize = match[1]!.toLowerCase();
    }
    update.run(JSON.stringify(cfg), row.rowid);
  }
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized");
  return _db;
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
}

// ── Converters ──────────────────────────────────────────────────────

function locationToRow(loc: ProjectLocation) {
  return {
    locationKind: loc.kind,
    locationPath: loc.kind !== "wsl" ? loc.path : null,
    locationDistro: loc.kind === "wsl" ? loc.distro : null,
    locationLinuxPath: loc.kind === "wsl" ? loc.linuxPath : null,
    locationUncPath: loc.kind === "wsl" ? loc.uncPath : null,
  };
}

function rowToLocation(row: {
  locationKind: string;
  locationPath: string | null;
  locationDistro: string | null;
  locationLinuxPath: string | null;
  locationUncPath: string | null;
}): ProjectLocation {
  if (row.locationKind === "wsl") {
    return {
      kind: "wsl",
      distro: row.locationDistro!,
      linuxPath: row.locationLinuxPath!,
      uncPath: row.locationUncPath!,
    };
  }
  if (row.locationKind === "posix") {
    return { kind: "posix", path: row.locationPath! };
  }
  return { kind: "windows", path: row.locationPath! };
}

function rowToProject(row: typeof schema.projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    location: rowToLocation(row),
    ...(row.lastDraftConfig ? { lastDraftConfig: JSON.parse(row.lastDraftConfig) } : {}),
    ...(row.scripts ? { scripts: JSON.parse(row.scripts) } : {}),
    ...(row.searchSettings ? { searchSettings: JSON.parse(row.searchSettings) } : {}),
    ...(row.disabled ? { disabled: true } : {}),
    createdAt: row.createdAt,
  };
}

function rowToThread(row: typeof schema.threads.$inferSelect): Thread {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    agentKind: row.agentKind as Thread["agentKind"],
    ...(row.agentInstanceId ? { agentInstanceId: row.agentInstanceId } : {}),
    config: JSON.parse(row.config),
    status: row.status as Thread["status"],
    attention: row.attention as Thread["attention"],
    canResumeWithConfig: row.canResumeWithConfig,
    ...(row.sessionRef ? { sessionRef: JSON.parse(row.sessionRef) } : {}),
    ...(row.worktreePath ? { worktreePath: row.worktreePath } : {}),
    ...(row.worktreeBranch ? { worktreeBranch: row.worktreeBranch } : {}),
    ...(row.prNumber != null ? { prNumber: row.prNumber } : {}),
    ...(row.groupId ? { groupId: row.groupId } : {}),
    ...(row.groupName ? { groupName: row.groupName } : {}),
    archived: row.archived,
    done: row.done,
    ...(row.doneAt ? { doneAt: row.doneAt } : {}),
    starred: row.starred,
    presentationMode: (row.presentationMode === "gui"
      ? "gui"
      : "terminal") as Thread["presentationMode"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.activeTurnStartedAt ? { activeTurnStartedAt: row.activeTurnStartedAt } : {}),
    ...(row.lastTurnStartedAt ? { lastTurnStartedAt: row.lastTurnStartedAt } : {}),
    ...(row.lastTurnEndedAt ? { lastTurnEndedAt: row.lastTurnEndedAt } : {}),
  };
}

// ── Public query functions (called from IPC handlers) ───────────────

export function dbGetProjects(): Project[] {
  const db = getDb();
  return db
    .select()
    .from(schema.projects)
    .orderBy(asc(schema.projects.sortOrder))
    .all()
    .map(rowToProject);
}

export function dbGetThreads(): Thread[] {
  const db = getDb();
  return db
    .select()
    .from(schema.threads)
    .orderBy(asc(schema.threads.sortOrder))
    .all()
    .map(rowToThread);
}

export function dbGetThread(threadId: string): Thread | null {
  const db = getDb();
  const row = db.select().from(schema.threads).where(eq(schema.threads.id, threadId)).get();
  return row ? rowToThread(row) : null;
}

export function dbGetState(key: string): string | null {
  const db = getDb();
  const row = db.select().from(schema.appState).where(eq(schema.appState.key, key)).get();
  return row?.value ?? null;
}

export function dbSetState(key: string, value: string): void {
  const db = getDb();
  db.insert(schema.appState)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value } })
    .run();
}

export function dbUpsertProject(project: Project, sortOrder: number): void {
  const db = getDb();
  db.insert(schema.projects)
    .values({
      id: project.id,
      name: project.name,
      ...locationToRow(project.location),
      lastDraftConfig: project.lastDraftConfig ? JSON.stringify(project.lastDraftConfig) : null,
      scripts: project.scripts ? JSON.stringify(project.scripts) : null,
      searchSettings: project.searchSettings ? JSON.stringify(project.searchSettings) : null,
      disabled: !!project.disabled,
      sortOrder,
      createdAt: project.createdAt,
    })
    .onConflictDoUpdate({
      target: schema.projects.id,
      set: {
        name: project.name,
        ...locationToRow(project.location),
        lastDraftConfig: project.lastDraftConfig ? JSON.stringify(project.lastDraftConfig) : null,
        scripts: project.scripts ? JSON.stringify(project.scripts) : null,
        searchSettings: project.searchSettings ? JSON.stringify(project.searchSettings) : null,
        disabled: !!project.disabled,
        sortOrder,
      },
    })
    .run();
}

export function dbUpsertThread(thread: Thread, sortOrder: number): void {
  const db = getDb();
  db.insert(schema.threads)
    .values({
      id: thread.id,
      projectId: thread.projectId,
      title: thread.title,
      agentKind: thread.agentKind,
      agentInstanceId: thread.agentInstanceId ?? null,
      config: JSON.stringify(thread.config),
      status: thread.status,
      attention: thread.attention,
      canResumeWithConfig: thread.canResumeWithConfig,
      sessionRef: thread.sessionRef ? JSON.stringify(thread.sessionRef) : null,
      terminalPrompt: null,
      worktreePath: thread.worktreePath ?? null,
      worktreeBranch: thread.worktreeBranch ?? null,
      prNumber: thread.prNumber ?? null,
      groupId: thread.groupId ?? null,
      groupName: thread.groupName ?? null,
      archived: thread.archived,
      done: thread.done,
      doneAt: thread.doneAt ?? null,
      starred: thread.starred,
      presentationMode: thread.presentationMode ?? "terminal",
      sortOrder,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      activeTurnStartedAt: thread.activeTurnStartedAt ?? null,
      lastTurnStartedAt: thread.lastTurnStartedAt ?? null,
      lastTurnEndedAt: thread.lastTurnEndedAt ?? null,
    })
    .onConflictDoUpdate({
      target: schema.threads.id,
      set: {
        title: thread.title,
        agentInstanceId: thread.agentInstanceId ?? null,
        config: JSON.stringify(thread.config),
        status: thread.status,
        attention: thread.attention,
        canResumeWithConfig: thread.canResumeWithConfig,
        sessionRef: thread.sessionRef ? JSON.stringify(thread.sessionRef) : null,
        terminalPrompt: null,
        worktreePath: thread.worktreePath ?? null,
        worktreeBranch: thread.worktreeBranch ?? null,
        prNumber: thread.prNumber ?? null,
        groupId: thread.groupId ?? null,
        groupName: thread.groupName ?? null,
        archived: thread.archived,
        done: thread.done,
        doneAt: thread.doneAt ?? null,
        starred: thread.starred,
        presentationMode: thread.presentationMode ?? "terminal",
        sortOrder,
        updatedAt: thread.updatedAt,
        activeTurnStartedAt: thread.activeTurnStartedAt ?? null,
        lastTurnStartedAt: thread.lastTurnStartedAt ?? null,
        lastTurnEndedAt: thread.lastTurnEndedAt ?? null,
      },
    })
    .run();
}

export function dbDeleteThread(threadId: string): void {
  const db = getDb();
  db.delete(schema.threads).where(eq(schema.threads.id, threadId)).run();
}

/**
 * Persisted canonical chat items per thread. Stored as a flat table keyed by
 * (thread_id, item_id); ordered by `position` to preserve insertion order.
 * Mirrors the renderer's `RuntimeChatItem` shape (id, type, state, payload,
 * streams) so the chat UI can hydrate on reopen.
 */
export interface PersistedRuntimeItem {
  id: string;
  type: string;
  state: "started" | "updated" | "completed";
  payload?: unknown;
  streams: Record<string, string>;
  parentItemId?: string | undefined;
}

export interface ThreadRuntimeSummary {
  itemCount: number;
  latestItemId?: string | undefined;
  latestItemType?: string | undefined;
  latestItemState?: PersistedRuntimeItem["state"] | undefined;
  contextUsage?: ThreadContextUsage | undefined;
}

const SQLITE_IN_CHUNK_SIZE = 500;

interface ThreadRuntimeSummaryStatementRunner {
  all(...values: string[]): unknown[];
}

interface ThreadRuntimeSummaryQueryRunner {
  prepare(sql: string): ThreadRuntimeSummaryStatementRunner;
}

function runtimeItemState(state: string): PersistedRuntimeItem["state"] {
  return state === "completed" || state === "updated" ? state : "started";
}

function chunkValues<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

/**
 * Low-cost shell snapshot summary: count runtime items and read only the latest
 * item metadata/context usage for many threads at once. This avoids decoding
 * every persisted chat payload on every remote `/api/snapshot` refresh.
 */
export function dbReadThreadRuntimeSummaries(
  sqlite: ThreadRuntimeSummaryQueryRunner,
  threadIds: readonly string[],
): Record<string, ThreadRuntimeSummary> {
  const ids = [...new Set(threadIds)].filter((id) => id.length > 0);
  const summaries: Record<string, ThreadRuntimeSummary> = {};
  for (const id of ids) {
    summaries[id] = { itemCount: 0 };
  }
  for (const chunk of chunkValues(ids, SQLITE_IN_CHUNK_SIZE)) {
    if (chunk.length === 0) continue;
    const sqlPlaceholders = placeholders(chunk.length);
    const runtimeRows = sqlite
      .prepare(
        `
        SELECT thread_id, item_count, item_id, type, state
        FROM (
          SELECT
            thread_id,
            item_id,
            type,
            state,
            COUNT(*) OVER (PARTITION BY thread_id) AS item_count,
            ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY position DESC) AS rn
          FROM thread_runtime_items
          WHERE thread_id IN (${sqlPlaceholders})
        )
        WHERE rn = 1
        `,
      )
      .all(...chunk) as Array<{
      thread_id: string;
      item_count: number;
      item_id: string;
      type: string;
      state: string;
    }>;
    for (const row of runtimeRows) {
      const currentSummary = summaries[row.thread_id] ?? { itemCount: 0 };
      summaries[row.thread_id] = {
        ...currentSummary,
        itemCount: row.item_count,
        latestItemId: row.item_id,
        latestItemType: row.type,
        latestItemState: runtimeItemState(row.state),
      };
    }

    const usageRows = sqlite
      .prepare(
        `SELECT thread_id, usage FROM thread_context_usage WHERE thread_id IN (${sqlPlaceholders})`,
      )
      .all(...chunk) as Array<{ thread_id: string; usage: string }>;
    for (const row of usageRows) {
      const parsed = safeParse(row.usage);
      if (!parsed || typeof parsed !== "object") continue;
      const currentSummary = summaries[row.thread_id] ?? { itemCount: 0 };
      summaries[row.thread_id] = {
        ...currentSummary,
        contextUsage: parsed as ThreadContextUsage,
      };
    }
  }
  return summaries;
}

export function dbGetThreadRuntimeSummaries(
  threadIds: readonly string[],
): Record<string, ThreadRuntimeSummary> {
  if (!_sqlite) throw new Error("Database not initialized");
  return dbReadThreadRuntimeSummaries(_sqlite, threadIds);
}

export function dbGetThreadRuntimeItems(threadId: string): PersistedRuntimeItem[] {
  if (!_sqlite) throw new Error("Database not initialized");
  const rows = _sqlite
    .prepare(
      "SELECT item_id, type, state, payload, streams, parent_item_id FROM thread_runtime_items WHERE thread_id = ? ORDER BY position ASC",
    )
    .all(threadId) as Array<{
    item_id: string;
    type: string;
    state: string;
    payload: string | null;
    streams: string | null;
    parent_item_id: string | null;
  }>;
  return rows.map((row) => ({
    id: row.item_id,
    type: row.type,
    state: runtimeItemState(row.state),
    payload: row.payload ? safeParse(row.payload) : undefined,
    streams: row.streams ? (safeParse(row.streams) as Record<string, string>) : {},
    ...(row.parent_item_id ? { parentItemId: row.parent_item_id } : {}),
  }));
}

export function dbReplaceThreadRuntimeItems(threadId: string, items: PersistedRuntimeItem[]): void {
  if (!_sqlite) throw new Error("Database not initialized");
  _sqlite.transaction(() => {
    if (!threadExistsInSqlite(_sqlite!, threadId)) return;
    replaceThreadRuntimeItemsInSqlite(_sqlite!, threadId, items);
  })();
}

function threadExistsInSqlite(sqlite: InstanceType<typeof Database>, threadId: string): boolean {
  return (
    (sqlite.prepare("SELECT 1 FROM threads WHERE id = ?").get(threadId) as
      | { "1": number }
      | undefined) !== undefined
  );
}

function replaceThreadRuntimeItemsInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  items: PersistedRuntimeItem[],
): void {
  const replace = sqlite.prepare(
    `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams, parent_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(thread_id, item_id) DO UPDATE SET
       position = excluded.position,
       type = excluded.type,
       state = excluded.state,
       payload = excluded.payload,
       streams = excluded.streams,
       parent_item_id = excluded.parent_item_id`,
  );
  const incomingIds = new Set(items.map((it) => it.id));
  const existing = sqlite
    .prepare("SELECT item_id FROM thread_runtime_items WHERE thread_id = ?")
    .all(threadId) as Array<{ item_id: string }>;
  const removeStmt = sqlite.prepare(
    "DELETE FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
  );
  for (const row of existing) {
    if (!incomingIds.has(row.item_id)) {
      removeStmt.run(threadId, row.item_id);
    }
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    replace.run(
      threadId,
      it.id,
      i,
      it.type,
      it.state,
      it.payload === undefined ? null : JSON.stringify(it.payload),
      JSON.stringify(it.streams ?? {}),
      it.parentItemId ?? null,
    );
  }
}

export function dbClearThreadRuntimeItems(threadId: string): void {
  if (!_sqlite) throw new Error("Database not initialized");
  _sqlite.prepare("DELETE FROM thread_runtime_items WHERE thread_id = ?").run(threadId);
}

/**
 * Frozen per-turn timing window. One row per completed turn (first user
 * input → thread settles back to idle). Mirrors the renderer's
 * `CompletedTurnRecord` shape.
 */
export interface PersistedCompletedTurn {
  startedAt: string;
  endedAt: string;
  anchorItemId: string | null;
}

export function dbGetThreadCompletedTurns(threadId: string): PersistedCompletedTurn[] {
  if (!_sqlite) throw new Error("Database not initialized");
  const rows = _sqlite
    .prepare(
      "SELECT started_at, ended_at, anchor_item_id FROM thread_completed_turns WHERE thread_id = ? ORDER BY idx ASC",
    )
    .all(threadId) as Array<{
    started_at: string;
    ended_at: string;
    anchor_item_id: string | null;
  }>;
  return rows.map((row) => ({
    startedAt: row.started_at,
    endedAt: row.ended_at,
    anchorItemId: row.anchor_item_id,
  }));
}

export function dbReplaceThreadCompletedTurns(
  threadId: string,
  turns: PersistedCompletedTurn[],
): void {
  if (!_sqlite) throw new Error("Database not initialized");
  _sqlite.transaction(() => {
    if (!threadExistsInSqlite(_sqlite!, threadId)) return;
    replaceThreadCompletedTurnsInSqlite(_sqlite!, threadId, turns);
  })();
}

export function dbReplaceThreadRuntimeSnapshot(
  threadId: string,
  items: PersistedRuntimeItem[],
  turns: PersistedCompletedTurn[],
  contextUsage: ThreadContextUsage | null | undefined,
): void {
  if (!_sqlite) throw new Error("Database not initialized");
  _sqlite.transaction(() => {
    if (!threadExistsInSqlite(_sqlite!, threadId)) return;
    replaceThreadRuntimeItemsInSqlite(_sqlite!, threadId, items);
    replaceThreadCompletedTurnsInSqlite(_sqlite!, threadId, turns);
    if (contextUsage !== undefined) {
      replaceThreadContextUsageInSqlite(_sqlite!, threadId, contextUsage);
    }
  })();
}

export function dbGetThreadContextUsage(threadId: string): ThreadContextUsage | null {
  if (!_sqlite) throw new Error("Database not initialized");
  const row = _sqlite
    .prepare("SELECT usage FROM thread_context_usage WHERE thread_id = ?")
    .get(threadId) as { usage: string } | undefined;
  if (!row) return null;
  const parsed = safeParse(row.usage);
  return parsed && typeof parsed === "object" ? (parsed as ThreadContextUsage) : null;
}

function replaceThreadContextUsageInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  usage: ThreadContextUsage | null,
): void {
  if (usage === null) {
    sqlite.prepare("DELETE FROM thread_context_usage WHERE thread_id = ?").run(threadId);
    return;
  }
  // Token usage is captured durably at the canonical-event layer (usage_events),
  // not here — this row is only the live context-window snapshot for the UI.
  sqlite
    .prepare(
      `INSERT INTO thread_context_usage (thread_id, usage) VALUES (?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET usage = excluded.usage`,
    )
    .run(threadId, JSON.stringify(usage));
}

function replaceThreadCompletedTurnsInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  turns: PersistedCompletedTurn[],
): void {
  const insert = sqlite.prepare(
    `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
       VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(thread_id, idx) DO UPDATE SET
       started_at = excluded.started_at,
       ended_at = excluded.ended_at,
       anchor_item_id = excluded.anchor_item_id`,
  );
  const remove = sqlite.prepare(
    "DELETE FROM thread_completed_turns WHERE thread_id = ? AND idx >= ?",
  );
  remove.run(threadId, turns.length);
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]!;
    insert.run(threadId, i, turn.startedAt, turn.endedAt, turn.anchorItemId ?? null);
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

// ── Durable usage-events log (decoupled from thread lifecycle) ──────
//
// Append-only, NO foreign key to threads — so usage stats survive thread delete
// and archive. Provider/model/mode are denormalized at write time (captured at
// the canonical-event layer in the renderer), so aggregation never needs to join
// back to a thread that may no longer exist.

export interface UsageEventInput {
  ts: number;
  kind: string;
  provider?: string | null | undefined;
  model?: string | null | undefined;
  mode?: string | null | undefined;
  fast?: boolean | undefined;
  effort?: string | null | undefined;
  name?: string | null | undefined;
  value?: number | undefined;
}

export interface UsageEventRow {
  ts: number;
  kind: string;
  provider: string | null;
  model: string | null;
  mode: string | null;
  fast: boolean;
  effort: string | null;
  name: string | null;
  value: number;
}

export function dbAppendUsageEvents(events: readonly UsageEventInput[]): void {
  if (!_sqlite) throw new Error("Database not initialized");
  if (events.length === 0) return;
  const stmt = _sqlite.prepare(
    "INSERT INTO usage_events (ts, kind, provider, model, mode, fast, effort, name, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  _sqlite.transaction((rows: readonly UsageEventInput[]) => {
    for (const e of rows) {
      stmt.run(
        e.ts,
        e.kind,
        e.provider ?? null,
        e.model ?? null,
        e.mode ?? null,
        e.fast ? 1 : 0,
        e.effort ?? null,
        e.name ?? null,
        e.value ?? 1,
      );
    }
  })(events);
  bumpProfileDataGeneration();
}

// Cache the full-table read keyed on the profile generation so the two readers
// of a single profile open (coreStats + tokenStats) share one scan, and
// repeat opens between writes don't rescan at all. Invalidated implicitly: any
// usage write bumps the generation, so a stale generation never matches.
let _usageEventsCache: { generation: number; rows: UsageEventRow[] } | undefined;

export function dbGetAllUsageEvents(): UsageEventRow[] {
  if (!_sqlite) throw new Error("Database not initialized");
  if (_usageEventsCache && _usageEventsCache.generation === _profileDataGeneration) {
    return _usageEventsCache.rows;
  }
  const rows = _sqlite
    .prepare("SELECT ts, kind, provider, model, mode, fast, effort, name, value FROM usage_events")
    .all() as Array<{
    ts: number;
    kind: string;
    provider: string | null;
    model: string | null;
    mode: string | null;
    fast: number;
    effort: string | null;
    name: string | null;
    value: number;
  }>;
  const mapped: UsageEventRow[] = rows.map((r) => ({
    ts: r.ts,
    kind: r.kind,
    provider: r.provider,
    model: r.model,
    mode: r.mode,
    fast: r.fast === 1,
    effort: r.effort,
    name: r.name,
    value: r.value,
  }));
  _usageEventsCache = { generation: _profileDataGeneration, rows: mapped };
  return mapped;
}

export function dbDeleteProject(projectId: string): void {
  const db = getDb();
  db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();
  db.delete(schema.projectNotes).where(eq(schema.projectNotes.projectId, projectId)).run();
}

// ── Per-project notes ───────────────────────────────────────────────

export function dbGetProjectNotes(projectId: string): ProjectNotes | null {
  const db = getDb();
  const row = db
    .select()
    .from(schema.projectNotes)
    .where(eq(schema.projectNotes.projectId, projectId))
    .get();
  if (!row) return null;
  const parsedTodos = row.todos ? safeParse(row.todos) : [];
  return {
    projectId: row.projectId,
    doc: row.doc ? (safeParse(row.doc) ?? null) : null,
    todos: Array.isArray(parsedTodos) ? (parsedTodos as ProjectNotes["todos"]) : [],
    updatedAt: row.updatedAt,
  };
}

export function dbSetProjectNotes(notes: ProjectNotes): void {
  const db = getDb();
  const doc = notes.doc == null ? null : JSON.stringify(notes.doc);
  const todos = JSON.stringify(notes.todos ?? []);
  db.insert(schema.projectNotes)
    .values({ projectId: notes.projectId, doc, todos, updatedAt: notes.updatedAt })
    .onConflictDoUpdate({
      target: schema.projectNotes.projectId,
      set: { doc, todos, updatedAt: notes.updatedAt },
    })
    .run();
}

/**
 * Bulk-sync the full project and thread lists from the renderer store.
 * Uses a transaction for atomicity — either everything writes or nothing.
 */
export function dbSyncAll(projectsData: Project[], threadsData: Thread[], viewJson: string): void {
  if (!_sqlite) throw new Error("Database not initialized");

  _sqlite.transaction(() => {
    const existingProjectIds = new Set(
      (_sqlite!.prepare("SELECT id FROM projects").all() as Array<{ id: string }>).map((r) => r.id),
    );
    const incomingProjectIds = new Set(projectsData.map((p) => p.id));
    const deleteProject = _sqlite!.prepare("DELETE FROM projects WHERE id = ?");
    const deleteProjectNotes = _sqlite!.prepare("DELETE FROM project_notes WHERE project_id = ?");
    const upsertProject = prepareProjectSyncStatement(_sqlite!);

    for (const pid of existingProjectIds) {
      if (!incomingProjectIds.has(pid)) {
        deleteProject.run(pid);
        deleteProjectNotes.run(pid);
      }
    }
    for (let i = 0; i < projectsData.length; i++) {
      runProjectSync(upsertProject, projectsData[i]!, i);
    }

    const existingThreadIds = new Set(
      (_sqlite!.prepare("SELECT id FROM threads").all() as Array<{ id: string }>).map((r) => r.id),
    );
    const incomingThreadIds = new Set(threadsData.map((t) => t.id));
    const deleteThread = _sqlite!.prepare("DELETE FROM threads WHERE id = ?");
    const upsertThread = prepareThreadSyncStatement(_sqlite!);

    for (const tid of existingThreadIds) {
      if (!incomingThreadIds.has(tid)) {
        deleteThread.run(tid);
      }
    }
    for (let i = 0; i < threadsData.length; i++) {
      runThreadSync(upsertThread, threadsData[i]!, i);
    }

    _sqlite!
      .prepare(
        "INSERT INTO app_state (key, value) VALUES ('view', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(viewJson);
  })();
}

type SqliteStatement = ReturnType<InstanceType<typeof Database>["prepare"]>;

function prepareProjectSyncStatement(sqlite: InstanceType<typeof Database>): SqliteStatement {
  return sqlite.prepare(`
    INSERT INTO projects (
      id, name, location_kind, location_path, location_distro, location_linux_path,
      location_unc_path, last_draft_config, scripts, search_settings, disabled,
      sort_order, created_at
    ) VALUES (
      @id, @name, @locationKind, @locationPath, @locationDistro, @locationLinuxPath,
      @locationUncPath, @lastDraftConfig, @scripts, @searchSettings, @disabled,
      @sortOrder, @createdAt
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      location_kind = excluded.location_kind,
      location_path = excluded.location_path,
      location_distro = excluded.location_distro,
      location_linux_path = excluded.location_linux_path,
      location_unc_path = excluded.location_unc_path,
      last_draft_config = excluded.last_draft_config,
      scripts = excluded.scripts,
      search_settings = excluded.search_settings,
      disabled = excluded.disabled,
      sort_order = excluded.sort_order
  `);
}

function runProjectSync(stmt: SqliteStatement, project: Project, sortOrder: number): void {
  stmt.run({
    id: project.id,
    name: project.name,
    ...locationToRow(project.location),
    lastDraftConfig: project.lastDraftConfig ? JSON.stringify(project.lastDraftConfig) : null,
    scripts: project.scripts ? JSON.stringify(project.scripts) : null,
    searchSettings: project.searchSettings ? JSON.stringify(project.searchSettings) : null,
    disabled: project.disabled ? 1 : 0,
    sortOrder,
    createdAt: project.createdAt,
  });
}

function prepareThreadSyncStatement(sqlite: InstanceType<typeof Database>): SqliteStatement {
  return sqlite.prepare(`
    INSERT INTO threads (
      id, project_id, title, agent_kind, agent_instance_id, config, status,
      attention, can_resume_with_config, session_ref, terminal_prompt, worktree_path,
      worktree_branch, pr_number, group_id, group_name, archived, done, done_at,
      starred, presentation_mode, sort_order, created_at, updated_at,
      active_turn_started_at, last_turn_started_at, last_turn_ended_at
    ) VALUES (
      @id, @projectId, @title, @agentKind, @agentInstanceId, @config, @status,
      @attention, @canResumeWithConfig, @sessionRef, NULL, @worktreePath,
      @worktreeBranch, @prNumber, @groupId, @groupName, @archived, @done, @doneAt,
      @starred, @presentationMode, @sortOrder, @createdAt, @updatedAt,
      @activeTurnStartedAt, @lastTurnStartedAt, @lastTurnEndedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      agent_instance_id = excluded.agent_instance_id,
      config = excluded.config,
      status = excluded.status,
      attention = excluded.attention,
      can_resume_with_config = excluded.can_resume_with_config,
      session_ref = excluded.session_ref,
      terminal_prompt = excluded.terminal_prompt,
      worktree_path = excluded.worktree_path,
      worktree_branch = excluded.worktree_branch,
      pr_number = excluded.pr_number,
      group_id = excluded.group_id,
      group_name = excluded.group_name,
      archived = excluded.archived,
      done = excluded.done,
      done_at = excluded.done_at,
      starred = excluded.starred,
      presentation_mode = excluded.presentation_mode,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at,
      active_turn_started_at = excluded.active_turn_started_at,
      last_turn_started_at = excluded.last_turn_started_at,
      last_turn_ended_at = excluded.last_turn_ended_at
  `);
}

function runThreadSync(stmt: SqliteStatement, thread: Thread, sortOrder: number): void {
  stmt.run({
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    agentKind: thread.agentKind,
    agentInstanceId: thread.agentInstanceId ?? null,
    config: JSON.stringify(thread.config),
    status: thread.status,
    attention: thread.attention,
    canResumeWithConfig: thread.canResumeWithConfig ? 1 : 0,
    sessionRef: thread.sessionRef ? JSON.stringify(thread.sessionRef) : null,
    worktreePath: thread.worktreePath ?? null,
    worktreeBranch: thread.worktreeBranch ?? null,
    prNumber: thread.prNumber ?? null,
    groupId: thread.groupId ?? null,
    groupName: thread.groupName ?? null,
    archived: thread.archived ? 1 : 0,
    done: thread.done ? 1 : 0,
    doneAt: thread.doneAt ?? null,
    starred: thread.starred ? 1 : 0,
    presentationMode: thread.presentationMode ?? "terminal",
    sortOrder,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    activeTurnStartedAt: thread.activeTurnStartedAt ?? null,
    lastTurnStartedAt: thread.lastTurnStartedAt ?? null,
    lastTurnEndedAt: thread.lastTurnEndedAt ?? null,
  });
}
