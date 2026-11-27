import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbDeleteThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  nativeBindingEnv,
  sqliteAvailable,
  testThread,
  removeReviewScopeFixtureSchema,
  removeCostSchemaForDowngrade,
  removeConversationSearchFixtureSchema,
} from "./runtimeItems.testFixtures";
import { resetRuntimePersistenceForTests } from "./runtimePersistenceRuntime";
import { withRuntimeBusyTimeout } from "./runtimeBusyTimeout";
import { dbMeasureLegacyHistoryCharge } from "./legacyReadCharge";
import {
  dbAppendThreadTerminalOutput,
  dbClearThreadTerminalScrollback,
  dbGetThreadTerminalScrollbackRecord,
} from "./terminalScrollback";
import { MAX_TERMINAL_COLUMN_CHANGES } from "@/shared/terminalColumnHistory";
import {
  MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS,
  TERMINAL_SCROLLBACK_CHUNK_CHARS,
} from "./terminalScrollbackStore";

if (!sqliteAvailable) throw new Error("Terminal persistence regression tests require real SQLite.");
let dir: string;
let path: string;
beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  dir = mkdtempSync(join(tmpdir(), "terminal-scrollback-"));
  path = join(dir, "state.sqlite");
  initDatabase(path);
  dbUpsertProject(
    {
      id: "project-1",
      name: "Test",
      location: { kind: "posix", path: "/tmp/project" },
      createdAt: "2026-01-01T00:00:00Z",
    },
    0,
  );
  dbUpsertThread(testThread(), 0);
});
afterEach(() => {
  resetRuntimePersistenceForTests();
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});
const id = "thread-1";
const read = () => dbGetThreadTerminalScrollbackRecord(id);

