import Database from "better-sqlite3";
import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { getSqlite } from "./connection";
import { dbGetThreadRuntimeItemCommitted } from "./runtimeItemRead";
import { dbReplaceThreadRuntimeItems } from "./runtimeItems";
import { applyRuntimeEventBatchesNow, applyThreadRuntimeEventsNow } from "./runtimeItemsWriter";
import { HEAD_CHARS, TAIL_CHARS } from "./runtimeStreamCap";
import { RUNTIME_STREAM_HEAD_BLOCK_CHARS } from "./runtimeStreamHeadSchema";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import {
  applyLegacyStreamEvents,
  streamWriteOutcome,
} from "./RuntimeLegacyStreamWriter.testFixtures";
import {
  delta,
  durableStreamDigest,
  initializeHeads,
  installPersistentHeadWriterFixture,
  logicalStreamDigest,
  observeStreamLookups,
  persistentHeads,
  retiredHintSchemaNames,
  THREAD,
} from "./RuntimePersistentStreamHeads.testFixtures";

describe.skipIf(!sqliteAvailable)("persistent stream head writer parity", () => {
  const fixture = installPersistentHeadWriterFixture();

  it("matches an independent legacy head/chunk/state oracle at every canonical prefix", () => {
    const sqlite = getSqlite();
    const payload = JSON.stringify({ content: "x".repeat(2 * 1024 * 1024), caption: "猫🖼" });
    sqlite
      .prepare("UPDATE thread_runtime_items SET payload = ? WHERE thread_id = ? AND item_id = ?")
      .run(payload, THREAD, "a");
    sqlite.exec(
      "CREATE TEMP TRIGGER reject_head_payload_update BEFORE UPDATE OF payload ON main.thread_runtime_items WHEN NEW.item_id = 'a' BEGIN SELECT RAISE(ABORT, 'unexpected payload rewrite'); END",
    );
    const prefixes: RuntimeEvent[][] = [
      [delta("a", ":first"), delta("b", "😀:b")],
      [delta("a", ""), delta("a", "more", "reasoning_text")],
      [delta("a", ":tail"), delta("b", "")],
      [delta("a", "", "assistant_text", true), delta("a", "new😀")],
      [delta("growing", "🧪"), delta("growing", "")],
      [delta("a", "x".repeat(HEAD_CHARS - 6) + "🧪")],
      [delta("a", "b".repeat(256_000 - 1) + "😀" + "c".repeat(TAIL_CHARS + 512_000))],
      [delta("b", ":state"), { type: "item.completed", threadId: THREAD, itemId: "b" }],
      [delta("b", ":completed"), delta("a", "tail"), delta("missing", "ignored")],
      [delta("a", "🧪again", "reasoning_text"), delta("a", "more")],
      [delta("b", "z".repeat(HEAD_CHARS - 1) + "😀", "assistant_text", true)],
      [delta("b", "extra"), delta("a", "extra")],
    ];
    const before = durableStreamDigest();
    const legacy: string[] = [];
    sqlite.exec("BEGIN IMMEDIATE");
    for (const events of prefixes) {
      applyLegacyStreamEvents(sqlite, THREAD, events);
      legacy.push(logicalStreamDigest());
    }
    sqlite.exec("ROLLBACK");
    expect(durableStreamDigest()).toBe(before);
    expect(persistentHeads()).toEqual([]);
    const reads = observeStreamLookups();
    prefixes.forEach((events, index) => {
      expect(applyRuntimeEventBatchesNow([{ threadId: THREAD, events }])).toEqual({
        kind: "committed",
      });
      expect(logicalStreamDigest()).toBe(legacy[index]);
    });
    expect(reads.some((read) => read.kind === "metadata" && read.headChars !== undefined)).toBe(
      true,
    );
    expect(
      reads
        .filter((read) => read.kind === "block")
        .every((read) => read.blobBytes <= RUNTIME_STREAM_HEAD_BLOCK_CHARS * 2),
    ).toBe(true);
    expect(retiredHintSchemaNames()).toEqual([]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.payload).toEqual(JSON.parse(payload));
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.reasoning_text).toBe(
      "unchanged Ωmore🧪again",
    );
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "b")?.streams.assistant_text).toBe(
      "z".repeat(HEAD_CHARS - 1) + "😀extra",
    );
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "growing")?.streams.assistant_text).toBe(
      "g".repeat(HEAD_CHARS - 1) + "🧪",
    );
  });

  it("reads no seed or head BLOB on repeated frozen prefixes while a sibling grows", () => {
    initializeHeads("a", "b");
    const reads = observeStreamLookups();
    for (let index = 0; index < 10; index += 1) {
      applyThreadRuntimeEventsNow(THREAD, [delta("a", "x"), delta("b", "y")]);
    }
    expect(reads.filter((read) => read.kind === "item")).toHaveLength(20);
    expect(reads.every((read) => read.seedUnits === 0 && read.blobBytes === 0)).toBe(true);
    const boundary = reads.length;
    applyThreadRuntimeEventsNow(THREAD, [
      delta("a", "tail"),
      delta("a", " grows", "reasoning_text"),
      delta("a", "after"),
    ]);
    expect(
      reads.slice(boundary).every((read) => read.seedUnits === 0 && read.blobBytes === 0),
    ).toBe(true);
    expect(persistentHeads("a").map((head) => head.head_chars)).toEqual([
      HEAD_CHARS,
      "unchanged Ω grows".length,
    ]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams).toEqual({
      assistant_text: "a".repeat(HEAD_CHARS) + "x".repeat(10) + "tailafter",
      reasoning_text: "unchanged Ω grows",
    });
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "b")?.state).toBe("completed");
  });

  it("indexes every frozen sibling once and reloads only scalar metadata across alternating streams", () => {
    const sqlite = getSqlite();
    sqlite.prepare("UPDATE thread_runtime_items SET streams = ? WHERE item_id = 'a'").run(
      JSON.stringify({
        assistant_text: "a".repeat(HEAD_CHARS),
        reasoning_text: "r".repeat(HEAD_CHARS),
      }),
    );
    const reads = observeStreamLookups();
    const alternating = Array.from({ length: 16 }, (_, index) =>
      delta("a", "x", index % 2 ? "reasoning_text" : "assistant_text"),
    );
    applyThreadRuntimeEventsNow(THREAD, alternating);
    expect(reads.filter((read) => read.seedUnits > 0)).toHaveLength(1);
    expect(persistentHeads("a")).toHaveLength(2);
    const boundary = reads.length;
    applyThreadRuntimeEventsNow(THREAD, alternating);
    expect(reads.slice(boundary).filter((read) => read.kind === "item")).toHaveLength(16);
    expect(
      reads.slice(boundary).every((read) => read.seedUnits === 0 && read.blobBytes === 0),
    ).toBe(true);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams).toEqual({
      assistant_text: "a".repeat(HEAD_CHARS) + "x".repeat(16),
      reasoning_text: "r".repeat(HEAD_CHARS) + "x".repeat(16),
    });
  });

  it("keeps frozen sibling reads free of payload while growing prefixes read only their bounded open block", () => {
    const sqlite = getSqlite();
    sqlite.prepare("UPDATE thread_runtime_items SET streams = ? WHERE item_id = 'a'").run(
      JSON.stringify({
        assistant_text: "a".repeat(HEAD_CHARS),
        reasoning_text: "r".repeat(24_000),
      }),
    );
    initializeHeads("a");
    const reads = observeStreamLookups();
    for (let round = 0; round < 10; round += 1) {
      applyThreadRuntimeEventsNow(THREAD, [delta("a", "think", "reasoning_text")]);
      const boundary = reads.length;
      applyThreadRuntimeEventsNow(THREAD, [delta("a", "tail")]);
      expect(reads.slice(boundary).length).toBeGreaterThan(0);
      expect(
        reads.slice(boundary).every((read) => read.seedUnits === 0 && read.blobBytes === 0),
      ).toBe(true);
    }
    expect(reads.every((read) => read.seedUnits === 0)).toBe(true);
    const blocks = reads.filter((read) => read.kind === "block");
    expect(blocks).toHaveLength(9);
    expect(
      blocks.every(
        (read) => read.blobBytes > 0 && read.blobBytes < RUNTIME_STREAM_HEAD_BLOCK_CHARS * 2,
      ),
    ).toBe(true);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams).toEqual({
      assistant_text: "a".repeat(HEAD_CHARS) + "tail".repeat(10),
      reasoning_text: "r".repeat(24_000) + "think".repeat(10),
    });
  });

  it("preserves malformed legacy success or refusal against the independent helper", () => {
    const sqlite = getSqlite();
    const storedHeads = [
      { streams: "{broken", text: "tail", eligible: false },
      { streams: "null", text: "tail", eligible: false },
      { streams: JSON.stringify(["x".repeat(HEAD_CHARS)]), text: "", eligible: false },
      { streams: JSON.stringify({ assistant_text: 23 }), text: "tail", eligible: false },
      {
        streams: JSON.stringify({ assistant_text: "x".repeat(HEAD_CHARS), reasoning_text: 23 }),
        text: "tail",
        eligible: false,
      },
      {
        streams: JSON.stringify({ assistant_text: "x".repeat(HEAD_CHARS + 2) }),
        text: "tail",
        eligible: false,
      },
      { streams: null, text: "tail", eligible: true },
    ];
    for (const stored of storedHeads) {
      sqlite.prepare("DELETE FROM thread_runtime_item_stream_chunks WHERE item_id = 'a'").run();
      sqlite.prepare("DELETE FROM thread_runtime_item_stream_state WHERE item_id = 'a'").run();
      sqlite
        .prepare("UPDATE thread_runtime_items SET streams = ? WHERE item_id = 'a'")
        .run(stored.streams);
      const events = [delta("a", stored.text)];
      sqlite.exec("BEGIN IMMEDIATE");
      const legacy = streamWriteOutcome(() => applyLegacyStreamEvents(sqlite, THREAD, events));
      const expected = logicalStreamDigest();
      sqlite.exec("ROLLBACK");
      expect(streamWriteOutcome(() => applyThreadRuntimeEventsNow(THREAD, events))).toEqual(legacy);
      expect(logicalStreamDigest()).toBe(expected);
      expect(persistentHeads("a").length > 0).toBe(stored.eligible && legacy.kind === "success");
    }
  });

  it("replaces a frozen stream with empty text while retaining a sibling head and tail", () => {
    const sqlite = getSqlite();
    const seed = JSON.stringify({
      assistant_text: "a".repeat(HEAD_CHARS),
      reasoning_text: "r".repeat(HEAD_CHARS),
    });
    sqlite.prepare("UPDATE thread_runtime_items SET streams = ? WHERE item_id = 'a'").run(seed);
    applyThreadRuntimeEventsNow(THREAD, [
      delta("a", " old"),
      delta("a", " keep", "reasoning_text"),
    ]);
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "", "assistant_text", true)]);
    expect(
      persistentHeads("a").find((head) => head.stream_key === JSON.stringify("assistant_text")),
    ).toMatchObject({ seed_chars: 0, head_chars: 0, next_seq: 0, open_seq: null });
    expect(
      sqlite.prepare("SELECT streams FROM thread_runtime_items WHERE item_id = 'a'").get(),
    ).toEqual({ streams: seed });
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")).toMatchObject({
      payload: { content: "kept" },
      streams: { assistant_text: "", reasoning_text: "r".repeat(HEAD_CHARS) + " keep" },
    });
    expect(
      sqlite
        .prepare("SELECT stream FROM thread_runtime_item_stream_state WHERE item_id = 'a'")
        .pluck()
        .all(),
    ).toEqual(["reasoning_text"]);
    expect(
      sqlite
        .prepare("SELECT stream FROM thread_runtime_item_stream_chunks WHERE item_id = 'a'")
        .pluck()
        .all(),
    ).toEqual(["reasoning_text"]);
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "new"), delta("a", " tail", "reasoning_text")]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams).toEqual({
      assistant_text: "new",
      reasoning_text: "r".repeat(HEAD_CHARS) + " keep tail",
    });
  });

  it("resets direct seed writes, cascades key moves, and prevents stale deletion/reinsertion or snapshot data", async () => {
    const sqlite = getSqlite();
    initializeHeads("a", "b");
    sqlite
      .prepare("UPDATE thread_runtime_items SET streams = ? WHERE thread_id = ? AND item_id = ?")
      .run(JSON.stringify({ assistant_text: "direct", reasoning_text: "kept" }), THREAD, "a");
    expect(persistentHeads("a")).toEqual([]);
    applyThreadRuntimeEventsNow(THREAD, [delta("a", " tail")]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "direct tail",
    );
    applyThreadRuntimeEventsNow(THREAD, [delta("b", "movable", "reasoning_text")]);
    const ids = persistentHeads("b").map((head) => head.head_id);
    sqlite.prepare("UPDATE thread_runtime_items SET item_id = 'moved' WHERE item_id = 'b'").run();
    expect(persistentHeads("b")).toEqual([]);
    expect(persistentHeads("moved").map((head) => head.head_id)).toEqual(ids);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "moved")?.streams.reasoning_text).toBe(
      "movable",
    );
    sqlite
      .prepare(
        "INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, streams) VALUES (?, 'reinserted', 99, 'assistant_message', 'started', ?)",
      )
      .run(THREAD, JSON.stringify({ assistant_text: "old row" }));
    applyThreadRuntimeEventsNow(THREAD, [delta("reinserted", " old")]);
    sqlite.prepare("DELETE FROM thread_runtime_items WHERE item_id = 'reinserted'").run();
    expect(persistentHeads("reinserted")).toEqual([]);
    sqlite
      .prepare(
        "INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, streams) VALUES (?, 'reinserted', 99, 'assistant_message', 'started', ?)",
      )
      .run(THREAD, JSON.stringify({ assistant_text: "new row" }));
    applyThreadRuntimeEventsNow(THREAD, [delta("reinserted", " tail")]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "reinserted")?.streams.assistant_text).toBe(
      "new row tail",
    );
    await dbReplaceThreadRuntimeItems(THREAD, [
      {
        id: "moved",
        type: "assistant_message",
        state: "started",
        streams: { assistant_text: "snapshot" },
      },
    ]);
    expect(
      persistentHeads().every(
        (head) => head.item_id === "moved" && head.head_chars === "snapshot".length,
      ),
    ).toBe(true);
    applyThreadRuntimeEventsNow(THREAD, [delta("moved", " tail")]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "moved")?.streams).toEqual({
      assistant_text: "snapshot tail",
    });
  });

  it("sees an external same-byte-size reset through persistent triggers before a cold lookup", () => {
    const sqlite = getSqlite();
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "overlay", "reasoning_text")]);
    const reads = observeStreamLookups();
    const path = join(fixture.directory(), "state.sqlite");
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    const oldSize = statSync(path).size;
    const original = (
      sqlite.prepare("SELECT streams FROM thread_runtime_items WHERE item_id = 'a'").get() as {
        streams: string;
      }
    ).streams;
    const assistant = "external-v1";
    const base = JSON.stringify({ assistant_text: assistant, reasoning_text: "" });
    const reasoning = "r".repeat(Buffer.byteLength(original) - Buffer.byteLength(base));
    expect(reasoning.length).toBeGreaterThanOrEqual(HEAD_CHARS);
    expect(reasoning.length).toBeLessThanOrEqual(HEAD_CHARS + 1);
    const replacement = JSON.stringify({ assistant_text: assistant, reasoning_text: reasoning });
    expect(Buffer.byteLength(replacement)).toBe(Buffer.byteLength(original));
    const other = new Database(path, {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    });
    try {
      other.pragma("foreign_keys = ON");
      const version = sqlite.pragma("data_version", { simple: true });
      other
        .prepare("UPDATE thread_runtime_items SET streams = ? WHERE item_id = 'a'")
        .run(replacement);
      other.pragma("wal_checkpoint(TRUNCATE)");
      expect(statSync(path).size).toBe(oldSize);
      expect(sqlite.pragma("data_version", { simple: true })).not.toBe(version);
      expect(persistentHeads("a")).toEqual([]);
      expect(
        sqlite.prepare("SELECT COUNT(*) AS n FROM thread_runtime_item_stream_head_blocks").get(),
      ).toEqual({ n: 0 });
      applyThreadRuntimeEventsNow(THREAD, [delta("a", " tail")]);
      expect(reads.filter((read) => read.seedUnits > 0)).toHaveLength(1);
      expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams).toEqual({
        assistant_text: assistant + " tail",
        reasoning_text: reasoning,
      });
      expect(
        persistentHeads("a").find((head) => head.stream_key === JSON.stringify("reasoning_text"))
          ?.head_chars,
      ).toBe(reasoning.length);
    } finally {
      other.close();
    }
  });
});
