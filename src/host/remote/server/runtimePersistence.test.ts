import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { BackendHostCore } from "@/backend/BackendHostCore";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
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
import { withPendingInterruptedTurn } from "./pendingInterruptedTurns";
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

  it.each([
    { reported: "error" as const, stored: "error" },
    { reported: null, stored: undefined },
  ])(
    "keeps a reported cut-off marker ($reported) when a newer state replaces its queued write",
    async ({ reported, stored }) => {
      vi.useFakeTimers();
      dbUpsertThread(testThread(), 0, undefined, "restart");
      const state = {
        type: "thread-state",
        threadId: THREAD_ID,
        attention: "none",
        canResumeWithConfig: true,
      } as const;
      persistSupervisorEvent({ ...state, status: "error", interruptedTurn: reported });
      persistSupervisorEvent({ ...state, status: "idle" });
      // Reads made before the row write lands already show the reported marker.
      expect(withPendingInterruptedTurn(dbGetThread(THREAD_ID)!).interruptedTurn).toBe(stored);
      await vi.advanceTimersByTimeAsync(10);
      expect(dbGetThread(THREAD_ID)).toMatchObject({ status: "idle" });
      expect(dbGetThread(THREAD_ID)?.interruptedTurn).toBe(stored);
      expect(withPendingInterruptedTurn(dbGetThread(THREAD_ID)!)).toEqual(dbGetThread(THREAD_ID));
    },
  );

  it("rejects a departed provider's failure before snapshot projection and coalescing", async () => {
    vi.useFakeTimers();
    dbUpsertThread({ ...testThread(), agentKind: "provider-b" }, 0);
    const state = {
      type: "thread-state",
      threadId: THREAD_ID,
      attention: "none",
      canResumeWithConfig: true,
    } as const;
    expect(
      persistSupervisorEvent({
        ...state,
        agentKind: "provider-a",
        status: "error",
        interruptedTurn: "error",
      }),
    ).toMatchObject({ kind: "withhold" });
    expect(withPendingInterruptedTurn(dbGetThread(THREAD_ID)!).interruptedTurn).toBeUndefined();
    persistSupervisorEvent({ ...state, agentKind: "provider-b", status: "idle" });
    await vi.advanceTimersByTimeAsync(10);
    expect(dbGetThread(THREAD_ID)).toMatchObject({ agentKind: "provider-b", status: "idle" });
    expect(dbGetThread(THREAD_ID)?.interruptedTurn).toBeUndefined();
  });

  it("does not project or coalesce a valid pending marker after provider replacement", async () => {
    vi.useFakeTimers();
    dbUpsertThread({ ...testThread(), agentKind: "provider-a" }, 0);
    const state = {
      type: "thread-state",
      threadId: THREAD_ID,
      attention: "none",
      canResumeWithConfig: true,
    } as const;
    persistSupervisorEvent({
      ...state,
      agentKind: "provider-a",
      status: "error",
      interruptedTurn: "error",
    });
    expect(withPendingInterruptedTurn(dbGetThread(THREAD_ID)!).interruptedTurn).toBe("error");
    dbUpsertThread({ ...testThread(), agentKind: "provider-b" }, 0);
    expect(withPendingInterruptedTurn(dbGetThread(THREAD_ID)!).interruptedTurn).toBeUndefined();
    persistSupervisorEvent({ ...state, agentKind: "provider-b", status: "idle" });
    await vi.advanceTimersByTimeAsync(10);
    expect(dbGetThread(THREAD_ID)?.interruptedTurn).toBeUndefined();
  });

  it("does not let a late failure overwrite the successor's already queued completion", async () => {
    vi.useFakeTimers();
    dbUpsertThread({ ...testThread(), agentKind: "provider-b", status: "working" }, 0);
    const state = {
      type: "thread-state",
      threadId: THREAD_ID,
      attention: "none",
      canResumeWithConfig: true,
    } as const;
    persistSupervisorEvent({ ...state, agentKind: "provider-b", status: "idle" });
    persistSupervisorEvent({
      ...state,
      agentKind: "provider-a",
      status: "error",
      interruptedTurn: "error",
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(dbGetThread(THREAD_ID)).toMatchObject({ status: "idle", agentKind: "provider-b" });
    expect(dbGetThread(THREAD_ID)?.interruptedTurn).toBeUndefined();
  });

  it.each(["success", "missing", "last", "failed"] as const)(
    "retires pre-rewind state only after a successful public rewind (%s)",
    async (outcome) => {
      dbUpsertThread({ ...testThread(), status: "idle" }, 0);
      dbApplyThreadRuntimeEvents(
        THREAD_ID,
        ["checkpoint", "failed-reply"].map((itemId) => ({
          type: "item.started" as const,
          threadId: THREAD_ID,
          itemId,
          itemType: "assistant_message" as const,
        })),
      );
      await dbFlushThreadRuntimeWrites(THREAD_ID);
      vi.useFakeTimers();
      const state = {
        type: "thread-state",
        threadId: THREAD_ID,
        attention: "none",
        canResumeWithConfig: true,
      } as const;
      persistSupervisorEvent({ ...state, status: "working", interruptedTurn: null });
      persistSupervisorEvent({ ...state, status: "error", interruptedTurn: "error" });
      expect(withPendingInterruptedTurn(dbGetThread(THREAD_ID)!).interruptedTurn).toBe("error");
      const onEvent = vi.fn<() => void>();
      const host = Object.assign(Object.create(BackendHostCore.prototype), {
        closing: false,
        options: { onEvent },
      }) as BackendHostCore;
      const checkpoint =
        outcome === "missing" ? "missing" : outcome === "last" ? "failed-reply" : "checkpoint";
      getSqlite().pragma(`query_only = ${outcome === "failed" ? "ON" : "OFF"}`);
      let truncated = false;
      let failure: unknown;
      try {
        truncated = host.truncateThreadRuntime(THREAD_ID, checkpoint).truncated;
      } catch (error) {
        failure = error;
      } finally {
        getSqlite().pragma("query_only = OFF");
      }
      expect(truncated).toBe(outcome === "success");
      expect(failure instanceof Error).toBe(outcome === "failed");
      const expected = outcome === "success" ? undefined : "error";
      expect(withPendingInterruptedTurn(dbGetThread(THREAD_ID)!).interruptedTurn).toBe(expected);
      expect(onEvent).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
      await vi.advanceTimersByTimeAsync(10);
      expect(dbGetThread(THREAD_ID)?.interruptedTurn).toBe(expected);
      // A later turn still owns its newly admitted interruption.
      persistSupervisorEvent({ ...state, status: "error", interruptedTurn: "restart" });
      expect(withPendingInterruptedTurn(dbGetThread(THREAD_ID)!).interruptedTurn).toBe("restart");
      await vi.advanceTimersByTimeAsync(10);
      expect(dbGetThread(THREAD_ID)?.interruptedTurn).toBe("restart");
    },
  );

  it("binds older untagged events to the provider that owned the thread at admission", async () => {
    vi.useFakeTimers();
    dbUpsertThread({ ...testThread(), agentKind: "provider-a" }, 0);
    persistSupervisorEvent({
      type: "thread-state",
      threadId: THREAD_ID,
      attention: "none",
      canResumeWithConfig: true,
      status: "error",
      interruptedTurn: "error",
    });
    dbUpsertThread({ ...testThread(), agentKind: "provider-b", status: "idle" }, 0);
    await vi.advanceTimersByTimeAsync(10);
    expect(dbGetThread(THREAD_ID)).toMatchObject({ status: "idle", agentKind: "provider-b" });
    expect(withPendingInterruptedTurn(dbGetThread(THREAD_ID)!).interruptedTurn).toBeUndefined();
  });

  it("publishes state for a thread whose row is not visible yet and writes it once the row lands", async () => {
    vi.useFakeTimers();
    const threadId = "thread-not-yet-visible";
    const event = {
      type: "thread-state",
      threadId,
      agentKind: "codex",
      attention: "none",
      canResumeWithConfig: true,
      status: "idle",
    } as const;
    expect(persistSupervisorEvent(event)).toEqual({ kind: "publish", event });
    dbUpsertThread({ ...testThread(), id: threadId }, 1);
    await vi.advanceTimersByTimeAsync(10);
    expect(dbGetThread(threadId)).toMatchObject({ status: "idle", canResumeWithConfig: true });
  });
});
