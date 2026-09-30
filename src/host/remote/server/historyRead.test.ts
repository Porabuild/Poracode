import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CATALOG_HOST_DECODE_MAX_BYTES,
  CATALOG_HOST_WIRE_MAX_BYTES,
  CATALOG_READS_CAPABILITY,
  HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES,
  encodeCompletedTurnCursor,
  historyItemTooLargeBodySchema,
  serializedDecodeByteLength,
  serializedWireByteLength,
} from "@/shared/remote/historyReadContract";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  dbReplaceThreadCompletedTurns,
  dbReplaceThreadRuntimeItems,
  type PersistedCompletedTurn,
} from "@/host/db/runtimeItems";
import { RuntimePersistenceBusyError } from "@/host/db/runtimePersistenceTypes";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";
import {
  HistoryItemTooLargeError,
  boundedThreadSnapshotSchema,
  buildBoundedCompletedTurnPage,
  buildBoundedThreadHistoryItems,
  buildBoundedThreadSnapshot,
  handleBoundedThreadHistory,
  handleBoundedThreadHistoryItems,
  handleBoundedThreadTurns,
  mapHistoryPersistenceRefusal,
  parseHistoryReadNegotiation,
} from "./historyRead";
import { buildThreadRuntimeItemsPage, buildThreadSnapshot } from "./snapshots";

function turn(index: number, anchor: string | null = `item-${index}`): PersistedCompletedTurn {
  const hour = String(Math.floor(index / 60)).padStart(2, "0");
  const minute = String(index % 60).padStart(2, "0");
  return {
    startedAt: `2026-01-01T${hour}:${minute}:00.000Z`,
    endedAt: `2026-01-01T${hour}:${minute}:30.000Z`,
    anchorItemId: anchor,
  };
}

function item(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `item-${String(index).padStart(3, "0")}`,
    type: "assistant_message",
    state: "completed" as const,
    streams: {},
    ...overrides,
  };
}

function context(): RemoteServerContext {
  return {
    options: {
      callSupervisor: async (method: string) => {
        if (method === "readTerminalScrollback") return "";
        if (method === "readTerminalSize") return { cols: 80, rows: 24 };
        if (method === "readThreadBackgroundTasks") return [];
        if (method === "getThreadFollowUpQueue") return null;
        return null;
      },
    },
    backgroundTasksByThread: new Map(),
    seq: 42,
  } as unknown as RemoteServerContext;
}

function negotiation(query = "") {
  return parseHistoryReadNegotiation(
    new URL(`http://host/api/threads/thread-1/history?reads=${CATALOG_READS_CAPABILITY}${query}`),
  );
}

interface FakeResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string | number | string[] | undefined>;
}

function fakeResponse(): ServerResponse & FakeResponse {
  const state: FakeResponse = { statusCode: 200, body: "", headers: {} };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    get body() {
      return state.body;
    },
    headers: state.headers,
    setHeader(name: string, value: string | number | readonly string[]) {
      state.headers[name.toLowerCase()] = Array.isArray(value)
        ? [...value]
        : (value as string | number);
      return res;
    },
    appendHeader(name: string, value: string | readonly string[]) {
      const key = name.toLowerCase();
      const previous = state.headers[key];
      const next = Array.isArray(value) ? value : [value];
      state.headers[key] = previous === undefined ? [...next] : [previous, ...next].flat();
      return res;
    },
    end(body?: string) {
      if (body !== undefined) state.body += body;
      return res;
    },
  };
  return res as unknown as ServerResponse & FakeResponse;
}

