import { getSqlite } from "./connection";

export const MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS = 200_000;

interface TerminalScrollbackRow {
  transcript: string;
  output_length: number;
}

export function dbGetThreadTerminalScrollback(threadId: string): string {
  const row = getSqlite()
    .prepare("SELECT transcript FROM thread_terminal_scrollback WHERE thread_id = ?")
    .get(threadId) as Pick<TerminalScrollbackRow, "transcript"> | undefined;
  return row?.transcript ?? "";
}

/**
 * Appends one coalesced supervisor output batch. `outputLength` is the
 * supervisor's absolute JS string offset, so an offset mismatch means a new
 * terminal generation and replaces stale scrollback instead of joining two
 * unrelated PTY sessions.
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
