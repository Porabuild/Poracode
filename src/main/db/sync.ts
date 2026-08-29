import Database from "better-sqlite3";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  type Project,
  type Thread,
} from "@/shared/contracts";
import type { DbPersistExperimentStatePayload } from "@/shared/ipc";
import { getSqlite } from "./connection";
import { acknowledgeMirroredThreadIds, isMainCreatedThreadUnmirrored } from "./mainCreatedThreads";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";
import { projectMutableRow } from "./rowMappers";
import { dbDiscardThreadRuntimeWrites } from "./runtimeItems";

/**
 * Bulk-sync the full project and thread lists from the renderer store.
 * Uses a transaction for atomicity — either everything writes or nothing.
 */
export function dbSyncAll(projectsData: Project[], threadsData: Thread[], viewJson: string): void {
  const sqlite = getSqlite();
  const deletedThreadIds = new Set<string>();

  sqlite.transaction(() => {
    const existingThreads = sqlite.prepare("SELECT id, project_id FROM threads").all() as Array<{
      id: string;
      project_id: string;
    }>;
    const existingProjectIds = new Set(
      (sqlite.prepare("SELECT id FROM projects").all() as Array<{ id: string }>).map((r) => r.id),
    );
    const incomingProjectIds = new Set(projectsData.map((p) => p.id));
    const deletedProjectIds = new Set(
      [...existingProjectIds].filter((projectId) => !incomingProjectIds.has(projectId)),
    );
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

    const incomingThreadIds = new Set(threadsData.map((t) => t.id));
    const deleteThread = sqlite.prepare("DELETE FROM threads WHERE id = ?");
    const upsertThread = prepareThreadSyncStatement(sqlite);

    for (const { id: tid, project_id: projectId } of existingThreads) {
      if (incomingThreadIds.has(tid)) continue;
      // A thread main just created (remote `start`, schedule, orchestrator) is
      // absent from this snapshot only because the renderer has not applied the
      // forwarded command yet. Deleting it would cascade away the launch turn's
      // runtime items — most visibly the initial `user_message`.
      if (!deletedProjectIds.has(projectId) && isMainCreatedThreadUnmirrored(tid)) continue;
      deleteThread.run(tid);
      deletedThreadIds.add(tid);
    }
    for (let i = 0; i < threadsData.length; i++) {
      runThreadSync(upsertThread, threadsData[i]!, i);
    }
    // Anything in this snapshot is renderer-owned from here on, so a later
    // snapshot that drops it is a real deletion.
    acknowledgeMirroredThreadIds(incomingThreadIds);

    sqlite
      .prepare(
        "INSERT INTO app_state (key, value) VALUES ('view', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(viewJson);
  })();
  for (const threadId of deletedThreadIds) dbDiscardThreadRuntimeWrites(threadId);
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
  for (const threadId of payload.deletedThreadIds) dbDiscardThreadRuntimeWrites(threadId);
}

type SqliteStatement = ReturnType<InstanceType<typeof Database>["prepare"]>;

function prepareProjectSyncStatement(sqlite: InstanceType<typeof Database>): SqliteStatement {
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

function runProjectSync(stmt: SqliteStatement, project: Project, sortOrder: number): void {
  stmt.run({
    id: project.id,
    ...projectMutableRow(project),
    disabled: project.disabled ? 1 : 0,
    sortOrder,
    createdAt: project.createdAt,
  });
}

function prepareThreadSyncStatement(sqlite: InstanceType<typeof Database>): SqliteStatement {
  return sqlite.prepare(`
    INSERT INTO threads (
      id, project_id, workspace_id, title, agent_kind, agent_instance_id, config, status,
      attention, can_resume_with_config, session_ref, terminal_prompt, worktree_path,
      worktree_branch, pr_number, group_id, group_name, parent_thread_id, archived, archived_at, done, done_at,
      starred, presentation_mode, sort_order, created_at, updated_at,
      active_turn_started_at, last_turn_started_at, last_turn_ended_at
    ) VALUES (
      @id, @projectId, @workspaceId, @title, @agentKind, @agentInstanceId, @config, @status,
      @attention, @canResumeWithConfig, @sessionRef, NULL, @worktreePath,
      @worktreeBranch, @prNumber, @groupId, @groupName, @parentThreadId, @archived, @archivedAt, @done, @doneAt,
      @starred, @presentationMode, @sortOrder, @createdAt, @updatedAt,
      @activeTurnStartedAt, @lastTurnStartedAt, @lastTurnEndedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
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

function runThreadSync(stmt: SqliteStatement, thread: Thread, sortOrder: number): void {
  stmt.run({
    id: thread.id,
    projectId: thread.projectId,
    // Kept in the sync so "Move to Workspace" survives the renderer's periodic
    // full-store persist, exactly like the single-row dbUpsertThread path.
    workspaceId: thread.workspaceId ?? null,
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
