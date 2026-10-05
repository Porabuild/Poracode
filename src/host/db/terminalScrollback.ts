import { getSqlite } from "./connection";
import { withRuntimeBusyTimeout } from "./runtimeBusyTimeout";
import { terminalScrollbackStore } from "./terminalScrollbackStore";
export { MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS } from "./terminalScrollbackStore";

export function dbGetThreadTerminalScrollback(threadId: string): string {
  return dbGetThreadTerminalScrollbackRecord(threadId)?.transcript ?? "";
}

/**
 * Transcript plus absolute **JS string code-unit** output length for
 * cursor-sync snapshots (UTF-16 units = `String.length`, not code points).
 * Returns null when no row exists (distinct from empty transcript).
 */
export function dbGetThreadTerminalScrollbackRecord(
  threadId: string,
): { transcript: string; outputLength: number } | null {
  return terminalScrollbackStore(getSqlite()).read(threadId);
}

/**
 * Appends one coalesced supervisor output batch. `outputLength` is the
 * supervisor's absolute JS code-unit offset, so an offset mismatch means a new
 * terminal generation and **replaces** stale scrollback instead of joining two
 * unrelated PTY sessions (restart / generation change).
 */
export function dbAppendThreadTerminalOutput(
  threadId: string,
  data: string,
  outputLength: number,
): void {
  if (!data) return;
  withRuntimeBusyTimeout(() =>
    terminalScrollbackStore(getSqlite()).append(threadId, data, outputLength),
  );
}

export function dbClearThreadTerminalScrollback(threadId: string): void {
  getSqlite().prepare("DELETE FROM thread_terminal_scrollback WHERE thread_id = ?").run(threadId);
}
