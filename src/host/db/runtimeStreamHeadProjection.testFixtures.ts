import type Database from "better-sqlite3";
import { vi } from "vitest";
import {
  appendRuntimeStreamHead,
  prepareRuntimeStreamHead,
  resetRuntimeStreamHead,
} from "./runtimeStreamHeadStore";

type SqliteDatabase = InstanceType<typeof Database>;
export const PROJECTION_THREAD = "thread-1";

export function insertProjectionItem(
  sqlite: SqliteDatabase,
  input: {
    id: string;
    position: number;
    type?: string;
    state?: string;
    seed?: string;
    payload?: string;
  },
): void {
  sqlite
    .prepare(`INSERT INTO thread_runtime_items
    (thread_id,item_id,position,type,state,payload,streams,parent_item_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`)
    .run(
      PROJECTION_THREAD,
      input.id,
      input.position,
      input.type ?? "assistant_message",
      input.state ?? "updated",
      input.payload ?? null,
      input.seed ?? "{}",
    );
}

export function appendProjectionHead(
  sqlite: SqliteDatabase,
  itemId: string,
  stream: string,
  text: string,
): void {
  const write = () => {
    const prepared = prepareRuntimeStreamHead(sqlite, {
      threadId: PROJECTION_THREAD,
      itemId,
      stream,
    });
    if (prepared.kind !== "ready" || !prepared.head)
      throw new Error("Expected indexed fixture head.");
    const result = appendRuntimeStreamHead(sqlite, prepared.head.head_id, text);
    if (result.remainder) throw new Error("Fixture append exceeded retained head.");
  };
  if (sqlite.inTransaction) write();
  else sqlite.transaction(write).immediate();
}

export function replaceProjectionHead(
  sqlite: SqliteDatabase,
  itemId: string,
  stream: string,
  text: string,
): void {
  sqlite
    .transaction(() => {
      const prepared = prepareRuntimeStreamHead(sqlite, {
        threadId: PROJECTION_THREAD,
        itemId,
        stream,
      });
      if (prepared.kind !== "ready" || !prepared.head)
        throw new Error("Expected indexed fixture head.");
      resetRuntimeStreamHead(sqlite, prepared.head.head_id);
      appendRuntimeStreamHead(sqlite, prepared.head.head_id, text);
    })
    .immediate();
}

export function setProjectionTail(
  sqlite: SqliteDatabase,
  itemId: string,
  stream: string,
  text: string,
  elided = 0,
): void {
  sqlite
    .prepare(`INSERT INTO thread_runtime_item_stream_chunks
    (thread_id,item_id,stream,seq,chars,text) VALUES (?, ?, ?, 0, ?, ?)`)
    .run(PROJECTION_THREAD, itemId, stream, text.length, text);
  sqlite
    .prepare(`INSERT INTO thread_runtime_item_stream_state
    (thread_id,item_id,stream,next_seq,tail_chars,elided_chars) VALUES (?, ?, ?, 1, ?, ?)`)
    .run(PROJECTION_THREAD, itemId, stream, text.length, elided);
}

export interface ProjectionRead {
  readonly sql: string;
  readonly rows: readonly Record<string, unknown>[];
}

/** Records actual returned projections, not merely a SQL substring. */
export function captureProjectionReads<T>(
  sqlite: SqliteDatabase,
  run: () => T,
): {
  result: T;
  reads: ProjectionRead[];
} {
  const reads: ProjectionRead[] = [];
  const prepare = sqlite.prepare.bind(sqlite);
  const spy = vi.spyOn(sqlite, "prepare").mockImplementation((sql: string) => {
    const statement = prepare(sql);
    const get = statement.get.bind(statement);
    const all = statement.all.bind(statement);
    vi.spyOn(statement, "get").mockImplementation((...args: unknown[]) => {
      const row = get(...args) as Record<string, unknown> | undefined;
      reads.push({ sql, rows: row ? [row] : [] });
      return row;
    });
    vi.spyOn(statement, "all").mockImplementation((...args: unknown[]) => {
      const rows = all(...args) as Array<Record<string, unknown>>;
      reads.push({ sql, rows });
      return rows;
    });
    return statement;
  });
  try {
    return { result: run(), reads };
  } finally {
    spy.mockRestore();
  }
}
