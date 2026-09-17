import type { Project, Thread } from "@/shared/contracts";
import { getSqlite } from "./connection";
import { dbAssertNoRunningCheckpointRevert } from "./checkpointRevertOperations";
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

/**
 * Versioned opaque cursor for {@link dbGetThreadsPage}: `tp1.` + base64url of
 * the last returned row's `(sort_order, id)` key. The prefix lets a future
 * cursor shape refuse old cursors instead of mispaging.
 */
const THREAD_PAGE_CURSOR_PREFIX = "tp1.";

export interface DbThreadPageCursor {
  sortOrder: number;
  id: string;
}

export function encodeDbThreadPageCursor(cursor: DbThreadPageCursor): string {
  return `${THREAD_PAGE_CURSOR_PREFIX}${Buffer.from(
    JSON.stringify({ s: cursor.sortOrder, i: cursor.id }),
    "utf8",
  ).toString("base64url")}`;
}

export function decodeDbThreadPageCursor(cursor: string): DbThreadPageCursor {
  if (!cursor.startsWith(THREAD_PAGE_CURSOR_PREFIX)) {
    throw new Error(`Malformed thread page cursor.`);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      Buffer.from(cursor.slice(THREAD_PAGE_CURSOR_PREFIX.length), "base64url").toString("utf8"),
    ) as unknown;
  } catch {
    throw new Error("Malformed thread page cursor.");
  }
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("s" in decoded) ||
    !("i" in decoded) ||
    typeof (decoded as { s: unknown }).s !== "number" ||
    !Number.isSafeInteger((decoded as { s: unknown }).s) ||
    typeof (decoded as { i: unknown }).i !== "string" ||
    (decoded as { i: string }).i.length === 0
  ) {
    throw new Error("Malformed thread page cursor.");
  }
  return { sortOrder: (decoded as { s: number }).s, id: (decoded as { i: string }).i };
}

export interface DbThreadListPage {
  threads: Thread[];
  /** Present when higher sort_order rows remain; null at the end of the list. */
  nextCursor: string | null;
}

export interface DbThreadListPageQuery {
  /** Page size; callers keep one page's reply inside the 64 KiB wire bound. */
  limit: number;
  /** Continuation cursor from the previous page's `nextCursor`. */
  cursor?: string;
  /** Project-scoped read; absent means every project. */
  projectId?: string;
}

/**
 * Bounded, project-scoped, cursor-paginated counterpart of `dbGetThreads`
 * (Gate 4 hazard #3): the full-list read has no filter and every client
 * attach transferred the whole list, so consumers page instead. Ordering is
 * `(sort_order ASC, id ASC)` — the id tiebreaker makes the cursor stable, and
 * the SQL never materializes rows past the page.
 */
export function dbGetThreadsPage(query: DbThreadListPageQuery): DbThreadListPage {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 200) {
    throw new Error("Thread page limit must be an integer between 1 and 200.");
  }
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (query.cursor !== undefined) {
    const cursor = decodeDbThreadPageCursor(query.cursor);
    conditions.push("(sort_order > ? OR (sort_order = ? AND id > ?))");
    params.push(cursor.sortOrder, cursor.sortOrder, cursor.id);
  }
  if (query.projectId !== undefined) {
    conditions.push("project_id = ?");
    params.push(query.projectId);
  }
  const whereSql = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  // One extra row distinguishes "page full, more remain" from "page full, list
  // exactly exhausted", so the final page reports a null cursor instead of
  // sending the client to fetch a degenerate empty page.
  const rows = getSqlite()
    .prepare(`SELECT * FROM threads${whereSql} ORDER BY sort_order ASC, id ASC LIMIT ?`)
    .all(...params, query.limit + 1) as ThreadRow[];
  const hasMore = rows.length > query.limit;
  const threads = rows.slice(0, query.limit).map(rowToThread);
  const lastRow = threads.length > 0 ? rows[threads.length - 1] : undefined;
  return {
    threads,
    nextCursor:
      hasMore && lastRow !== undefined
        ? encodeDbThreadPageCursor({
            sortOrder: lastRow.sort_order,
            id: lastRow.id,
          })
        : null,
  };
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
 * Host-side durable PR-merge settle: mark threads done without touching their
 * sidebar sort order, live status, or ownership markers (unlike
 * `dbUpsertThread`, which rewrites the whole row). Only rows not already done
 * flip, so an explicit un-done by the user is never reversed by a late event.
 */
export function dbSetThreadsDone(threadIds: readonly string[], doneAt: string): void {
  if (threadIds.length === 0) return;
  getSqlite()
    .prepare(
      `UPDATE threads
       SET done = 1, done_at = ?, updated_at = ?
       WHERE done = 0 AND id IN (${threadIds.map(() => "?").join(", ")})`,
    )
    .run(doneAt, doneAt, ...threadIds);
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
  // A running compound checkpoint revert holds the per-thread mutation lock
  // and its journal row is that claim's durable form: deleting mid-revert
  // would let the revert's file-restore phase run into a deleted project, so
  // the delete refuses loudly until the operation settles.
  dbAssertNoRunningCheckpointRevert([threadId]);
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
  // Same custody rule as dbDeleteProject's per-thread counterpart: any thread
  // of the project with a running revert blocks the whole project deletion.
  dbAssertNoRunningCheckpointRevert(threadIds);
  sqlite.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  sqlite.prepare("DELETE FROM project_notes WHERE project_id = ?").run(projectId);
  for (const threadId of threadIds) dbDiscardThreadRuntimeWrites(threadId);
  notifyProjectThreadDataChanged();
}
