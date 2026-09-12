import type { Project, Thread } from "@/shared/contracts";
import { getSqlite } from "./connection";
import { forgetMainCreatedThread, noteMainCreatedThread } from "./mainCreatedThreads";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";
import {
  projectMutableRow,
  rowToProject,
  rowToThread,
  type ProjectRow,
  type ThreadRow,
} from "./rowMappers";
import { dbDiscardThreadRuntimeWrites } from "./runtimeItems";
import {
  prepareProjectUpsertStatement,
  prepareThreadUpsertStatement,
  runProjectUpsert,
  runThreadUpsert,
} from "./upsertStatements";

// ── Public query functions (called from IPC handlers) ───────────────

export function dbGetProjects(): Project[] {
  const rows = getSqlite()
    .prepare("SELECT * FROM projects ORDER BY sort_order ASC")
    .all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function dbGetProject(projectId: string): Project | null {
  const row = getSqlite().prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
    | ProjectRow
    | undefined;
  return row ? rowToProject(row) : null;
}

export function dbGetThreads(): Thread[] {
  const rows = getSqlite()
    .prepare("SELECT * FROM threads ORDER BY sort_order ASC")
    .all() as ThreadRow[];
  return rows.map(rowToThread);
}

export function dbGetThread(threadId: string): Thread | null {
  const row = getSqlite().prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as
    | ThreadRow
    | undefined;
  return row ? rowToThread(row) : null;
}

export function dbGetState(key: string): string | null {
  const row = getSqlite().prepare("SELECT value FROM app_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function dbSetState(key: string, value: string): void {
  getSqlite()
    .prepare(
      "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function dbUpsertProject(project: Project, sortOrder: number): void {
  const sqlite = getSqlite();
  runProjectUpsert(prepareProjectUpsertStatement(sqlite), project, sortOrder);
  notifyProjectThreadDataChanged();
}

export function dbUpdateProject(project: Project): void {
  getSqlite()
    .prepare(
      `UPDATE projects SET
         name = @name,
         icon = @icon,
         location_kind = @locationKind,
         location_path = @locationPath,
         location_distro = @locationDistro,
         location_linux_path = @locationLinuxPath,
         location_unc_path = @locationUncPath,
         last_draft_config = @lastDraftConfig,
         scripts = @scripts,
         search_settings = @searchSettings,
         worktree_location = @worktreeLocation,
         mcp_servers = @mcpServers,
         gh_account = @ghAccount,
         workspace_id = @workspaceId,
         disabled = @disabled
       WHERE id = @id`,
    )
    .run({ id: project.id, ...projectMutableRow(project) });
  notifyProjectThreadDataChanged();
}

export function dbUpsertThread(thread: Thread, sortOrder: number): void {
  const sqlite = getSqlite();
  sqlite
    .transaction(() => {
      // A row main inserts on its own is invisible to the renderer's store until the
      // forwarded command reaches it, so shield it from `dbSyncAll`'s delete pass
      // (see mainCreatedThreads). Keep the row and ownership marker atomic across
      // the desktop/backend-host database connections.
      const isNewRow =
        sqlite.prepare("SELECT 1 FROM threads WHERE id = ?").get(thread.id) === undefined;
      const options = { writeThreadStatusSource: true } as const;
      runThreadUpsert(prepareThreadUpsertStatement(sqlite, options), thread, sortOrder, options);
      if (isNewRow) noteMainCreatedThread(thread.id);
    })
    .immediate();
  notifyProjectThreadDataChanged();
}

/**
 * Assign a thread to a sidebar group without touching its sort order (unlike
 * `dbUpsertThread`, which requires one). Fallback for orchestrator grouping
 * when no renderer window is up to own the metadata write.
 */
export function dbSetThreadGroup(threadId: string, groupId: string, groupName: string): void {
  getSqlite()
    .prepare("UPDATE threads SET group_id = ?, group_name = ? WHERE id = ?")
    .run(groupId, groupName, threadId);
  notifyProjectThreadDataChanged();
}

/**
 * No agent session survives a host restart, so any persisted live status
 * ("launching"/"working"/...) is stale by definition once the process boots.
 * DB-level counterpart of the renderer's `markThreadsInactiveOnLaunch`; the
 * headless server calls it at startup since it has no renderer to self-heal.
 */
export function dbMarkLiveThreadsInactive(): void {
  getSqlite()
    .prepare(
      `UPDATE threads
       SET status = 'inactive', attention = 'none', active_turn_started_at = NULL
       WHERE status NOT IN ('inactive', 'error')`,
    )
    .run();
  notifyProjectThreadDataChanged();
}

export function dbDeleteThread(threadId: string): void {
  getSqlite().prepare("DELETE FROM threads WHERE id = ?").run(threadId);
  dbDiscardThreadRuntimeWrites(threadId);
  forgetMainCreatedThread(threadId);
  notifyProjectThreadDataChanged();
}

export function dbDeleteProject(projectId: string): void {
  const sqlite = getSqlite();
  const threadIds = (
    sqlite.prepare("SELECT id FROM threads WHERE project_id = ?").all(projectId) as {
      id: string;
    }[]
  ).map((row) => row.id);
  sqlite.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  sqlite.prepare("DELETE FROM project_notes WHERE project_id = ?").run(projectId);
  for (const threadId of threadIds) dbDiscardThreadRuntimeWrites(threadId);
  notifyProjectThreadDataChanged();
}
