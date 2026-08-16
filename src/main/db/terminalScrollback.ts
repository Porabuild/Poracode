import { getSqlite } from "./connection";

export const MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS = 200_000;

interface TerminalScrollbackRow {
  transcript: string;
  output_length: number;
}

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
  const row = getSqlite()
    .prepare("SELECT transcript, output_length FROM thread_terminal_scrollback WHERE thread_id = ?")
    .get(threadId) as TerminalScrollbackRow | undefined;
  if (!row) return null;
  return { transcript: row.transcript, outputLength: row.output_length };
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
  const sqlite = getSqlite();
  const previous = sqlite
    .prepare("SELECT transcript, output_length FROM thread_terminal_scrollback WHERE thread_id = ?")
    .get(threadId) as TerminalScrollbackRow | undefined;
  const transcript = (
    previous?.output_length === outputLength - data.length ? previous.transcript + data : data
  ).slice(-MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS);
  sqlite
    .prepare(
      `INSERT INTO thread_terminal_scrollback (thread_id, transcript, output_length)
       SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM threads WHERE id = ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         transcript = excluded.transcript,
         output_length = excluded.output_length`,
    )
    .run(threadId, transcript, outputLength, threadId);
}

export function dbClearThreadTerminalScrollback(threadId: string): void {
  getSqlite().prepare("DELETE FROM thread_terminal_scrollback WHERE thread_id = ?").run(threadId);
}
