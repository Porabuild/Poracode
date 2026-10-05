import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dbGetThreadRuntimeItem as facadeRead,
  dbGetThreadRuntimeItemCommitted as facadeCommittedRead,
} from "@/host/db";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbGetThreadRuntimeItemCommitted as extractedCommittedRead } from "./runtimeItemRead";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetThreadRuntimeItem,
  dbGetThreadRuntimeItemCommitted,
  dbHasPendingThreadRuntimeWrites,
  dbReplaceThreadRuntimeItems,
} from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import {
  beginRuntimeFence,
  flushRuntimeFence,
  releaseRuntimeFence,
  runtimePersistenceController,
} from "./runtimePersistenceRuntime";
import {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
} from "./runtimePersistenceTypes";
import { HEAD_CHARS, TAIL_CHARS } from "./runtimeStreamCap";
import type { RuntimeTimelineItemRow } from "./runtimeTimelineReads";

const THREAD_ID = "thread-1";
const ITEM_ID = "image-🖼️";
const IMAGE_PAYLOAD = {
  name: "view_image",
  path: "/tmp/猫 🧪.png",
  images: [{ mimeType: "image/png", data: "iVBORw0KGgo=" }],
  caption: "Résumé — Привет — 你好 — 🦉",
};

/** Fingerprint canonical rows, including every retained chunk, outside read probes. */
function canonicalStreamsDigest(): string {
  const hash = createHash("sha256");
  const sqlite = getSqlite();
  for (const sql of [
    "SELECT thread_id, item_id, streams FROM thread_runtime_items ORDER BY thread_id, item_id",
    "SELECT * FROM thread_runtime_item_stream_state ORDER BY thread_id, item_id, stream",
    "SELECT * FROM thread_runtime_item_stream_chunks ORDER BY thread_id, item_id, stream, seq",
    "SELECT * FROM thread_runtime_item_stream_heads ORDER BY thread_id, item_id, stream_order",
    "SELECT head_id, seq, chars, hex(data) AS data FROM thread_runtime_item_stream_head_blocks ORDER BY head_id, seq",
  ]) {
    hash.update(sql);
    for (const row of sqlite.prepare(sql).iterate()) hash.update(JSON.stringify(row));
  }
  return hash.digest("hex");
}

