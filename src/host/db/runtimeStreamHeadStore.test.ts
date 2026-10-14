import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEAD_CHARS } from "./runtimeStreamCap";
import { encodeRuntimeStreamKey } from "./runtimeStreamHeadCodec";
import { RUNTIME_STREAM_HEAD_BLOCK_CHARS as BLOCK } from "./runtimeStreamHeadSchema";
import {
  appendRuntimeStreamHead,
  isRuntimeStreamHeadIndexed,
  peekRuntimeStreamHead,
  prepareRuntimeStreamHead,
  resetRuntimeStreamHead,
} from "./runtimeStreamHeadStore";
import {
  createHeadFixture,
  fixtureAppend,
  fixtureHeads,
  HEAD_ITEM,
  HEAD_THREAD,
  openHeadDatabase,
  releasedHeadAppend,
  seedHeadItem,
  sqliteAvailable,
} from "./runtimeStreamHeadStore.testFixtures";

const key = (stream = "text", itemId = HEAD_ITEM) => ({ threadId: HEAD_THREAD, itemId, stream });

describe.skipIf(!sqliteAvailable)("bounded canonical stream head store", () => {
  let sqlite: InstanceType<typeof Database>;
  beforeEach(() => {
    sqlite = openHeadDatabase();
    createHeadFixture(sqlite);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sqlite.close();
  });

  it("requires caller transaction ownership and ignores missing items", () => {
    expect(() => prepareRuntimeStreamHead(sqlite, key())).toThrow("owned transaction");
    expect(() => appendRuntimeStreamHead(sqlite, 1, "x")).toThrow("owned transaction");
    expect(() => resetRuntimeStreamHead(sqlite, 1)).toThrow("owned transaction");
    expect(sqlite.transaction(() => prepareRuntimeStreamHead(sqlite, key())).immediate()).toEqual({
      kind: "missing",
    });
    expect(isRuntimeStreamHeadIndexed(sqlite, HEAD_THREAD, HEAD_ITEM)).toBe(false);
  });

  it("indexes every seed once and selects no seed JSON on later prefixes/new streams", () => {
    const seed = JSON.stringify({ first: "seed\ud83d", empty: "", other: "kept" });
    seedHeadItem(sqlite, seed, HEAD_ITEM, "completed");
    const returnedSeeds: Array<string | null> = [];
    const original = sqlite.prepare.bind(sqlite);
    vi.spyOn(sqlite, "prepare").mockImplementation((sql) => {
      const statement = original(sql);
      if (sql.includes("CASE WHEN h.head_id IS NULL")) {
        const get = statement.get.bind(statement);
        vi.spyOn(statement, "get").mockImplementation((...args) => {
          const row = get(...args) as { streams: string | null } | undefined;
          if (row) returnedSeeds.push(row.streams);
          return row;
        });
      }
      return statement;
    });
    const prepare = (stream: string) =>
      sqlite.transaction(() => prepareRuntimeStreamHead(sqlite, key(stream))).immediate();
    expect(prepare("first")).toMatchObject({
      kind: "ready",
      state: "completed",
      head: { seed_chars: 5, head_chars: 5 },
    });
    expect(prepare("new")).toMatchObject({
      kind: "ready",
      head: { seed_chars: 0, stream_order: 3 },
    });
    expect(prepare("other")).toMatchObject({ kind: "ready", head: { stream_order: 2 } });
    expect(returnedSeeds).toEqual([seed, null, null]);
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({
      first: "seed\ud83d",
      empty: "",
      other: "kept",
      new: "",
    });
    expect(sqlite.prepare("SELECT streams,state FROM thread_runtime_items").get()).toEqual({
      streams: seed,
      state: "completed",
    });
  });

  it("keeps empty deltas absent and explicit empty replacements present", () => {
    seedHeadItem(sqlite);
    const prepared = sqlite
      .transaction(() => prepareRuntimeStreamHead(sqlite, { ...key(), createStream: false }))
      .immediate();
    expect(prepared).toEqual({ kind: "ready", state: "started", head: undefined });
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({});
    sqlite
      .transaction(() => {
        const ready = prepareRuntimeStreamHead(sqlite, key());
        if (ready.kind !== "ready" || !ready.head) throw new Error("not ready");
        resetRuntimeStreamHead(sqlite, ready.head.head_id);
        expect(appendRuntimeStreamHead(sqlite, ready.head.head_id, "").remainder).toBe("");
      })
      .immediate();
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "" });
  });

  it.each([
    0,
    1,
    BLOCK - 1,
    BLOCK,
    BLOCK + 1,
    HEAD_CHARS - 2,
    HEAD_CHARS - 1,
    HEAD_CHARS,
    HEAD_CHARS + 1,
  ])("matches frozen v52 head acceptance from seed length %i", (seedLength) => {
    let expected = "p".repeat(seedLength);
    seedHeadItem(sqlite, JSON.stringify({ text: expected, sibling: "stable" }));
    const deltas = ["", "\ud83d", "\ude00", "A\ud800B\udc00", '\n"\\\u0001', "😀end"];
    for (const delta of deltas) {
      const oracle = releasedHeadAppend(expected, delta);
      const result = fixtureAppend(sqlite, "text", delta);
      expected = oracle.head;
      expect(result).toEqual({ head: expected.length, remainder: oracle.remainder });
      expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: expected, sibling: "stable" });
      const head = peekRuntimeStreamHead(sqlite, key())!;
      const quoted = JSON.stringify(expected);
      expect(head).toMatchObject({
        seed_chars: seedLength,
        head_chars: expected.length,
        head_wire_bytes: Buffer.byteLength(quoted, "utf8") - 2,
        head_json_units: quoted.length - 2,
        head_has_content: expected.trim() ? 1 : 0,
        head_last_unit: expected.length ? expected.charCodeAt(expected.length - 1) : -1,
      });
    }
  });

  it("keeps complete cap-crossing pairs and exact split units when tails are discarded", () => {
    seedHeadItem(sqlite);
    fixtureAppend(sqlite, "text", "a".repeat(HEAD_CHARS - 1));
    const before = fixtureHeads(sqlite).get(HEAD_ITEM) as Record<string, string>;
    const oracle = releasedHeadAppend(before.text!, "😀tail");
    const appended = fixtureAppend(sqlite, "text", "😀tail");
    expect(appended).toEqual({ head: HEAD_CHARS + 1, remainder: "tail" });
    // A zero-tail consumer deliberately discards remainder. Heads have independent rows.
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: oracle.head });
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM thread_runtime_item_stream_chunks").get(),
    ).toEqual({ n: 0 });
    expect(peekRuntimeStreamHead(sqlite, key())).toMatchObject({ open_seq: null, open_chars: 0 });
  });

  it("preserves pairs/lone units across seed, delta and 8192-unit storage boundaries", () => {
    const seed = "seed\ud83d";
    seedHeadItem(sqlite, JSON.stringify({ text: seed }));
    let expected = seed;
    for (const delta of [
      "\ude00",
      "x".repeat(BLOCK - 2),
      "\ud800",
      "\udc00",
      "\ud800",
      "z\udc00",
    ]) {
      expected += delta;
      fixtureAppend(sqlite, "text", delta);
    }
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: expected });
    expect(peekRuntimeStreamHead(sqlite, key())).toMatchObject({
      head_wire_bytes: Buffer.byteLength(JSON.stringify(expected), "utf8") - 2,
      head_json_units: JSON.stringify(expected).length - 2,
    });
  });

  it("coalesces one-unit fragments and bounds block rows at the whole-head cap", () => {
    seedHeadItem(sqlite);
    sqlite
      .transaction(() => {
        const prepared = prepareRuntimeStreamHead(sqlite, key());
        if (prepared.kind !== "ready" || !prepared.head) throw new Error("not ready");
        const headId = prepared.head.head_id;
        for (let unit = 0; unit < BLOCK * 2 + 1; unit++) {
          const result = appendRuntimeStreamHead(sqlite, headId, "x");
          expect(result.head.next_seq).toBe(Math.ceil((unit + 1) / BLOCK));
        }
        expect(
          appendRuntimeStreamHead(sqlite, headId, "x".repeat(HEAD_CHARS)).remainder,
        ).toHaveLength(BLOCK * 2 + 1);
      })
      .immediate();
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n, MAX(chars) AS max, SUM(chars) AS chars FROM thread_runtime_item_stream_head_blocks",
        )
        .get(),
    ).toEqual({ n: Math.ceil(HEAD_CHARS / BLOCK), max: BLOCK, chars: HEAD_CHARS });
    expect(peekRuntimeStreamHead(sqlite, key())).toMatchObject({
      next_seq: 32,
      head_chars: HEAD_CHARS,
      open_seq: null,
    });
  });

  it("never reads or rewrites a closed block or item JSON on a warm append", () => {
    seedHeadItem(sqlite);
    const reads: Array<{ seq: number; bytes: number }> = [];
    const writes: number[] = [];
    const original = sqlite.prepare.bind(sqlite);
    vi.spyOn(sqlite, "prepare").mockImplementation((sql) => {
      const statement = original(sql);
      if (sql.includes("SELECT chars, data")) {
        const get = statement.get.bind(statement);
        vi.spyOn(statement, "get").mockImplementation((...args) => {
          const result = get(...args) as { data: Buffer };
          reads.push({ seq: Number(args[1]), bytes: result.data.length });
          return result;
        });
      }
      if (sql.includes("SET chars = ?, data = ?")) {
        const run = statement.run.bind(statement);
        vi.spyOn(statement, "run").mockImplementation((...args) => {
          writes.push((args[1] as Buffer).length);
          return run(...args);
        });
      }
      return statement;
    });
    fixtureAppend(sqlite, "text", "x".repeat(BLOCK) + "y");
    sqlite.exec(`
      CREATE TRIGGER reject_closed_write BEFORE UPDATE ON thread_runtime_item_stream_head_blocks
        WHEN OLD.seq = 0 BEGIN SELECT RAISE(ABORT,'closed rewrite'); END;
      CREATE TRIGGER reject_item_json BEFORE UPDATE OF streams,payload ON thread_runtime_items
        BEGIN SELECT RAISE(ABORT,'JSON rewrite'); END;
    `);
    const { head_id: headId } = peekRuntimeStreamHead(sqlite, key())!;
    sqlite
      .transaction(() => {
        for (let index = 0; index < 200; index++) appendRuntimeStreamHead(sqlite, headId, "z");
      })
      .immediate();
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({
      text: "x".repeat(BLOCK) + "y" + "z".repeat(200),
    });
    expect(reads).toHaveLength(200);
    expect(writes).toHaveLength(200);
    expect(reads.every((read) => read.seq === 1 && read.bytes < BLOCK * 2)).toBe(true);
    expect(writes.every((bytes) => bytes <= BLOCK * 2)).toBe(true);
  });

  it("suppresses a replaced seed, preserves siblings/order and leaves tails to the caller", () => {
    const seed = JSON.stringify({ text: "obsolete", sibling: "kept" });
    seedHeadItem(sqlite, seed);
    fixtureAppend(sqlite, "text", " appended");
    fixtureAppend(sqlite, "sibling", " blocks");
    sqlite
      .prepare("INSERT INTO thread_runtime_item_stream_chunks VALUES (?,?,?,?,?,?)")
      .run(HEAD_THREAD, HEAD_ITEM, "text", 0, 4, "tail");
    sqlite
      .prepare("INSERT INTO thread_runtime_item_stream_state VALUES (?,?,?,?,?,?)")
      .run(HEAD_THREAD, HEAD_ITEM, "text", 1, 4, 2);
    const head = peekRuntimeStreamHead(sqlite, key())!;
    sqlite.transaction(() => resetRuntimeStreamHead(sqlite, head.head_id)).immediate();
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "", sibling: "kept blocks" });
    expect(sqlite.prepare("SELECT streams FROM thread_runtime_items").get()).toEqual({
      streams: seed,
    });
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM thread_runtime_item_stream_chunks").get(),
    ).toEqual({ n: 1 });
    expect(peekRuntimeStreamHead(sqlite, key())).toMatchObject({
      seed_chars: 0,
      stream_order: 0,
      head_chars: 0,
      next_seq: 0,
    });
    fixtureAppend(sqlite, "text", "new");
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "new", sibling: "kept blocks" });
  });

  it.each([
    "{broken",
    "null",
    "[]",
    "3",
    '"literal"',
    '{"text":23}',
    '{"text":"ok","other":23}',
    '{"constructor":"owned"}',
  ])("preserves exceptional raw seed %j as legacy", (streams) => {
    seedHeadItem(sqlite, streams);
    expect(sqlite.transaction(() => prepareRuntimeStreamHead(sqlite, key())).immediate()).toEqual({
      kind: "legacy",
      state: "started",
      streams,
      indexed: false,
    });
    expect(isRuntimeStreamHeadIndexed(sqlite, HEAD_THREAD, HEAD_ITEM)).toBe(false);
  });

  it("materializes complete sibling heads for an indexed legacy-key fallback", () => {
    seedHeadItem(sqlite, JSON.stringify({ text: "seed", sibling: "kept" }));
    fixtureAppend(sqlite, "text", " grows");
    fixtureAppend(sqlite, "sibling", " also");
    const prepared = sqlite
      .transaction(() => prepareRuntimeStreamHead(sqlite, key("constructor")))
      .immediate();
    expect(prepared).toEqual({
      kind: "legacy",
      state: "started",
      streams: JSON.stringify({ text: "seed grows", sibling: "kept also" }),
      indexed: true,
    });
    if (prepared.kind !== "legacy") throw new Error("not legacy");
    sqlite.prepare("UPDATE thread_runtime_items SET streams=?").run(prepared.streams);
    expect(isRuntimeStreamHeadIndexed(sqlite, HEAD_THREAD, HEAD_ITEM)).toBe(false);
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({
      text: "seed grows",
      sibling: "kept also",
    });
  });

  it("preserves exact stream-key code units and JS property order", () => {
    seedHeadItem(sqlite, JSON.stringify({ z: "seed", "2": "number", a: "last" }));
    for (const stream of ["z", "\ud800", "�", "1", "new"])
      fixtureAppend(sqlite, stream, "😀\udc00");
    const heads = fixtureHeads(sqlite).get(HEAD_ITEM) as Record<string, string>;
    expect(Object.keys(heads)).toEqual(["1", "2", "z", "a", "\ud800", "�", "new"]);
    expect(heads["\ud800"]).toBe("😀\udc00");
    expect(peekRuntimeStreamHead(sqlite, key("\ud800"))?.stream_key).toBe(
      encodeRuntimeStreamKey("\ud800"),
    );
    expect(peekRuntimeStreamHead(sqlite, key("\ud800"))?.head_id).not.toBe(
      peekRuntimeStreamHead(sqlite, key("�"))?.head_id,
    );
  });
});
