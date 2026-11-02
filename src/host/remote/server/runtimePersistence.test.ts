import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetThreadRuntimeItems,
  dbReplaceThreadRuntimeSnapshot,
} from "@/host/db/runtimeItems";
import {
  getRuntimeDurableGapPendingThreadIds,
  getRuntimePersistenceSample,
  getRuntimePersistenceState,
  attachRuntimePersistenceDurableGapFromCurrentConnection,
  armRuntimeThreadForLaunch,
  barrierRuntimeWrites,
} from "@/host/db/runtimePersistenceRuntime";
import { persistSupervisorEvent, resetDeferredThreadResetsForTests } from "./runtimePersistence";

const THREAD_ID = "thread-1";

function started(): RuntimeEvent {
  return {
    type: "item.started",
    threadId: THREAD_ID,
    itemId: "a",
    itemType: "command_execution",
  } as RuntimeEvent;
}

function delta(text: string): RuntimeEvent {
  return {
    type: "content.delta",
    threadId: THREAD_ID,
    itemId: "a",
    stream: "command_output",
    delta: text,
  } as RuntimeEvent;
}

describe.skipIf(!sqliteAvailable)("persistSupervisorEvent failure contract", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-runtime-persistence-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Persistence project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
    resetDeferredThreadResetsForTests();
  });

  afterEach(() => {
    getSqlite().pragma("query_only = OFF");
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries real SQLite writer contention with ordered usage and transcript custody", async () => {
    attachRuntimePersistenceDurableGapFromCurrentConnection();
    armRuntimeThreadForLaunch(THREAD_ID);
    const sqlite = getSqlite();
    const blocker = new Database(
      join(dir, "state.sqlite"),
      nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {},
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const usage = (counter: number): RuntimeEvent => ({
      type: "usage.spent",
      threadId: THREAD_ID,
      usage: {
        counterKind: "cumulative",
        counter,
        scopeId: "contention",
        epoch: 0,
        sampleId: `cumulative-${counter}`,
      },
    });
    const call: RuntimeEvent = {
      type: "usage.spent",
      threadId: THREAD_ID,
      usage: {
        counterKind: "per-call",
        counter: 50,
        scopeId: "contention-call",
        epoch: 0,
        sampleId: "call-once",
      },
    };
    try {
      blocker.exec("BEGIN IMMEDIATE");
      expect(
        persistSupervisorEvent({
          type: "thread-runtime-events",
          threadId: THREAD_ID,
          events: [started(), delta("before"), usage(1000)],
        }),
      ).toMatchObject({ kind: "publish" });
      expect(barrierRuntimeWrites(THREAD_ID)).toMatchObject({
        kind: "degraded",
        errorClass: "retryable",
        error: { code: "SQLITE_BUSY" },
      });
      expect(errors).toHaveBeenCalled();
      expect(sqlite.prepare("SELECT COUNT(*) AS n FROM thread_runtime_items").get()).toEqual({
        n: 0,
      });
      expect(sqlite.prepare("SELECT COUNT(*) AS n FROM usage_events").get()).toEqual({ n: 0 });
      expect(
        persistSupervisorEvent({
          type: "thread-runtime-events",
          threadId: THREAD_ID,
          events: [delta("after"), usage(1200), call, call],
        }),
      ).toMatchObject({ kind: "publish" });
      expect(getRuntimePersistenceSample()?.pendingEvents).toBe(7);
      blocker.exec("COMMIT");
      await expect.poll(() => getRuntimePersistenceSample()?.pendingEvents).toBe(0);
      expect((await dbGetThreadRuntimeItems(THREAD_ID))[0]?.streams.command_output).toBe(
        "beforeafter",
      );
      expect(sqlite.prepare("SELECT SUM(value) AS n FROM usage_events").get()).toEqual({ n: 250 });
      expect(
        persistSupervisorEvent({
          type: "thread-runtime-events",
          threadId: THREAD_ID,
          events: [usage(1000), usage(1200), call],
        }),
      ).toMatchObject({ kind: "publish" });
      await dbFlushThreadRuntimeWrites(THREAD_ID);
      expect(sqlite.prepare("SELECT SUM(value) AS n FROM usage_events").get()).toEqual({ n: 250 });
      expect(sqlite.prepare("SELECT COUNT(*) AS n FROM usage_token_samples").get()).toEqual({
        n: 1,
      });
    } finally {
      if (blocker.inTransaction) blocker.exec("ROLLBACK");
      blocker.close();
    }
  });

  it("never throws into the supervisor handler and refuses to accept without durable evidence", async () => {
    const sqlite = getSqlite();
    sqlite.pragma("query_only = ON");
    // B1 arm-before-accept: with storage read-only the boot cannot arm, so the
    // batch is withheld and NOT accepted (no shorter transcript can be
    // published); the failed exact gap is a bounded pending obligation.
    const outcome = persistSupervisorEvent({
      type: "thread-runtime-events",
      threadId: THREAD_ID,
      events: [started(), delta("kept")],
    });
    expect(outcome).toMatchObject({ kind: "withhold", reason: "refused", threadIds: [THREAD_ID] });
    expect(getRuntimePersistenceSample()?.pendingEvents).toBe(0);
    expect(getRuntimeDurableGapPendingThreadIds()).toContain(THREAD_ID);

    // Storage recovers: only the authoritative rebase repairs the explicit
    // refusal, and the pending obligation is superseded by it.
    sqlite.pragma("query_only = OFF");
    await dbReplaceThreadRuntimeSnapshot(THREAD_ID, [], [], null);
    expect(getRuntimeDurableGapPendingThreadIds()).toEqual([]);
    expect(await dbGetThreadRuntimeItems(THREAD_ID)).toEqual([]);
  });

  it("defers a thread reset over a typed-degraded barrier and applies it after recovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    dbApplyThreadRuntimeEvents(THREAD_ID, [started(), delta("before reset")]);
    await dbFlushThreadRuntimeWrites(THREAD_ID);
    expect(await dbGetThreadRuntimeItems(THREAD_ID)).toHaveLength(1);

    const sqlite = getSqlite();
    sqlite.pragma("query_only = ON");
    const published: string[] = [];
    // The reset supersedes earlier data but must not discard uncommitted
    // accepted events; with a failing storage path it is deferred, not applied
    // and not published.
    expect(() =>
      persistSupervisorEvent(
        { type: "thread-reset", threadId: THREAD_ID },
        {
          publishDeferredEvent: (event) => {
            published.push(event.type);
          },
        },
      ),
    ).not.toThrow();

    // First attempt fails against the read-only database. The typed barrier
    // degradation must stay `degraded` (storage), never escalate to `refusing`.
    await vi.advanceTimersByTimeAsync(10);
    expect(published).toEqual([]);
    expect(getRuntimePersistenceState()).toMatchObject({
      state: "degraded",
      errorClass: "storage",
    });
    expect(sqlite.pragma("query_only", { simple: true })).toBe(1);

    sqlite.pragma("query_only = OFF");
    // The retrying control op applies the rebase and publishes it exactly once.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(published).toEqual(["thread-reset"]);
    expect(await dbGetThreadRuntimeItems(THREAD_ID)).toHaveLength(0);
    expect(getRuntimePersistenceState()?.state).not.toBe("refusing");
  });
});
