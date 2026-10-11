import type Database from "better-sqlite3";
import { vi } from "vitest";

type SqliteDatabase = InstanceType<typeof Database>;
type Prepare = (sql: string) => Database.Statement;

export interface WriterStreamRead {
  kind: "item" | "metadata" | "block";
  sql: string;
  itemId: string | undefined;
  stream: string | undefined;
  seedUnits: number;
  blobBytes: number;
  headChars: number | undefined;
  inTransaction: boolean;
}

interface ReadTrace {
  sinks: WriterStreamRead[][];
  onPrepare: Array<(sql: string, prepare: Prepare) => void>;
  onRead: Array<(read: WriterStreamRead) => void>;
}

const traces = new WeakMap<SqliteDatabase, ReadTrace>();

/** Install before any store statements are cached; later observers add sinks. */
export function observePersistentWriterReads(
  sqlite: SqliteDatabase,
  onPrepare?: (sql: string, prepare: Prepare) => void,
  onRead?: (read: WriterStreamRead) => void,
): WriterStreamRead[] {
  let trace = traces.get(sqlite);
  if (!trace) {
    trace = { sinks: [], onPrepare: [], onRead: [] };
    traces.set(sqlite, trace);
    const installed = trace;
    const original = sqlite.prepare.bind(sqlite);
    vi.spyOn(sqlite, "prepare").mockImplementation((sql) => {
      for (const callback of installed.onPrepare) callback(sql, original);
      const statement = original(sql);
      const kind =
        sql.includes("FROM thread_runtime_items i") && sql.includes("AS indexed")
          ? "item"
          : sql.includes("FROM thread_runtime_item_stream_heads") &&
              !sql.includes("MAX(stream_order)")
            ? "metadata"
            : sql.includes("SELECT chars, data FROM thread_runtime_item_stream_head_blocks")
              ? "block"
              : undefined;
      if (kind) {
        const get = statement.get.bind(statement);
        vi.spyOn(statement, "get").mockImplementation((...args) => {
          const row = get(...args) as
            | {
                streams?: unknown;
                data?: unknown;
                item_id?: string;
                stream_key?: string;
                head_chars?: number;
              }
            | undefined;
          const read: WriterStreamRead = {
            kind,
            sql,
            itemId: row?.item_id ?? (kind === "item" ? String(args[1]) : undefined),
            stream: row?.stream_key ? (JSON.parse(row.stream_key) as string) : undefined,
            seedUnits: typeof row?.streams === "string" ? row.streams.length : 0,
            blobBytes: Buffer.isBuffer(row?.data) ? row.data.length : 0,
            headChars: row?.head_chars,
            inTransaction: sqlite.inTransaction,
          };
          for (const sink of installed.sinks) sink.push(read);
          for (const callback of installed.onRead) callback(read);
          return row;
        });
      }
      return statement;
    });
  }
  const reads: WriterStreamRead[] = [];
  trace.sinks.push(reads);
  if (onPrepare) trace.onPrepare.push(onPrepare);
  if (onRead) trace.onRead.push(onRead);
  return reads;
}
