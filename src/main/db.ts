import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { asc, eq } from "drizzle-orm";
import type { ProjectLocation, Project, Thread } from "../shared/contracts";
import * as schema from "./db.schema";

let _db: ReturnType<typeof drizzle> | undefined;
let _sqlite: InstanceType<typeof Database> | undefined;

export function initDatabase(dbPath: string) {
  console.log(`[db] opening ${dbPath}`);
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");

  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });

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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migrate: add sort_order columns if missing
  const projectCols = sqlite.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projectCols.some((c) => c.name === "sort_order")) {
    sqlite.exec("ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  }
  const threadCols = sqlite.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
  if (!threadCols.some((c) => c.name === "sort_order")) {
    sqlite.exec("ALTER TABLE threads ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  }
  if (!threadCols.some((c) => c.name === "worktree_path")) {
    sqlite.exec("ALTER TABLE threads ADD COLUMN worktree_path TEXT");
  }
  if (!threadCols.some((c) => c.name === "worktree_branch")) {
    sqlite.exec("ALTER TABLE threads ADD COLUMN worktree_branch TEXT");
  }

  console.log("[db] initialized");
  return _db;
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized");
  return _db;
}

export function closeDatabase() {
  _sqlite?.close();
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
    createdAt: row.createdAt,
  };
}

function rowToThread(row: typeof schema.threads.$inferSelect): Thread {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    agentKind: row.agentKind as Thread["agentKind"],
    config: JSON.parse(row.config),
    status: row.status as Thread["status"],
    attention: row.attention as Thread["attention"],
    canResumeWithConfig: row.canResumeWithConfig,
    ...(row.sessionRef ? { sessionRef: JSON.parse(row.sessionRef) } : {}),
    ...(row.terminalPrompt ? { terminalPrompt: JSON.parse(row.terminalPrompt) } : {}),
    ...(row.worktreePath ? { worktreePath: row.worktreePath } : {}),
    ...(row.worktreeBranch ? { worktreeBranch: row.worktreeBranch } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
      sortOrder,
      createdAt: project.createdAt,
    })
    .onConflictDoUpdate({
      target: schema.projects.id,
      set: {
        name: project.name,
        ...locationToRow(project.location),
        lastDraftConfig: project.lastDraftConfig ? JSON.stringify(project.lastDraftConfig) : null,
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
      config: JSON.stringify(thread.config),
      status: thread.status,
      attention: thread.attention,
      canResumeWithConfig: thread.canResumeWithConfig,
      sessionRef: thread.sessionRef ? JSON.stringify(thread.sessionRef) : null,
      terminalPrompt: thread.terminalPrompt ? JSON.stringify(thread.terminalPrompt) : null,
      worktreePath: thread.worktreePath ?? null,
      worktreeBranch: thread.worktreeBranch ?? null,
      sortOrder,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.threads.id,
      set: {
        title: thread.title,
        config: JSON.stringify(thread.config),
        status: thread.status,
        attention: thread.attention,
        canResumeWithConfig: thread.canResumeWithConfig,
        sessionRef: thread.sessionRef ? JSON.stringify(thread.sessionRef) : null,
        terminalPrompt: thread.terminalPrompt ? JSON.stringify(thread.terminalPrompt) : null,
        worktreePath: thread.worktreePath ?? null,
        worktreeBranch: thread.worktreeBranch ?? null,
        sortOrder,
        updatedAt: thread.updatedAt,
      },
    })
    .run();
}

export function dbDeleteThread(threadId: string): void {
  const db = getDb();
  db.delete(schema.threads).where(eq(schema.threads.id, threadId)).run();
}

export function dbDeleteProject(projectId: string): void {
  const db = getDb();
  db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();
}

/**
 * Bulk-sync the full project and thread lists from the renderer store.
 * Uses a transaction for atomicity — either everything writes or nothing.
 */
export function dbSyncAll(projectsData: Project[], threadsData: Thread[], viewJson: string): void {
  if (!_sqlite) throw new Error("Database not initialized");
  const db = getDb();

  _sqlite.transaction(() => {
    // Sync projects
    const existingProjectIds = new Set(
      db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .all()
        .map((r) => r.id),
    );
    const incomingProjectIds = new Set(projectsData.map((p) => p.id));

    for (const pid of existingProjectIds) {
      if (!incomingProjectIds.has(pid)) {
        db.delete(schema.projects).where(eq(schema.projects.id, pid)).run();
      }
    }
    for (let i = 0; i < projectsData.length; i++) {
      dbUpsertProject(projectsData[i]!, i);
    }

    // Sync threads
    const existingThreadIds = new Set(
      db
        .select({ id: schema.threads.id })
        .from(schema.threads)
        .all()
        .map((r) => r.id),
    );
    const incomingThreadIds = new Set(threadsData.map((t) => t.id));

    for (const tid of existingThreadIds) {
      if (!incomingThreadIds.has(tid)) {
        db.delete(schema.threads).where(eq(schema.threads.id, tid)).run();
      }
    }
    for (let i = 0; i < threadsData.length; i++) {
      dbUpsertThread(threadsData[i]!, i);
    }

    // Sync view
    dbSetState("view", viewJson);
  })();
}
