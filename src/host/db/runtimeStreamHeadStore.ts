import type Database from "better-sqlite3";
import { safeParse } from "./rowMappers";
import { HEAD_CHARS, utf16SafeSliceEnd } from "./runtimeStreamCap";
import {
  appendRuntimeStreamHeadCounters,
  assertRuntimeStreamHeadBlock,
  assertRuntimeStreamHeadMetadata,
  encodeRuntimeStreamKey,
  isRuntimeStreamHeadKeyEligible,
  isRuntimeStreamHeadSeed,
  RUNTIME_STREAM_HEAD_METADATA_COLUMNS,
  runtimeStreamHeadCounters,
  type RuntimeStreamHeadMetadata,
} from "./runtimeStreamHeadCodec";
import { readRuntimeStreamHeads } from "./runtimeStreamHeadRead";
import { RUNTIME_STREAM_HEAD_BLOCK_CHARS } from "./runtimeStreamHeadSchema";

type SqliteDatabase = InstanceType<typeof Database>;

export interface RuntimeStreamHeadKey {
  readonly threadId: string;
  readonly itemId: string;
  readonly stream: string;
}

export type RuntimeStreamHeadPreparation =
  | { readonly kind: "missing" }
  | {
      readonly kind: "legacy";
      readonly state: string;
      /** Full effective heads when indexed; raw seed bytes otherwise. */
      readonly streams: string | null;
      readonly indexed: boolean;
    }
  | {
      readonly kind: "ready";
      readonly state: string;
      /** Absent only when createStream:false leaves a nonexistent stream untouched. */
      readonly head: RuntimeStreamHeadMetadata | undefined;
    };

function createStatements(sqlite: SqliteDatabase) {
  return {
    item: sqlite.prepare(`
      SELECT i.state,
             CASE WHEN h.head_id IS NULL THEN i.streams ELSE NULL END AS streams,
             CASE WHEN h.head_id IS NULL THEN 0 ELSE 1 END AS indexed
      FROM thread_runtime_items i
      LEFT JOIN thread_runtime_item_stream_heads h
        ON h.thread_id = i.thread_id AND h.item_id = i.item_id
      WHERE i.thread_id = ? AND i.item_id = ? LIMIT 1`),
    seed: sqlite.prepare(
      "SELECT item_id, streams FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
    ),
    peek: sqlite.prepare(`SELECT ${RUNTIME_STREAM_HEAD_METADATA_COLUMNS}
      FROM thread_runtime_item_stream_heads WHERE thread_id = ? AND item_id = ? AND stream_key = ?`),
    byId: sqlite.prepare(`SELECT ${RUNTIME_STREAM_HEAD_METADATA_COLUMNS}
      FROM thread_runtime_item_stream_heads WHERE head_id = ?`),
    indexed: sqlite.prepare(`SELECT 1 FROM thread_runtime_item_stream_heads
      WHERE thread_id = ? AND item_id = ? LIMIT 1`),
    nextOrder: sqlite.prepare(`SELECT COALESCE(MAX(stream_order), -1) + 1 AS ordinal
      FROM thread_runtime_item_stream_heads WHERE thread_id = ? AND item_id = ?`),
    insertHead: sqlite.prepare(`INSERT INTO thread_runtime_item_stream_heads
      (thread_id, item_id, stream_key, stream_order, seed_chars, head_chars, next_seq,
       open_seq, open_chars, head_wire_bytes, head_json_units, head_has_content, head_last_unit)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?, ?)`),
    open: sqlite.prepare(`SELECT chars, data FROM thread_runtime_item_stream_head_blocks
      WHERE head_id = ? AND seq = ?`),
    updateOpen: sqlite.prepare(`UPDATE thread_runtime_item_stream_head_blocks
      SET chars = ?, data = ? WHERE head_id = ? AND seq = ?`),
    insertBlock: sqlite.prepare(`INSERT INTO thread_runtime_item_stream_head_blocks
      (head_id, seq, chars, data) VALUES (?, ?, ?, ?)`),
    updateHead: sqlite.prepare(`UPDATE thread_runtime_item_stream_heads SET
      head_chars = ?, next_seq = ?, open_seq = ?, open_chars = ?, head_wire_bytes = ?,
      head_json_units = ?, head_has_content = ?, head_last_unit = ? WHERE head_id = ?`),
    clearBlocks: sqlite.prepare(
      "DELETE FROM thread_runtime_item_stream_head_blocks WHERE head_id = ?",
    ),
    resetHead: sqlite.prepare(`UPDATE thread_runtime_item_stream_heads SET seed_chars = 0,
      head_chars = 0, next_seq = 0, open_seq = NULL, open_chars = 0, head_wire_bytes = 0,
      head_json_units = 0, head_has_content = 0, head_last_unit = -1 WHERE head_id = ?`),
  };
}

