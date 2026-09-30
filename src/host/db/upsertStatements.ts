import Database from "better-sqlite3";
import type { Project, Thread } from "@/shared/contracts";
import { projectMutableRow } from "./rowMappers";

/**
 * Shared `projects` / `threads` upsert statements. Used by the single-row
 * writers in `projectsThreads.ts` and the bulk renderer sync in `sync.ts` so
 * both paths write exactly the same column set.
 */

export type SqliteStatement = ReturnType<InstanceType<typeof Database>["prepare"]>;

export function prepareProjectUpsertStatement(
  sqlite: InstanceType<typeof Database>,
): SqliteStatement {
  return sqlite.prepare(`
    INSERT INTO projects (
      id, name, icon, location_kind, location_path, location_distro, location_linux_path,
      location_unc_path, last_draft_config, scripts, search_settings, worktree_location,
      mcp_servers, gh_account, workspace_id,
      disabled, sort_order, created_at
    ) VALUES (
      @id, @name, @icon, @locationKind, @locationPath, @locationDistro, @locationLinuxPath,
      @locationUncPath, @lastDraftConfig, @scripts, @searchSettings, @worktreeLocation,
      @mcpServers, @ghAccount, @workspaceId,
      @disabled, @sortOrder, @createdAt
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      icon = excluded.icon,
      location_kind = excluded.location_kind,
      location_path = excluded.location_path,
      location_distro = excluded.location_distro,
      location_linux_path = excluded.location_linux_path,
      location_unc_path = excluded.location_unc_path,
      last_draft_config = excluded.last_draft_config,
      scripts = excluded.scripts,
      search_settings = excluded.search_settings,
      worktree_location = excluded.worktree_location,
      mcp_servers = excluded.mcp_servers,
      gh_account = excluded.gh_account,
      workspace_id = excluded.workspace_id,
      disabled = excluded.disabled,
      sort_order = excluded.sort_order
  `);
}

export function runProjectUpsert(stmt: SqliteStatement, project: Project, sortOrder: number): void {
  stmt.run({
    id: project.id,
    ...projectMutableRow(project),
    sortOrder,
    createdAt: project.createdAt,
  });
}

export interface ThreadUpsertOptions {
  /**
   * Whether `thread_status_source` is written. The single-row writer owns that
   * column; the bulk renderer sync leaves it untouched so a stale renderer
   * snapshot cannot clobber a status source the supervisor just recorded.
   */
  readonly writeThreadStatusSource: boolean;
}

export function prepareThreadUpsertStatement(
  sqlite: InstanceType<typeof Database>,
  options: ThreadUpsertOptions,
): SqliteStatement {
  const statusSourceUpdate = options.writeThreadStatusSource
    ? "thread_status_source = excluded.thread_status_source,"
    : "";
  return sqlite.prepare(`
    INSERT INTO threads (
      id, project_id, workspace_id, title, agent_kind, agent_instance_id, config, status,
      attention, thread_status_source, can_resume_with_config, session_ref, terminal_prompt, worktree_path,
      worktree_branch, pr_number, group_id, group_name, parent_thread_id, archived, archived_at, done, done_at,
      starred, presentation_mode, sort_order, created_at, updated_at,
      active_turn_started_at, last_turn_started_at, last_turn_ended_at
    ) VALUES (
      @id, @projectId, @workspaceId, @title, @agentKind, @agentInstanceId, @config, @status,
      @attention, @threadStatusSource, @canResumeWithConfig, @sessionRef, NULL, @worktreePath,
      @worktreeBranch, @prNumber, @groupId, @groupName, @parentThreadId, @archived, @archivedAt, @done, @doneAt,
      @starred, @presentationMode, @sortOrder, @createdAt, @updatedAt,
      @activeTurnStartedAt, @lastTurnStartedAt, @lastTurnEndedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      -- Kept in the update set so "Move to Workspace" survives full syncs.
      workspace_id = excluded.workspace_id,
      title = excluded.title,
      -- Mutable: a thread can be switched to another provider in place, keeping
      -- its id and transcript. Omitting this pinned rows to their first agent.
      agent_kind = excluded.agent_kind,
      agent_instance_id = excluded.agent_instance_id,
      config = excluded.config,
      status = excluded.status,
      attention = excluded.attention,
      ${statusSourceUpdate}
      can_resume_with_config = excluded.can_resume_with_config,
      session_ref = excluded.session_ref,
      terminal_prompt = excluded.terminal_prompt,
      worktree_path = excluded.worktree_path,
      worktree_branch = excluded.worktree_branch,
      pr_number = excluded.pr_number,
      group_id = excluded.group_id,
      group_name = excluded.group_name,
      parent_thread_id = excluded.parent_thread_id,
      archived = excluded.archived,
      archived_at = excluded.archived_at,
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

export function runThreadUpsert(
  stmt: SqliteStatement,
  thread: Thread,
  sortOrder: number,
  options: ThreadUpsertOptions,
): void {
  stmt.run({
    id: thread.id,
    projectId: thread.projectId,
    workspaceId: thread.workspaceId ?? null,
    title: thread.title,
    agentKind: thread.agentKind,
    agentInstanceId: thread.agentInstanceId ?? null,
    config: JSON.stringify(thread.config),
    status: thread.status,
    attention: thread.attention,
    threadStatusSource: options.writeThreadStatusSource
      ? (thread.threadStatusSource ?? null)
      : null,
    canResumeWithConfig: thread.canResumeWithConfig ? 1 : 0,
    sessionRef: thread.sessionRef ? JSON.stringify(thread.sessionRef) : null,
    worktreePath: thread.worktreePath ?? null,
    worktreeBranch: thread.worktreeBranch ?? null,
    prNumber: thread.prNumber ?? null,
    groupId: thread.groupId ?? null,
    groupName: thread.groupName ?? null,
    parentThreadId: thread.parentThreadId ?? null,
    archived: thread.archived ? 1 : 0,
    archivedAt: thread.archivedAt ?? null,
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
