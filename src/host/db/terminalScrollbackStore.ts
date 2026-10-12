import type Database from "better-sqlite3";

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
}
interface ChunkRow {
  seq: number;
  chars: number;
  data: Buffer;
}

function createStore(sqlite: SqliteDatabase) {
  const read = sqlite.prepare(`SELECT transcript, output_length, chunked, stored_chars, next_seq
    FROM thread_terminal_scrollback WHERE thread_id = ?`);
  const threadExists = sqlite.prepare("SELECT 1 FROM threads WHERE id = ?");
  const create = sqlite.prepare(`INSERT INTO thread_terminal_scrollback
    (thread_id, transcript, output_length, chunked, stored_chars, next_seq) VALUES (?, '', 0, 1, 0, 0)`);
  const write = sqlite.prepare(`UPDATE thread_terminal_scrollback SET transcript = '',
    output_length = ?, chunked = 1, stored_chars = ?, next_seq = ? WHERE thread_id = ?`);
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

  const append = sqlite.transaction((threadId: string, data: string, outputLength: number) => {
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
    write.run(outputLength, storedChars, nextSeq, threadId);
  });

  return {
    append: (threadId: string, data: string, outputLength: number) =>
      append.immediate(threadId, data, outputLength),
    read: (threadId: string) => {
      const row = read.get(threadId) as ScrollbackRow | undefined;
      if (!row) return null;
      const transcript = row.chunked
        ? (chunks.all(threadId) as { data: Buffer }[])
            .map((chunk) => chunk.data.toString("utf16le"))
            .join("")
            .slice(-MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS)
        : row.transcript;
      return { transcript, outputLength: row.output_length };
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
