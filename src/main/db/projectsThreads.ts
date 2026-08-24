import { asc, eq, notInArray } from "drizzle-orm";
import type { Project, Thread } from "@/shared/contracts";
import * as schema from "../db.schema";
import { getDb } from "./connection";
import { forgetMainCreatedThread, noteMainCreatedThread } from "./mainCreatedThreads";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";
import { projectMutableRow, rowToProject, rowToThread } from "./rowMappers";

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

export function dbGetProject(projectId: string): Project | null {
  const db = getDb();
  const row = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  return row ? rowToProject(row) : null;
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
      ...projectMutableRow(project),
      sortOrder,
      createdAt: project.createdAt,
    })
    .onConflictDoUpdate({
      target: schema.projects.id,
      set: {
        ...projectMutableRow(project),
        sortOrder,
      },
    })
    .run();
  notifyProjectThreadDataChanged();
}

export function dbUpdateProject(project: Project): void {
  getDb()
    .update(schema.projects)
    .set(projectMutableRow(project))
    .where(eq(schema.projects.id, project.id))
    .run();
  notifyProjectThreadDataChanged();
}

export function dbUpsertThread(thread: Thread, sortOrder: number): void {
  const db = getDb();
  // A row main inserts on its own is invisible to the renderer's store until the
  // forwarded command reaches it, so shield it from `dbSyncAll`'s delete pass
  // (see mainCreatedThreads).
  const isNewRow =
    db
      .select({ id: schema.threads.id })
      .from(schema.threads)
      .where(eq(schema.threads.id, thread.id))
      .get() === undefined;
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
      threadStatusSource: thread.threadStatusSource ?? null,
      canResumeWithConfig: thread.canResumeWithConfig,
      sessionRef: thread.sessionRef ? JSON.stringify(thread.sessionRef) : null,
      terminalPrompt: null,
      worktreePath: thread.worktreePath ?? null,
      worktreeBranch: thread.worktreeBranch ?? null,
      prNumber: thread.prNumber ?? null,
      groupId: thread.groupId ?? null,
      groupName: thread.groupName ?? null,
      parentThreadId: thread.parentThreadId ?? null,
      archived: thread.archived,
      archivedAt: thread.archivedAt ?? null,
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
        threadStatusSource: thread.threadStatusSource ?? null,
        canResumeWithConfig: thread.canResumeWithConfig,
        sessionRef: thread.sessionRef ? JSON.stringify(thread.sessionRef) : null,
        terminalPrompt: null,
        worktreePath: thread.worktreePath ?? null,
        worktreeBranch: thread.worktreeBranch ?? null,
        prNumber: thread.prNumber ?? null,
        groupId: thread.groupId ?? null,
        groupName: thread.groupName ?? null,
        parentThreadId: thread.parentThreadId ?? null,
        archived: thread.archived,
        archivedAt: thread.archivedAt ?? null,
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
  if (isNewRow) noteMainCreatedThread(thread.id);
  notifyProjectThreadDataChanged();
}

/**
 * Assign a thread to a sidebar group without touching its sort order (unlike
 * `dbUpsertThread`, which requires one). Fallback for orchestrator grouping
 * when no renderer window is up to own the metadata write.
 */
export function dbSetThreadGroup(threadId: string, groupId: string, groupName: string): void {
  const db = getDb();
  db.update(schema.threads)
    .set({ groupId, groupName })
    .where(eq(schema.threads.id, threadId))
    .run();
  notifyProjectThreadDataChanged();
}

/**
 * No agent session survives a host restart, so any persisted live status
 * ("launching"/"working"/...) is stale by definition once the process boots.
 * DB-level counterpart of the renderer's `markThreadsInactiveOnLaunch`; the
 * headless server calls it at startup since it has no renderer to self-heal.
 */
export function dbMarkLiveThreadsInactive(): void {
  const db = getDb();
  db.update(schema.threads)
    .set({ status: "inactive", attention: "none", activeTurnStartedAt: null })
    .where(notInArray(schema.threads.status, ["inactive", "error"]))
    .run();
  notifyProjectThreadDataChanged();
}

export function dbDeleteThread(threadId: string): void {
  const db = getDb();
  db.delete(schema.threads).where(eq(schema.threads.id, threadId)).run();
  forgetMainCreatedThread(threadId);
  notifyProjectThreadDataChanged();
}

export function dbDeleteProject(projectId: string): void {
  const db = getDb();
  db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();
  db.delete(schema.projectNotes).where(eq(schema.projectNotes.projectId, projectId)).run();
  notifyProjectThreadDataChanged();
}
