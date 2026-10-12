import Database from "better-sqlite3";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbGetThreadRuntimeItemCommitted } from "./runtimeItemRead";
import { applyRuntimeEventBatchesNow, applyThreadRuntimeEventsNow } from "./runtimeItemsWriter";
import { HEAD_CHARS } from "./runtimeStreamCap";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import {
  delta,
  durableStreamDigest,
  initializeHeads,
  installPersistentHeadWriterFixture,
  observeStreamLookups,
  persistentHeads,
  retiredHintSchemaNames,
  THREAD,
} from "./RuntimePersistentStreamHeads.testFixtures";

describe.skipIf(!sqliteAvailable)("persistent stream head transaction custody", () => {
  const fixture = installPersistentHeadWriterFixture();

  it("reserves the main writer before any cold item lookup in atomic and standalone prefixes", () => {
    const other = new Database(join(fixture.directory(), "state.sqlite"), {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    });
    const transactions: boolean[] = [];
    const lockFailures: unknown[] = [];
    try {
      other.pragma("busy_timeout = 0");
      observeStreamLookups(undefined, (read) => {
        if (read.kind !== "item") return;
        transactions.push(read.inTransaction);
        let failure: unknown;
        try {
          other.exec("BEGIN IMMEDIATE");
          other.exec("ROLLBACK");
        } catch (error) {
          failure = error;
        }
        lockFailures.push(failure);
      });
      expect(
        applyRuntimeEventBatchesNow([
          { threadId: THREAD, events: [delta("a", "")] },
          { threadId: THREAD, events: [delta("b", "")] },
        ]),
      ).toEqual({ kind: "committed" });
      applyThreadRuntimeEventsNow(THREAD, [delta("a", "tail")]);
      expect(transactions).toEqual([true, true, true]);
      expect(lockFailures).toEqual(
        Array.from({ length: 3 }, () => expect.objectContaining({ code: "SQLITE_BUSY" })),
      );
    } finally {
      if (other.inTransaction) other.exec("ROLLBACK");
      other.close();
    }
  });

  it("rolls back a newly frozen head block, metadata and prior tail writes before exact retry", () => {
    initializeHeads("b");
    const sqlite = getSqlite();
    const before = durableStreamDigest();
    const heads = persistentHeads();
    sqlite.exec(
      "CREATE TEMP TRIGGER fail_head_tail BEFORE INSERT ON main.thread_runtime_item_stream_chunks WHEN NEW.text = 'FAIL' BEGIN SELECT RAISE(ABORT, 'tail failure'); END",
    );
    const events = [delta("growing", "🧪"), delta("b", "FAIL")];
    expect(() => applyThreadRuntimeEventsNow(THREAD, events)).toThrow("tail failure");
    expect(durableStreamDigest()).toBe(before);
    expect(persistentHeads()).toEqual(heads);
    sqlite.exec("DROP TRIGGER fail_head_tail");
    applyThreadRuntimeEventsNow(THREAD, events);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "growing")?.streams.assistant_text).toBe(
      "g".repeat(HEAD_CHARS - 1) + "🧪",
    );
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "b")?.streams.assistant_text).toBe(
      "b".repeat(HEAD_CHARS) + "FAIL",
    );
    expect(persistentHeads("growing")[0]).toMatchObject({
      head_chars: HEAD_CHARS + 1,
      next_seq: 1,
      open_seq: null,
      open_chars: 0,
    });
  });

  it("preserves an externally committed reset while rolling back attempted reinitialization and append", () => {
    initializeHeads("a", "b");
    const sqlite = getSqlite();
    const reads = observeStreamLookups();
    const other = new Database(join(fixture.directory(), "state.sqlite"), {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    });
    try {
      other.pragma("foreign_keys = ON");
      const version = sqlite.pragma("data_version", { simple: true });
      other
        .prepare("UPDATE thread_runtime_items SET streams = ? WHERE item_id = 'a'")
        .run(JSON.stringify({ assistant_text: "external", reasoning_text: "kept" }));
      expect(sqlite.pragma("data_version", { simple: true })).not.toBe(version);
      expect(persistentHeads("a")).toEqual([]);
      const external = durableStreamDigest();
      sqlite.exec(
        "CREATE TEMP TRIGGER fail_external_append BEFORE INSERT ON main.thread_runtime_item_stream_head_blocks BEGIN SELECT RAISE(ABORT, 'external retry failure'); END",
      );
      expect(() => applyThreadRuntimeEventsNow(THREAD, [delta("a", " tail")])).toThrow(
        "external retry failure",
      );
      expect(durableStreamDigest()).toBe(external);
      expect(persistentHeads("a")).toEqual([]);
      sqlite.exec("DROP TRIGGER fail_external_append");
      applyThreadRuntimeEventsNow(THREAD, [delta("a", " tail")]);
      expect(reads.filter((read) => read.seedUnits > 0)).toHaveLength(2);
      expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams).toEqual({
        assistant_text: "external tail",
        reasoning_text: "kept",
      });
      expect(persistentHeads("b")[0]?.head_chars).toBe(HEAD_CHARS);
      expect(retiredHintSchemaNames()).toEqual([]);
    } finally {
      other.close();
    }
  });

  it("restores seed suppression, blocks and tails on both savepoint and outer rollback", () => {
    initializeHeads("a", "b");
    const sqlite = getSqlite();
    const reads = observeStreamLookups();
    const before = durableStreamDigest();
    const heads = persistentHeads();
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec("SAVEPOINT fixture_savepoint");
    applyThreadRuntimeEventsNow(THREAD, [
      delta("a", "replacement", "assistant_text", true),
      delta("b", " nested"),
    ]);
    expect(persistentHeads("a")[0]).toMatchObject({
      seed_chars: 0,
      head_chars: "replacement".length,
    });
    expect(reads.every((read) => read.seedUnits === 0)).toBe(true);
    sqlite.exec("ROLLBACK TO fixture_savepoint");
    sqlite.exec("RELEASE fixture_savepoint");
    expect(durableStreamDigest()).toBe(before);
    expect(persistentHeads()).toEqual(heads);
    applyThreadRuntimeEventsNow(THREAD, [
      delta("a", "", "assistant_text", true),
      delta("a", "nested"),
    ]);
    expect(persistentHeads("a")[0]).toMatchObject({ seed_chars: 0, head_chars: "nested".length });
    sqlite.exec("ROLLBACK");
    expect(durableStreamDigest()).toBe(before);
    expect(persistentHeads()).toEqual(heads);
    const boundary = reads.length;
    applyThreadRuntimeEventsNow(THREAD, [delta("a", " fresh")]);
    expect(reads.slice(boundary).length).toBeGreaterThan(0);
    expect(
      reads.slice(boundary).every((read) => read.seedUnits === 0 && read.blobBytes === 0),
    ).toBe(true);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + " fresh",
    );
  });

  it("adds no main write lock or persistent metadata mutation to a nested missing-item read", () => {
    initializeHeads("a");
    const sqlite = getSqlite();
    const before = durableStreamDigest();
    sqlite.exec("BEGIN DEFERRED");
    applyThreadRuntimeEventsNow(THREAD, [delta("missing", "ignored")]);
    expect(durableStreamDigest()).toBe(before);
    const other = new Database(join(fixture.directory(), "state.sqlite"), {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    });
    try {
      other.pragma("busy_timeout = 0");
      expect(() => other.exec("BEGIN IMMEDIATE")).not.toThrow();
      other.exec("ROLLBACK");
    } finally {
      other.close();
      sqlite.exec("ROLLBACK");
    }
  });

  it("keeps durable heads across close/reopen and uses no seed or BLOB on a new cold writer", () => {
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "first")]);
    const heads = persistentHeads();
    closeDatabase();
    initDatabase(join(fixture.directory(), "state.sqlite"));
    expect(persistentHeads()).toEqual(heads);
    expect(retiredHintSchemaNames()).toEqual([]);
    const freshReads = observeStreamLookups();
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "second")]);
    expect(freshReads.length).toBeGreaterThan(0);
    expect(freshReads.every((read) => read.seedUnits === 0 && read.blobBytes === 0)).toBe(true);
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "third")]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + "firstsecondthird",
    );
    expect(persistentHeads()).toEqual(heads);
    expect(
      getSqlite()
        .prepare("SELECT name FROM main.sqlite_master WHERE name LIKE 'runtime_frozen_stream%'")
        .all(),
    ).toEqual([]);
  });
});
