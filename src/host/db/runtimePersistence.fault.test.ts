import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetThreadRuntimeItems,
  dbHasPendingThreadRuntimeWrites,
  dbReplaceThreadRuntimeSnapshot,
  dbTruncateThreadRuntimeAfter,
} from "./runtimeItems";
import {
  getRuntimeDurableGapPendingThreadIds,
  getRuntimePersistenceShutdownReport,
  getRuntimePersistenceState,
  runtimePersistenceController,
} from "./runtimePersistenceRuntime";
import {
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
  RuntimePersistenceDurableGapPendingError,
} from "./runtimePersistenceTypes";

const THREAD_ID = "thread-1";

function delta(text: string, itemId = "a"): RuntimeEvent {
  return {
    type: "content.delta",
    threadId: THREAD_ID,
    itemId,
    stream: "command_output",
    delta: text,
  } as RuntimeEvent;
}

function started(itemId: string): RuntimeEvent {
  return {
    type: "item.started",
    threadId: THREAD_ID,
    itemId,
    itemType: "command_execution",
  } as RuntimeEvent;
}

let usageSeq = 0;
function cumulativeUsage(counter: number, scopeId = "scope-1"): RuntimeEvent {
  usageSeq += 1;
  return {
    type: "usage.spent",
    threadId: THREAD_ID,
    usage: {
      counterKind: "cumulative",
      scopeId,
      epoch: 0,
      sampleId: `sample-${usageSeq}`,
      counter,
      fresh: true,
    },
  } as RuntimeEvent;
}

function perCallUsage(counter: number, sampleId: string): RuntimeEvent {
  return {
    type: "usage.spent",
    threadId: THREAD_ID,
    usage: { counterKind: "per-call", sampleId, counter },
  } as RuntimeEvent;
}

function tokenRows(): Array<{ kind: string; value: number }> {
  return getSqlite().prepare("SELECT kind, value FROM usage_events ORDER BY id").all() as Array<{
    kind: string;
    value: number;
  }>;
}

