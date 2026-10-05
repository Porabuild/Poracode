import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { LATEST_SCHEMA_VERSION } from "./migrations";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { dbDeleteThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbReadThreadRuntimeItems } from "./runtimeItems";
import { RuntimeWriteQueue } from "./runtimeWriteQueue";
import {
  RuntimePersistenceController,
  type RuntimePersistenceControllerOptions,
} from "./runtimePersistenceController";
import { RuntimePersistenceDrainIncompleteError } from "./runtimePersistenceTypes";
import {
  applyRuntimeEventBatchesNow,
  applyThreadRuntimeEventsNow,
  resetRuntimeItemsWriterCache,
} from "./runtimeItemsWriter";
import {
  applyRuntimeEvents,
  getRuntimePersistenceShutdownReport,
  resetRuntimePersistenceForTests,
  runtimePersistenceController,
} from "./runtimePersistenceRuntime";
import {
  delta,
  durableRuntimeRows,
  eventsWithUsage,
  installDeferredCommitFailure,
  started,
} from "./runtimePersistence.atomic.testFixtures";

const { sqlTrace } = vi.hoisted(() => ({ sqlTrace: [] as string[] }));
vi.mock("better-sqlite3", async (importOriginal) => {
  const original = await importOriginal<{ default: typeof Database }>();
  return {
    default: class extends original.default {
      constructor(...args: ConstructorParameters<typeof original.default>) {
        super(args[0], {
          ...args[1],
          verbose: (sql) => {
            sqlTrace.push(String(sql));
          },
        });
      }
    },
  };
});

const budget = { maxThreads: 4, maxBytes: 4 * 1024 * 1024, maxMs: 5 };

