import { getSqlite } from "./connection";

/** Runtime writes yield a contended SQLite writer lock without blocking the host. */
export const RUNTIME_FLUSH_BUSY_TIMEOUT_MS = 0;

/** Always read and restore the actual connection value. Nested scopes at the
 * same timeout need no updates. PRAGMA busy_timeout executes during statement
 * preparation, so its statements cannot be cached like ordinary SQL queries. */
export function withRuntimeBusyTimeout<T>(
  operation: () => T,
  timeoutMs = RUNTIME_FLUSH_BUSY_TIMEOUT_MS,
): T {
  const sqlite = getSqlite();
  const previous = sqlite.pragma("busy_timeout", { simple: true }) as number;
  const target = Math.max(0, Math.floor(timeoutMs));
  if (previous === target) return operation();
  sqlite.pragma(`busy_timeout = ${target}`);
  try {
    return operation();
  } finally {
    // An operation may deliberately close the database. A fresh connection
    // starts with its own timeout; never restore a retired connection's value.
    if (sqlite.open) sqlite.pragma(`busy_timeout = ${previous}`);
  }
}
