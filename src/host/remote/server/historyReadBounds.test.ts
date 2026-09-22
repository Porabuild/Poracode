import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CATALOG_READS_CAPABILITY,
  HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES,
  serializedDecodeByteLength,
  serializedWireByteLength,
} from "@/shared/remote/historyReadContract";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import {
  dbMeasureHistoryStreamHeadEscaped,
  dbReadThreadHistoryPagePhase1,
  dbReadThreadHistoryPhase2,
} from "@/host/db/historyReads";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  dbReplaceThreadCompletedTurns,
  dbReplaceThreadRuntimeItems,
  type PersistedRuntimeItem,
} from "@/host/db/runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import {
  HistoryItemTooLargeError,
  buildBoundedCompletedTurnPage,
  buildBoundedThreadHistoryItems,
  parseHistoryReadNegotiation,
} from "./historyRead";

/**
 * B4 history bound semantics: a conservative upper bound above a cap is not
 * proof and never refuses; a pre-fetch refusal is reserved for a row that
 * cannot fit the HOST caps and is proven by a sound lower bound (exact escaped
 * verbatim fields + stream tail, plus the SQL-side exact streams head). JSON
 * payloads are resolved by the exact phase-2 measurement. SQL-select evidence
 * pins that a refused row is not materialized.
 */

function item(index: number, overrides: Record<string, unknown> = {}): PersistedRuntimeItem {
  return {
    id: `item-${String(index).padStart(3, "0")}`,
    type: "assistant_message",
    state: "completed",
    streams: {},
    ...overrides,
  } as PersistedRuntimeItem;
}

function negotiation(query = "") {
  return parseHistoryReadNegotiation(
    new URL(
      `http://host/api/threads/thread-1/history/items?reads=${CATALOG_READS_CAPABILITY}${query}`,
    ),
  );
}

function captureSql<T>(run: () => T): { readonly sql: string[]; readonly result: T } {
  const sqlite = getSqlite();
  const original = sqlite.prepare.bind(sqlite);
  const sql: string[] = [];
  (sqlite as unknown as { prepare: (statement: string) => unknown }).prepare = (
    statement: string,
  ) => {
    sql.push(statement);
    return original(statement);
  };
  try {
    return { sql, result: run() };
  } finally {
    (sqlite as unknown as { prepare: typeof original }).prepare = original;
  }
}

async function captureSqlAsync(run: () => Promise<void>): Promise<string[]> {
  const sqlite = getSqlite();
  const original = sqlite.prepare.bind(sqlite);
  const sql: string[] = [];
  (sqlite as unknown as { prepare: (statement: string) => unknown }).prepare = (
    statement: string,
  ) => {
    sql.push(statement);
    return original(statement);
  };
  try {
    await run();
  } finally {
    (sqlite as unknown as { prepare: typeof original }).prepare = original;
  }
  return sql;
}

const phase2PayloadSelect = /SELECT item_id, type, state, payload, streams/u;

