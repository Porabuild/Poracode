import type Database from "better-sqlite3";
import { HEAD_CHARS, joinWithElision, TAIL_CHARS, utf16SafeSliceEnd } from "./runtimeStreamCap";

type SqliteDatabase = InstanceType<typeof Database>;

/**
 * Append-only storage for a runtime item's streamed content.
 *
 * A `content.delta` used to rewrite the item's whole `streams` JSON blob, so the
 * cost of one chunk grew with everything the item had already produced: a
 * long-running command reached hundreds of milliseconds per chunk, synchronously,
 * on the main process. Here an append is a small INSERT plus a small UPDATE, so
 * it costs the same whether the item has produced a kilobyte or a gigabyte.
 *
 * Layout per (item, stream):
 *   - the head lives in `thread_runtime_items.streams` and freezes once it
 *     reaches {@link HEAD_CHARS} — after that, streaming never rewrites the
 *     item row again;
 *   - everything past the head is a row in `thread_runtime_item_stream_chunks`;
 *   - `thread_runtime_item_stream_state` carries the next sequence number, the
 *     retained character count and how much has been dropped, so the append
 *     path needs no aggregate query;
 *   - trimming the retained window deletes the oldest chunk rows, which costs
 *     the same no matter how much the item has produced.
 *
 * Reads reassemble `head + elision marker + tail`, so callers still see one
 * string per stream and nothing outside this module knows about chunking.
 */

/**
 * Largest chunk row written. A provider that delivers a whole command result as
 * one delta would otherwise create a single unbounded row, which both defeats
 * the retention window (whole rows are the unit of trimming) and puts a huge
 * value back on the write path.
 */
const CHUNK_MAX_CHARS = 256_000;

/** Oldest chunks inspected per trim pass. */
const TRIM_SCAN_LIMIT = 64;

/** Item ids per tail lookup; SQLite caps how many parameters one statement takes. */
const TAIL_QUERY_BATCH = 400;

interface StreamStateRow {
  next_seq: number;
  tail_chars: number;
  elided_chars: number;
}

export interface AppendStreamDeltaInput {
  readonly threadId: string;
  readonly itemId: string;
  readonly stream: string;
  readonly delta: string;
  /** The item's current head text for this stream, as stored on the item row. */
  readonly head: string;
}

export interface AppendStreamDeltaResult {
  /** New head text when the head grew, or `undefined` when it is already frozen. */
  readonly head?: string;
}

function readStreamState(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
  stream: string,
): StreamStateRow {
  const row = sqlite
    .prepare(
      `SELECT next_seq, tail_chars, elided_chars FROM thread_runtime_item_stream_state
       WHERE thread_id = ? AND item_id = ? AND stream = ?`,
    )
    .get(threadId, itemId, stream) as StreamStateRow | undefined;
  return row ?? { next_seq: 0, tail_chars: 0, elided_chars: 0 };
}

function writeStreamState(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
  stream: string,
  state: StreamStateRow,
): void {
  sqlite
    .prepare(
      `INSERT INTO thread_runtime_item_stream_state
         (thread_id, item_id, stream, next_seq, tail_chars, elided_chars)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(thread_id, item_id, stream) DO UPDATE SET
         next_seq = excluded.next_seq,
         tail_chars = excluded.tail_chars,
         elided_chars = excluded.elided_chars`,
    )
    .run(threadId, itemId, stream, state.next_seq, state.tail_chars, state.elided_chars);
}

/**
 * Append one delta. Returns the item-row fields that changed so the caller can
 * fold them into the UPDATE it already performs — usually nothing, because the
 * head is frozen and the tail lives in its own rows.
 */
