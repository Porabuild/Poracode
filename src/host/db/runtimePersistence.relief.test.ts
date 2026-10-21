import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { RuntimePersistenceController } from "./runtimePersistenceController";
import {
  RuntimePersistenceDegradedError,
  type RuntimeProducerSignal,
} from "./runtimePersistenceTypes";

const KIB = 1024;

/** A distinct item per event so flush-time coalescing cannot merge them. */
function largeDelta(threadId: string, index: number, bytes = 100 * KIB): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId: `item-${index}`,
    stream: "command_output",
    delta: "x".repeat(bytes),
  } as RuntimeEvent;
}

function burst(threadId: string, count: number, bytes?: number): RuntimeEvent[] {
  return Array.from({ length: count }, (_, index) => largeDelta(threadId, index, bytes));
}

function harness(options: {
  bounds: NonNullable<ConstructorParameters<typeof RuntimePersistenceController>[0]["bounds"]>;
  write?: (threadId: string, events: readonly RuntimeEvent[]) => void;
}) {
  const written = new Map<string, string[]>();
  const signals: RuntimeProducerSignal[] = [];
  const controller = new RuntimePersistenceController({
    write:
      options.write ??
      ((threadId, events) => {
        const ids = written.get(threadId) ?? [];
        for (const event of events) if ("itemId" in event) ids.push(event.itemId);
        written.set(threadId, ids);
      }),
    bounds: options.bounds,
    flushIntervalMs: 60_000,
    onSignal: (signal) => signals.push(signal),
  });
  return { controller, written, signals };
}