describe("bounded durable terminal chunks", () => {
  it("preserves schema-51 transcripts on upgrade, converts once on append, and survives reopen", () => {
    const legacyText = "old\u0000 scrollback 😀 日本語";
    getSqlite()
      .prepare(
        "INSERT INTO thread_terminal_scrollback(thread_id, transcript, output_length) VALUES (?, ?, ?)",
      )
      .run(id, legacyText, legacyText.length);
    removeReviewScopeFixtureSchema(getSqlite());
    removeConversationSearchFixtureSchema(getSqlite());
    removeCostSchemaForDowngrade(getSqlite());
    getSqlite().exec(`DROP TABLE thread_terminal_scrollback_chunks;
      ALTER TABLE thread_terminal_scrollback DROP COLUMN chunked;
      ALTER TABLE thread_terminal_scrollback DROP COLUMN stored_chars;
      ALTER TABLE thread_terminal_scrollback DROP COLUMN next_seq;
      UPDATE app_state SET value = '51' WHERE key = 'schema_version';`);
    closeDatabase();
    expect(() => initDatabase(path, { schemaMode: "validate" })).toThrow(/schema is incomplete/);
    closeDatabase();
    initDatabase(path);
    expect(read()).toEqual({ transcript: legacyText, outputLength: legacyText.length });
    dbAppendThreadTerminalOutput(id, " next", legacyText.length + 5);
    expect(
      getSqlite()
        .prepare("SELECT transcript, chunked FROM thread_terminal_scrollback WHERE thread_id = ?")
        .get(id),
    ).toEqual({ transcript: "", chunked: 1 });
    closeDatabase();
    initDatabase(path, { schemaMode: "validate" });
    expect(read()).toEqual({
      transcript: legacyText + " next",
      outputLength: legacyText.length + 5,
    });
  });
  it("preserves UTF-16 cursor text across surrogate halves, chunk edges and the exact retention edge", () => {
    let all = "x".repeat(TERMINAL_SCROLLBACK_CHUNK_CHARS - 1) + "\ud83d";
    dbAppendThreadTerminalOutput(id, all, all.length);
    dbAppendThreadTerminalOutput(id, "\ude00\u0000日本語", all.length + 5);
    all += "\ude00\u0000日本語";
    expect(read()).toEqual({ transcript: all, outputLength: all.length });
    const tail = "\ude00\u0000日本語" + "😀".repeat(105_000);
    all += tail;
    dbAppendThreadTerminalOutput(id, tail, all.length);
    expect(read()).toEqual({
      transcript: all.slice(-MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS),
      outputLength: all.length,
    });
    dbAppendThreadTerminalOutput(id, "a", all.length + 1);
    expect(read()?.transcript).toBe((all + "a").slice(-MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS));
  });
  it("bounds retained rows and bytes even with tiny appends, and never rewrites a full transcript", () => {
    const initial = "x".repeat(MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS);
    dbAppendThreadTerminalOutput(id, initial, initial.length);
    getSqlite()
      .exec(`CREATE TRIGGER reject_transcript_rewrite BEFORE UPDATE OF transcript ON thread_terminal_scrollback
      WHEN NEW.transcript != '' BEGIN SELECT RAISE(ABORT, 'full transcript rewrite'); END;`);
    for (let i = 1; i <= 1000; i++) dbAppendThreadTerminalOutput(id, "a", initial.length + i);
    expect(read()).toEqual({
      transcript: "x".repeat(initial.length - 1000) + "a".repeat(1000),
      outputLength: initial.length + 1000,
    });
    const totals = getSqlite()
      .prepare(
        "SELECT COUNT(*) AS rows, SUM(chars) AS chars, MAX(length(data)) AS maxBytes FROM thread_terminal_scrollback_chunks WHERE thread_id = ?",
      )
      .get(id) as { rows: number; chars: number; maxBytes: number };
    expect(totals.rows).toBeLessThanOrEqual(
      Math.ceil(MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS / TERMINAL_SCROLLBACK_CHUNK_CHARS) + 1,
    );
    expect(totals.chars).toBeLessThan(
      MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS + TERMINAL_SCROLLBACK_CHUNK_CHARS,
    );
    expect(totals.maxBytes).toBeLessThanOrEqual(2 * TERMINAL_SCROLLBACK_CHUNK_CHARS);
    expect(dbMeasureLegacyHistoryCharge(id).scrollbackStoredBytes).toBe(totals.chars * 2);
    expect(dbMeasureLegacyHistoryCharge(id, { omitScrollback: true }).scrollbackStoredBytes).toBe(
      0,
    );
  });
  it("rolls chunks, retention and cursor back together on failure and safely retries", () => {
    dbAppendThreadTerminalOutput(id, "old", 3);
    getSqlite().exec(`CREATE TRIGGER reject_cursor BEFORE UPDATE ON thread_terminal_scrollback
      BEGIN SELECT RAISE(ABORT, 'storage failure'); END;`);
    expect(() => dbAppendThreadTerminalOutput(id, "new", 6)).toThrow("storage failure");
    expect(read()).toEqual({ transcript: "old", outputLength: 3 });
    getSqlite().exec("DROP TRIGGER reject_cursor");
    dbAppendThreadTerminalOutput(id, "new", 6);
    expect(read()).toEqual({ transcript: "oldnew", outputLength: 6 });
  });
  it("rolls legacy conversion back without destroying the pre-upgrade transcript", () => {
    getSqlite()
      .prepare(
        "INSERT INTO thread_terminal_scrollback(thread_id, transcript, output_length) VALUES (?, ?, ?)",
      )
      .run(id, "legacy😀", 8);
    getSqlite().exec(`CREATE TRIGGER reject_conversion BEFORE UPDATE ON thread_terminal_scrollback
      BEGIN SELECT RAISE(ABORT, 'conversion failure'); END;`);
    expect(() => dbAppendThreadTerminalOutput(id, "new", 11)).toThrow("conversion failure");
    expect(read()).toEqual({ transcript: "legacy😀", outputLength: 8 });
    expect(
      getSqlite().prepare("SELECT COUNT(*) AS n FROM thread_terminal_scrollback_chunks").get(),
    ).toEqual({ n: 0 });
    getSqlite().exec("DROP TRIGGER reject_conversion");
    dbAppendThreadTerminalOutput(id, "new", 11);
    expect(read()).toEqual({ transcript: "legacy😀new", outputLength: 11 });
  });

  it("restores pruned chunks when a later metadata write aborts the append", () => {
    const original = "x".repeat(MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS);
    dbAppendThreadTerminalOutput(id, original, original.length);
    const chunks = () =>
      getSqlite()
        .prepare("SELECT seq, chars, data FROM thread_terminal_scrollback_chunks ORDER BY seq")
        .all();
    const before = chunks();
    getSqlite().exec(`CREATE TRIGGER reject_after_prune BEFORE UPDATE ON thread_terminal_scrollback
      BEGIN SELECT RAISE(ABORT, 'pruning failure'); END;`);
    const appended = "a".repeat(2 * TERMINAL_SCROLLBACK_CHUNK_CHARS);
    expect(() =>
      dbAppendThreadTerminalOutput(id, appended, original.length + appended.length),
    ).toThrow("pruning failure");
    expect(chunks()).toEqual(before);
    expect(read()).toEqual({ transcript: original, outputLength: original.length });
    getSqlite().exec("DROP TRIGGER reject_after_prune");
    dbAppendThreadTerminalOutput(id, appended, original.length + appended.length);
    expect(read()?.transcript).toBe(
      (original + appended).slice(-MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS),
    );
  });

  it("yields a writer lock immediately and restores the connection timeout", () => {
    const other = new Database(path, {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    });
    try {
      other.exec("BEGIN IMMEDIATE");
      const started = performance.now();
      expect(() => dbAppendThreadTerminalOutput(id, "new", 3)).toThrow(/locked/);
      expect(performance.now() - started).toBeLessThan(500);
      expect(getSqlite().pragma("busy_timeout", { simple: true })).toBe(5000);
      expect(read()).toBeNull();
      other.exec("ROLLBACK");
      dbAppendThreadTerminalOutput(id, "new", 3);
      expect(read()?.transcript).toBe("new");
    } finally {
      if (other.inTransaction) other.exec("ROLLBACK");
      other.close();
    }
  });

  it("preserves nondefault and nested timeouts even when a scoped operation fails", () => {
    const sqlite = getSqlite();
    sqlite.pragma("busy_timeout = 777");
    expect(() =>
      withRuntimeBusyTimeout(() => {
        expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(0);
        withRuntimeBusyTimeout(
          () => expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(200),
          200,
        );
        expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(0);
        withRuntimeBusyTimeout(() =>
          expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(0),
        );
        throw new Error("write failed");
      }),
    ).toThrow("write failed");
    expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(777);
  });
  it("replaces a restarted cursor, cascades clear/delete, and ignores late output for deleted threads", () => {
    dbAppendThreadTerminalOutput(id, "old generation", 14);
    dbAppendThreadTerminalOutput(id, "new", 3);
    expect(read()).toEqual({ transcript: "new", outputLength: 3 });
    dbClearThreadTerminalScrollback(id);
    expect(read()).toBeNull();
    dbAppendThreadTerminalOutput(id, "next", 4);
    dbDeleteThread(id);
    dbAppendThreadTerminalOutput(id, "late", 8);
    expect(read()).toBeNull();
    expect(
      getSqlite().prepare("SELECT COUNT(*) AS n FROM thread_terminal_scrollback_chunks").get(),
    ).toEqual({ n: 0 });
  });
});

