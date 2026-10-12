import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { RuntimeEvent } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { join } from "node:path";
import { dbGetThreadRuntimeItemCommitted } from "./runtimeItemRead";
import {
  applyRuntimeEventBatchesNow,
  applyThreadRuntimeEventsNow,
  resetRuntimeItemsWriterCache,
} from "./runtimeItemsWriter";
import { HEAD_CHARS } from "./runtimeStreamCap";
import { RUNTIME_STREAM_HEAD_BLOCK_CHARS } from "./runtimeStreamHeadSchema";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import { applyLegacyStreamEvents } from "./RuntimeLegacyStreamWriter.testFixtures";
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

function observeRetiredHintSql(): string[] {
  const sqlite = getSqlite();
  const exec = sqlite.exec.bind(sqlite);
  const sql: string[] = [];
  const record = (statement: string) => {
    if (
      !statement.includes("sqlite_master") &&
      (statement.includes("runtime_frozen_stream") || statement.includes("data_version"))
    )
      sql.push(statement);
  };
  observeStreamLookups(record);
  vi.spyOn(sqlite, "exec").mockImplementation((statement) => {
    record(statement);
    return exec(statement);
  });
  return sql;
}

function failFirstColdHeadPrepare(): () => number {
  let attempts = 0;
  let fail = true;
  observeStreamLookups((sql, prepare) => {
    if (!sql.includes("FROM thread_runtime_item_stream_heads WHERE head_id = ?")) return;
    attempts += 1;
    if (fail) {
      fail = false;
      prepare("SELECT lifecycle_missing_column FROM thread_runtime_items");
    }
  });
  return () => attempts;
}

