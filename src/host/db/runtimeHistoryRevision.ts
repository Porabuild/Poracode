import { getSqlite } from "./connection";

/** Process-local rebase revision. Connection ownership releases closed databases. */
const revisions = new WeakMap<object, Map<string, number>>();
export function runtimeHistoryRevision(threadId: string): number {
  return revisions.get(getSqlite())?.get(threadId) ?? 0;
}
export function noteRuntimeHistoryMutation(threadId: string): void {
  const connection = getSqlite();
  let current = revisions.get(connection);
  if (!current) {
    current = new Map();
    revisions.set(connection, current);
  }
  current.set(threadId, (current.get(threadId) ?? 0) + 1);
}
