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
import { dbDiscardThreadRuntimeWrites } from "./runtimeItems";
import {
  prepareProjectUpsertStatement,
  prepareThreadUpsertStatement,
  runProjectUpsert,
  runThreadUpsert,
} from "./upsertStatements";

/** Renderer snapshots never own `thread_status_source`; see ThreadUpsertOptions. */
const THREAD_SYNC_OPTIONS = { writeThreadStatusSource: false } as const;

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
    const upsertProject = prepareProjectUpsertStatement(sqlite);

    for (const pid of existingProjectIds) {
      if (!incomingProjectIds.has(pid)) {
        deleteProject.run(pid);
        deleteProjectNotes.run(pid);
      }
    }
    for (let i = 0; i < projectsData.length; i++) {
      runProjectUpsert(upsertProject, projectsData[i]!, i);
    }

    const incomingThreadIds = new Set(threadsData.map((t) => t.id));
    const deleteThread = sqlite.prepare("DELETE FROM threads WHERE id = ?");
    const upsertThread = prepareThreadUpsertStatement(sqlite, THREAD_SYNC_OPTIONS);

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
      runThreadUpsert(upsertThread, threadsData[i]!, i, THREAD_SYNC_OPTIONS);
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

    const upsertThread = prepareThreadUpsertStatement(sqlite, THREAD_SYNC_OPTIONS);
    for (const { thread, sortOrder } of payload.upsertThreads) {
      runThreadUpsert(upsertThread, thread, sortOrder, THREAD_SYNC_OPTIONS);
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
