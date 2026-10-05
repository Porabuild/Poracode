import Database from "better-sqlite3";
import { HEAD_CHARS } from "./runtimeStreamCap";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import { createRuntimeStreamHeadSchema } from "./runtimeStreamHeadSchema";
import { readRuntimeStreamHeads } from "./runtimeStreamHeadRead";
import { appendRuntimeStreamHead, prepareRuntimeStreamHead } from "./runtimeStreamHeadStore";

export { sqliteAvailable };
export const HEAD_THREAD = "head-thread";
export const HEAD_ITEM = "head-item";

export function openHeadDatabase(
  path = ":memory:",
  readonly = false,
): InstanceType<typeof Database> {
  return new Database(path, {
    ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    ...(readonly ? { readonly: true } : {}),
  });
}

export function createHeadFixture(sqlite: InstanceType<typeof Database>): void {
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE thread_runtime_items (
      thread_id TEXT NOT NULL, item_id TEXT NOT NULL, state TEXT NOT NULL,
      payload TEXT, streams TEXT, PRIMARY KEY(thread_id, item_id)
    );
    CREATE TABLE thread_runtime_item_stream_chunks (
      thread_id TEXT NOT NULL, item_id TEXT NOT NULL, stream TEXT NOT NULL,
      seq INTEGER NOT NULL, chars INTEGER NOT NULL, text TEXT NOT NULL,
      PRIMARY KEY(thread_id, item_id, stream, seq),
      FOREIGN KEY(thread_id,item_id) REFERENCES thread_runtime_items(thread_id,item_id) ON DELETE CASCADE
    );
    CREATE TABLE thread_runtime_item_stream_state (
      thread_id TEXT NOT NULL, item_id TEXT NOT NULL, stream TEXT NOT NULL,
      next_seq INTEGER NOT NULL, tail_chars INTEGER NOT NULL, elided_chars INTEGER NOT NULL,
      PRIMARY KEY(thread_id,item_id,stream),
      FOREIGN KEY(thread_id,item_id) REFERENCES thread_runtime_items(thread_id,item_id) ON DELETE CASCADE
    );
  `);
  createRuntimeStreamHeadSchema(sqlite);
}

export function seedHeadItem(
  sqlite: InstanceType<typeof Database>,
  streams: string | null = "{}",
  itemId = HEAD_ITEM,
  state = "started",
): void {
  sqlite
    .prepare("INSERT INTO thread_runtime_items VALUES (?, ?, ?, NULL, ?)")
    .run(HEAD_THREAD, itemId, state, streams);
}

export function fixtureHeads(
  sqlite: InstanceType<typeof Database>,
  itemIds: readonly string[] = [HEAD_ITEM],
): Map<string, unknown> {
  return sqlite.transaction(() => {
    const row = sqlite.prepare(
      "SELECT item_id,streams FROM thread_runtime_items WHERE thread_id=? AND item_id=?",
    );
    const rows = itemIds.flatMap((itemId) => {
      const found = row.get(HEAD_THREAD, itemId) as
        | { item_id: string; streams: string | null }
        | undefined;
      return found ? [found] : [];
    });
    return readRuntimeStreamHeads(sqlite, HEAD_THREAD, rows);
  })();
}

export function fixtureAppend(
  sqlite: InstanceType<typeof Database>,
  stream: string,
  delta: string,
  itemId = HEAD_ITEM,
): { head: number; remainder: string } {
  return sqlite
    .transaction(() => {
      const prepared = prepareRuntimeStreamHead(sqlite, {
        threadId: HEAD_THREAD,
        itemId,
        stream,
        createStream: delta.length > 0,
      });
      if (prepared.kind !== "ready" || !prepared.head)
        throw new Error("Fixture needs a ready head.");
      const appended = appendRuntimeStreamHead(sqlite, prepared.head.head_id, delta);
      return { head: appended.head.head_chars, remainder: appended.remainder };
    })
    .immediate();
}

/** Frozen v52 acceptance oracle, independent of the new metadata/codec helpers. */
export function releasedHeadAppend(
  previous: string,
  delta: string,
): { head: string; remainder: string } {
  if (delta.length === 0 || previous.length >= HEAD_CHARS)
    return { head: previous, remainder: delta };
  const room = HEAD_CHARS - previous.length;
  let end = room;
  if (
    end > 0 &&
    end < delta.length &&
    delta.charCodeAt(end - 1) >= 0xd800 &&
    delta.charCodeAt(end - 1) <= 0xdbff &&
    delta.charCodeAt(end) >= 0xdc00 &&
    delta.charCodeAt(end) <= 0xdfff
  )
    end -= 1;
  const acceptedEnd = end < Math.min(delta.length, room) ? end + 2 : end;
  return { head: previous + delta.slice(0, acceptedEnd), remainder: delta.slice(acceptedEnd) };
}
