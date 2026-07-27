import Database from "better-sqlite3";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  type Project,
  type Thread,
} from "@/shared/contracts";
import type { DbPersistExperimentStatePayload } from "@/shared/ipc";
import { getSqlite } from "./connection";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";
import { locationToRow } from "./rowMappers";

/**
 * Bulk-sync the full project and thread lists from the renderer store.
 * Uses a transaction for atomicity — either everything writes or nothing.
 */
export function dbSyncAll(projectsData: Project[], threadsData: Thread[], viewJson: string): void {
  const sqlite = getSqlite();

  sqlite.transaction(() => {
    const existingProjectIds = new Set(
      (sqlite.prepare("SELECT id FROM projects").all() as Array<{ id: string }>).map((r) => r.id),
    );
    const incomingProjectIds = new Set(projectsData.map((p) => p.id));
    const deleteProject = sqlite.prepare("DELETE FROM projects WHERE id = ?");
    const deleteProjectNotes = sqlite.prepare("DELETE FROM project_notes WHERE project_id = ?");
    const upsertProject = prepareProjectSyncStatement(sqlite);

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
      (sqlite.prepare("SELECT id FROM threads").all() as Array<{ id: string }>).map((r) => r.id),
    );
    const incomingThreadIds = new Set(threadsData.map((t) => t.id));
    const deleteThread = sqlite.prepare("DELETE FROM threads WHERE id = ?");
    const upsertThread = prepareThreadSyncStatement(sqlite);

    for (const tid of existingThreadIds) {
      if (!incomingThreadIds.has(tid)) {
        deleteThread.run(tid);
      }
    }
    for (let i = 0; i < threadsData.length; i++) {
      runThreadSync(upsertThread, threadsData[i]!, i);
    }

    sqlite
      .prepare(
        "INSERT INTO app_state (key, value) VALUES ('view', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(viewJson);
  })();
  notifyProjectThreadDataChanged();
}

export function dbPersistExperimentState(payload: DbPersistExperimentStatePayload): void {
  const sqlite = getSqlite();
  sqlite.transaction(() => {
    const deleteThread = sqlite.prepare("DELETE FROM threads WHERE id = ?");
    for (const threadId of payload.deletedThreadIds) deleteThread.run(threadId);

    const upsertThread = prepareThreadSyncStatement(sqlite);
    for (const { thread, sortOrder } of payload.upsertThreads) {
      runThreadSync(upsertThread, thread, sortOrder);
    }

    sqlite
      .prepare(
        "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(
        EXPERIMENT_STORE_KEY,
        JSON.stringify({
          state: { experiments: payload.experiments },
          version: EXPERIMENT_STORE_VERSION,
        }),
      );
  })();
}

type SqliteStatement = ReturnType<InstanceType<typeof Database>["prepare"]>;

function prepareProjectSyncStatement(sqlite: InstanceType<typeof Database>): SqliteStatement {
  return sqlite.prepare(`
    INSERT INTO projects (
      id, name, location_kind, location_path, location_distro, location_linux_path,
      location_unc_path, last_draft_config, scripts, search_settings, mcp_servers, workspace_id,
      disabled, sort_order, created_at
    ) VALUES (
      @id, @name, @locationKind, @locationPath, @locationDistro, @locationLinuxPath,
      @locationUncPath, @lastDraftConfig, @scripts, @searchSettings, @mcpServers, @workspaceId,
      @disabled, @sortOrder, @createdAt
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
      mcp_servers = excluded.mcp_servers,
      workspace_id = excluded.workspace_id,
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
    mcpServers: project.mcpServers ? JSON.stringify(project.mcpServers) : null,
    workspaceId: project.workspaceId ?? null,
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
      worktree_branch, pr_number, group_id, group_name, parent_thread_id, archived, done, done_at,
      starred, presentation_mode, sort_order, created_at, updated_at,
      active_turn_started_at, last_turn_started_at, last_turn_ended_at
    ) VALUES (
      @id, @projectId, @title, @agentKind, @agentInstanceId, @config, @status,
      @attention, @canResumeWithConfig, @sessionRef, NULL, @worktreePath,
      @worktreeBranch, @prNumber, @groupId, @groupName, @parentThreadId, @archived, @done, @doneAt,
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
      parent_thread_id = excluded.parent_thread_id,
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
    parentThreadId: thread.parentThreadId ?? null,
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