describe("durable terminal column history", () => {
  const chunkRows = () =>
    getSqlite()
      .prepare(
        "SELECT seq, chars, hex(data) AS data FROM thread_terminal_scrollback_chunks WHERE thread_id = ? ORDER BY seq",
      )
      .all(id);

  it("migrates a real schema-79 scrollback row to v80 with identical raw bytes", () => {
    const legacyText = "width-48 scrollback 🌐 日本語";
    dbAppendThreadTerminalOutput(id, legacyText, legacyText.length);
    const chunksBefore = chunkRows();
    expect(chunksBefore.length).toBeGreaterThan(0);
    // Rewind to the exact pre-80 shape a released v79 database carries.
    getSqlite().exec(`ALTER TABLE thread_terminal_scrollback DROP COLUMN column_changes;
      UPDATE app_state SET value = '79' WHERE key = 'schema_version';`);
    closeDatabase();
    expect(() => initDatabase(path, { schemaMode: "validate" })).toThrow(/schema is incomplete/);
    closeDatabase();
    initDatabase(path);
    expect(read()).toEqual({ transcript: legacyText, outputLength: legacyText.length });
    expect(chunkRows()).toEqual(chunksBefore);
    expect(
      getSqlite()
        .prepare("SELECT column_changes FROM thread_terminal_scrollback WHERE thread_id = ?")
        .get(id),
    ).toEqual({ column_changes: null });
    // The migrated row keeps accepting appends; old bytes stay unknown-width.
    dbAppendThreadTerminalOutput(id, "!", legacyText.length + 1, [
      { fromCursor: legacyText.length, columns: 100 },
    ]);
    expect(read()?.columnChanges).toEqual([
      { fromCursor: 0, columns: null },
      { fromCursor: legacyText.length, columns: 100 },
    ]);
  });

  it("merges, reopens, clips to retention and resets multi-width geometry", () => {
    const head = "prompt$ ";
    const middle = "x".repeat(400);
    const tail = "y".repeat(200);
    const resizeAt = head.length + middle.length;
    const all = head + middle + tail;
    const expected = [
      { fromCursor: 0, columns: 48 },
      { fromCursor: resizeAt, columns: 100 },
    ];
    dbAppendThreadTerminalOutput(id, all, all.length, [
      { fromCursor: 0, columns: 48 },
      { fromCursor: resizeAt, columns: 100 },
    ]);
    expect(read()?.columnChanges).toEqual(expected);
    // Reopen: persisted {toCursor, changes} validates against stored outputLength.
    closeDatabase();
    initDatabase(path);
    expect(read()?.columnChanges).toEqual(expected);
    // A contiguous append at the same width merges into the retained window.
    dbAppendThreadTerminalOutput(id, "more", all.length + 4, [
      { fromCursor: all.length, columns: 100 },
    ]);
    expect(read()?.columnChanges).toEqual(expected);
    // Pruning to the 200k raw retention clips geometry to the same window.
    const fill = "z".repeat(MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS);
    const outputLength = all.length + 4 + fill.length;
    dbAppendThreadTerminalOutput(id, fill, outputLength, [
      { fromCursor: all.length + 4, columns: 100 },
    ]);
    const retained = read();
    expect(retained?.transcript).toBe(fill);
    expect(retained?.outputLength).toBe(outputLength);
    expect(retained?.columnChanges).toEqual([
      { fromCursor: outputLength - MAX_PERSISTED_TERMINAL_SCROLLBACK_CHARS, columns: 100 },
    ]);
    // A discontinuity replaces the row and discards stale geometry entirely.
    dbAppendThreadTerminalOutput(id, "fresh", 5);
    expect(read()).toEqual({ transcript: "fresh", outputLength: 5 });
  });

  it("retains the full known-span budget across alternating known and unknown widths", () => {
    // 2051 one-unit markers alternating known/unknown would exhaust the
    // 1024-span history if unknown gaps counted as spans. recordChanges
    // stores only known widths, so the last 1024 known spans survive intact.
    const data = "x".repeat(2051);
    const markers = Array.from({ length: data.length }, (_, fromCursor) => ({
      fromCursor,
      columns: fromCursor % 2 === 0 ? 48 : null,
    }));
    dbAppendThreadTerminalOutput(id, data, data.length, markers);
    const record = read();
    expect(record?.transcript).toBe(data);
    expect(record?.outputLength).toBe(data.length);
    const changes = record?.columnChanges ?? [];
    expect(changes.length).toBeLessThanOrEqual(MAX_TERMINAL_COLUMN_CHANGES);
    const known = changes.filter((change) => change.columns !== null);
    expect(known).toHaveLength(1024);
    expect(known[0]).toEqual({ fromCursor: 4, columns: 48 });
    expect(known.at(-1)).toEqual({ fromCursor: 2050, columns: 48 });
  });

  it("discards malformed or stale column metadata without affecting raw reads", () => {
    dbAppendThreadTerminalOutput(id, "known", 5, [{ fromCursor: 0, columns: 48 }]);
    expect(read()?.columnChanges).toEqual([{ fromCursor: 0, columns: 48 }]);
    const setGeometry = (value: string | null) =>
      getSqlite()
        .prepare("UPDATE thread_terminal_scrollback SET column_changes = ? WHERE thread_id = ?")
        .run(value, id);
    for (const stale of [
      "not-json{",
      JSON.stringify({ toCursor: 99, changes: [{ fromCursor: 0, columns: 48 }] }),
      JSON.stringify({ toCursor: 5, changes: [{ fromCursor: 0, columns: 999 }] }),
      JSON.stringify({ toCursor: 5, changes: [{ fromCursor: 42, columns: 48 }] }),
      JSON.stringify({
        toCursor: 5,
        changes: Array.from({ length: MAX_TERMINAL_COLUMN_CHANGES + 1 }, () => ({
          fromCursor: 0,
          columns: 48,
        })),
      }),
    ]) {
      setGeometry(stale);
      expect(read()).toEqual({ transcript: "known", outputLength: 5 });
    }
    // The next contiguous append treats stale metadata as absent: old bytes
    // read as unknown width and only the supplied span is recorded.
    dbAppendThreadTerminalOutput(id, "!", 6, [{ fromCursor: 5, columns: 100 }]);
    expect(read()).toEqual({
      transcript: "known!",
      outputLength: 6,
      columnChanges: [
        { fromCursor: 0, columns: null },
        { fromCursor: 5, columns: 100 },
      ],
    });
  });
});