describe.skipIf(!sqliteAvailable)("commit-safe runtime batching (real SQLite)", () => {
  let dir: string;
  let dbPath: string;
  const controllers: RuntimePersistenceController[] = [];
  function controller(options: Partial<RuntimePersistenceControllerOptions> = {}) {
    const result = new RuntimePersistenceController({
      write: applyThreadRuntimeEventsNow,
      atomicBatchWriter: applyRuntimeEventBatchesNow,
      now: () => Date.now(),
      ...options,
    });
    controllers.push(result);
    return result;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
    dir = mkdtempSync(join(process.cwd(), "tmp", "runtime-atomic-test-"));
    dbPath = join(dir, "state.sqlite");
    initDatabase(dbPath);
    dbUpsertProject(
      {
        id: "project-1",
        name: "Atomic persistence",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00Z",
      },
      0,
    );
    for (const id of ["a", "b", "c", "d", "e"]) dbUpsertThread({ ...testThread(), id }, 0);
    resetRuntimePersistenceForTests();
    resetRuntimeItemsWriterCache();
    sqlTrace.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const c of controllers.splice(0)) c.stopTimers();
    const sqlite = getSqlite();
    if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
    sqlite.exec("DROP TRIGGER IF EXISTS atomic_test_failure");
    sqlite.pragma("query_only = OFF");
    closeDatabase();
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("rolls back the outer COMMIT with original prefixes, cursors, counters and ledger intact; retries exactly once", () => {
    let tailReached = 0;
    installDeferredCommitFailure(() => {
      tailReached++;
    });
    let flushClock = 0;
    const queue = new RuntimeWriteQueue(
      applyThreadRuntimeEventsNow,
      {},
      () => 0,
      (batches) => {
        const result = applyRuntimeEventBatchesNow(batches);
        expect(result).toMatchObject({
          kind: "rolled-back",
          error: { code: "SQLITE_CONSTRAINT_FOREIGNKEY" },
        });
        expect(tailReached).toBe(2); // BOTH bodies and their ledger savepoints finished.
        expect(getSqlite().inTransaction).toBe(false);
        flushClock += 5; // Exercise deferred sequential recovery, without same-cycle fallback.
        return result;
      },
    );
    for (const id of ["a", "b"]) queue.enqueue(id, eventsWithUsage(id));
    const pin = queue.pinThread("a");
    queue.enqueue("a", [delta("a", ":newer")]);
    const beforeQueue = queue.stats();
    const beforeRows = durableRuntimeRows();
    sqlTrace.length = 0;
    expect(queue.flushBudgeted({ ...budget, now: () => flushClock }).failure).not.toBeNull();
    expect(sqlTrace.filter((sql) => sql === "COMMIT")).toHaveLength(1);
    expect(sqlTrace.filter((sql) => sql === "ROLLBACK")).toHaveLength(1);
    expect(queue.stats()).toEqual(beforeQueue);
    expect(queue.committedThrough("a")).toBe(0);
    expect(queue.committedThrough("b")).toBe(0);
    expect(queue.pinnedThrough("a")).toBe(pin);
    expect(durableRuntimeRows()).toEqual(beforeRows);

    getSqlite().exec("DROP TRIGGER atomic_test_failure");
    expect(queue.flushBudgeted({ ...budget, now: () => flushClock })).toMatchObject({
      failure: null,
      committedEvents: 14,
      remainingThreads: 1,
    });
    expect(queue.committedThrough("a")).toBe(pin);
    expect(dbReadThreadRuntimeItems("a")[0]?.streams.assistant_text).toBe(
      "x".repeat(40_000) + ":tail",
    );
    queue.releasePin("a");
    expect(queue.flushThread("a").kind).toBe("committed");
    expect(dbReadThreadRuntimeItems("a")[0]?.streams.assistant_text).toBe(
      "x".repeat(40_000) + ":tail:newer",
    );
    expect(dbReadThreadRuntimeItems("b")[0]?.state).toBe("completed");
    expect(getSqlite().prepare("SELECT value FROM usage_events ORDER BY id").all()).toEqual([
      { value: 100 },
      { value: 19 },
      { value: 100 },
      { value: 19 },
    ]);
    // Replay usage samples only: cumulative and per-call dedupe still hold.
    expect(
      applyRuntimeEventBatchesNow(
        ["a", "b"].map((threadId) => ({
          threadId,
          events: eventsWithUsage(threadId).filter((e) => e.type === "usage.spent"),
        })),
      ),
    ).toEqual({ kind: "committed" });
    expect(getSqlite().prepare("SELECT COUNT(*) AS count FROM usage_events").get()).toEqual({
      count: 4,
    });
    expect(getSqlite().pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("uses one COMMIT and one timeout scope for four threads, reusing connection-local setup", () => {
    const prepare = vi.spyOn(getSqlite(), "prepare");
    const transaction = vi.spyOn(getSqlite(), "transaction");
    const queue = new RuntimeWriteQueue(
      applyThreadRuntimeEventsNow,
      {},
      () => 0,
      applyRuntimeEventBatchesNow,
    );
    for (const id of ["a", "b", "c", "d"])
      queue.enqueue(id, [started(id), delta(id, "one"), delta(id, "two")]);
    const flush = () => queue.flushBudgeted({ ...budget, now: () => 0 });
    expect(flush()).toMatchObject({ flushedThreads: 4, committedEvents: 12 });
    expect(sqlTrace.filter((sql) => sql === "BEGIN IMMEDIATE")).toHaveLength(1);
    expect(sqlTrace.filter((sql) => sql === "COMMIT")).toHaveLength(1);
    expect(sqlTrace.some((sql) => sql.startsWith("SAVEPOINT"))).toBe(false);
    expect(sqlTrace.filter((sql) => sql.startsWith("PRAGMA busy_timeout"))).toHaveLength(3);
    for (const id of ["a", "b", "c", "d"])
      expect(dbReadThreadRuntimeItems(id)[0]?.streams.assistant_text).toBe("onetwo");
    transaction.mockClear();
    sqlTrace.length = 0;
    for (const id of ["a", "b", "c", "d"]) queue.enqueue(id, [delta(id, "three")]);
    expect(flush().flushedThreads).toBe(4);
    expect(transaction).not.toHaveBeenCalled();
    expect(
      prepare.mock.calls.filter(([sql]) => sql === "SELECT 1 FROM threads WHERE id = ?"),
    ).toHaveLength(1);
    expect(sqlTrace.filter((sql) => sql === "COMMIT")).toHaveLength(1);
  });

  it("retains fence unreadiness after COMMIT failure and reads only the pinned prefix after recovery", async () => {
    installDeferredCommitFailure(() => undefined);
    const c = controller({
      atomicBatchWriter: (batches) => {
        const result = applyRuntimeEventBatchesNow(batches);
        vi.setSystemTime(Date.now() + 5);
        return result;
      },
    });
    c.admit("a", eventsWithUsage("a"));
    c.admit("b", eventsWithUsage("b"));
    const token = c.beginFence("a");
    c.admit("a", [delta("a", ":later")]);
    vi.advanceTimersByTime(250);
    expect(c.sample()).toMatchObject({
      pendingEvents: 15,
      committedThroughPersistSeq: 0,
      coalescedInputBytes: 0,
      coalescedOutputBytes: 0,
      flushSuccesses: 0,
      flushFailuresStorage: 1,
    });
    expect(token.ready).not.toBe(true);
    const read = vi.fn<() => ReturnType<typeof dbReadThreadRuntimeItems>>(() =>
      dbReadThreadRuntimeItems("a"),
    );
    expect(() => c.readFenced(token, read)).toThrow(/fence/i);
    expect(read).not.toHaveBeenCalled();
    getSqlite().exec("DROP TRIGGER atomic_test_failure");
    expect((await c.flushFence(token)).kind).toBe("committed");
    expect(c.readFenced(token, read)[0]?.streams.assistant_text).toBe("x".repeat(40_000) + ":tail");
    expect(c.pendingStats().events).toBe(8);
    c.releaseFence(token);
    expect(c.commitThreadPrefixSync("a")).toBeGreaterThan(token.throughPersistSeq);
    expect(c.shutdown().kind).toBe("drained");
  });

  it("classifies statement failure after rollback and commits only the healthy older fallback prefix", () => {
    getSqlite().exec(`CREATE TRIGGER atomic_test_failure BEFORE INSERT ON thread_runtime_items
      WHEN NEW.thread_id = 'b' BEGIN SELECT RAISE(ABORT, 'broken thread'); END;`);
    const failure = vi.fn<NonNullable<RuntimePersistenceControllerOptions["onFailure"]>>();
    const c = controller({ onFailure: failure });
    for (const id of ["a", "b", "c"]) c.admit(id, [started(id), delta(id, "once")]);
    vi.advanceTimersByTime(250);
    expect(failure).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "SQLITE_CONSTRAINT_TRIGGER" }),
      "storage",
      "b",
    );
    expect(c.sample()).toMatchObject({
      state: "degraded",
      pendingEvents: 4,
      flushFailuresStorage: 1,
    });
    expect(dbReadThreadRuntimeItems("a")[0]?.streams.assistant_text).toBe("once");
    expect(dbReadThreadRuntimeItems("b")).toEqual([]);
    expect(dbReadThreadRuntimeItems("c")).toEqual([]);
    getSqlite().exec("DROP TRIGGER atomic_test_failure");
    expect(c.shutdown().kind).toBe("drained");
    for (const id of ["a", "b", "c"])
      expect(dbReadThreadRuntimeItems(id)[0]?.streams.assistant_text).toBe("once");
  });

  it("classifies real BUSY and READONLY batch failures without acknowledging either thread", () => {
    const c = controller();
    for (const id of ["a", "b"]) c.admit(id, [started(id)]);
    const blocker = new Database(dbPath);
    blocker.exec("BEGIN IMMEDIATE");
    try {
      vi.advanceTimersByTime(250);
      expect(c.sample()).toMatchObject({
        pendingEvents: 2,
        committedThroughPersistSeq: 0,
        flushFailuresRetryable: 1,
      });
    } finally {
      blocker.exec("ROLLBACK");
      blocker.close();
    }
    getSqlite().pragma("query_only = ON");
    expect(c.shutdown()).toMatchObject({
      kind: "incomplete",
      errorClass: "storage",
      pendingEvents: 2,
    });
    getSqlite().pragma("query_only = OFF");
    expect(c.shutdown().kind).toBe("drained");
  });

  it("notifies health recovery only after an independent reader can see every committed thread", () => {
    const reader = new Database(dbPath, { readonly: true });
    const notifications: string[] = [];
    const c = controller({
      recoverAfterMs: 0,
      onStateChange: (info) => {
        if (info.state !== "healthy") return;
        expect(getSqlite().inTransaction).toBe(false);
        expect(
          reader.prepare("SELECT thread_id FROM thread_runtime_items ORDER BY thread_id").all(),
        ).toEqual([{ thread_id: "a" }, { thread_id: "b" }]);
        expect(c.sample().pendingEvents).toBe(0);
        notifications.push(info.state);
      },
    });
    getSqlite().pragma("query_only = ON");
    c.runControlWrite(() => getSqlite().prepare("UPDATE threads SET title = 'denied'").run());
    getSqlite().pragma("query_only = OFF");
    for (const id of ["a", "b"]) c.admit(id, [started(id)]);
    try {
      vi.advanceTimersByTime(1000);
      expect(notifications).toEqual(["healthy"]);
    } finally {
      reader.close();
    }
  });

  it("refuses nesting and does not replay a successful commit when timeout cleanup throws", () => {
    const batches = ["a", "b"].map((threadId) => ({
      threadId,
      events: [started(threadId), delta(threadId, "once")],
    }));
    getSqlite().exec("BEGIN IMMEDIATE");
    expect(() => applyRuntimeEventBatchesNow(batches)).toThrow(/outer SQLite/);
    expect(getSqlite().inTransaction).toBe(true);
    expect(dbReadThreadRuntimeItems("a")).toEqual([]);
    getSqlite().exec("ROLLBACK");
    const sqlite = getSqlite();
    const pragma = sqlite.pragma.bind(sqlite);
    vi.spyOn(sqlite, "pragma").mockImplementation((source, options) => {
      if (source === "busy_timeout = 5000") throw new Error("restore failed after COMMIT");
      return pragma(source, options);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const queue = new RuntimeWriteQueue(
      applyThreadRuntimeEventsNow,
      {},
      () => 0,
      applyRuntimeEventBatchesNow,
    );
    for (const batch of batches) queue.enqueue(batch.threadId, batch.events);
    expect(queue.flushBudgeted({ ...budget, now: () => 0 })).toMatchObject({
      committedEvents: 4,
      failure: null,
    });
    expect(queue.hasPending()).toBe(false);
    expect(log).toHaveBeenCalledOnce();
    for (const id of ["a", "b"])
      expect(dbReadThreadRuntimeItems(id)[0]?.streams.assistant_text).toBe("once");
    pragma("busy_timeout = 5000");
    pragma("query_only = ON");
    expect(applyRuntimeEventBatchesNow(batches)).toMatchObject({
      kind: "rolled-back",
      error: { code: "SQLITE_READONLY" },
    });
    expect(sqlite.inTransaction).toBe(false);
  });

  it("preserves close custody on commit failure, then joins and reopens with fresh writer caches", () => {
    installDeferredCommitFailure(() => undefined);
    for (const id of ["a", "b"])
      expect(applyRuntimeEvents(id, eventsWithUsage(id)).kind).toBe("accepted");
    const sqlite = getSqlite();
    const token = runtimePersistenceController.beginFence("a");
    expect(() => closeDatabase()).toThrow(RuntimePersistenceDrainIncompleteError);
    expect(sqlite.open).toBe(true);
    expect(token.released).toBe(true);
    expect(getRuntimePersistenceShutdownReport()).toMatchObject({
      kind: "incomplete",
      pendingEvents: 14,
    });
    expect(sqlite.prepare("SELECT armed FROM runtime_persistence_epoch").get()).toEqual({
      armed: 1,
    });
    expect(
      sqlite.prepare("SELECT thread_id FROM thread_runtime_epoch_touches ORDER BY thread_id").all(),
    ).toEqual([{ thread_id: "a" }, { thread_id: "b" }]);
    expect(durableRuntimeRows().every((rows) => rows.length === 0)).toBe(true);
    sqlite.exec("DROP TRIGGER atomic_test_failure");
    closeDatabase();
    expect(sqlite.open).toBe(false);
    initDatabase(dbPath, { schemaMode: "validate" });
    expect(
      getSqlite().prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get(),
    ).toEqual({ value: String(LATEST_SCHEMA_VERSION) });
    for (const id of ["a", "b"])
      expect(dbReadThreadRuntimeItems(id)[0]?.streams.assistant_text).toBe(
        "x".repeat(40_000) + ":tail",
      );
    // Deletion invalidates existence decisions; a later reuse must be writable.
    dbDeleteThread("b");
    expect(
      applyRuntimeEventBatchesNow([
        { threadId: "b", events: eventsWithUsage("b") },
        { threadId: "a", events: [delta("a", ":again")] },
      ]),
    ).toEqual({ kind: "committed" });
    expect(dbReadThreadRuntimeItems("b")).toEqual([]);
    dbUpsertThread({ ...testThread(), id: "b" }, 0);
    expect(
      applyRuntimeEventBatchesNow([
        { threadId: "b", events: [started("b"), delta("b", "reused")] },
        { threadId: "a", events: [delta("a", ":last")] },
      ]),
    ).toEqual({ kind: "committed" });
    expect(dbReadThreadRuntimeItems("b")[0]?.streams.assistant_text).toBe("reused");
    expect(dbReadThreadRuntimeItems("a")[0]?.streams.assistant_text).toBe(
      "x".repeat(40_000) + ":tail:again:last",
    );
  });
});
