import type Database from "better-sqlite3";

/**
 * Keep seed selection, canonical head blocks and tails on one SQLite snapshot.
 * The callback is synchronous; no snapshot is held across a fence/HTTP await.
 */
export function readRuntimeSnapshot<T>(sqlite: InstanceType<typeof Database>, read: () => T): T {
  return sqlite.inTransaction ? read() : sqlite.transaction(read)();
}
