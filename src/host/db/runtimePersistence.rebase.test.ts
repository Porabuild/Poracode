import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbClearThreadRuntimeItems,
  dbFlushThreadRuntimeWrites,
  dbGetThreadRuntimeItems,
  dbHasPendingThreadRuntimeWrites,
  dbReadThreadRuntimeItems,
} from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import {
  getRuntimeContamination,
  getRuntimePersistenceSample,
  resetRuntimePersistenceForTests,
  enqueueRuntimeControlOperation,
} from "./runtimePersistenceRuntime";
import { RuntimePersistenceContaminatedError } from "./runtimePersistenceTypes";
import {
  hasDeferredThreadReset,
  persistSupervisorEvent,
  resetDeferredThreadResetsForTests,
} from "@/host/remote/server/runtimePersistence";

const THREAD_A = "thread-rebase-a";

function started(threadId: string, itemId: string): RuntimeEvent {
  return {
    type: "item.started",
    threadId,
    itemId,
    itemType: "assistant_message",
  } as RuntimeEvent;
}

function delta(threadId: string, itemId: string, text: string): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId,
    stream: "assistant_text",
    delta: text,
  } as RuntimeEvent;
}

async function until(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition.");
}

describe.skipIf(!sqliteAvailable)("B1 authoritative rebase recovery (real SQLite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-runtime-rebase-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Rebase project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), id: THREAD_A }, 0);
    resetRuntimePersistenceForTests();
  });

  afterEach(() => {
    try {
      getSqlite().pragma("query_only = OFF");
    } catch {
      // The database may already be closed by a failed test.
    }
    resetDeferredThreadResetsForTests();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    resetRuntimePersistenceForTests();
  });

  it("keeps the accepted prefix and contamination across a failed delete, then supersedes on retry", async () => {
    dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "old")]);
    await dbFlushThreadRuntimeWrites(THREAD_A);
    expect(dbReadThreadRuntimeItems(THREAD_A).map((item) => item.id)).toEqual(["old"]);

    // Fill the per-thread cap: the accepted prefix is resident and the refused
    // suffix contaminates the thread.
    const batch = [
      started(THREAD_A, "a"),
      ...Array.from({ length: 5_000 }, () => delta(THREAD_A, "a", "x")),
    ];
    expect(dbApplyThreadRuntimeEvents(THREAD_A, batch)).toMatchObject({
      kind: "accepted",
      refusedEvents: 1,
    });
    expect(getRuntimeContamination(THREAD_A)?.reason).toBe("thread-events");
    expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(true);
    const supersededBefore = getRuntimePersistenceSample()?.supersededAcceptedEvents ?? 0;

    // The durable delete fails before applying: discarding first would publish
    // a truncated transcript with no marker.
    getSqlite().pragma("query_only = ON");
    await expect(dbClearThreadRuntimeItems(THREAD_A)).rejects.toThrow(/readonly/i);
    expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(true);
    expect(getRuntimeContamination(THREAD_A)?.reason).toBe("thread-events");
    expect(dbReadThreadRuntimeItems(THREAD_A).map((item) => item.id)).toEqual(["old"]);
    expect(getRuntimePersistenceSample()?.supersededAcceptedEvents ?? 0).toBe(supersededBefore);

    // A retried delete applies and is the explicit supersede of the prefix.
    getSqlite().pragma("query_only = OFF");
    await dbClearThreadRuntimeItems(THREAD_A);
    expect(getRuntimeContamination(THREAD_A)).toBeNull();
    expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(false);
    expect(dbReadThreadRuntimeItems(THREAD_A)).toEqual([]);
    expect((getRuntimePersistenceSample()?.supersededAcceptedEvents ?? 0) - supersededBefore).toBe(
      5_000,
    );
  });

  it("contaminates the thread when a deferred reset exhausts its bounded retries, and repairs on a later reset", async () => {
    dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "old")]);
    await dbFlushThreadRuntimeWrites(THREAD_A);

    getSqlite().pragma("query_only = ON");
    const published: string[] = [];
    expect(
      persistSupervisorEvent(
        { type: "thread-reset", threadId: THREAD_A },
        { publishDeferredEvent: (event) => published.push(event.type) },
      ),
    ).toMatchObject({ kind: "withhold", reason: "deferred-reset" });
    expect(hasDeferredThreadReset(THREAD_A)).toBe(true);

    // Bounded retries exhaust: the durable rebase will never apply and the
    // explicit per-thread gap marker must remain.
    await until(() => getRuntimeContamination(THREAD_A)?.reason === "rebase-dropped");
    expect(published).toEqual([]);
    expect(hasDeferredThreadReset(THREAD_A)).toBe(false);

    // A new session's events are refused instead of silently merging into the
    // pre-reset transcript, and reads stay typed-refused.
    expect(
      persistSupervisorEvent({
        type: "thread-runtime-events",
        threadId: THREAD_A,
        events: [started(THREAD_A, "new-session")],
      }),
    ).toMatchObject({ kind: "withhold", reason: "refused", threadIds: [THREAD_A] });
    await expect(dbGetThreadRuntimeItems(THREAD_A)).rejects.toBeInstanceOf(
      RuntimePersistenceContaminatedError,
    );

    // Storage recovers and a later authoritative reset is the repair path.
    getSqlite().pragma("query_only = OFF");
    const repaired: string[] = [];
    persistSupervisorEvent(
      { type: "thread-reset", threadId: THREAD_A },
      { publishDeferredEvent: (event) => repaired.push(event.type) },
    );
    await until(() => repaired.length === 1);
    expect(getRuntimeContamination(THREAD_A)).toBeNull();
    expect(await dbGetThreadRuntimeItems(THREAD_A)).toEqual([]);
  });

  it("contaminates the thread when the control reserve refuses the deferred reset", () => {
    dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "old")]);

    // Fill the reserved control capacity synchronously: no event-loop turn
    // runs, so the failing fillers stay queued and the reset cannot enqueue.
    for (let i = 0; i < 256; i++) {
      expect(
        enqueueRuntimeControlOperation({
          describe: `filler-${i}`,
          run: () => {
            throw Object.assign(new Error("database or disk is full"), { code: "SQLITE_FULL" });
          },
        }),
      ).toBe("accepted");
    }
    expect(persistSupervisorEvent({ type: "thread-reset", threadId: THREAD_A })).toMatchObject({
      kind: "withhold",
      reason: "deferred-reset",
    });
    expect(getRuntimeContamination(THREAD_A)?.reason).toBe("rebase-dropped");
    expect(hasDeferredThreadReset(THREAD_A)).toBe(false);
    expect(dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "new-session")])).toMatchObject({
      kind: "refused",
      scope: "thread",
    });
  });
});
