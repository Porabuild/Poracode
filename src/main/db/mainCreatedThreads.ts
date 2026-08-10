/**
 * Thread rows main inserted itself — remote `start` commands, schedules,
 * orchestrator launches — that the renderer's store has not mirrored yet.
 *
 * The renderer persists its whole store through `dbSyncAll`, which deletes every
 * thread row missing from that snapshot. A main-created row is missing from it
 * until the forwarded `start` command reaches the renderer, and the delete
 * cascades into `thread_runtime_items`: the launch turn's `user_message` (already
 * persisted from the supervisor's emit) disappears, and later events are dropped
 * until the renderer re-creates the row. The ownership marker lives in SQLite
 * so Electron main and the backend host see the same protection, including
 * across a backend crash. The first renderer snapshot carrying an id hands
 * ownership back to the renderer, so its own deletions keep working.
 */
import { getSqlite } from "./connection";

export function noteMainCreatedThread(threadId: string): void {
  getSqlite()
    .prepare("INSERT OR IGNORE INTO main_created_threads (thread_id) VALUES (?)")
    .run(threadId);
}

export function forgetMainCreatedThread(threadId: string): void {
  getSqlite().prepare("DELETE FROM main_created_threads WHERE thread_id = ?").run(threadId);
}

export function isMainCreatedThreadUnmirrored(threadId: string): boolean {
  return (
    getSqlite().prepare("SELECT 1 FROM main_created_threads WHERE thread_id = ?").get(threadId) !==
    undefined
  );
}

/** A renderer snapshot arrived: every thread it carries is renderer-owned now. */
export function acknowledgeMirroredThreadIds(threadIds: Iterable<string>): void {
  const deleteThread = getSqlite().prepare("DELETE FROM main_created_threads WHERE thread_id = ?");
  for (const threadId of threadIds) deleteThread.run(threadId);
}
