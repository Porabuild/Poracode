import {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
  type RuntimeStorageErrorClass,
} from "./runtimePersistenceTypes";

/**
 * Maps a thrown SQLite/better-sqlite3 error to the persistence failure classes.
 *
 * - `retryable`: contention the (zero) scoped busy timeout ended immediately;
 *   keep pending, yield, retry on a later macrotask with backoff.
 * - `storage`: the volume cannot accept writes right now (full/read-only/IO) or
 *   an unrecognized error reached a proven-idempotent write. Degrade and keep
 *   pending. Runtime writes are idempotent by construction (item upserts,
 *   coalesced stream appends, cumulative/sample-deduped usage, `INSERT OR
 *   IGNORE` positions), so retrying is safe; the policy is finite because the
 *   retry curve is bounded and admission closes at the hard cap rather than
 *   growing without limit. Unknown errors are never escalated to `fatal` by a
 *   magic consecutive-error count: a classification mapping bug must degrade
 *   (visible, retried, survivable) instead of permanently wedging admission.
 * - `fatal`: corruption or a not-a-database error, where retrying cannot be
 *   proven safe. Refuse admission and stay refused until the connection is
 *   reopened.
 *
 * Typed persistence errors short-circuit with their own class: the barrier or
 * gate that produced them already applied the correct state transition, and
 * re-classifying them (a typed error carries no `SQLITE_*` code) would turn a
 * recoverable degradation into a fatal wedge.
 */
export function classifyStorageError(error: unknown): RuntimeStorageErrorClass {
  if (error instanceof RuntimePersistenceContaminatedError) return "storage";
  if (error instanceof RuntimePersistenceBusyError) return "retryable";
  if (error instanceof RuntimePersistenceDegradedError) return error.errorClass;
  const code = sqliteErrorCode(error);
  if (code === undefined) return "storage";
  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return "retryable";
  if (
    code === "SQLITE_FULL" ||
    code === "SQLITE_READONLY" ||
    code === "SQLITE_CANTOPEN" ||
    code.startsWith("SQLITE_IOERR")
  ) {
    return "storage";
  }
  if (code === "SQLITE_CORRUPT" || code === "SQLITE_NOTADB") return "fatal";
  return "storage";
}

/**
 * Finds a SQLite error code on the error or anywhere in its `cause` chain.
 * The cause walk matters because a barrier wraps the original write error
 * before the controller classifies it.
 */
function sqliteErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined && current !== null; depth += 1) {
    if (typeof current === "object") {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && code.startsWith("SQLITE_")) return code;
      current = (current as { cause?: unknown }).cause;
    } else {
      return undefined;
    }
  }
  return undefined;
}
