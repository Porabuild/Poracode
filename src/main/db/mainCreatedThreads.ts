/**
 * Thread rows main inserted itself — remote `start` commands, schedules,
 * orchestrator launches — that the renderer's store has not mirrored yet.
 *
 * The renderer persists its whole store through `dbSyncAll`, which deletes every
 * thread row missing from that snapshot. A main-created row is missing from it
 * until the forwarded `start` command reaches the renderer, and the delete
 * cascades into `thread_runtime_items`: the launch turn's `user_message` (already
 * persisted from the supervisor's emit) disappears, and later events are dropped
 * until the renderer re-creates the row. Ids tracked here are exempt from that
 * delete; the first renderer snapshot carrying an id hands ownership back to the
 * renderer, so its own deletions keep working.
 */
const unmirroredThreadIds = new Set<string>();

export function noteMainCreatedThread(threadId: string): void {
  unmirroredThreadIds.add(threadId);
}

export function forgetMainCreatedThread(threadId: string): void {
  unmirroredThreadIds.delete(threadId);
}

export function isMainCreatedThreadUnmirrored(threadId: string): boolean {
  return unmirroredThreadIds.has(threadId);
}

/** A renderer snapshot arrived: every thread it carries is renderer-owned now. */
export function acknowledgeMirroredThreadIds(threadIds: Iterable<string>): void {
  for (const threadId of threadIds) unmirroredThreadIds.delete(threadId);
}

/** Tied to the open database — a new database starts with no pending rows. */
export function resetMainCreatedThreads(): void {
  unmirroredThreadIds.clear();
}
