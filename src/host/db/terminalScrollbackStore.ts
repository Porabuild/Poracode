import type Database from "better-sqlite3";
import {
  knownTerminalColumns,
  MAX_TERMINAL_COLUMN_CHANGES,
  TerminalColumnHistory,
  type TerminalColumnChange,
} from "@/shared/terminalColumnHistory";

export const MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS = 200_000;
/** Matches schema 52's CHECK constraint. Never rewrite more than one small tail. */
export const TERMINAL_SCROLLBACK_CHUNK_CHARS = 8192;
type SqliteDatabase = InstanceType<typeof Database>;
interface ScrollbackRow {
  transcript: string;
  output_length: number;
  chunked: number;
  stored_chars: number;
  next_seq: number;
  column_changes: string | null;
}
interface ChunkRow {
  seq: number;
  chars: number;
  data: Buffer;
}

/**
 * Read the bounded `{toCursor, changes}` geometry blob written by schema 80.
 * Metadata is trusted only when it still describes this row's exact output
 * cursor and every marker has a valid absolute UTF-16 cursor and column count;
 * anything else is discarded as unknown geometry without touching raw reads.
 */
function readColumnChanges(
  value: string | null | undefined,
  outputLength: number,
): TerminalColumnChange[] {
  if (!value) return [];
  let stored: unknown;
  try {
    stored = JSON.parse(value);
  } catch {
    return [];
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return [];
  const { toCursor, changes } = stored as { toCursor?: unknown; changes?: unknown };
  if (toCursor !== outputLength || !Array.isArray(changes)) return [];
  if (changes.length > MAX_TERMINAL_COLUMN_CHANGES) return [];
  const result: TerminalColumnChange[] = [];
  let previousCursor = -1;
  for (const entry of changes) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const { fromCursor, columns } = entry as { fromCursor?: unknown; columns?: unknown };
    if (
      typeof fromCursor !== "number" ||
      !Number.isSafeInteger(fromCursor) ||
      fromCursor < 0 ||
      fromCursor > outputLength ||
      fromCursor < previousCursor
    ) {
      return [];
    }
    if (
      columns !== null &&
      (typeof columns !== "number" || knownTerminalColumns(columns) === null)
    ) {
      return [];
    }
    previousCursor = fromCursor;
    result.push({ fromCursor, columns: columns as number | null });
  }
  return result;
}

/**
 * Supplied spans are absolute UTF-16 cursors. Malformed entries degrade to
 * "unknown width" (or are dropped) rather than failing the raw append; the
 * list is sorted and capped so `recordChanges` always sees append-only,
 * bounded input.
 */
function sanitizeColumnChanges(
  changes: readonly TerminalColumnChange[] | undefined,
): TerminalColumnChange[] {
  if (!changes?.length) return [];
  const result: TerminalColumnChange[] = [];
  for (const entry of changes as readonly unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const fromCursor = (entry as { fromCursor?: unknown }).fromCursor;
    if (typeof fromCursor !== "number" || !Number.isSafeInteger(fromCursor) || fromCursor < 0) {
      continue;
    }
    result.push({
      fromCursor,
      columns: knownTerminalColumns((entry as { columns?: unknown }).columns as number | undefined),
    });
  }
  result.sort((a, b) => a.fromCursor - b.fromCursor);
  return result.slice(-MAX_TERMINAL_COLUMN_CHANGES);
}

