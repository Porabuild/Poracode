import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEAD_CHARS } from "./runtimeStreamCap";
import { encodeRuntimeStreamKey } from "./runtimeStreamHeadCodec";
import {
  measureRuntimeStreamHeadStorage,
  readRuntimeStreamHeadMetadata,
  readRuntimeStreamHeads,
} from "./runtimeStreamHeadRead";
import { RUNTIME_STREAM_HEAD_BLOCK_CHARS as BLOCK } from "./runtimeStreamHeadSchema";
import { peekRuntimeStreamHead } from "./runtimeStreamHeadStore";
import {
  createHeadFixture,
  fixtureAppend,
  fixtureHeads,
  HEAD_ITEM,
  HEAD_THREAD,
  openHeadDatabase,
  seedHeadItem,
  sqliteAvailable,
} from "./runtimeStreamHeadStore.testFixtures";

describe.skipIf(!sqliteAvailable)("stream head read projections", () => {
  let sqlite: InstanceType<typeof Database>;
  beforeEach(() => {
    sqlite = openHeadDatabase();
    createHeadFixture(sqlite);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sqlite.close();
  });

  it.each([
    null,
    "",
    "{broken",
    "null",
    "[]",
    "3",
    '"literal"',
    '{"text":23}',
    '{"text":"legacy"}',
  ])("preserves legacy metadata-absent parse shape %j", (streams) => {
    seedHeadItem(sqlite, streams);
    let expected: unknown = {};
    if (streams) {
      try {
        expected = JSON.parse(streams);
      } catch {
        expected = undefined;
      }
    }
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual(expected);
  });

  it("assembles only requested items and batches scalar/head_id lookups", () => {
    for (let index = 0; index < 405; index++) {
      const id = `item-${index}`;
      seedHeadItem(sqlite, JSON.stringify({ text: `seed-${index}` }), id);
      fixtureAppend(sqlite, "text", "\ud83d\ude00", id);
    }
    seedHeadItem(sqlite, "{}", "unselected");
    fixtureAppend(sqlite, "text", "x".repeat(HEAD_CHARS), "unselected");
    const executions: Array<{ sql: string; args: unknown[] }> = [];
    const original = sqlite.prepare.bind(sqlite);
    vi.spyOn(sqlite, "prepare").mockImplementation((sql) => {
      const statement = original(sql);
      if (sql.includes("FROM thread_runtime_item_stream_head")) {
        const all = statement.all.bind(statement);
        vi.spyOn(statement, "all").mockImplementation((...args) => {
          executions.push({ sql, args });
          return all(...args);
        });
      }
      return statement;
    });
    const ids = Array.from({ length: 405 }, (_, index) => `item-${404 - index}`);
    const result = fixtureHeads(sqlite, [...ids, ids[0]!, "missing"]);
    expect([...result.keys()]).toEqual(ids);
    for (let index = 0; index < 405; index++)
      expect(result.get(`item-${index}`)).toEqual({ text: `seed-${index}😀` });
    expect(
      executions.filter((execution) => execution.sql.includes("SELECT head_id, seq")),
    ).toHaveLength(2);
    expect(executions.filter((execution) => execution.sql.includes("stream_order"))).toHaveLength(
      2,
    );
    expect(executions.some((execution) => execution.args.includes("unselected"))).toBe(false);
    expect(executions.every((execution) => execution.args.length <= 401)).toBe(true);
  });

  it("projects scalar/key costs without selecting JSON seeds or BLOB payloads", () => {
    const stream = `stream-${"k".repeat(32_000)}`;
    const seed = JSON.stringify({ [stream]: "old\ud800" });
    seedHeadItem(sqlite, seed);
    fixtureAppend(sqlite, stream, "\udc00" + "x".repeat(BLOCK * 2));
    const executed: string[] = [];
    const original = sqlite.prepare.bind(sqlite);
    vi.spyOn(sqlite, "prepare").mockImplementation((sql) => {
      const statement = original(sql);
      const all = statement.all.bind(statement);
      vi.spyOn(statement, "all").mockImplementation((...args) => {
        executed.push(sql);
        return all(...args);
      });
      return statement;
    });
    const metadata = readRuntimeStreamHeadMetadata(sqlite, HEAD_THREAD, [HEAD_ITEM]);
    const costs = measureRuntimeStreamHeadStorage(sqlite, HEAD_THREAD, [HEAD_ITEM]).get(HEAD_ITEM)!;
    expect(metadata.get(HEAD_ITEM)).toHaveLength(1);
    expect(costs).toEqual({
      metadataKeyBytes: Buffer.byteLength(
        HEAD_THREAD + HEAD_ITEM + encodeRuntimeStreamKey(stream),
        "utf8",
      ),
      blockBytes: (BLOCK * 2 + 1) * 2,
      streamCount: 1,
      blockCount: 3,
      headChars: 4 + BLOCK * 2 + 1,
      headWireBytes: Buffer.byteLength(JSON.stringify("old😀" + "x".repeat(BLOCK * 2)), "utf8") - 2,
      headJsonUnits: JSON.stringify("old😀" + "x".repeat(BLOCK * 2)).length - 2,
    });
    expect(executed).toHaveLength(2);
    expect(
      executed.every(
        (sql) => !sql.includes("thread_runtime_items") && !sql.includes("SELECT data"),
      ),
    ).toBe(true);
    expect(
      Object.values(metadata.get(HEAD_ITEM)![0]!).some((value) => Buffer.isBuffer(value)),
    ).toBe(false);
    expect(
      sqlite
        .prepare("PRAGMA table_info(thread_runtime_item_stream_head_blocks)")
        .all()
        .map((column) => (column as { name: string }).name),
    ).toEqual(["head_id", "seq", "chars", "data"]);
  });

  it("performs no query for empty row/ID selections", () => {
    const spy = vi.spyOn(sqlite, "prepare");
    expect(readRuntimeStreamHeads(sqlite, HEAD_THREAD, []).size).toBe(0);
    expect(readRuntimeStreamHeadMetadata(sqlite, HEAD_THREAD, []).size).toBe(0);
    expect(measureRuntimeStreamHeadStorage(sqlite, HEAD_THREAD, []).size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails on missing blocks, sequence gaps, wrong lengths and last-unit corruption", () => {
    seedHeadItem(sqlite);
    fixtureAppend(sqlite, "text", "a".repeat(BLOCK) + "z");
    const head = peekRuntimeStreamHead(sqlite, {
      threadId: HEAD_THREAD,
      itemId: HEAD_ITEM,
      stream: "text",
    })!;
    for (const corrupt of [
      () => sqlite.prepare("DELETE FROM thread_runtime_item_stream_head_blocks WHERE seq=0").run(),
      () =>
        sqlite
          .prepare("UPDATE thread_runtime_item_stream_head_blocks SET chars=2,data=? WHERE seq=1")
          .run(Buffer.from("zz", "utf16le")),
      () =>
        sqlite
          .prepare("UPDATE thread_runtime_item_stream_heads SET head_last_unit=120 WHERE head_id=?")
          .run(head.head_id),
    ]) {
      expect(() =>
        sqlite
          .transaction(() => {
            corrupt();
            fixtureHeads(sqlite);
          })
          .immediate(),
      ).toThrow("Invalid runtime stream head");
      expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "a".repeat(BLOCK) + "z" });
    }
  });

  it("detects incomplete legacy seed indexes and noncanonical key aliases", () => {
    seedHeadItem(sqlite, JSON.stringify({ text: "seed", sibling: "kept" }));
    fixtureAppend(sqlite, "text", "more");
    expect(() =>
      sqlite
        .transaction(() => {
          sqlite
            .prepare("DELETE FROM thread_runtime_item_stream_heads WHERE stream_key=?")
            .run(encodeRuntimeStreamKey("sibling"));
          fixtureHeads(sqlite);
        })
        .immediate(),
    ).toThrow("Incomplete runtime stream head seed index");
    expect(() =>
      sqlite
        .transaction(() => {
          sqlite
            .prepare("UPDATE thread_runtime_item_stream_heads SET stream_key=? WHERE stream_key=?")
            .run('"\\u0074ext"', encodeRuntimeStreamKey("text"));
          fixtureHeads(sqlite);
        })
        .immediate(),
    ).toThrow("Invalid runtime stream head key");
  });
});