// Prepared statements follow the handle. No metadata, seed or block cache survives a prefix.
const statementSets = new WeakMap<SqliteDatabase, ReturnType<typeof createStatements>>();
function statements(sqlite: SqliteDatabase): ReturnType<typeof createStatements> {
  let cached = statementSets.get(sqlite);
  if (!cached) {
    cached = createStatements(sqlite);
    statementSets.set(sqlite, cached);
  }
  return cached;
}

function requireTransaction(sqlite: SqliteDatabase): void {
  if (!sqlite.inTransaction) {
    throw new Error("Runtime stream head writes require an owned transaction.");
  }
}

function metadataById(sqlite: SqliteDatabase, headId: number): RuntimeStreamHeadMetadata {
  const head = statements(sqlite).byId.get(headId) as RuntimeStreamHeadMetadata | undefined;
  if (!head) throw new Error("Runtime stream head is missing.");
  assertRuntimeStreamHeadMetadata(head);
  return head;
}

/** Fresh scalar/key projection; never reads seed JSON or block payloads. */
export function peekRuntimeStreamHead(
  sqlite: SqliteDatabase,
  key: RuntimeStreamHeadKey,
): RuntimeStreamHeadMetadata | undefined {
  const head = statements(sqlite).peek.get(
    key.threadId,
    key.itemId,
    encodeRuntimeStreamKey(key.stream),
  ) as RuntimeStreamHeadMetadata | undefined;
  if (head) assertRuntimeStreamHeadMetadata(head);
  return head;
}

export function isRuntimeStreamHeadIndexed(
  sqlite: SqliteDatabase,
  threadId: string,
  itemId: string,
): boolean {
  return statements(sqlite).indexed.get(threadId, itemId) !== undefined;
}

function insertHead(
  sqlite: SqliteDatabase,
  key: RuntimeStreamHeadKey,
  ordinal: number,
  seed: string,
): void {
  const counters = runtimeStreamHeadCounters(seed);
  statements(sqlite).insertHead.run(
    key.threadId,
    key.itemId,
    encodeRuntimeStreamKey(key.stream),
    ordinal,
    seed.length,
    counters.head_chars,
    counters.head_wire_bytes,
    counters.head_json_units,
    counters.head_has_content,
    counters.head_last_unit,
  );
}

/**
 * Use inside the canonical owner's immediate transaction. Index all eligible
 * seed streams once, without rewriting their JSON. Pass createStream:false for
 * an empty non-replacement delta so it cannot invent an empty stream property.
 */
export function prepareRuntimeStreamHead(
  sqlite: SqliteDatabase,
  input: RuntimeStreamHeadKey & { readonly createStream?: boolean },
): RuntimeStreamHeadPreparation {
  requireTransaction(sqlite);
  const sql = statements(sqlite);
  const item = sql.item.get(input.threadId, input.itemId) as
    | { state: string; streams: string | null; indexed: number }
    | undefined;
  if (!item) return { kind: "missing" };
  if (!isRuntimeStreamHeadKeyEligible(input.stream)) {
    if (item.indexed === 0)
      return { kind: "legacy", state: item.state, streams: item.streams, indexed: false };
    const seed = sql.seed.get(input.threadId, input.itemId) as {
      item_id: string;
      streams: string | null;
    };
    const effective = readRuntimeStreamHeads(sqlite, input.threadId, [seed]).get(input.itemId);
    // A subsequent legacy JSON UPDATE invalidates overlays. Capture siblings first.
    return { kind: "legacy", state: item.state, streams: JSON.stringify(effective), indexed: true };
  }
  if (item.indexed === 0) {
    const seed = item.streams ? safeParse(item.streams) : {};
    if (!isRuntimeStreamHeadSeed(seed)) {
      return { kind: "legacy", state: item.state, streams: item.streams, indexed: false };
    }
    let ordinal = 0;
    for (const [stream, text] of Object.entries(seed)) {
      insertHead(sqlite, { ...input, stream }, ordinal++, text);
    }
  }
  let head = peekRuntimeStreamHead(sqlite, input);
  if (!head && input.createStream !== false) {
    const { ordinal } = sql.nextOrder.get(input.threadId, input.itemId) as { ordinal: number };
    insertHead(sqlite, input, ordinal, "");
    head = peekRuntimeStreamHead(sqlite, input)!;
  }
  return { kind: "ready", state: item.state, head };
}