describe("runtime persistence capacity relief", () => {
  it("commits a burst larger than the per-thread byte bound instead of refusing it", () => {
    const { controller, written, signals } = harness({
      bounds: { maxPendingBytesPerThread: 1024 * KIB },
    });
    try {
      // ~2 MiB in one batch against a 1 MiB per-thread bound: the incident shape.
      const admission = controller.admit("t1", burst("t1", 20));
      expect(admission).toMatchObject({ kind: "accepted", acceptedEvents: 20, refusedEvents: 0 });
      expect(controller.getContamination("t1")).toBeNull();
      expect(signals.some((signal) => signal.kind === "stop")).toBe(false);

      expect(controller.barrier("t1").kind).toBe("committed");
      expect(written.get("t1")).toEqual(Array.from({ length: 20 }, (_, index) => `item-${index}`));
    } finally {
      controller.stopTimers();
    }
  });

  it("commits past the per-thread event bound across separate batches", () => {
    const { controller, written } = harness({ bounds: { maxPendingEventsPerThread: 3 } });
    try {
      for (let batch = 0; batch < 4; batch += 1) {
        const events = Array.from({ length: 3 }, (_, index) =>
          largeDelta("t1", batch * 3 + index, 16),
        );
        expect(controller.admit("t1", events)).toMatchObject({
          kind: "accepted",
          refusedEvents: 0,
        });
      }
      expect(controller.barrier("t1").kind).toBe("committed");
      expect(written.get("t1")).toHaveLength(12);
    } finally {
      controller.stopTimers();
    }
  });

  it("relieves the global bound by committing other threads and never enters refusing", () => {
    const { controller, written } = harness({
      bounds: {
        maxPendingEventsGlobal: 4,
        maxPendingEventsPerThread: 4,
        maxPendingBytesGlobal: 4096 * KIB,
      },
    });
    try {
      expect(controller.admit("a", burst("a", 3, 16)).kind).toBe("accepted");
      expect(controller.admit("b", burst("b", 3, 16))).toMatchObject({
        kind: "accepted",
        refusedEvents: 0,
      });
      expect(controller.getState()).not.toBe("refusing");
      expect(controller.getContamination("a")).toBeNull();
      expect(controller.getContamination("b")).toBeNull();
      // Thread "a" was committed to make room for "b".
      expect(written.get("a")).toHaveLength(3);
    } finally {
      controller.stopTimers();
    }
  });

  it("does not leave the queue at the hard global bound after an admission", () => {
    const { controller } = harness({
      bounds: { maxPendingEventsGlobal: 2, maxPendingEventsPerThread: 2 },
    });
    try {
      expect(controller.admit("a", burst("a", 2, 16)).kind).toBe("accepted");
      expect(controller.getState()).toBe("healthy");
      expect(controller.pendingStats().events).toBe(0);
      expect(controller.admit("b", burst("b", 1, 16)).kind).toBe("accepted");
    } finally {
      controller.stopTimers();
    }
  });

  it("still refuses truthfully when storage cannot commit the relief", () => {
    let fail = false;
    const { controller } = harness({
      bounds: { maxPendingEventsPerThread: 2 },
      write: () => {
        if (fail) throw Object.assign(new Error("SQLITE_IOERR"), { code: "SQLITE_IOERR" });
      },
    });
    try {
      expect(controller.admit("t1", burst("t1", 2, 16)).kind).toBe("accepted");
      fail = true;
      expect(controller.admit("t1", [largeDelta("t1", 2, 16)])).toMatchObject({
        kind: "refused",
        reason: "thread-events",
      });
      expect(controller.getContamination("t1")?.reason).toBe("thread-events");
      // Accepted events stay resident for the retry path.
      expect(controller.pendingStats().events).toBe(2);
    } finally {
      controller.stopTimers();
    }
  });

  it("preempts a held read fence instead of refusing a write it pins", async () => {
    const { controller, written } = harness({ bounds: { maxPendingEventsPerThread: 1 } });
    try {
      const token = controller.beginFence("t1");
      expect((await controller.flushFence(token)).kind).toBe("committed");
      const deferred = Promise.withResolvers<string>();
      const reading = controller.readFencedAsync(token, () => deferred.promise);

      expect(controller.admit("t1", burst("t1", 3, 16))).toMatchObject({
        kind: "accepted",
        refusedEvents: 0,
      });
      expect(controller.getContamination("t1")).toBeNull();
      expect(written.get("t1")?.length ?? 0).toBeGreaterThanOrEqual(2);

      // The preempted reader is told to retry; the write was not refused.
      deferred.resolve("prefix");
      await expect(reading).rejects.toBeInstanceOf(RuntimePersistenceDegradedError);
      expect(controller.barrier("t1").kind).toBe("committed");
      expect(written.get("t1")).toHaveLength(3);
    } finally {
      controller.stopTimers();
    }
  });

  it("commits an aged backlog instead of refusing the next batch on age", () => {
    let nowMs = 1_000;
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      bounds: { maxPendingAgeMs: 1_000 },
      flushIntervalMs: 60_000,
      now: () => nowMs,
    });
    try {
      // More aged events than one relief chunk holds.
      expect(controller.admit("t1", burst("t1", 1_200, 16)).kind).toBe("accepted");
      nowMs += 5_000;
      expect(controller.admit("t2", [largeDelta("t2", 1, 16)])).toMatchObject({
        kind: "accepted",
        refusedEvents: 0,
      });
      expect(controller.getState()).not.toBe("refusing");
      expect(controller.getContamination("t2")).toBeNull();
    } finally {
      controller.stopTimers();
    }
  });

  it("drains a slow backlog completely at close instead of stopping at a local deadline", () => {
    let nowMs = 0;
    const written: string[] = [];
    const controller = new RuntimePersistenceController({
      // Each commit takes 600 ms of wall clock, as on a large, busy database.
      write: (_threadId, events) => {
        nowMs += 600;
        for (const event of events) if ("itemId" in event) written.push(event.itemId);
      },
      flushIntervalMs: 60_000,
      now: () => nowMs,
    });
    for (const threadId of ["a", "b", "c", "d", "e", "f"]) {
      expect(controller.admit(threadId, burst(threadId, 2, 16)).kind).toBe("accepted");
    }
    expect(controller.drainBeforeClose()).toMatchObject({ kind: "drained" });
    expect(written).toHaveLength(12);
    expect(nowMs).toBeGreaterThan(1_000);
  });

  it("does not retry failing storage on every admission inside its backoff window", () => {
    let nowMs = 1_000;
    let writes = 0;
    const controller = new RuntimePersistenceController({
      write: () => {
        writes += 1;
        throw Object.assign(new Error("SQLITE_BUSY"), { code: "SQLITE_BUSY" });
      },
      bounds: { maxPendingAgeMs: 1_000 },
      retryBackoffMs: [500],
      flushIntervalMs: 60_000,
      now: () => nowMs,
    });
    try {
      controller.admit("t1", [largeDelta("t1", 0, 16)]);
      nowMs += 600;
      for (let index = 1; index <= 20; index += 1) {
        controller.admit(`t${index + 1}`, [largeDelta(`t${index + 1}`, index, 16)]);
      }
      // One aged-backlog relief attempt, then the backoff holds further writes.
      expect(writes).toBe(1);
      nowMs += 600;
      controller.admit("late", [largeDelta("late", 99, 16)]);
      expect(writes).toBe(2);
    } finally {
      controller.stopTimers();
    }
  });

  it("keeps a large backlog from cancelling the storage backoff with immediate flushes", () => {
    vi.useFakeTimers();
    let writes = 0;
    const controller = new RuntimePersistenceController({
      write: () => {
        writes += 1;
        throw Object.assign(new Error("SQLITE_FULL"), { code: "SQLITE_FULL" });
      },
      storageBackoffMs: [10_000],
    });
    try {
      // Past one budgeted batch (4 MiB): the first admission flushes immediately.
      controller.admit("t1", burst("t1", 45));
      vi.advanceTimersByTime(1);
      expect(writes).toBe(1);
      for (let index = 0; index < 10; index += 1) {
        controller.admit("t1", [largeDelta("t1", 100 + index, 16)]);
        vi.advanceTimersByTime(1);
      }
      expect(writes).toBe(1);
    } finally {
      controller.stopTimers();
      vi.useRealTimers();
    }
  });

  it("bounds one aged-backlog relief by its time budget", () => {
    let nowMs = 1_000;
    let commits = 0;
    const controller = new RuntimePersistenceController({
      // Each committed chunk costs 30 ms of wall clock.
      write: () => {
        commits += 1;
        nowMs += 30;
      },
      bounds: { maxPendingAgeMs: 1_000 },
      flushIntervalMs: 60_000,
      now: () => nowMs,
    });
    try {
      controller.admit("t1", burst("t1", 3_000, 16));
      nowMs += 5_000;
      controller.admit("t2", [largeDelta("t2", 0, 16)]);
      expect(commits).toBeGreaterThan(0);
      expect(commits).toBeLessThan(6);
      expect(controller.pendingStats().events).toBeGreaterThan(0);
    } finally {
      controller.stopTimers();
    }
  });

  it("keeps the backoff after a cycle that committed one thread and then failed another", () => {
    vi.useFakeTimers();
    let writes = 0;
    const controller = new RuntimePersistenceController({
      write: (threadId) => {
        writes += 1;
        if (threadId === "b") {
          throw Object.assign(new Error("SQLITE_BUSY"), { code: "SQLITE_BUSY" });
        }
      },
      bounds: { maxPendingEventsPerThread: 1 },
      retryBackoffMs: [10_000],
    });
    try {
      controller.admit("a", [largeDelta("a", 0, 16)]);
      controller.admit("b", [largeDelta("b", 1, 16)]);
      // One scheduled cycle commits "a" and then fails "b" in the same millisecond.
      vi.advanceTimersByTime(300);
      expect(writes).toBe(2);
      // Inside the backoff, a bound hit on "b" must not retry the failing write.
      controller.admit("b", [largeDelta("b", 2, 16)]);
      expect(writes).toBe(2);
    } finally {
      controller.stopTimers();
      vi.useRealTimers();
    }
  });
});