function createStore(sqlite: SqliteDatabase) {
  const read =
    sqlite.prepare(`SELECT transcript, output_length, chunked, stored_chars, next_seq, column_changes
    FROM thread_terminal_scrollback WHERE thread_id = ?`);
  const threadExists = sqlite.prepare("SELECT 1 FROM threads WHERE id = ?");
  const create = sqlite.prepare(`INSERT INTO thread_terminal_scrollback
    (thread_id, transcript, output_length, chunked, stored_chars, next_seq) VALUES (?, '', 0, 1, 0, 0)`);
  const write = sqlite.prepare(`UPDATE thread_terminal_scrollback SET transcript = '',
    output_length = ?, chunked = 1, stored_chars = ?, next_seq = ?, column_changes = ? WHERE thread_id = ?`);
  const clearChunks = sqlite.prepare(
    "DELETE FROM thread_terminal_scrollback_chunks WHERE thread_id = ?",
  );
  const chunks = sqlite.prepare(`SELECT data FROM thread_terminal_scrollback_chunks
    WHERE thread_id = ? ORDER BY seq`);
  const tail = sqlite.prepare(`SELECT seq, chars, data FROM thread_terminal_scrollback_chunks
    WHERE thread_id = ? ORDER BY seq DESC LIMIT 1`);
  const insert = sqlite.prepare(`INSERT INTO thread_terminal_scrollback_chunks
    (thread_id, seq, chars, data) VALUES (?, ?, ?, ?)`);
  const updateTail =
    sqlite.prepare(`UPDATE thread_terminal_scrollback_chunks SET chars = ?, data = ?
    WHERE thread_id = ? AND seq = ?`);
  const oldest = sqlite.prepare(`SELECT seq, chars FROM thread_terminal_scrollback_chunks
    WHERE thread_id = ? ORDER BY seq`);
  const prune = sqlite.prepare(
    "DELETE FROM thread_terminal_scrollback_chunks WHERE thread_id = ? AND seq <= ?",
  );

  function appendOutput(
    threadId: string,
    data: string,
    outputLength: number,
    incomingColumns: TerminalColumnChange[] = [],
  ): void {
    const previous = read.get(threadId) as ScrollbackRow | undefined;
    if (!previous && !threadExists.get(threadId)) return;
    if (!previous) create.run(threadId);
    const contiguous = previous?.output_length === outputLength - data.length;
    let storedChars = contiguous && previous?.chunked ? previous.stored_chars : 0;
    let nextSeq = contiguous && previous?.chunked ? previous.next_seq : 0;
    let incoming = data;
    if (
      !contiguous ||
      !previous?.chunked ||
      data.length >= MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS
    ) {
      clearChunks.run(threadId);
      storedChars = 0;
      nextSeq = 0;
      incoming = (
        (contiguous && previous && !previous.chunked ? previous.transcript : "") + data
      ).slice(-MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS);
    }

    // UTF-16LE blobs preserve exact JS code units, including a surrogate pair
    // split across provider batches or storage chunks. Text bindings would
    // replace isolated surrogate halves and corrupt reconstructed cursor text.
    let offset = 0;
    const last = tail.get(threadId) as ChunkRow | undefined;
    if (last && last.chars < TERMINAL_SCROLLBACK_CHUNK_CHARS) {
      const addition = incoming.slice(0, TERMINAL_SCROLLBACK_CHUNK_CHARS - last.chars);
      const text = last.data.toString("utf16le") + addition;
      updateTail.run(text.length, Buffer.from(text, "utf16le"), threadId, last.seq);
      storedChars += addition.length;
      offset += addition.length;
    }
    for (; offset < incoming.length; offset += TERMINAL_SCROLLBACK_CHUNK_CHARS) {
      const text = incoming.slice(offset, offset + TERMINAL_SCROLLBACK_CHUNK_CHARS);
      insert.run(threadId, nextSeq++, text.length, Buffer.from(text, "utf16le"));
      storedChars += text.length;
    }

    // Keep the chunk containing the exact retention boundary. Reads slice its
    // prefix, avoiding a front-chunk rewrite on every append. Extra storage is
    // strictly less than one chunk; tail coalescing also bounds the row count
    // when an agent emits only one character per flush.
    let pruneThrough: number | undefined;
    if (storedChars > MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS) {
      const candidates = oldest.all(threadId) as { seq: number; chars: number }[];
      for (const candidate of candidates) {
        if (storedChars - candidate.chars < MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS) break;
        storedChars -= candidate.chars;
        pruneThrough = candidate.seq;
      }
    }
    if (pruneThrough !== undefined) prune.run(threadId, pruneThrough);

    // Column geometry is derived, never authoritative: merge the still-valid
    // stored window (only when this append continues it) with the supplied
    // spans, then clip the snapshot to the same retention the raw read serves.
    // recordChanges stores only known-width spans, so unknown gaps never
    // consume the bounded span budget. A reset, discontinuity, or unusable
    // cursor range leaves geometry empty while raw chunks stay byte-identical.
    let storedGeometry: string | null = null;
    const inputFrom = outputLength - data.length;
    if (
      Number.isSafeInteger(outputLength) &&
      outputLength >= 0 &&
      Number.isSafeInteger(inputFrom) &&
      inputFrom >= 0 &&
      inputFrom <= outputLength
    ) {
      const previousChanges =
        contiguous && previous ? readColumnChanges(previous.column_changes, inputFrom) : [];
      const incomingChanges = sanitizeColumnChanges(incomingColumns);
      if (previousChanges.length > 0 || incomingChanges.length > 0) {
        const geometry = new TerminalColumnHistory();
        if (previous && previousChanges.length > 0) {
          const previousUnits = previous.chunked
            ? previous.stored_chars
            : previous.transcript.length;
          geometry.recordChanges(
            Math.max(0, inputFrom - previousUnits),
            inputFrom,
            previousChanges,
          );
        }
        geometry.recordChanges(inputFrom, outputLength, incomingChanges);
        const retainedFrom = Math.max(
          0,
          outputLength - Math.min(storedChars, MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS),
        );
        if (retainedFrom <= outputLength) {
          const changes = geometry.snapshot(retainedFrom, outputLength);
          storedGeometry = changes.some((change) => change.columns !== null)
            ? JSON.stringify({ toCursor: outputLength, changes })
            : null;
        }
      }
    }
    write.run(outputLength, storedChars, nextSeq, storedGeometry, threadId);
  }

  const append = sqlite.transaction(appendOutput);

  return {
    append: (
      threadId: string,
      data: string,
      outputLength: number,
      columns?: TerminalColumnChange[],
    ) => append.immediate(threadId, data, outputLength, columns),
    read: (threadId: string) => {
      const row = read.get(threadId) as ScrollbackRow | undefined;
      if (!row) return null;
      const transcript = row.chunked
        ? (chunks.all(threadId) as { data: Buffer }[])
            .map((chunk) => chunk.data.toString("utf16le"))
            .join("")
            .slice(-MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS)
        : row.transcript;
      const columnChanges = readColumnChanges(row.column_changes, row.output_length);
      return {
        transcript,
        outputLength: row.output_length,
        ...(columnChanges.length ? { columnChanges } : {}),
      };
    },
  };
}

// Statement/transaction caches are connection-scoped, not transcript caches.
// Closed connections can be collected without retaining process-lifetime state.
const stores = new WeakMap<SqliteDatabase, ReturnType<typeof createStore>>();
export function terminalScrollbackStore(sqlite: SqliteDatabase) {
  let store = stores.get(sqlite);
  if (!store) {
    store = createStore(sqlite);
    stores.set(sqlite, store);
  }
  return store;
}