describe.skipIf(!sqliteAvailable)("history page bound semantics", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-history-bounds-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("keeps the 4,000,000-character Unicode stream inside the host caps (parent repro)", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "long-stream",
        type: "command_execution",
        state: "completed",
        streams: { command_output: "界".repeat(4_000_000) },
      },
    ]);
    const body = await buildBoundedThreadHistoryItems(
      { threadId: "thread-1", limit: 500 },
      negotiation().caps,
    );
    const parsed = JSON.parse(body) as { items: { id: string }[] };
    expect(parsed.items.map((entry) => entry.id)).toEqual(["long-stream"]);
    expect(serializedWireByteLength(body)).toBeLessThanOrEqual(32 * 1024 * 1024);
    expect(serializedDecodeByteLength(body)).toBeLessThanOrEqual(64 * 1024 * 1024);
  }, 60_000);

  it("refuses a control-character tail proven oversized before the payload fetch, with SQL evidence", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [item(0), item(1)]);
    const sqlite = getSqlite();
    const insertChunk = sqlite.prepare(
      `INSERT INTO thread_runtime_item_stream_chunks (thread_id, item_id, stream, seq, chars, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    sqlite.transaction(() => {
      for (let seq = 0; seq < 6; seq += 1) {
        const text = "\u0001".repeat(1_000_000);
        insertChunk.run("thread-1", "item-001", "assistant_text", seq, text.length, text);
      }
    })();

    let failure: unknown;
    const sql = await captureSqlAsync(async () => {
      try {
        await buildBoundedThreadHistoryItems(
          { threadId: "thread-1", limit: 500 },
          negotiation().caps,
        );
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toBeInstanceOf(HistoryItemTooLargeError);
    const readItem = (failure as HistoryItemTooLargeError).body.readItem;
    expect(readItem).toMatchObject({
      resource: "runtime_item",
      id: "item-001",
      measurement: "serialized-upper-bound",
    });
    // 6 chunks × 1M controls escape to 36 MB: the tail's exact escaped bytes
    // alone prove the row oversized. The lower bound is reported and never
    // exceeds the conservative upper bound.
    expect(readItem.lowerBoundWireBytes).toBeGreaterThan(32 * 1024 * 1024);
    expect(readItem.lowerBoundWireBytes).toBeLessThanOrEqual(readItem.wireBytes!);
    expect(sql.some((statement) => phase2PayloadSelect.test(statement))).toBe(false);
    expect(
      sql
        .filter((statement) => statement.includes("item_id IN ("))
        .every((statement) => statement.includes("SUM(length(CAST(text AS BLOB)))")),
    ).toBe(true);
  }, 60_000);

  it("measures a hostile streams head exactly inside SQLite and refuses before fetching payload text", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [item(0), item(1)]);
    // Bypass the append-time retention layout: 6M control characters in the
    // item's `streams` head alone. `json_quote` in SQL proves 36 MB escaped.
    getSqlite()
      .prepare("UPDATE thread_runtime_items SET streams = ? WHERE thread_id = ? AND item_id = ?")
      .run(JSON.stringify({ assistant_text: "\u0001".repeat(6_000_000) }), "thread-1", "item-001");

    let failure: unknown;
    const sql = await captureSqlAsync(async () => {
      try {
        await buildBoundedThreadHistoryItems(
          { threadId: "thread-1", limit: 500 },
          negotiation().caps,
        );
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toBeInstanceOf(HistoryItemTooLargeError);
    const readItem = (failure as HistoryItemTooLargeError).body.readItem;
    expect(readItem).toMatchObject({ id: "item-001", measurement: "serialized-upper-bound" });
    expect(readItem.lowerBoundWireBytes).toBeGreaterThan(32 * 1024 * 1024);
    expect(sql.some((statement) => phase2PayloadSelect.test(statement))).toBe(false);
    // The head was measured with `json_each`/`json_quote` sums inside SQLite;
    // no head or payload text was selected into JS.
    expect(sql.some((statement) => statement.includes("json_each"))).toBe(true);
  }, 60_000);

  it("accepts a large JSON payload under the host caps and refuses it exactly under a tiny client cap", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      item(0, { payload: { blob: "q".repeat(2 * 1024 * 1024) } }),
    ]);
    const accepted = await buildBoundedThreadHistoryItems(
      { threadId: "thread-1", limit: 500 },
      negotiation().caps,
    );
    expect(serializedWireByteLength(accepted)).toBeGreaterThan(HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES);

    let failure: unknown;
    const sql = await captureSqlAsync(async () => {
      try {
        await buildBoundedThreadHistoryItems(
          { threadId: "thread-1", limit: 500 },
          negotiation("&maxBytes=1048576").caps,
        );
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toBeInstanceOf(HistoryItemTooLargeError);
    const readItem = (failure as HistoryItemTooLargeError).body.readItem;
    expect(readItem).toMatchObject({ measurement: "serialized-exact" });
    expect(readItem.lowerBoundWireBytes).toBeUndefined();
    // A payload has no sound lower bound (projection only shrinks it), so the
    // row is fetched and measured exactly.
    expect(sql.some((statement) => phase2PayloadSelect.test(statement))).toBe(true);
  }, 60_000);

  it("resolves a hostile turn anchor by exact measurement, not by an estimate", () => {
    dbReplaceThreadCompletedTurns("thread-1", [
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:30.000Z",
        anchorItemId: `界${"x".repeat(3 * 1024 * 1024)}`,
      },
    ]);
    let failure: unknown;
    const { sql } = captureSql(() => {
      try {
        buildBoundedCompletedTurnPage({
          threadId: "thread-1",
          limit: 100,
          caps: negotiation("&maxBytes=1048576").caps,
        });
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toBeInstanceOf(HistoryItemTooLargeError);
    const readItem = (failure as HistoryItemTooLargeError).body.readItem;
    expect(readItem).toMatchObject({ resource: "turn", measurement: "serialized-exact" });
    expect(readItem.lowerBoundWireBytes).toBeUndefined();
    expect(sql.some((statement) => statement.includes("FROM thread_completed_turns"))).toBe(true);
  });

  it("excludes line-trimmed elided streams from the lower bound and serves them exactly", async () => {
    // 5M characters through the append path: the retained tail is trimmed to
    // TAIL_CHARS, so the assembled value goes through `joinWithElision`, which
    // can drop partial lines. The tail/head sizes are then not a sound lower
    // bound, and the row must be resolved by exact measurement.
    await dbReplaceThreadRuntimeItems("thread-1", [
      item(0, { streams: { assistant_text: "x".repeat(5_000_000) } }),
    ]);
    const phase1 = dbReadThreadHistoryPagePhase1("thread-1", { limit: 10 });
    const row = phase1.rows[0]!;
    expect(row.streamsElided).toBe(true);
    expect(row.lowerBoundWireBytes).toBeLessThan(1024);
    expect(row.boundStreamWireBytes).toBeGreaterThan(20 * 1024 * 1024);
    const [materialized] = dbReadThreadHistoryPhase2("thread-1", [row.itemId]);
    expect(row.lowerBoundWireBytes).toBeLessThanOrEqual(
      serializedWireByteLength(JSON.stringify(materialized)),
    );

    const body = await buildBoundedThreadHistoryItems(
      { threadId: "thread-1", limit: 500 },
      negotiation().caps,
    );
    expect(serializedWireByteLength(body)).toBeLessThanOrEqual(32 * 1024 * 1024);
    expect((JSON.parse(body) as { items: unknown[] }).items).toHaveLength(1);
  }, 60_000);

  it("does not use the tail or head as proof for an adversarial elided row", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [item(0), item(1)]);
    const sqlite = getSqlite();
    const insertChunk = sqlite.prepare(
      `INSERT INTO thread_runtime_item_stream_chunks (thread_id, item_id, stream, seq, chars, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    sqlite.transaction(() => {
      for (let seq = 0; seq < 6; seq += 1) {
        const text = "\u0001".repeat(1_000_000);
        insertChunk.run("thread-1", "item-001", "assistant_text", seq, text.length, text);
      }
      // A state row claiming elision: the assembled value is line-trimmed, so
      // the 36 MB tail cannot prove oversize and the row is measured exactly.
      sqlite
        .prepare(
          `INSERT INTO thread_runtime_item_stream_state
             (thread_id, item_id, stream, next_seq, tail_chars, elided_chars)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("thread-1", "item-001", "assistant_text", 6, 6_000_000, 1_000_000);
    })();

    let failure: unknown;
    const sql = await captureSqlAsync(async () => {
      try {
        await buildBoundedThreadHistoryItems(
          { threadId: "thread-1", limit: 500 },
          negotiation().caps,
        );
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toBeInstanceOf(HistoryItemTooLargeError);
    const readItem = (failure as HistoryItemTooLargeError).body.readItem;
    expect(readItem).toMatchObject({ id: "item-001", measurement: "serialized-exact" });
    expect(readItem.lowerBoundWireBytes).toBeUndefined();
    expect(sql.some((statement) => phase2PayloadSelect.test(statement))).toBe(true);
  }, 60_000);

  it("never reports a lower bound above the actual serialized item", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      item(0, { streams: { assistant_text: "界".repeat(300_000) } }),
      item(1, {
        id: "tail-item",
        streams: { command_output: "😀".repeat(100_000), reasoning_text: "thinking" },
      }),
      item(2, { id: "tool", type: "tool_call", payload: { name: "read_file" } }),
      item(3, { id: "reasoning", type: "reasoning", streams: { reasoning_text: "why" } }),
      item(4, { id: "controls", streams: { assistant_text: "\t\n\u0001".repeat(200_000) } }),
    ]);
    const phase1 = dbReadThreadHistoryPagePhase1("thread-1", { limit: 100 });
    const materialized = dbReadThreadHistoryPhase2(
      "thread-1",
      phase1.rows.map((row) => row.itemId),
    );
    for (const row of phase1.rows) {
      const actual = materialized.find((candidate) => candidate.id === row.itemId)!;
      const actualWire = serializedWireByteLength(JSON.stringify(actual));
      const actualDecode = serializedDecodeByteLength(JSON.stringify(actual));
      expect(row.lowerBoundWireBytes).toBeLessThanOrEqual(actualWire);
      expect(row.lowerBoundDecodeBytes).toBeLessThanOrEqual(actualDecode);
      expect(row.boundWireBytes).toBeGreaterThanOrEqual(actualWire);
      // Adding the exact SQL-side head measurement stays a lower bound — but
      // only for rows whose streams are not line-trimmed by elision.
      const head = row.streamsElided
        ? { wireBytes: 0, decodeBytes: 0 }
        : dbMeasureHistoryStreamHeadEscaped("thread-1", row.itemId);
      expect(row.lowerBoundWireBytes + head.wireBytes).toBeLessThanOrEqual(actualWire);
      expect(row.lowerBoundDecodeBytes + head.decodeBytes).toBeLessThanOrEqual(actualDecode);
    }
  });
});