describe.skipIf(!sqliteAvailable)("runtime persistence fault handling (real SQLite)", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-runtime-fault-test-"));
    dbPath = join(dir, "state.sqlite");
    initDatabase(dbPath);
    dbUpsertProject(
      {
        id: "project-1",
        name: "Fault project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
  });

  afterEach(() => {
    const sqlite = getSqlite();
    sqlite.pragma("query_only = OFF");
    sqlite.pragma("max_page_count = 1073741823");
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("retries a real SQLITE_BUSY and preserves per-thread order after the boot armed", async () => {
    // B1 arm-before-accept: the durable epoch arm and the per-thread touch are
    // mandatory writes that precede the first accepted event. Prime the boot
    // and this thread while storage is writable, then exercise the queue's
    // bounded retry under real write-lock contention.
    dbApplyThreadRuntimeEvents(THREAD_ID, [started("a")]);
    await dbFlushThreadRuntimeWrites(THREAD_ID);

    const blocker = new Database(dbPath);
    blocker.exec("BEGIN IMMEDIATE");
    try {
      dbApplyThreadRuntimeEvents(THREAD_ID, [
        started("a"),
        delta("one "),
        delta("two "),
        delta("three"),
      ]);
      const degraded = getRuntimePersistenceState();
      expect(degraded?.pendingEvents).toBe(4);

      // BUSY=0: the refused read must not wait on the held write lock.
      const startedAt = Date.now();
      await expect(dbGetThreadRuntimeItems(THREAD_ID)).rejects.toBeInstanceOf(
        RuntimePersistenceDegradedError,
      );
      expect(Date.now() - startedAt).toBeLessThan(500);
      expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(true);
    } finally {
      blocker.exec("ROLLBACK");
      blocker.close();
    }

    const items = await dbGetThreadRuntimeItems(THREAD_ID);
    expect(items[0]?.streams).toMatchObject({
      command_output: "one two three",
    });
    expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(false);
    // The scoped flush busy timeout is restored, so unrelated writes keep the
    // connection's configured patience.
    expect(getSqlite().pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("refuses every batch before acceptance while storage is read-only (arm-before-accept)", async () => {
    const sqlite = getSqlite();
    sqlite.pragma("query_only = ON");
    try {
      // The mandatory root arm cannot commit, so the batch is refused typed
      // and NOTHING enters the accepted queue: no event is published, no
      // shorter transcript can be served as current.
      const admission = dbApplyThreadRuntimeEvents(THREAD_ID, [started("a"), delta("keep me")]);
      expect(admission).toMatchObject({ kind: "refused", reason: "degraded", scope: "global" });
      expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(false);
      await expect(dbGetThreadRuntimeItems(THREAD_ID)).rejects.toBeInstanceOf(
        RuntimePersistenceContaminatedError,
      );
      // The authoritative rebase is the recovery, but storage is still
      // read-only, so the SQL deliberately fails; truncate is never a repair
      // and refuses the contaminated thread typed before touching SQL.
      await expect(dbReplaceThreadRuntimeSnapshot(THREAD_ID, [], [], null)).rejects.toThrow(
        /readonly/i,
      );
      expect(() => dbTruncateThreadRuntimeAfter(THREAD_ID, "a")).toThrow(
        RuntimePersistenceContaminatedError,
      );
      // The failed exact-gap write is tracked as a bounded obligation, so a
      // clean close cannot erase the refusal.
      expect(getRuntimeDurableGapPendingThreadIds()).toContain(THREAD_ID);
    } finally {
      sqlite.pragma("query_only = OFF");
    }
    // Storage recovers: the pending exact evidence becomes durable (the same
    // finalize the close hook runs) and the refusal survives as an exact gap.
    runtimePersistenceController.finalizeDurableGapClose();
    expect(getRuntimeDurableGapPendingThreadIds()).toEqual([]);
    expect(
      sqlite.prepare("SELECT reason FROM thread_runtime_gaps WHERE thread_id = ?").get(THREAD_ID),
    ).toMatchObject({ reason: "degraded" });
  });

  it("classifies real SQLITE_FULL as storage and commits usage exactly once on retry", async () => {
    const sqlite = getSqlite();
    const pages = sqlite.pragma("page_count", { simple: true }) as number;
    // A few free pages only: the 2 MiB event below cannot allocate and SQLite
    // reports a real SQLITE_FULL from the writer transaction.
    sqlite.pragma(`max_page_count = ${pages + 8}`);
    try {
      dbApplyThreadRuntimeEvents(THREAD_ID, [
        started("a"),
        delta("x".repeat(2 * 1024 * 1024), "a"),
        cumulativeUsage(100),
        perCallUsage(7, "call-1"),
      ]);
      await expect(dbGetThreadRuntimeItems(THREAD_ID)).rejects.toBeInstanceOf(
        RuntimePersistenceDegradedError,
      );
      // Chunked flush: the small `started` chunk commits into the free pages
      // before the 2 MiB chunk hits FULL; the accepted suffix is retained.
      expect(getRuntimePersistenceState()?.pendingEvents).toBe(3);
    } finally {
      sqlite.pragma("max_page_count = 1073741823");
    }

    await dbFlushThreadRuntimeWrites(THREAD_ID);
    expect(tokenRows()).toEqual([
      { kind: "tokens_v2", value: 100 },
      { kind: "tokens_v2", value: 7 },
    ]);

    // A replayed batch (crash/retry semantics) must not double count: the
    // cumulative counter is unchanged and the per-call sample is deduped.
    dbApplyThreadRuntimeEvents(THREAD_ID, [cumulativeUsage(100), perCallUsage(7, "call-1")]);
    await dbFlushThreadRuntimeWrites(THREAD_ID);
    expect(tokenRows()).toEqual([
      { kind: "tokens_v2", value: 100 },
      { kind: "tokens_v2", value: 7 },
    ]);
  });

  it("refuses a clean close while failed gap evidence is not durable and keeps custody", async () => {
    const sqlite = getSqlite();
    sqlite.pragma("query_only = ON");
    // Storage is read-only from the first admission: the boot cannot arm, the
    // batch is refused, and the failed exact-gap write is tracked as a pending
    // obligation. Nothing was accepted, so the drain itself is complete.
    dbApplyThreadRuntimeEvents(THREAD_ID, [started("a"), delta("pending")]);
    expect(dbHasPendingThreadRuntimeWrites(THREAD_ID)).toBe(false);

    let thrown: unknown;
    try {
      closeDatabase();
    } catch (error) {
      thrown = error;
    }
    // The close is refused typed for the unwritten evidence, not for uncommitted
    // accepted events: the armed epoch (had it armed) and every touch survive,
    // so the next boot still resolves the refusal.
    expect(thrown).toBeInstanceOf(RuntimePersistenceDurableGapPendingError);
    expect((thrown as RuntimePersistenceDurableGapPendingError).pendingThreadIds).toContain(
      THREAD_ID,
    );
    expect(getRuntimePersistenceShutdownReport()).toBeNull();
    // Custody preserved: the handle is still open and the evidence is pending.
    expect(getSqlite()).toBeTruthy();
    expect(getRuntimeDurableGapPendingThreadIds()).toContain(THREAD_ID);

    // Storage recovers: the pending evidence becomes durable, so afterEach's
    // close can complete a truthful disarm.
    sqlite.pragma("query_only = OFF");
    runtimePersistenceController.finalizeDurableGapClose();
    expect(getRuntimeDurableGapPendingThreadIds()).toEqual([]);
  });
});