describe.skipIf(!sqliteAvailable)("persistent stream head lifecycle", () => {
  const fixture = installPersistentHeadWriterFixture();

  it("initializes cold growing streams without TEMP hints and keeps rich state/payload updates off the seed", () => {
    const sqlite = getSqlite();
    sqlite
      .prepare("UPDATE thread_runtime_items SET streams = ?")
      .run(JSON.stringify({ assistant_text: "cold", reasoning_text: "thinking" }));
    sqlite.exec(
      "CREATE TEMP TRIGGER reject_ordinary_seed_update BEFORE UPDATE OF streams ON main.thread_runtime_items BEGIN SELECT RAISE(ABORT, 'unexpected seed update'); END",
    );
    const hintSql = observeRetiredHintSql();
    for (let round = 0; round < 10; round += 1) {
      const itemId = "rich-" + round;
      const rich: RuntimeEvent[] = [
        {
          type: "item.started",
          threadId: THREAD,
          itemId,
          itemType: "tool_call",
          payload: { title: "work", detail: { round } },
        },
        {
          type: "item.updated",
          threadId: THREAD,
          itemId,
          payload: { result: { paths: ["src/file.ts"], round } },
        },
        { type: "item.completed", threadId: THREAD, itemId },
      ];
      expect(
        applyRuntimeEventBatchesNow([
          { threadId: THREAD, events: [delta("a", "short")] },
          { threadId: THREAD, events: rich },
          { threadId: THREAD, events: [delta("growing", "thought", "reasoning_text")] },
        ]),
      ).toEqual({ kind: "committed" });
    }
    expect(hintSql).toEqual([]);
    expect(retiredHintSchemaNames()).toEqual([]);
    expect(persistentHeads().map((head) => head.item_id)).toEqual(["a", "a", "growing", "growing"]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "cold" + "short".repeat(10),
    );
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "growing")?.streams.reasoning_text).toBe(
      "thinking" + "thought".repeat(10),
    );
  });

  it("publishes metadata in the first commit and uses a cold scalar-only path for frozen and closed growing heads", () => {
    const hintSql = observeRetiredHintSql();
    const reads = observeStreamLookups();
    expect(
      applyRuntimeEventBatchesNow([{ threadId: THREAD, events: [delta("a", "first")] }]),
    ).toEqual({ kind: "committed" });
    expect(persistentHeads("a")).toHaveLength(2);
    expect(reads.filter((read) => read.seedUnits > 0)).toHaveLength(1);
    const first = reads.length;
    resetRuntimeItemsWriterCache();
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "second")]);
    expect(reads.slice(first).length).toBeGreaterThan(0);
    expect(reads.slice(first).every((read) => read.seedUnits === 0 && read.blobBytes === 0)).toBe(
      true,
    );
    const sqlite = getSqlite();
    sqlite
      .prepare("UPDATE thread_runtime_items SET streams = '{}' WHERE item_id = 'growing'")
      .run();
    applyThreadRuntimeEventsNow(THREAD, [
      delta("growing", "q".repeat(RUNTIME_STREAM_HEAD_BLOCK_CHARS)),
    ]);
    expect(persistentHeads("growing")[0]).toMatchObject({
      next_seq: 1,
      open_seq: null,
      open_chars: 0,
    });
    resetRuntimeItemsWriterCache();
    const boundary = reads.length;
    applyThreadRuntimeEventsNow(THREAD, [delta("growing", "next")]);
    expect(reads.slice(boundary).length).toBeGreaterThan(0);
    expect(
      reads.slice(boundary).every((read) => read.seedUnits === 0 && read.blobBytes === 0),
    ).toBe(true);
    expect(hintSql).toEqual([]);
    expect(retiredHintSchemaNames()).toEqual([]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "growing")?.streams.assistant_text).toBe(
      "q".repeat(RUNTIME_STREAM_HEAD_BLOCK_CHARS) + "next",
    );
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + "firstsecond",
    );
  });

  it("indexes a frozen sibling when the requested stream grows and does not reload its seed later", () => {
    const reads = observeStreamLookups();
    applyThreadRuntimeEventsNow(THREAD, [delta("a", " growing", "reasoning_text")]);
    expect(persistentHeads("a").map((head) => head.head_chars)).toEqual([
      HEAD_CHARS,
      "unchanged Ω growing".length,
    ]);
    expect(reads.filter((read) => read.seedUnits > 0)).toHaveLength(1);
    const boundary = reads.length;
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "tail")]);
    expect(reads.slice(boundary).length).toBeGreaterThan(0);
    expect(
      reads.slice(boundary).every((read) => read.seedUnits === 0 && read.blobBytes === 0),
    ).toBe(true);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.reasoning_text).toBe(
      "unchanged Ω growing",
    );
  });

  it("keeps corrupted seed objects on the independent legacy path without indexing them", () => {
    const sqlite = getSqlite();
    const streams = JSON.stringify({ assistant_text: "a".repeat(HEAD_CHARS), reasoning_text: 23 });
    sqlite.prepare("UPDATE thread_runtime_items SET streams = ? WHERE item_id = 'a'").run(streams);
    const events = [delta("a", "")];
    sqlite.exec("BEGIN IMMEDIATE");
    applyLegacyStreamEvents(sqlite, THREAD, events);
    const expected = logicalStreamDigest();
    sqlite.exec("ROLLBACK");
    applyThreadRuntimeEventsNow(THREAD, events);
    expect(logicalStreamDigest()).toBe(expected);
    expect(persistentHeads("a")).toEqual([]);
    expect(
      sqlite.prepare("SELECT streams FROM thread_runtime_items WHERE item_id = 'a'").get(),
    ).toEqual({ streams });
    expect(retiredHintSchemaNames()).toEqual([]);
  });

  it("supports item keys beyond the retired hint cap through persistent integer block identities", () => {
    const sqlite = getSqlite();
    const itemId = "é".repeat(512);
    sqlite.prepare("UPDATE thread_runtime_items SET item_id = ? WHERE item_id = 'a'").run(itemId);
    const reads = observeStreamLookups();
    applyThreadRuntimeEventsNow(THREAD, [delta(itemId, "")]);
    expect(persistentHeads(itemId)).toHaveLength(2);
    const boundary = reads.length;
    applyThreadRuntimeEventsNow(THREAD, [delta(itemId, "tail")]);
    expect(reads.slice(boundary).length).toBeGreaterThan(0);
    expect(
      reads.slice(boundary).every((read) => read.seedUnits === 0 && read.blobBytes === 0),
    ).toBe(true);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, itemId)?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + "tail",
    );
  });

  it("rolls back earlier head initialization when a later atomic prefix fails and retries once", () => {
    const sqlite = getSqlite();
    sqlite.exec(
      "CREATE TEMP TRIGGER lifecycle_fail_tail BEFORE INSERT ON main.thread_runtime_item_stream_chunks WHEN NEW.text = 'FAIL' BEGIN SELECT RAISE(ABORT, 'lifecycle tail failure'); END",
    );
    const before = durableStreamDigest();
    const batches = [
      { threadId: THREAD, events: [delta("a", "eligible")] },
      { threadId: THREAD, events: [delta("b", "FAIL")] },
    ];
    expect(applyRuntimeEventBatchesNow(batches)).toMatchObject({ kind: "rolled-back" });
    expect(durableStreamDigest()).toBe(before);
    expect(persistentHeads()).toEqual([]);
    sqlite.exec("DROP TRIGGER lifecycle_fail_tail");
    expect(applyRuntimeEventBatchesNow(batches)).toEqual({ kind: "committed" });
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + "eligible",
    );
  });

  it("rolls back head blocks accepted by the body but rejected at outer COMMIT", () => {
    const sqlite = getSqlite();
    sqlite.exec(
      "CREATE TABLE lifecycle_parent (id INTEGER PRIMARY KEY); CREATE TABLE lifecycle_child (parent_id INTEGER REFERENCES lifecycle_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TEMP TRIGGER lifecycle_deferred_failure AFTER INSERT ON main.thread_runtime_item_stream_chunks WHEN NEW.text = 'commit-fail' BEGIN INSERT INTO lifecycle_child VALUES (999); END;",
    );
    const before = durableStreamDigest();
    const batches = [
      { threadId: THREAD, events: [delta("growing", "x"), delta("a", "commit-fail")] },
    ];
    expect(applyRuntimeEventBatchesNow(batches)).toMatchObject({
      kind: "rolled-back",
      error: expect.objectContaining({ code: "SQLITE_CONSTRAINT_FOREIGNKEY" }),
    });
    expect(durableStreamDigest()).toBe(before);
    expect(persistentHeads()).toEqual([]);
    sqlite.exec("DROP TRIGGER lifecycle_deferred_failure");
    expect(applyRuntimeEventBatchesNow(batches)).toEqual({ kind: "committed" });
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "growing")?.streams.assistant_text).toBe(
      "g".repeat(HEAD_CHARS - 1) + "x",
    );
  });

  it("preserves a previous committed receipt when a later cold head prepare fails and retries exactly", () => {
    expect(
      applyRuntimeEventBatchesNow([{ threadId: THREAD, events: [delta("a", "first")] }]),
    ).toEqual({ kind: "committed" });
    const committed = durableStreamDigest();
    closeDatabase();
    initDatabase(join(fixture.directory(), "state.sqlite"));
    const attempts = failFirstColdHeadPrepare();
    const current = [{ threadId: THREAD, events: [delta("a", "second")] }];
    expect(applyRuntimeEventBatchesNow(current)).toMatchObject({
      kind: "rolled-back",
      error: expect.objectContaining({ code: "SQLITE_ERROR" }),
    });
    expect(durableStreamDigest()).toBe(committed);
    expect(applyRuntimeEventBatchesNow(current)).toEqual({ kind: "committed" });
    expect(attempts()).toBe(2);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + "firstsecond",
    );
    expect(
      getSqlite()
        .prepare("SELECT next_seq FROM thread_runtime_item_stream_state WHERE item_id = 'a'")
        .get(),
    ).toEqual({ next_seq: 2 });
  });

  it("keeps nested metadata private until outer commit and restores it on outer rollback", () => {
    const sqlite = getSqlite();
    const other = new Database(join(fixture.directory(), "state.sqlite"), {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    });
    const visible = other.prepare("SELECT COUNT(*) AS n FROM thread_runtime_item_stream_heads");
    try {
      sqlite.exec("BEGIN IMMEDIATE");
      applyThreadRuntimeEventsNow(THREAD, [delta("a", "nested-commit")]);
      expect(persistentHeads("a")).toHaveLength(2);
      expect(visible.get()).toEqual({ n: 0 });
      sqlite.exec("COMMIT");
      expect(visible.get()).toEqual({ n: 2 });
      const before = durableStreamDigest();
      sqlite.exec("BEGIN IMMEDIATE");
      applyThreadRuntimeEventsNow(THREAD, [delta("a", "nested-rollback")]);
      sqlite.exec("ROLLBACK");
      expect(durableStreamDigest()).toBe(before);
    } finally {
      other.close();
    }
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + "nested-commit",
    );
    expect(retiredHintSchemaNames()).toEqual([]);
  });

  it("restores an initialized frozen head after nested replacement rollback before a top-level append", () => {
    const sqlite = getSqlite();
    initializeHeads("a");
    const before = durableStreamDigest();
    sqlite.exec("BEGIN IMMEDIATE");
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "replacement", "assistant_text", true)]);
    expect(persistentHeads("a")[0]).toMatchObject({
      seed_chars: 0,
      head_chars: "replacement".length,
    });
    sqlite.exec("ROLLBACK");
    expect(durableStreamDigest()).toBe(before);
    const reads = observeStreamLookups();
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "top-level")]);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((read) => read.seedUnits === 0 && read.blobBytes === 0)).toBe(true);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + "top-level",
    );
  });

  it("preserves standalone committed data across cold prepare failure and exact retry", () => {
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "first")]);
    const committed = durableStreamDigest();
    closeDatabase();
    initDatabase(join(fixture.directory(), "state.sqlite"));
    const attempts = failFirstColdHeadPrepare();
    expect(() => applyThreadRuntimeEventsNow(THREAD, [delta("a", "second")])).toThrow(
      /lifecycle_missing_column/,
    );
    expect(durableStreamDigest()).toBe(committed);
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "second")]);
    expect(attempts()).toBe(2);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + "firstsecond",
    );
  });

  it("retains authoritative metadata across statement-cache resets without seed or BLOB reload", () => {
    initializeHeads("a");
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "warm")]);
    const heads = persistentHeads();
    resetRuntimeItemsWriterCache();
    const reads = observeStreamLookups();
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "after-reset")]);
    resetRuntimeItemsWriterCache();
    applyThreadRuntimeEventsNow(THREAD, [delta("a", "fresh")]);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((read) => read.seedUnits === 0 && read.blobBytes === 0)).toBe(true);
    expect(persistentHeads()).toEqual(heads);
    expect(retiredHintSchemaNames()).toEqual([]);
    expect(dbGetThreadRuntimeItemCommitted(THREAD, "a")?.streams.assistant_text).toBe(
      "a".repeat(HEAD_CHARS) + "warmafter-resetfresh",
    );
  });
});
