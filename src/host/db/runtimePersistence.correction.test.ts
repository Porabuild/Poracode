import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { applyThreadRuntimeEventsNow } from "./runtimeItemsWriter";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeSummariesCommitted,
  dbHasPendingThreadRuntimeWrites,
  dbReadThreadRuntimeItems,
  dbReplaceThreadRuntimeSnapshot,
} from "./runtimeItems";
import { RuntimePersistenceController } from "./runtimePersistenceController";
import {
  beginRuntimeFence,
  flushRuntimeFence,
  getRuntimeContamination,
  getRuntimePersistenceSample,
  getRuntimePersistenceShutdownReport,
  getRuntimePersistenceState,
  readRuntimeFence,
  releaseRuntimeFence,
  resetRuntimePersistenceForTests,
  runtimePersistenceController,
} from "./runtimePersistenceRuntime";
import {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
  type RuntimeProducerSignal,
} from "./runtimePersistenceTypes";
import { persistSupervisorEvent } from "@/host/remote/server/runtimePersistence";

const THREAD_A = "thread-a";
const THREAD_B = "thread-b";
const MIB = 1024 * 1024;

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

async function until(condition: () => boolean, timeoutMs = 4_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition.");
}

describe.skipIf(!sqliteAvailable)("B1 persistence correction (real SQLite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-runtime-correction-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Correction project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    for (const id of [THREAD_A, THREAD_B]) {
      dbUpsertThread({ ...testThread(), id }, 0);
    }
    resetRuntimePersistenceForTests();
  });

  afterEach(() => {
    try {
      getSqlite().pragma("query_only = OFF");
    } catch {
      // Database already closed by a failed test; the close below is a no-op.
    }
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  describe("admission refusal, contamination, and authoritative rebase", () => {
    it("publishes only the accepted prefix, refuses reads for the affected thread, and serves summaries", async () => {
      const batch = [
        started(THREAD_A, "a"),
        ...Array.from({ length: 5_000 }, () => delta(THREAD_A, "a", "x")),
      ];
      const outcome = persistSupervisorEvent({
        type: "thread-runtime-events",
        threadId: THREAD_A,
        events: batch,
      });
      expect(outcome.kind).toBe("publish-partial");
      if (outcome.kind !== "publish-partial") throw new Error("expected partial publication");
      // The refused suffix is never published; the accepted prefix is exact.
      expect(outcome.event).toMatchObject({ type: "thread-runtime-events", threadId: THREAD_A });
      expect((outcome.event as { events: RuntimeEvent[] }).events).toHaveLength(5_000);
      expect(outcome.droppedEvents).toBe(1);
      expect(outcome.droppedBytes).toBeGreaterThan(0);

      const state = getRuntimePersistenceState();
      expect(state?.state).not.toBe("refusing");
      expect(state?.contaminatedThreads).toBe(1);
      expect(getRuntimeContamination(THREAD_A)?.reason).toBe("thread-events");

      // The accepted prefix commits through the normal bounded drain; the
      // ordered transcript still refuses because the published domain covers
      // the refused suffix.
      await until(() => !dbHasPendingThreadRuntimeWrites(THREAD_A));
      await expect(dbGetThreadRuntimeItems(THREAD_A)).rejects.toBeInstanceOf(
        RuntimePersistenceContaminatedError,
      );
      // A committed-only projection keeps serving.
      expect(dbGetThreadRuntimeSummariesCommitted([THREAD_A])[THREAD_A]).toMatchObject({
        itemCount: 1,
      });

      // An unrelated thread admits, commits, and serves while A is refused.
      const other = persistSupervisorEvent({
        type: "thread-runtime-events",
        threadId: THREAD_B,
        events: [started(THREAD_B, "b"), delta(THREAD_B, "b", "healthy")],
      });
      expect(other.kind).toBe("publish");
      await dbFlushThreadRuntimeWrites(THREAD_B);
      const otherItems = await dbGetThreadRuntimeItems(THREAD_B);
      expect(otherItems[0]?.streams.assistant_text).toBe("healthy");

      // The reset is the reachable authoritative rebase: durable first, then
      // published, and it clears the contamination.
      const published: string[] = [];
      persistSupervisorEvent(
        { type: "thread-reset", threadId: THREAD_A },
        { publishDeferredEvent: (event) => published.push(event.type) },
      );
      await until(() => published.length === 1);
      expect(published).toEqual(["thread-reset"]);
      expect(getRuntimeContamination(THREAD_A)).toBeNull();
      expect(await dbGetThreadRuntimeItems(THREAD_A)).toEqual([]);
    });

    it("publishes a deferred reset only after its durable rebase applied", async () => {
      persistSupervisorEvent({
        type: "thread-runtime-events",
        threadId: THREAD_A,
        events: [
          started(THREAD_A, "a"),
          delta(THREAD_A, "a", "before reset"),
          ...Array.from({ length: 5_000 }, () => delta(THREAD_A, "a", "y")),
        ],
      });
      // 5001+ events: the prefix commits, the suffix is refused and contaminates.
      expect(getRuntimeContamination(THREAD_A)).not.toBeNull();
      await until(() => !dbHasPendingThreadRuntimeWrites(THREAD_A));

      let rowsWhenPublished: number | null = null;
      persistSupervisorEvent(
        { type: "thread-reset", threadId: THREAD_A },
        {
          publishDeferredEvent: () => {
            rowsWhenPublished = dbReadThreadRuntimeItems(THREAD_A).length;
          },
        },
      );
      await until(() => rowsWhenPublished !== null);
      expect(rowsWhenPublished).toBe(0);
      expect(getRuntimeContamination(THREAD_A)).toBeNull();
    });

    it("keeps a global age refusal as explicit contamination until a deliberate rebase", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      try {
        dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "kept")]);
        // The accepted event ages past the 30 s bound without a successful
        // flush; the next batch is refused globally.
        vi.setSystemTime(new Date("2026-01-01T00:00:31.000Z"));
        const refused = dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "aged-out")]);
        expect(refused).toMatchObject({ kind: "refused", reason: "age", scope: "global" });
        // The refused canonical event is a hole in the thread's transcript:
        // without contamination a later fenced read would serve the shorter
        // prefix as complete.
        expect(getRuntimeContamination(THREAD_A)?.reason).toBe("age");
        await expect(dbGetThreadRuntimeItems(THREAD_A)).rejects.toBeInstanceOf(
          RuntimePersistenceContaminatedError,
        );
      } finally {
        vi.useRealTimers();
      }
      // The deliberate rebase is the only recovery; the applied SQL rebase
      // clears the durable gap evidence in its own transaction and then the
      // in-memory marker (an in-memory-only clear would re-resolve the
      // surviving gap row on the next read).
      await dbReplaceThreadRuntimeSnapshot(THREAD_A, [], [], null);
      expect(getRuntimeContamination(THREAD_A)).toBeNull();
      expect(await dbGetThreadRuntimeItems(THREAD_A)).toEqual([]);
    });
  });

  describe("thread-state control retry", () => {
    it("rebuilds the row after a transient failure without a later state event", async () => {
      expect(persistSupervisorEvent(threadState("working"))).toMatchObject({ kind: "publish" });
      await until(() => dbGetThread(THREAD_A)?.status === "working");

      const sqlite = getSqlite();
      sqlite.pragma("query_only = ON");
      expect(persistSupervisorEvent(threadState("idle"))).toMatchObject({ kind: "publish" });
      // The write fails and is retained; the health state degrades (storage),
      // never escalating a typed/unknown failure to fatal.
      await until(() => getRuntimePersistenceState()?.state === "degraded");
      expect(getRuntimePersistenceState()?.errorClass).toBe("storage");
      expect(getRuntimePersistenceSample()?.controlOperationsPending).toBeGreaterThan(0);
      expect(dbGetThread(THREAD_A)?.status).toBe("working");

      sqlite.pragma("query_only = OFF");
      await until(() => dbGetThread(THREAD_A)?.status === "idle");
      await until(() => (getRuntimePersistenceSample()?.controlOperationsPending ?? 1) === 0);
      expect(getRuntimePersistenceState()?.state).not.toBe("refusing");
    });
  });

  describe("asynchronous committed-prefix fence (real SQLite)", () => {
    it("holds the pinned prefix while post-fence events accumulate, then drains", async () => {
      dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "first")]);
      const token = beginRuntimeFence(THREAD_A);
      // Admitted after the pin: this event must not be visible behind the fence.
      dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "second")]);

      const result = await flushRuntimeFence(token);
      if (result.kind !== "committed") throw new Error(`expected committed, got ${result.kind}`);
      expect(result.pendingEvents).toBeGreaterThan(0);
      const content = readRuntimeFence(token, () => dbReadThreadRuntimeItems(THREAD_A));
      expect(content.map((item) => item.id)).toEqual(["first"]);
      releaseRuntimeFence(token);

      await dbFlushThreadRuntimeWrites(THREAD_A);
      const drained = await dbGetThreadRuntimeItems(THREAD_A);
      expect(drained.map((item) => item.id)).toEqual(["first", "second"]);
    });

    it("serializes two readers on one thread in FIFO order", async () => {
      dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "one")]);
      const first = beginRuntimeFence(THREAD_A);
      const second = beginRuntimeFence(THREAD_A);

      const firstResult = await flushRuntimeFence(first);
      expect(firstResult.kind).toBe("committed");
      const secondFlush = flushRuntimeFence(second);
      const firstContent = readRuntimeFence(first, () => dbReadThreadRuntimeItems(THREAD_A));
      expect(firstContent.map((item) => item.id)).toEqual(["one"]);
      releaseRuntimeFence(first);

      expect((await secondFlush).kind).toBe("committed");
      const secondContent = readRuntimeFence(second, () => dbReadThreadRuntimeItems(THREAD_A));
      expect(secondContent.map((item) => item.id)).toEqual(["one"]);
      releaseRuntimeFence(second);
    });

    it("refuses a read when the fence expired between flush and read", async () => {
      const controller = new RuntimePersistenceController({
        write: (threadId, events) => applyThreadRuntimeEventsNow(threadId, events),
        flushIntervalMs: 60_000,
        fenceMaxHoldMs: 30,
      });
      controller.admit(THREAD_A, [started(THREAD_A, "held")]);
      const token = controller.beginFence(THREAD_A);
      const result = await controller.flushFence(token);
      expect(result.kind).toBe("committed");
      // The scheduler's max-hold expired the fence; the read must not run
      // behind a boundary that no longer holds.
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(() => controller.readFenced(token, () => dbReadThreadRuntimeItems(THREAD_A))).toThrow(
        /Runtime fence/,
      );
    });

    it("bounds fence and mutation waiters with typed busy refusals", async () => {
      const controller = new RuntimePersistenceController({
        write: (threadId, events) => applyThreadRuntimeEventsNow(threadId, events),
        flushIntervalMs: 60_000,
        schedulerOptions: { maxFenceWaitersPerThread: 1, maxWaitersTotal: 2 },
      });
      const first = controller.beginFence(THREAD_A);
      expect((await controller.flushFence(first)).kind).toBe("committed");
      const second = controller.beginFence(THREAD_A);
      expect(() => controller.beginFence(THREAD_A)).toThrow(RuntimePersistenceBusyError);
      await expect(
        controller.runThreadMutation(THREAD_A, "delete", () => undefined),
      ).rejects.toBeInstanceOf(RuntimePersistenceBusyError);

      controller.releaseFence(first);
      expect((await controller.flushFence(second)).kind).toBe("committed");
      controller.releaseFence(second);
      expect(controller.accessWaiterCount()).toBe(0);
    });

    it("releases held fence pins at shutdown, drains post-pin content, and refuses the stale read", async () => {
      dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "pinned")]);
      const token = beginRuntimeFence(THREAD_A);
      const held = await flushRuntimeFence(token);
      expect(held.kind).toBe("committed");
      // Accepted after the pin: only the pin blocks it from committing.
      dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "post-pin")]);
      expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(true);

      const report = runtimePersistenceController.shutdown(500);
      expect(report.kind).toBe("drained");
      expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(false);
      // The cancelled fence's pin is gone, so the accepted post-pin event
      // committed instead of being reported as incomplete custody.
      expect(dbReadThreadRuntimeItems(THREAD_A).map((item) => item.id)).toEqual([
        "pinned",
        "post-pin",
      ]);
      // Cancellation releases the pin; it does not make the captured boundary
      // valid again. A stale token still refuses its read.
      expect(() => readRuntimeFence(token, () => dbReadThreadRuntimeItems(THREAD_A))).toThrow(
        /fence/,
      );
      expect(() => releaseRuntimeFence(token)).not.toThrow();
    });

    it("closes cleanly when a held fence pinned accepted post-pin content", async () => {
      dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "pinned")]);
      const token = beginRuntimeFence(THREAD_A);
      expect((await flushRuntimeFence(token)).kind).toBe("committed");
      dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "post-pin")]);
      // The close hook must drain the accepted post-pin event instead of
      // throwing a drain-incomplete report and retaining database custody.
      expect(() => closeDatabase()).not.toThrow();
      expect(getRuntimePersistenceShutdownReport()).toMatchObject({ kind: "drained" });
    });

    it("cancels a queued fence at shutdown without pinning the drain", async () => {
      dbApplyThreadRuntimeEvents(THREAD_A, [started(THREAD_A, "queued")]);
      const token = beginRuntimeFence(THREAD_A); // never flushed
      const report = runtimePersistenceController.shutdown(500);
      expect(report.kind).toBe("drained");
      expect(dbReadThreadRuntimeItems(THREAD_A).map((item) => item.id)).toEqual(["queued"]);
      expect((await flushRuntimeFence(token)).kind).toBe("cancelled");
      expect(() => readRuntimeFence(token, () => dbReadThreadRuntimeItems(THREAD_A))).toThrow(
        /fence/,
      );
    });
  });

  describe("controller state machine (configured bounds are never enlarged)", () => {
    function controllerWithSignals(options: {
      bounds?: ConstructorParameters<typeof RuntimePersistenceController>[0]["bounds"];
      inFlightWindowBytes?: number | null;
      write?: (threadId: string, events: readonly RuntimeEvent[]) => void;
      now?: () => number;
    }): { controller: RuntimePersistenceController; signals: RuntimeProducerSignal[] } {
      const signals: RuntimeProducerSignal[] = [];
      const controller = new RuntimePersistenceController({
        write: options.write ?? (() => undefined),
        flushIntervalMs: 60_000,
        ...(options.bounds ? { bounds: options.bounds } : {}),
        ...(options.inFlightWindowBytes !== undefined
          ? { inFlightWindowBytes: options.inFlightWindowBytes }
          : {}),
        ...(options.now ? { now: options.now } : {}),
        onSignal: (signal) => signals.push(signal),
      });
      return { controller, signals };
    }

    it("computes the pause threshold from the advertised in-flight window and clamps without enlarging the bound", () => {
      const { controller } = controllerWithSignals({ inFlightWindowBytes: 14 * MIB });
      expect(controller.getPauseThresholdBytes()).toBe(32 * MIB - 14 * MIB - MIB);
      expect(controller.isPauseThresholdClamped()).toBe(false);

      controller.setInFlightWindowBytes(64 * MIB);
      expect(controller.getBounds().maxPendingBytesGlobal).toBe(32 * MIB);
      expect(controller.isPauseThresholdClamped()).toBe(true);
      expect(controller.getPauseThresholdBytes()).toBe(MIB);
    });

    it("keeps a per-thread refusal thread-scoped and keeps other threads live", async () => {
      const { controller, signals } = controllerWithSignals({
        bounds: {
          maxPendingEventsPerThread: 2,
          maxPendingBytesPerThread: MIB,
          maxPendingEventsGlobal: 100,
          maxPendingBytesGlobal: 10 * MIB,
        },
        write: (threadId, events) => applyThreadRuntimeEventsNow(threadId, events),
      });
      expect(
        controller.admit(THREAD_A, [started(THREAD_A, "1"), started(THREAD_A, "2")]).kind,
      ).toBe("accepted");
      const refused = controller.admit(THREAD_A, [started(THREAD_A, "3")]);
      expect(refused).toMatchObject({ kind: "refused", reason: "thread-events", scope: "thread" });
      expect(controller.getState()).not.toBe("refusing");
      expect(signals.at(-1)).toMatchObject({ kind: "stop", threadIds: [THREAD_A] });

      expect(controller.admit(THREAD_B, [started(THREAD_B, "b")]).kind).toBe("accepted");
      expect(controller.barrier(THREAD_B).kind).toBe("committed");
      expect(() => controller.barrierOrThrow(THREAD_A)).toThrow(
        RuntimePersistenceContaminatedError,
      );
    });

    it("closes bulk admission on a global refusal and recovers after the accepted backlog drains", () => {
      let nowMs = Date.now();
      const { controller, signals } = controllerWithSignals({
        now: () => nowMs,
        bounds: {
          maxPendingEventsGlobal: 2,
          maxPendingBytesGlobal: MIB,
          maxPendingEventsPerThread: 10,
          maxPendingBytesPerThread: MIB,
        },
        write: (threadId, events) => applyThreadRuntimeEventsNow(threadId, events),
      });
      expect(
        controller.admit(THREAD_A, [started(THREAD_A, "1"), started(THREAD_A, "2")]).kind,
      ).toBe("accepted");
      const refused = controller.admit(THREAD_B, [started(THREAD_B, "b")]);
      expect(refused).toMatchObject({ kind: "refused", scope: "global" });
      expect(controller.getState()).toBe("refusing");
      expect(signals.at(-1)).toMatchObject({ kind: "stop", reason: "hard-cap" });

      expect(controller.barrier(THREAD_A).kind).toBe("committed");
      nowMs += 2_500;
      controller.runControlWrite(() => undefined);
      expect(controller.getState()).not.toBe("refusing");
      expect(signals.at(-1)?.kind === "resume" || controller.getState() === "healthy").toBe(true);
    });

    it("refuses an oversize canonical event explicitly and contaminates only that thread", () => {
      const { controller, signals } = controllerWithSignals({
        bounds: {
          maxSingleEventBytes: 1_000,
          maxPendingBytesPerThread: 2_000,
          maxPendingBytesGlobal: 10_000,
        },
        write: (threadId, events) => applyThreadRuntimeEventsNow(threadId, events),
      });
      const refused = controller.admit(THREAD_A, [delta(THREAD_A, "a", "x".repeat(2_000))]);
      expect(refused).toMatchObject({ kind: "refused", reason: "oversize", scope: "thread" });
      expect(controller.getContamination(THREAD_A)?.reason).toBe("oversize");
      expect(signals.at(-1)).toMatchObject({ kind: "stop", threadIds: [THREAD_A] });

      // The oversize slot is bounded and never combined: a 2 MiB event is
      // admitted alone, and the next event is refused instead of sharing it.
      const { controller: slotController } = controllerWithSignals({
        bounds: {
          maxSingleEventBytes: 8 * MIB,
          maxPendingBytesPerThread: MIB,
          maxPendingBytesGlobal: 32 * MIB,
        },
      });
      expect(slotController.admit(THREAD_A, [delta(THREAD_A, "a", "x".repeat(2 * MIB))]).kind).toBe(
        "accepted",
      );
      expect(slotController.admit(THREAD_A, [started(THREAD_A, "tail")]).kind).toBe("refused");
    });
  });
});

function threadState(status: "working" | "idle") {
  return {
    type: "thread-state" as const,
    threadId: THREAD_A,
    status,
    attention: "none" as const,
    canResumeWithConfig: false,
  };
}
