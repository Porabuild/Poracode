import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import {
  RuntimeWriteQueue,
  type RuntimeAtomicBatchWriter,
  type RuntimeQueueStats,
  type RuntimeWriteFlush,
} from "./runtimeWriteQueue";

const MIB = 1024 * 1024;
const budget = { maxThreads: 4, maxBytes: 4 * MIB, maxMs: 5 };
function delta(threadId: string, text: string, itemId = "item"): RuntimeEvent {
  return { type: "content.delta", threadId, itemId, stream: "assistant_text", delta: text };
}

describe("atomic runtime queue prefixes", () => {
  it("keeps counters and original coalescible prefixes until a successful outer commit", () => {
    const write = vi.fn<RuntimeWriteFlush>();
    let fail = true;
    let queue: RuntimeWriteQueue;
    const beforeCommit = vi.fn<(stats: RuntimeQueueStats) => void>();
    const batch: RuntimeAtomicBatchWriter = (batches) => {
      beforeCommit(queue.stats());
      expect(batches.map((b) => b.threadId)).toEqual(["a", "b"]);
      expect(batches[0]!.events).toEqual([delta("a", "onetwo")]);
      if (fail) throw new Error("no commit or certified rollback");
      return { kind: "committed" };
    };
    queue = new RuntimeWriteQueue(write, {}, () => 0, batch);
    queue.enqueue("a", [delta("a", "one"), delta("a", "two")]);
    const last = queue.enqueue("b", [delta("b", "three")]);
    const pending = queue.stats();
    expect(queue.flushBudgeted(budget).failure).not.toBeNull();
    expect(queue.stats()).toEqual(pending);
    expect(write).not.toHaveBeenCalled();
    fail = false;
    expect(queue.flushBudgeted(budget)).toMatchObject({ flushedThreads: 2, committedEvents: 3 });
    expect(beforeCommit.mock.calls.map(([stats]) => stats)).toEqual([pending, pending]);
    expect(queue.stats()).toMatchObject({
      pendingEvents: 0,
      committedThroughPersistSeq: last.persistSeq,
    });
    expect(queue.stats().coalescedInputBytes).toBe(pending.pendingEstimatedBytes);
    expect(queue.stats().coalescedOutputBytes).toBeLessThan(pending.pendingEstimatedBytes);
  });

  it("pins exact prefixes and keeps the suffix's original age across partial commits", () => {
    let clock = 0;
    const writes: string[] = [];
    const queue = new RuntimeWriteQueue(
      (id) => {
        writes.push(id);
      },
      {},
      () => clock,
      (batches) => {
        writes.push(...batches.map((batch) => batch.threadId));
        return { kind: "committed" };
      },
    );
    queue.enqueue("a", [delta("a", "old")]);
    const pin = queue.pinThread("a");
    clock = 10;
    queue.enqueue("b", [delta("b", "middle")]);
    clock = 20;
    queue.enqueue("a", [delta("a", "new")]);
    clock = 30;
    expect(queue.flushBudgeted({ ...budget, now: () => clock }).committedEvents).toBe(2);
    expect(writes).toEqual(["a", "b"]);
    expect(queue.committedThrough("a")).toBe(pin);
    expect(queue.oldestPendingAgeMs()).toBe(10);
    expect(queue.flushThreadThrough("a", Number.MAX_SAFE_INTEGER).kind).toBe("empty");
    queue.releasePin("a");
    expect(queue.flushThread("a").committedEvents).toBe(1);
  });

  it("bounds group threads and per-thread event counts even under larger shutdown budgets", () => {
    const groups: string[][] = [];
    const queue = new RuntimeWriteQueue(
      () => undefined,
      {},
      () => 0,
      (batches) => {
        groups.push(batches.map((b) => b.threadId));
        expect(batches.every((b) => b.events.length <= 500)).toBe(true);
        return { kind: "committed" };
      },
    );
    for (let i = 0; i < 6; i++) {
      const id = `thread-${i}`;
      queue.enqueue(
        id,
        Array.from({ length: 501 }, (_, j) => delta(id, "x", `item-${j}`)),
      );
    }
    const first = queue.flushBudgeted({ maxThreads: 16, maxBytes: 16 * MIB, maxMs: 50 });
    expect(first).toMatchObject({ flushedThreads: 4, committedEvents: 2000 });
    expect(groups).toEqual([["thread-0", "thread-1", "thread-2", "thread-3"]]);
    expect(queue.pendingEvents()).toBe(1006);
  });

  it("charges original input bytes and stops at the remaining ordinary group allowance", () => {
    const single = delta("a", "x".repeat(700_000));
    const size = estimateRuntimeEventBytes(single);
    const write = vi.fn<RuntimeWriteFlush>();
    const batch = vi.fn<RuntimeAtomicBatchWriter>(() => ({ kind: "committed" }));
    const queue = new RuntimeWriteQueue(write, {}, () => 0, batch);
    queue.enqueue("a", [single]);
    queue.enqueue("b", [delta("b", "y".repeat(700_000))]);
    expect(queue.flushBudgeted({ ...budget, maxBytes: MIB })).toMatchObject({
      flushedThreads: 1,
      committedBytes: size,
      remainingThreads: 1,
    });
    expect(batch).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.pendingEvents("b")).toBe(1);
  });

  it("keeps the 1 MiB prefix and 4 MiB ordinary group cap when callers request larger chunks", () => {
    const queue = new RuntimeWriteQueue(
      () => undefined,
      {},
      () => 0,
      () => ({ kind: "committed" }),
    );
    for (const id of ["a", "b", "c", "d"]) {
      queue.enqueue(id, [delta(id, "x".repeat(700_000)), delta(id, "y".repeat(700_000))]);
    }
    const result = queue.flushBudgeted({
      ...budget,
      maxBytes: 16 * MIB,
      // This case verifies byte/event caps; wall-clock contention may validly
      // exhaust the separate 5 ms scheduling budget before four prefixes.
      now: () => 0,
      chunk: { maxEvents: 1000, maxBytes: 8 * MIB },
    });
    expect(result).toMatchObject({ flushedThreads: 4, committedEvents: 4 });
    expect(result.committedBytes).toBeLessThanOrEqual(4 * MIB);
    expect(queue.pendingEvents()).toBe(4);
  });

  it("keeps a reserved oversize slot and its age unchanged on rollback", () => {
    let flushClock = 0;
    const queue = new RuntimeWriteQueue(
      () => undefined,
      {},
      () => 10,
      () => {
        flushClock += 5;
        return { kind: "rolled-back", error: new Error("commit failed") };
      },
    );
    queue.enqueue("large", [delta("large", "x".repeat(5 * MIB))]);
    queue.enqueue("normal", [delta("normal", "small")]);
    const before = queue.stats();
    expect(before.oversizeEvents).toBe(1);
    expect(queue.flushBudgeted({ ...budget, now: () => flushClock }).committedEvents).toBe(0);
    expect(queue.stats()).toEqual(before);
    expect(queue.forceFlushThreadIds()).toEqual(["large"]);
    expect(queue.flushBudgeted({ ...budget, now: () => flushClock }).committedEvents).toBe(1);
    expect(queue.stats().oversizeEvents).toBe(0);
    // The original sequential byte budget stops after the indivisible event.
    expect(queue.pendingThreadIds()).toEqual(["normal"]);
  });

  it("bounds total ordinary bytes and admits only one separately charged oversized singleton", () => {
    const groups: number[][] = [];
    const queue = new RuntimeWriteQueue(
      () => undefined,
      {},
      () => 0,
      (batches) => {
        groups.push(
          batches.map((b) => b.events.reduce((sum, e) => sum + estimateRuntimeEventBytes(e), 0)),
        );
        return { kind: "committed" };
      },
    );
    queue.enqueue("old", [delta("old", "small")]);
    const large = queue.enqueue("large", [delta("large", "x".repeat(5 * MIB))]);
    queue.enqueue("second-large", [delta("second-large", "x".repeat(5 * MIB))]);
    queue.enqueue("newest", [delta("newest", "small")]);
    const before = queue.stats();
    expect(before.oversizeEvents).toBe(2);
    const first = queue.flushBudgeted(budget);
    expect(first).toMatchObject({ flushedThreads: 2, remainingThreads: 2 });
    expect(groups[0]!.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      4 * MIB + large.acceptedBytes,
    );
    expect(queue.stats()).toMatchObject({
      oversizeEvents: 1,
      oversizeBytes: before.oversizeBytes - large.acceptedBytes,
    });
    expect(queue.pendingThreadIds()).toEqual(["second-large", "newest"]);
  });

  it.each(["maxThreads", "maxBytes", "maxMs"] as const)(
    "does no work with a zero %s budget",
    (key) => {
      const batch = vi.fn<RuntimeAtomicBatchWriter>(() => ({ kind: "committed" }));
      const single = vi.fn<RuntimeWriteFlush>();
      const queue = new RuntimeWriteQueue(single, {}, () => 0, batch);
      for (const id of ["a", "b"]) queue.enqueue(id, [delta(id, "x")]);
      expect(queue.flushBudgeted({ ...budget, [key]: 0 }).committedEvents).toBe(0);
      expect(single).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
    },
  );

  it("checks time admission between prefixes but acknowledges the whole committed transaction", () => {
    let calls = 0;
    const groups: string[][] = [];
    const queue = new RuntimeWriteQueue(
      () => undefined,
      {},
      () => 0,
      (batches) => {
        groups.push(batches.map((b) => b.threadId));
        calls = 20; // SQL can run past the admission deadline; it cannot be interrupted.
        return { kind: "committed" };
      },
    );
    for (const id of ["a", "b", "c"]) queue.enqueue(id, [delta(id, "x")]);
    expect(queue.flushBudgeted({ ...budget, maxMs: 3, now: () => calls++ })).toMatchObject({
      committedEvents: 2,
      remainingThreads: 1,
      elapsedMs: 20,
    });
    expect(groups).toEqual([["a", "b"]]);
  });

  it("isolates a failed thread in order only after rollback, retaining later work", () => {
    const error = Object.assign(new Error("full"), { code: "SQLITE_FULL" });
    let rolledBack = false;
    const writes: string[] = [];
    const queue = new RuntimeWriteQueue(
      (id) => {
        expect(rolledBack).toBe(true);
        writes.push(id);
        if (id === "b") throw error;
      },
      {},
      () => 0,
      () => {
        rolledBack = true;
        return { kind: "rolled-back", error };
      },
    );
    for (const id of ["a", "b", "c"]) queue.enqueue(id, [delta(id, "x")]);
    expect(queue.flushBudgeted(budget)).toMatchObject({
      flushedThreads: 1,
      failure: { threadId: "b", error },
      remainingThreads: 2,
    });
    expect(writes).toEqual(["a", "b"]);
    expect(queue.committedThrough("b")).toBe(0);
    expect(queue.pendingThreadIds()).toEqual(["b", "c"]);
    expect(queue.flushBudgeted(budget)).toMatchObject({
      flushedThreads: 0,
      failure: { threadId: "b", error },
      remainingThreads: 2,
    });
    expect(writes).toEqual(["a", "b", "b"]);
  });

  it("makes sequential progress next tick when a failed group consumed the time allowance", () => {
    let clock = 0;
    const error = new Error("late poison");
    const batch = vi.fn<RuntimeAtomicBatchWriter>(() => {
      clock += 5;
      return { kind: "rolled-back", error };
    });
    const queue = new RuntimeWriteQueue(
      (id) => {
        if (id === "b") throw error;
      },
      {},
      () => 0,
      batch,
    );
    for (const id of ["a", "b", "c"]) queue.enqueue(id, [delta(id, "x")]);
    const options = { ...budget, now: () => clock };
    expect(queue.flushBudgeted(options).committedEvents).toBe(0);
    expect(queue.flushBudgeted(options)).toMatchObject({
      committedEvents: 1,
      failure: { threadId: "b" },
    });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(queue.pendingThreadIds()).toEqual(["b", "c"]);
  });
});
