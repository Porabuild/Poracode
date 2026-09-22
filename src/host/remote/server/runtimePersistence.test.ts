import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