export interface RuntimeStreamHeadAppendResult {
  readonly head: RuntimeStreamHeadMetadata;
  /** Caller persists this with the unchanged tail append/retention helper. */
  readonly remainder: string;
}

/**
 * Append only accepted head units. Reads/rebinds at most one open block, never a
 * closed block. Authoritative scalar state is refreshed even if the caller kept
 * an old metadata object. Tail, item state and COMMIT remain the caller's work.
 */
export function appendRuntimeStreamHead(
  sqlite: SqliteDatabase,
  headId: number,
  delta: string,
): RuntimeStreamHeadAppendResult {
  requireTransaction(sqlite);
  const head = metadataById(sqlite, headId);
  if (delta.length === 0 || head.head_chars >= HEAD_CHARS) return { head, remainder: delta };
  const room = HEAD_CHARS - head.head_chars;
  const safeEnd = utf16SafeSliceEnd(delta, room);
  const headEnd = safeEnd < Math.min(delta.length, room) ? safeEnd + 2 : safeEnd;
  const accepted = delta.slice(0, headEnd);
  const counters = appendRuntimeStreamHeadCounters(head, accepted);
  const sql = statements(sqlite);
  let nextSeq = head.next_seq;
  let openSeq = head.open_seq;
  let openChars = head.open_chars;
  let offset = 0;
  if (openSeq !== null) {
    const block = sql.open.get(headId, openSeq) as { chars: number; data: Buffer } | undefined;
    if (!block) throw new Error("Runtime stream head open block is missing.");
    assertRuntimeStreamHeadBlock(block);
    if (block.chars !== openChars)
      throw new Error("Invalid runtime stream head open block length.");
    const addition = accepted.slice(0, RUNTIME_STREAM_HEAD_BLOCK_CHARS - openChars);
    const data = Buffer.concat([block.data, Buffer.from(addition, "utf16le")]);
    openChars += addition.length;
    sql.updateOpen.run(openChars, data, headId, openSeq);
    offset = addition.length;
    if (openChars === RUNTIME_STREAM_HEAD_BLOCK_CHARS) {
      openSeq = null;
      openChars = 0;
    }
  }
  for (; offset < accepted.length; offset += RUNTIME_STREAM_HEAD_BLOCK_CHARS) {
    const text = accepted.slice(offset, offset + RUNTIME_STREAM_HEAD_BLOCK_CHARS);
    const seq = nextSeq++;
    sql.insertBlock.run(headId, seq, text.length, Buffer.from(text, "utf16le"));
    openSeq = text.length < RUNTIME_STREAM_HEAD_BLOCK_CHARS ? seq : null;
    openChars = openSeq === null ? 0 : text.length;
  }
  if (counters.head_chars >= HEAD_CHARS) {
    openSeq = null;
    openChars = 0;
  }
  const updated = {
    ...head,
    ...counters,
    next_seq: nextSeq,
    open_seq: openSeq,
    open_chars: openChars,
  };
  assertRuntimeStreamHeadMetadata(updated);
  sql.updateHead.run(
    counters.head_chars,
    nextSeq,
    openSeq,
    openChars,
    counters.head_wire_bytes,
    counters.head_json_units,
    counters.head_has_content,
    counters.head_last_unit,
    headId,
  );
  return { head: updated, remainder: delta.slice(headEnd) };
}

/** Suppress this seed and delete only its head blocks; caller separately clears tails. */
export function resetRuntimeStreamHead(
  sqlite: SqliteDatabase,
  headId: number,
): RuntimeStreamHeadMetadata {
  requireTransaction(sqlite);
  metadataById(sqlite, headId);
  const sql = statements(sqlite);
  sql.clearBlocks.run(headId);
  sql.resetHead.run(headId);
  return metadataById(sqlite, headId);
}