export function appendStreamDelta(
  sqlite: SqliteDatabase,
  input: AppendStreamDeltaInput,
): AppendStreamDeltaResult {
  const { threadId, itemId, stream, delta, head } = input;
  if (delta.length === 0) return {};

  // Fill the head first; it freezes at HEAD_CHARS and is never rewritten after.
  let nextHead: string | undefined;
  let remainder = delta;
  if (head.length < HEAD_CHARS) {
    const room = HEAD_CHARS - head.length;
    const safeEnd = utf16SafeSliceEnd(delta, room);
    const headEnd = safeEnd < Math.min(delta.length, room) ? safeEnd + 2 : safeEnd;
    nextHead = head + delta.slice(0, headEnd);
    remainder = delta.slice(headEnd);
    if (remainder.length === 0) return { head: nextHead };
  }

  const state = readStreamState(sqlite, threadId, itemId, stream);
  const insert = sqlite.prepare(
    `INSERT INTO thread_runtime_item_stream_chunks (thread_id, item_id, stream, seq, chars, text)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  let nextSeq = state.next_seq;
  let tailChars = state.tail_chars;
  for (let offset = 0; offset < remainder.length;) {
    const end = utf16SafeSliceEnd(remainder, Math.min(remainder.length, offset + CHUNK_MAX_CHARS));
    const text = remainder.slice(offset, end);
    insert.run(threadId, itemId, stream, nextSeq, text.length, text);
    nextSeq += 1;
    tailChars += text.length;
    offset = end;
  }
  const newestSeq = nextSeq - 1;

  let elidedChars = state.elided_chars;
  if (tailChars > TAIL_CHARS) {
    // Over budget: drop whole chunks from the oldest end. `chars` is declared
    // before `text` so this reads record headers, not chunk contents.
    const oldest = sqlite.prepare(
      `SELECT seq, chars FROM thread_runtime_item_stream_chunks
       WHERE thread_id = ? AND item_id = ? AND stream = ?
       ORDER BY seq ASC LIMIT ${TRIM_SCAN_LIMIT}`,
    );
    const remove = sqlite.prepare(
      `DELETE FROM thread_runtime_item_stream_chunks
       WHERE thread_id = ? AND item_id = ? AND stream = ? AND seq = ?`,
    );
    while (tailChars > TAIL_CHARS) {
      const candidates = oldest.all(threadId, itemId, stream) as Array<{
        seq: number;
        chars: number;
      }>;
      let removedAny = false;
      for (const candidate of candidates) {
        if (tailChars <= TAIL_CHARS) break;
        // Never drop the newest chunk: it is what just arrived.
        if (candidate.seq >= newestSeq) break;
        remove.run(threadId, itemId, stream, candidate.seq);
        tailChars -= Number(candidate.chars);
        elidedChars += Number(candidate.chars);
        removedAny = true;
      }
      if (!removedAny) break;
    }
  }

  writeStreamState(sqlite, threadId, itemId, stream, {
    next_seq: nextSeq,
    tail_chars: tailChars,
    elided_chars: elidedChars,
  });
  return nextHead === undefined ? {} : { head: nextHead };
}

/** Remove every appended tail in a thread. */
export function clearThreadStreamChunks(sqlite: SqliteDatabase, threadId: string): void {
  sqlite.prepare("DELETE FROM thread_runtime_item_stream_chunks WHERE thread_id = ?").run(threadId);
  sqlite.prepare("DELETE FROM thread_runtime_item_stream_state WHERE thread_id = ?").run(threadId);
}

/** Store complete stream values in the same head/chunk layout used by live deltas. */
export function writeItemStreams(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
  streams: Record<string, string>,
): void {
  const heads: Record<string, string> = {};
  for (const [stream, text] of Object.entries(streams)) {
    if (typeof text !== "string") continue;
    const result = appendStreamDelta(sqlite, { threadId, itemId, stream, delta: text, head: "" });
    heads[stream] = result.head ?? "";
  }
  sqlite
    .prepare("UPDATE thread_runtime_items SET streams = ? WHERE thread_id = ? AND item_id = ?")
    .run(JSON.stringify(heads), threadId, itemId);
}

/** A stream's appended tail text and how much of it has been dropped. */
export interface ItemStreamTails {
  text: Record<string, string>;
  elided: Record<string, number>;
}

/**
 * Load the appended tails for a set of items, concatenated in sequence order.
 * Items with nothing appended are absent from the result.
 */
export function readStreamTails(
  sqlite: SqliteDatabase,
  threadId: string,
  itemIds: readonly string[],
): Map<string, ItemStreamTails> {
  const byItem = new Map<string, ItemStreamTails>();
  const textParts = new Map<string, Record<string, string[]>>();
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return byItem;
  const entryFor = (itemId: string): ItemStreamTails => {
    const existing = byItem.get(itemId);
    if (existing) return existing;
    const created: ItemStreamTails = { text: {}, elided: {} };
    byItem.set(itemId, created);
    return created;
  };

  // Restricted to the requested items: a transcript can hold several megabytes
  // of retained tail, and a page must not pay for items it is not returning.
  for (let start = 0; start < ids.length; start += TAIL_QUERY_BATCH) {
    const batch = ids.slice(start, start + TAIL_QUERY_BATCH);
    const marks = batch.map(() => "?").join(", ");
    const stateRows = sqlite
      .prepare(
        `SELECT item_id, stream, elided_chars FROM thread_runtime_item_stream_state
         WHERE thread_id = ? AND elided_chars > 0 AND item_id IN (${marks})`,
      )
      .all(threadId, ...batch) as Array<{
      item_id: string;
      stream: string;
      elided_chars: number;
    }>;
    for (const row of stateRows) {
      entryFor(row.item_id).elided[row.stream] = Number(row.elided_chars);
    }

    const chunkRows = sqlite
      .prepare(
        `SELECT item_id, stream, text FROM thread_runtime_item_stream_chunks
         WHERE thread_id = ? AND item_id IN (${marks})
         ORDER BY item_id ASC, stream ASC, seq ASC`,
      )
      .all(threadId, ...batch) as Array<{ item_id: string; stream: string; text: string }>;
    for (const row of chunkRows) {
      entryFor(row.item_id);
      let itemParts = textParts.get(row.item_id);
      if (!itemParts) {
        itemParts = {};
        textParts.set(row.item_id, itemParts);
      }
      (itemParts[row.stream] ??= []).push(row.text);
    }
  }
  for (const [itemId, streams] of textParts) {
    const target = byItem.get(itemId)!.text;
    for (const [stream, parts] of Object.entries(streams)) target[stream] = parts.join("");
  }
  return byItem;
}

/**
 * Rebuild one item's streams from its stored head and its appended tail.
 * Returns the head object itself when there is nothing to add.
 */
export function assembleItemStreams(
  head: Record<string, string>,
  tails: ItemStreamTails | undefined,
): Record<string, string> {
  if (!tails) return head;
  const assembled: Record<string, string> = { ...head };
  const streams = new Set([
    ...Object.keys(assembled),
    ...Object.keys(tails.text),
    ...Object.keys(tails.elided),
  ]);
  for (const stream of streams) {
    const headText = assembled[stream] ?? "";
    const elidedChars = tails.elided[stream] ?? 0;
    const tailText = tails.text[stream] ?? "";
    assembled[stream] = joinWithElision(headText, tailText, elidedChars);
  }
  return assembled;
}

/** Whether a stream holds any non-whitespace content, without assembling it. */
export function streamHasContent(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
  stream: string,
  head: string | undefined,
): boolean {
  if ((head ?? "").trim().length > 0) return true;
  const rows = sqlite
    .prepare(
      `SELECT text FROM thread_runtime_item_stream_chunks
       WHERE thread_id = ? AND item_id = ? AND stream = ?`,
    )
    .iterate(threadId, itemId, stream) as Iterable<{ text: string }>;
  for (const row of rows) {
    if (row.text.trim().length > 0) return true;
  }
  return false;
}