describe.skipIf(!sqliteAvailable)("single runtime item read projection (real SQLite)", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-runtime-item-read-"));
    dbPath = join(dir, "state.sqlite");
    initDatabase(dbPath);
    dbUpsertProject(
      {
        id: "project-1",
        name: "Read projection",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    getSqlite().pragma("query_only = OFF");
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("omits native stream materialization and all tail queries while preserving a full retained stream", async () => {
    const head = "H".repeat(HEAD_CHARS - 3) + "🧪\n";
    const tail = "T".repeat(TAIL_CHARS - 3) + "終🖼";
    const streams = { command_output: head + tail, reasoning_text: "kept Ω", empty: "" };
    await dbReplaceThreadRuntimeItems(THREAD_ID, [
      {
        id: ITEM_ID,
        type: "tool_call",
        state: "completed",
        parentItemId: "parent-🦉",
        payload: IMAGE_PAYLOAD,
        streams,
      },
      {
        id: "unrelated",
        type: "command_execution",
        state: "updated",
        payload: { command: "long log" },
        streams: { command_output: "unrelated".repeat(100_000) },
      },
    ]);
    const sqlite = getSqlite();
    const before = canonicalStreamsDigest();
    const prepare = vi.spyOn(sqlite, "prepare");

    const projected = dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID, {
      includeStreams: false,
    });
    expect(projected).toEqual({
      id: ITEM_ID,
      type: "tool_call",
      state: "completed",
      parentItemId: "parent-🦉",
      payload: IMAGE_PAYLOAD,
      streams: {},
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]![0]).toMatch(/SELECT .*payload, NULL AS streams, parent_item_id/);
    const payloadStatement = prepare.mock.results[0]!.value;
    expect(payloadStatement.columns()).toContainEqual(
      expect.objectContaining({ name: "streams", column: null, table: null }),
    );
    const nativeRow = payloadStatement.get(THREAD_ID, ITEM_ID) as RuntimeTimelineItemRow;
    expect(nativeRow.streams).toBeNull();
    expect(nativeRow.payload).toBe(JSON.stringify(IMAGE_PAYLOAD));

    prepare.mockClear();
    const full = dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID);
    expect(full).toEqual({ ...projected, streams });
    expect(full!.streams.command_output).toHaveLength(4_256_000);
    expect(prepare).toHaveBeenCalledTimes(5);
    expect(prepare.mock.results[0]!.value.columns()).toContainEqual(
      expect.objectContaining({
        name: "streams",
        column: "streams",
        table: "thread_runtime_items",
      }),
    );
    expect(prepare.mock.calls[1]![0]).toMatch(/FROM thread_runtime_item_stream_heads/);
    expect(prepare.mock.calls[2]![0]).toMatch(/FROM thread_runtime_item_stream_head_blocks/);
    expect(prepare.mock.results[2]!.value.columns()).toContainEqual(
      expect.objectContaining({
        name: "data",
        column: "data",
        table: "thread_runtime_item_stream_head_blocks",
      }),
    );
    expect(prepare.mock.calls[3]![0]).toMatch(/FROM thread_runtime_item_stream_state/);
    expect(prepare.mock.calls[4]![0]).toMatch(
      /SELECT item_id, stream, text FROM thread_runtime_item_stream_chunks/,
    );
    const chunks = prepare.mock.results[4]!.value.all(THREAD_ID, ITEM_ID) as Array<{
      item_id: string;
      text: string;
    }>;
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((row) => row.item_id === ITEM_ID)).toBe(true);
    expect(chunks.reduce((chars, row) => chars + row.text.length, 0)).toBe(TAIL_CHARS);
    prepare.mockClear();
    expect(await dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID, { includeStreams: false })).toEqual(
      projected,
    );
    // The fence keeps its durable-gap bookkeeping; inspect only item/stream reads.
    const fencedItemQueries = prepare.mock.calls.flatMap(([sql], index) =>
      /FROM thread_runtime_items\b/.test(sql) ? [index] : [],
    );
    expect(fencedItemQueries).toHaveLength(1);
    expect(prepare.mock.results[fencedItemQueries[0]!]!.value.columns()).toContainEqual(
      expect.objectContaining({ name: "streams", column: null, table: null }),
    );
    expect(prepare.mock.calls.some(([sql]) => /thread_runtime_item_stream_/.test(sql))).toBe(false);
    expect(await dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID)).toEqual(full);
    prepare.mockRestore();
    expect(canonicalStreamsDigest()).toBe(before);
  });

  it("keeps old two-argument facades and pre-projection stored heads, chunks and elision semantics", async () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        "INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams, parent_item_id) VALUES (?, ?, 0, 'assistant_message', 'updated', ?, ?, NULL)",
      )
      .run(
        THREAD_ID,
        ITEM_ID,
        JSON.stringify(IMAGE_PAYLOAD),
        JSON.stringify({ command_output: "begin\n", assistant_text: "head α", empty: "" }),
      );
    for (const [stream, text, elided] of [
      ["command_output", "partial\nend 🧪\n", 37],
      ["assistant_text", " tail 中", 0],
      ["chunk_only", "尾巴", 0],
    ] as const) {
      sqlite
        .prepare(
          "INSERT INTO thread_runtime_item_stream_chunks (thread_id, item_id, stream, seq, chars, text) VALUES (?, ?, ?, 0, ?, ?)",
        )
        .run(THREAD_ID, ITEM_ID, stream, text.length, text);
      sqlite
        .prepare(
          "INSERT INTO thread_runtime_item_stream_state (thread_id, item_id, stream, next_seq, tail_chars, elided_chars) VALUES (?, ?, ?, 1, ?, ?)",
        )
        .run(THREAD_ID, ITEM_ID, stream, text.length, elided);
    }
    const expected = {
      id: ITEM_ID,
      type: "assistant_message",
      state: "updated",
      payload: IMAGE_PAYLOAD,
      streams: {
        command_output:
          "begin\n[... poracode elided 37 characters of earlier output ...]\nend 🧪\n",
        assistant_text: "head α tail 中",
        chunk_only: "尾巴",
        empty: "",
      },
    };
    expect(facadeCommittedRead).toBe(dbGetThreadRuntimeItemCommitted);
    expect(facadeCommittedRead).toBe(extractedCommittedRead);
    expect(facadeRead).toBe(dbGetThreadRuntimeItem);
    expect(facadeCommittedRead(THREAD_ID, ITEM_ID)).toEqual(expected);
    expect(await facadeRead(THREAD_ID, ITEM_ID)).toEqual(expected);
    for (const options of [undefined, {}, { includeStreams: true }]) {
      expect(facadeCommittedRead(THREAD_ID, ITEM_ID, options)).toEqual(expected);
      expect(await facadeRead(THREAD_ID, ITEM_ID, options)).toEqual(expected);
    }
    expect(facadeCommittedRead(THREAD_ID, ITEM_ID, { includeStreams: false })).toEqual({
      ...expected,
      streams: {},
    });
    expect(await facadeRead(THREAD_ID, ITEM_ID, { includeStreams: false })).toEqual({
      ...expected,
      streams: {},
    });
  });

  it.each([
    [
      "Unicode image payload",
      "started",
      "parent-🦉",
      JSON.stringify(IMAGE_PAYLOAD),
      "started",
      IMAGE_PAYLOAD,
    ],
    ["SQL NULL payload", "updated", null, null, "updated", undefined],
    ["JSON null payload", "completed", "", "null", "completed", null],
    ["invalid JSON and unknown state", "future-state", "parent-2", "{broken", "started", undefined],
    ["empty payload and state", "", null, "", "started", undefined],
    ["false payload", "updated", null, "false", "updated", false],
    ["zero payload", "completed", null, "0", "completed", 0],
    ["Unicode string payload", "started", null, '"猫 🧪"', "started", "猫 🧪"],
  ] as const)(
    "preserves payload and metadata for %s",
    async (_label, state, parent, payload, expectedState, expectedPayload) => {
      getSqlite()
        .prepare(
          "INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams, parent_item_id) VALUES (?, ?, 0, 'custom_type', ?, ?, ?, ?)",
        )
        .run(
          THREAD_ID,
          ITEM_ID,
          state,
          payload,
          JSON.stringify({ custom_stream: "text 🧪" }),
          parent,
        );
      const expected = {
        id: ITEM_ID,
        type: "custom_type",
        state: expectedState,
        payload: expectedPayload,
        streams: { custom_stream: "text 🧪" },
        ...(parent ? { parentItemId: parent } : {}),
      };
      expect(dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID)).toEqual(expected);
      expect(
        dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID, { includeStreams: false }),
      ).toEqual({
        ...expected,
        streams: {},
      });
      expect(await dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID, { includeStreams: false })).toEqual({
        ...expected,
        streams: {},
      });
    },
  );

  it("returns null for missing items and threads and scopes colliding item ids by thread", async () => {
    await dbReplaceThreadRuntimeItems(THREAD_ID, [
      { id: ITEM_ID, type: "image_view", state: "completed", payload: IMAGE_PAYLOAD, streams: {} },
    ]);
    dbUpsertThread({ ...testThread(), id: "thread-2" }, 1);
    await dbReplaceThreadRuntimeItems("thread-2", [
      { id: ITEM_ID, type: "custom", state: "updated", payload: { other: true }, streams: {} },
    ]);
    for (const options of [undefined, { includeStreams: false }]) {
      expect(dbGetThreadRuntimeItemCommitted(THREAD_ID, "absent", options)).toBeNull();
      expect(dbGetThreadRuntimeItemCommitted("absent", ITEM_ID, options)).toBeNull();
      expect(await dbGetThreadRuntimeItem(THREAD_ID, "absent", options)).toBeNull();
      expect(await dbGetThreadRuntimeItem("absent", ITEM_ID, options)).toBeNull();
      expect(dbGetThreadRuntimeItemCommitted("thread-2", ITEM_ID, options)?.payload).toEqual({
        other: true,
      });
      expect(dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID, options)?.payload).toEqual(
        IMAGE_PAYLOAD,
      );
    }
  });

  it("keeps committed reads behind pending payloads and fences the selected prefix before reading", async () => {
    dbApplyThreadRuntimeEvents(THREAD_ID, [
      {
        type: "item.started",
        threadId: THREAD_ID,
        itemId: ITEM_ID,
        itemType: "image_view",
        payload: { phase: "pending" },
        parentItemId: "parent-🦉",
      },
    ]);
    expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(true);
    expect(
      dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID, { includeStreams: false }),
    ).toBeNull();
    expect(dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID)).toBeNull();
    const initial = await dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID, { includeStreams: false });
    expect(initial).toMatchObject({
      payload: { phase: "pending" },
      state: "started",
      parentItemId: "parent-🦉",
    });
    expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(false);

    dbApplyThreadRuntimeEvents(THREAD_ID, [
      { type: "item.updated", threadId: THREAD_ID, itemId: ITEM_ID, payload: IMAGE_PAYLOAD },
      {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: ITEM_ID,
        stream: "command_output",
        delta: "before fence 🧪",
      },
    ]);
    const sqlite = getSqlite();
    const rawPayload = sqlite.prepare(
      "SELECT payload FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
    );
    expect(dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID, { includeStreams: false })).toEqual(
      initial,
    );
    expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(true);
    expect(rawPayload.get(THREAD_ID, ITEM_ID)).toEqual({
      payload: JSON.stringify({ phase: "pending" }),
    });

    const pendingRead = dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID, { includeStreams: false });
    dbApplyThreadRuntimeEvents(THREAD_ID, [
      {
        type: "item.updated",
        threadId: THREAD_ID,
        itemId: ITEM_ID,
        payload: { phase: "post-fence" },
      },
      {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: ITEM_ID,
        stream: "command_output",
        delta: " after fence",
      },
    ]);
    const projected = await pendingRead;
    expect(projected).toEqual({
      ...initial,
      state: "updated",
      payload: { phase: "pending", ...IMAGE_PAYLOAD },
      streams: {},
    });
    expect(rawPayload.get(THREAD_ID, ITEM_ID)).toEqual({
      payload: JSON.stringify({ phase: "pending", ...IMAGE_PAYLOAD }),
    });
    expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(true);
    expect(runtimePersistenceController.accessWaiterCount()).toBe(0);
    expect(dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID)).toEqual({
      ...projected,
      streams: { command_output: "before fence 🧪" },
    });
    expect(await dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID)).toEqual({
      ...projected,
      payload: { phase: "post-fence", ...IMAGE_PAYLOAD },
      streams: { command_output: "before fence 🧪 after fence" },
    });
    expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(false);
  });

  it("propagates typed degraded refusal under a real SQLite write lock without returning stale payload", async () => {
    dbApplyThreadRuntimeEvents(THREAD_ID, [
      {
        type: "item.started",
        threadId: THREAD_ID,
        itemId: ITEM_ID,
        itemType: "image_view",
        payload: { old: true },
      },
    ]);
    await dbFlushThreadRuntimeWrites(THREAD_ID);
    const blocker = new Database(
      dbPath,
      nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : undefined,
    );
    blocker.exec("BEGIN IMMEDIATE");
    try {
      dbApplyThreadRuntimeEvents(THREAD_ID, [
        { type: "item.updated", threadId: THREAD_ID, itemId: ITEM_ID, payload: IMAGE_PAYLOAD },
      ]);
      const failure = await dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID, {
        includeStreams: false,
      }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(RuntimePersistenceDegradedError);
      expect(failure).toMatchObject({
        threadId: THREAD_ID,
        errorClass: "retryable",
        cause: { code: "SQLITE_BUSY" },
      });
      expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(true);
      expect(
        dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID, { includeStreams: false })?.payload,
      ).toEqual({ old: true });
      expect(runtimePersistenceController.accessWaiterCount()).toBe(0);
    } finally {
      blocker.exec("ROLLBACK");
      blocker.close();
    }
    expect(
      (await dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID, { includeStreams: false }))?.payload,
    ).toEqual({ old: true, ...IMAGE_PAYLOAD });
    expect(getSqlite().pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("propagates typed busy refusal through the existing bounded fence scheduler", async () => {
    const held = beginRuntimeFence(THREAD_ID);
    expect((await flushRuntimeFence(held)).kind).toBe("committed");
    const queued = [beginRuntimeFence(THREAD_ID), beginRuntimeFence(THREAD_ID)];
    try {
      await expect(
        dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID, { includeStreams: false }),
      ).rejects.toBeInstanceOf(RuntimePersistenceBusyError);
      expect(
        dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID, { includeStreams: false }),
      ).toBeNull();
    } finally {
      for (const token of queued) releaseRuntimeFence(token);
      releaseRuntimeFence(held);
    }
    expect(runtimePersistenceController.accessWaiterCount()).toBe(0);
    expect(await dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID, { includeStreams: false })).toBeNull();
  });

  it("refuses typed durable gaps while committed-only reads keep their existing lag semantics", async () => {
    await dbReplaceThreadRuntimeItems(THREAD_ID, [
      {
        id: ITEM_ID,
        type: "image_view",
        state: "completed",
        payload: IMAGE_PAYLOAD,
        streams: { custom_stream: "canonical" },
      },
    ]);
    const before = canonicalStreamsDigest();
    const sqlite = getSqlite();
    sqlite.pragma("query_only = ON");
    try {
      expect(
        dbApplyThreadRuntimeEvents(THREAD_ID, [
          {
            type: "item.updated",
            threadId: THREAD_ID,
            itemId: ITEM_ID,
            payload: { refused: true },
          },
        ]),
      ).toMatchObject({ kind: "refused", reason: "degraded" });
    } finally {
      sqlite.pragma("query_only = OFF");
    }
    runtimePersistenceController.finalizeDurableGapClose();
    expect(
      sqlite.prepare("SELECT reason FROM thread_runtime_gaps WHERE thread_id = ?").get(THREAD_ID),
    ).toEqual({ reason: "degraded" });
    const failure = await dbGetThreadRuntimeItem(THREAD_ID, ITEM_ID, {
      includeStreams: false,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RuntimePersistenceContaminatedError);
    expect(failure).toMatchObject({
      threadId: THREAD_ID,
      reason: "degraded",
      repairRequired: true,
    });
    expect(
      dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID, { includeStreams: false })?.payload,
    ).toEqual(IMAGE_PAYLOAD);
    expect(dbGetThreadRuntimeItemCommitted(THREAD_ID, ITEM_ID)?.streams).toEqual({
      custom_stream: "canonical",
    });
    expect(canonicalStreamsDigest()).toBe(before);
    expect(runtimePersistenceController.accessWaiterCount()).toBe(0);
  });
});