async function invoke(handler: (call: never) => Promise<void>, url: string): Promise<FakeResponse> {
  const res = fakeResponse();
  const req = Readable.from([]) as unknown as IncomingMessage;
  (req as unknown as { headers: Record<string, string> }).headers = {};
  await handler({
    ctx: context(),
    req,
    res,
    url: new URL(url, "http://host"),
    forwardOrigin: null,
    bearerToken: null,
    session: null,
    readClass: "normal",
    params: { threadId: "thread-1" },
  } as never);
  return res;
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

describe.skipIf(!sqliteAvailable)("B4 bounded history server composition", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-b4-history-server-"));
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

  it("parses declared negotiation strictly and leaves undeclared requests alone", () => {
    const declared = negotiation("&completedTurnsLimit=17&maxBytes=4096&maxDecodeBytes=8192");
    expect(declared.declared).toBe(true);
    expect(declared.completedTurnsLimit).toBe(17);
    expect(declared.caps.maxWireBytes).toBe(4096);
    expect(declared.caps.maxDecodeBytes).toBe(8192);

    const clamped = negotiation("&maxBytes=999999999999");
    expect(clamped.caps.maxWireBytes).toBe(CATALOG_HOST_WIRE_MAX_BYTES);
    expect(clamped.caps.maxDecodeBytes).toBe(CATALOG_HOST_DECODE_MAX_BYTES);

    expect(
      parseHistoryReadNegotiation(new URL("http://host/api/threads/thread-1/history")).declared,
    ).toBe(false);

    const expectCode = (query: string, code: string) => {
      expect(() => negotiation(query)).toThrowError(expect.objectContaining({ code }) as Error);
    };
    expectCode("&completedTurnsLimit=0", "invalid_completed_turns_limit");
    expectCode("&completedTurnsLimit=501", "invalid_completed_turns_limit");
    expectCode("&maxBytes=0", "invalid_max_bytes");
    expect(() =>
      parseHistoryReadNegotiation(new URL("http://host/api/threads/thread-1/history?reads=nope")),
    ).toThrowError(expect.objectContaining({ code: "invalid_reads_capability" }) as Error);
  });

  it("returns the newest completed-turn tail with an exact ct1. cursor", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [item(0), item(1), item(2)]);
    dbReplaceThreadCompletedTurns(
      "thread-1",
      Array.from({ length: 300 }, (_, index) => turn(index, index % 3 === 0 ? null : `a-${index}`)),
    );

    const body = await buildBoundedThreadSnapshot(context(), "thread-1", negotiation());
    const parsed = boundedThreadSnapshotSchema.parse(JSON.parse(body));
    expect(parsed.reads).toBe(CATALOG_READS_CAPABILITY);
    expect(parsed.runtimeItems.map((entry) => entry.id)).toEqual([
      "item-000",
      "item-001",
      "item-002",
    ]);
    expect(parsed.runtimeNextCursor).toBeNull();
    expect(parsed.completedTurns).toHaveLength(200);
    expect(parsed.completedTurns[0]?.startedAt).toBe(turn(100).startedAt);
    expect(parsed.completedTurns.at(-1)?.startedAt).toBe(turn(299).startedAt);
    expect(parsed.completedTurnsNextCursor).toBe(encodeCompletedTurnCursor(100));
    // Anchorless turns inside the tail are preserved.
    expect(parsed.completedTurns.some((entry) => entry.anchorItemId === null)).toBe(true);
  });

  it("delegates undeclared thread-history and thread-history-items byte-for-byte", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [item(0), item(1), item(2)]);
    dbReplaceThreadCompletedTurns("thread-1", [turn(0), turn(1)]);

    const legacySnapshot = await invoke(
      handleBoundedThreadHistory as unknown as (call: never) => Promise<void>,
      "http://host/api/threads/thread-1/history?runtimePage=1",
    );
    const expectedSnapshot = `${JSON.stringify(
      await buildThreadSnapshot(context(), "thread-1", { runtimePage: true }),
    )}\n`;
    expect(legacySnapshot.statusCode).toBe(200);
    expect(legacySnapshot.body).toBe(expectedSnapshot);

    const legacyItems = await invoke(
      handleBoundedThreadHistoryItems as unknown as (call: never) => Promise<void>,
      "http://host/api/threads/thread-1/history/items?limit=2",
    );
    const expectedItems = `${JSON.stringify(
      await buildThreadRuntimeItemsPage({ threadId: "thread-1", limit: 2 }),
    )}\n`;
    expect(legacyItems.statusCode).toBe(200);
    expect(legacyItems.body).toBe(expectedItems);

    await expect(
      invoke(
        handleBoundedThreadTurns as unknown as (call: never) => Promise<void>,
        "http://host/api/threads/thread-1/turns?limit=5",
      ),
    ).rejects.toMatchObject({ code: "invalid_reads_capability" });
  });

  it("walks items pages with a small client cap with no holes, duplicates, or run splits", async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `item-${String(index).padStart(3, "0")}`);
    await dbReplaceThreadRuntimeItems(
      "thread-1",
      ids.map((id) => ({
        id,
        type: "assistant_message",
        state: "completed" as const,
        streams: { assistant_text: "x".repeat(60_000) },
      })),
    );
    const caps = negotiation("&maxBytes=500000").caps;
    const pages: string[][] = [];
    let cursor: number | undefined;
    for (let pageIndex = 0; pageIndex < 50; pageIndex += 1) {
      const body = await buildBoundedThreadHistoryItems(
        {
          threadId: "thread-1",
          limit: 500,
          ...(cursor !== undefined ? { beforePosition: cursor } : {}),
        },
        caps,
      );
      expect(serializedWireByteLength(body)).toBeLessThanOrEqual(caps.maxWireBytes);
      const parsed = JSON.parse(body) as { items: { id: string }[]; nextCursor: number | null };
      const pageIds = parsed.items.map((entry) => entry.id);
      // Ascending page order, and the cursor is the oldest included position.
      expect(pageIds).toEqual([...pageIds].sort());
      expect(parsed.nextCursor === null || parsed.nextCursor === ids.indexOf(pageIds[0]!)).toBe(
        true,
      );
      pages.push(pageIds);
      if (parsed.nextCursor === null) break;
      cursor = parsed.nextCursor;
    }
    const seen = pages.flat();
    expect([...seen].sort()).toEqual(ids);
    expect(new Set(seen).size).toBe(ids.length);
    // Pages continue strictly older: every row of the next page precedes the
    // previous page's oldest row.
    for (let index = 1; index < pages.length; index += 1) {
      const newestOfThisPage = ids.indexOf(pages[index]!.at(-1)!);
      const oldestOfPreviousPage = ids.indexOf(pages[index - 1]![0]!);
      expect(newestOfThisPage).toBeLessThan(oldestOfPreviousPage);
    }
  });

  it("keeps an entire timeline group run on one page when it fits the declared budget", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      item(0),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `group-${index}`,
        type: "command_execution",
        state: "completed" as const,
        streams: { command_output: "y".repeat(60_000) },
      })),
      item(9, { id: "tail" }),
    ]);
    const caps = negotiation("&maxBytes=500000").caps;
    const first = await buildBoundedThreadHistoryItems({ threadId: "thread-1", limit: 500 }, caps);
    const firstParsed = JSON.parse(first) as { items: { id: string }[]; nextCursor: number | null };
    expect(firstParsed.items.map((entry) => entry.id)).toEqual(["tail"]);

    const second = await buildBoundedThreadHistoryItems(
      {
        threadId: "thread-1",
        limit: 500,
        ...(firstParsed.nextCursor !== null ? { beforePosition: firstParsed.nextCursor } : {}),
      },
      caps,
    );
    const secondParsed = JSON.parse(second) as {
      items: { id: string }[];
      nextCursor: number | null;
    };
    // The run is never split across pages: page 2 carries all five rows.
    expect(secondParsed.items.map((entry) => entry.id)).toEqual([
      "group-0",
      "group-1",
      "group-2",
      "group-3",
      "group-4",
    ]);
    expect(secondParsed.nextCursor).not.toBeNull();
  });

  it("refuses a host-cap-breaking stream before its payload is fetched", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      item(0),
      {
        id: "oversized",
        type: "assistant_message",
        state: "completed",
        streams: {},
      },
    ]);
    // Hostile stored state that bypasses the append-time retention trim: raw
    // control characters that JSON-escape to 6× their stored bytes, so the
    // stream bound alone exceeds the host wire cap. No payload text may be
    // selected into JS for this row.
    const sqlite = getSqlite();
    const insertChunk = sqlite.prepare(
      `INSERT INTO thread_runtime_item_stream_chunks (thread_id, item_id, stream, seq, chars, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    sqlite.transaction(() => {
      for (let seq = 0; seq < 6; seq += 1) {
        const text = "\u0001".repeat(1_000_000);
        insertChunk.run("thread-1", "oversized", "assistant_text", seq, text.length, text);
      }
    })();

    const sql = await captureSqlAsync(async () => {
      let failure: unknown;
      try {
        await buildBoundedThreadHistoryItems(
          { threadId: "thread-1", limit: 500 },
          negotiation().caps,
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(HistoryItemTooLargeError);
      expect((failure as HistoryItemTooLargeError).body.readItem).toMatchObject({
        resource: "runtime_item",
        id: "oversized",
        measurement: "serialized-upper-bound",
      });
    });
    expect(sql.some((statement) => /payload, streams/u.test(statement))).toBe(false);
    // The only IN (...) statement is the metadata tail-length sum; the payload
    // fetch-by-key never ran.
    expect(
      sql
        .filter((statement) => statement.includes("item_id IN ("))
        .every((statement) => statement.includes("SUM(length(CAST(text AS BLOB)))")),
    ).toBe(true);

    const response = await invoke(
      handleBoundedThreadHistoryItems as unknown as (call: never) => Promise<void>,
      `http://host/api/threads/thread-1/history/items?reads=${CATALOG_READS_CAPABILITY}&limit=500`,
    );
    expect(response.statusCode).toBe(422);
    expect(historyItemTooLargeBodySchema.parse(JSON.parse(response.body)).readItem).toMatchObject({
      resource: "runtime_item",
      id: "oversized",
    });
  });

  it("fetches only the packed newest rows and never selects payload text for the rest", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [item(0), item(1)]);
    // The older row carries a large non-image payload that the soft cut must
    // exclude, so its text never crosses into JS.
    getSqlite()
      .prepare("UPDATE thread_runtime_items SET payload = ? WHERE thread_id = ? AND item_id = ?")
      .run(JSON.stringify({ blob: "q".repeat(1_000_000) }), "thread-1", "item-000");

    let pageIds: string[] = [];
    const sql = await captureSqlAsync(async () => {
      const body = await buildBoundedThreadHistoryItems(
        { threadId: "thread-1", limit: 500 },
        negotiation("&maxBytes=200000").caps,
      );
      pageIds = (JSON.parse(body) as { items: { id: string }[] }).items.map((entry) => entry.id);
    });
    expect(pageIds).toEqual(["item-001"]);
    const payloadSelects = sql.filter((statement) =>
      /SELECT item_id, type, state, payload, streams/u.test(statement),
    );
    expect(payloadSelects).toHaveLength(1);
    expect(payloadSelects[0]!.split("?").length - 1).toBe(2);
  });

  it("accepts a 2 MiB page-of-one above the soft target and refuses it exactly under a 1 MiB declaration", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "two-mib",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "w".repeat(2 * 1024 * 1024) },
      },
    ]);

    const accepted = await buildBoundedThreadHistoryItems(
      { threadId: "thread-1", limit: 500 },
      negotiation().caps,
    );
    const acceptedBytes = serializedWireByteLength(accepted);
    expect(acceptedBytes).toBeGreaterThan(HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES);
    expect(acceptedBytes).toBeLessThanOrEqual(CATALOG_HOST_WIRE_MAX_BYTES);
    expect((JSON.parse(accepted) as { items: unknown[] }).items).toHaveLength(1);

    const strictCaps = negotiation("&maxBytes=1048576").caps;
    let failure: unknown;
    try {
      await buildBoundedThreadHistoryItems({ threadId: "thread-1", limit: 500 }, strictCaps);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(HistoryItemTooLargeError);
    const refusal = (failure as HistoryItemTooLargeError).body;
    expect(refusal.readItem.measurement).toBe("serialized-exact");
    expect(refusal.readItem.wireBytes).toBeGreaterThan(refusal.readItem.maxBytes);
    expect(historyItemTooLargeBodySchema.parse(refusal).readItem.wireBytesMeaning).toBe(
      "utf8-serialized",
    );
  });

  it("keeps the existing 4,000,000-character stream inside the negotiated hard caps", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "long-stream",
        type: "command_execution",
        state: "completed",
        streams: { command_output: "\u0001".repeat(4_000_000) },
      },
    ]);
    const body = await buildBoundedThreadHistoryItems(
      { threadId: "thread-1", limit: 500 },
      negotiation().caps,
    );
    const parsed = JSON.parse(body) as { items: { id: string }[] };
    expect(parsed.items.map((entry) => entry.id)).toEqual(["long-stream"]);
    expect(serializedWireByteLength(body)).toBeLessThanOrEqual(CATALOG_HOST_WIRE_MAX_BYTES);
    expect(serializedDecodeByteLength(body)).toBeLessThanOrEqual(CATALOG_HOST_DECODE_MAX_BYTES);
  }, 60_000);

  it("delivers turns ascending with an exact next cursor and typed cursor errors", async () => {
    dbReplaceThreadCompletedTurns(
      "thread-1",
      Array.from({ length: 300 }, (_, index) => turn(index, index % 2 === 0 ? null : `a-${index}`)),
    );
    const caps = negotiation().caps;

    const first = buildBoundedCompletedTurnPage({ threadId: "thread-1", limit: 100, caps });
    const firstParsed = JSON.parse(first) as {
      turns: { startedAt: string; anchorItemId: string | null }[];
      completedTurnsNextCursor: string | null;
    };
    expect(firstParsed.turns[0]?.startedAt).toBe(turn(200).startedAt);
    expect(firstParsed.turns.at(-1)?.startedAt).toBe(turn(299).startedAt);
    expect(firstParsed.completedTurnsNextCursor).toBe(encodeCompletedTurnCursor(200));

    const second = buildBoundedCompletedTurnPage({
      threadId: "thread-1",
      limit: 100,
      cursorIdx: 200,
      caps,
    });
    const secondParsed = JSON.parse(second) as {
      turns: { startedAt: string }[];
      completedTurnsNextCursor: string | null;
    };
    expect(secondParsed.turns[0]?.startedAt).toBe(turn(100).startedAt);
    expect(secondParsed.turns.at(-1)?.startedAt).toBe(turn(199).startedAt);
    expect(secondParsed.completedTurnsNextCursor).toBe(encodeCompletedTurnCursor(100));

    const last = buildBoundedCompletedTurnPage({
      threadId: "thread-1",
      limit: 100,
      cursorIdx: 100,
      caps,
    });
    const lastParsed = JSON.parse(last) as { turns: unknown[]; completedTurnsNextCursor: null };
    expect(lastParsed.turns).toHaveLength(100);
    expect(lastParsed.completedTurnsNextCursor).toBeNull();

    const response = await invoke(
      handleBoundedThreadTurns as unknown as (call: never) => Promise<void>,
      `http://host/api/threads/thread-1/turns?reads=${CATALOG_READS_CAPABILITY}&limit=10&cursor=tp1.abc`,
    ).catch((error: unknown) => error as RemoteHttpError);
    expect(response).toBeInstanceOf(RemoteHttpError);
    expect((response as RemoteHttpError).code).toBe("invalid_thread_cursor");
  });

  it("maps B1 typed persistence refusals to retryable 503s", () => {
    const busy = mapHistoryPersistenceRefusal(
      new RuntimePersistenceBusyError("thread-1", "fence", 250),
    ) as RemoteHttpError;
    expect(busy).toBeInstanceOf(RemoteHttpError);
    expect(busy.code).toBe("persistence_read_refused");
    expect(busy.status).toBe(503);
    expect(busy.retryAfterMs).toBe(250);
    expect(mapHistoryPersistenceRefusal(new Error("unrelated"))).toBeInstanceOf(Error);
  });
});
