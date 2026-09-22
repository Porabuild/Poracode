import { type Project, type Thread } from "@/shared/contracts";
import { getSqlite } from "./connection";
import {
  dbFindRunningCheckpointRevertForThreads,
  dbUpdateCheckpointRevertPhases,
} from "./checkpointRevertOperations";
import {
  acknowledgeMirroredThreadIds,
  forgetMainCreatedThread,
  isMainCreatedThreadUnmirrored,
} from "./mainCreatedThreads";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";
import { notifyThreadsDeleted } from "./deletedThreadNotifications";
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
 * Row-scoped sibling of [dbSyncAll]: the renderer diffs its store against the
 * last persisted snapshot and ships only changed rows plus explicit deletions.
 * Explicit deletes are intentional renderer deletions, so the unmirrored
 * main-created-thread guard does not apply — but the ownership marker is
 * cleared so the guard cannot resurrect the row later.
 */
export function dbSyncChanges(payload: {
  projects: Array<{ project: Project; sortOrder: number }>;
  threads: Array<{ thread: Thread; sortOrder: number }>;
  deletedProjectIds: string[];
  deletedThreadIds: string[];
  projectOrder?: string[] | undefined;
  threadOrder?: string[] | undefined;
  viewJson: string;
}): void {
  const sqlite = getSqlite();
  // Explicit renderer deletions plus the project-cascade deletions captured
  // inside the transaction below; announced together after the commit.
  const deletedThreadIds = new Set(payload.deletedThreadIds);
  sqlite
    .transaction(() => {
      const deleteProject = sqlite.prepare("DELETE FROM projects WHERE id = ?");
      const deleteProjectNotes = sqlite.prepare("DELETE FROM project_notes WHERE project_id = ?");
      const listProjectThreadIds = sqlite.prepare("SELECT id FROM threads WHERE project_id = ?");
      for (const projectId of payload.deletedProjectIds) {
        // Capture the project's threads BEFORE the delete: the foreign-key
        // cascade removes them inside this transaction, and the postcommit
        // announcement must include them like any explicit deletion.
        for (const row of listProjectThreadIds.all(projectId) as Array<{ id: string }>) {
          deletedThreadIds.add(row.id);
        }
        deleteProject.run(projectId);
        deleteProjectNotes.run(projectId);
      }
      const upsertProject = prepareProjectUpsertStatement(sqlite);
      for (const { project, sortOrder } of payload.projects) {
        runProjectUpsert(upsertProject, project, sortOrder);
      }

      const deleteThread = sqlite.prepare("DELETE FROM threads WHERE id = ?");
      for (const threadId of payload.deletedThreadIds) {
        deleteThread.run(threadId);
        forgetMainCreatedThread(threadId);
      }
      // The authority deleted these threads; a locally running compound
      // checkpoint revert against one of them can never run again. Settle its
      // journal row inside the same mirror transaction so a stale `running`
      // row cannot refuse later project/thread deletes (the operator remedy
      // for a live local revert — retry it — is meaningless once the thread
      // is gone from the authoritative mirror).
      const runningReverts = dbFindRunningCheckpointRevertForThreads(payload.deletedThreadIds);
      for (const operationKey of runningReverts.operationKeys) {
        // `ambiguous`, not a completed-family outcome: phases may have partly
        // applied before the authority deleted the thread, and the row must
        // not claim success — it only records that the claim is released.
        dbUpdateCheckpointRevertPhases(operationKey, { outcome: "ambiguous" });
      }
      const upsertThread = prepareThreadUpsertStatement(sqlite, THREAD_SYNC_OPTIONS);
      for (const { thread, sortOrder } of payload.threads) {
        runThreadUpsert(upsertThread, thread, sortOrder, THREAD_SYNC_OPTIONS);
      }
      acknowledgeMirroredThreadIds(payload.threads.map(({ thread }) => thread.id));

      // A drag reorder (or add/remove) permutes the array without changing any
      // row object, so order travels as explicit full id lists; reindexing here
      // is idempotent with the upserts' own sort_order values.
      if (payload.projectOrder) {
        const reindex = sqlite.prepare("UPDATE projects SET sort_order = ? WHERE id = ?");
        payload.projectOrder.forEach((projectId, index) => reindex.run(index, projectId));
      }
      if (payload.threadOrder) {
        const reindex = sqlite.prepare("UPDATE threads SET sort_order = ? WHERE id = ?");
        payload.threadOrder.forEach((threadId, index) => reindex.run(index, threadId));
      }

      sqlite
        .prepare(
          "INSERT INTO app_state (key, value) VALUES ('view', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(payload.viewJson);
    })
    .immediate();
  // The mirror transaction committed; announce the explicit and
  // project-cascaded deletions so the composition's reclaimer can retire
  // their attachment directories.
  notifyThreadsDeleted([...deletedThreadIds]);
  for (const threadId of deletedThreadIds) dbDiscardThreadRuntimeWrites(threadId);
  // View-only writes (navigation, layout) must not wake the projection watch.
  if (
    payload.projects.length > 0 ||
    payload.threads.length > 0 ||
    payload.deletedProjectIds.length > 0 ||
    payload.deletedThreadIds.length > 0 ||
    payload.projectOrder !== undefined ||
    payload.threadOrder !== undefined
  ) {
    notifyProjectThreadDataChanged();
  }
}

/**
 * Bulk-sync the full project and thread lists from the renderer store.
 * Uses a transaction for atomicity — either everything writes or nothing.
 */
export function dbSyncAll(projectsData: Project[], threadsData: Thread[], viewJson: string): void {
  const sqlite = getSqlite();
  const deletedThreadIds = new Set<string>();

  sqlite
    .transaction(() => {
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
      // Same authority-mirror semantics as [dbSyncChanges]: a locally running
      // compound revert for a thread this full snapshot deletes can never run
      // again, so settle its claim instead of leaving a stale `running` row.
      const settledReverts = dbFindRunningCheckpointRevertForThreads([...deletedThreadIds]);
      for (const operationKey of settledReverts.operationKeys) {
        dbUpdateCheckpointRevertPhases(operationKey, { outcome: "ambiguous" });
      }
      // Anything in this snapshot is renderer-owned from here on, so a later
      // snapshot that drops it is a real deletion.
      acknowledgeMirroredThreadIds(incomingThreadIds);

      sqlite
        .prepare(
          "INSERT INTO app_state (key, value) VALUES ('view', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(viewJson);
    })
    .immediate();
  // The full-snapshot transaction committed; announce the diffed deletions.
  notifyThreadsDeleted([...deletedThreadIds]);
  for (const threadId of deletedThreadIds) dbDiscardThreadRuntimeWrites(threadId);
  notifyProjectThreadDataChanged();
}
