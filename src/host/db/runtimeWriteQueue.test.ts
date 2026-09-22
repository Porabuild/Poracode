import { afterEach, describe, expect, it, vi } from "vitest";
import { coalesceRuntimeEvents } from "@/shared/coalesce";
import type { RuntimeEvent } from "@/shared/contracts";
import { RuntimeWriteQueue } from "./runtimeWriteQueue";

function delta(itemId: string, text: string, stream = "command_output"): RuntimeEvent {
  return { type: "content.delta", threadId: "t1", itemId, stream, delta: text } as RuntimeEvent;
}

function started(itemId: string): RuntimeEvent {
  return {
    type: "item.started",
    threadId: "t1",
    itemId,
    itemType: "command_execution",
  } as RuntimeEvent;
}

function completed(itemId: string): RuntimeEvent {
  return { type: "item.completed", threadId: "t1", itemId } as RuntimeEvent;
}

function bigDelta(bytes: number, itemId = "a"): RuntimeEvent {
  return delta(itemId, "x".repeat(bytes));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("coalesceRuntimeEvents", () => {
  it("merges consecutive deltas for the same item and stream", () => {
    const merged = coalesceRuntimeEvents([
      delta("a", "one "),
      delta("a", "two "),
      delta("a", "three"),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ type: "content.delta", itemId: "a", delta: "one two three" });
  });

  it("keeps lifecycle events between deltas in order", () => {
    const merged = coalesceRuntimeEvents([
      started("a"),
      delta("a", "x"),
      delta("a", "y"),
      completed("a"),
      delta("a", "z"),
    ]);

    expect(merged.map((e) => e.type)).toEqual([
      "item.started",
      "content.delta",
      "item.completed",
      "content.delta",
    ]);
    expect(merged[1]).toMatchObject({ delta: "xy" });
    expect(merged[3]).toMatchObject({ delta: "z" });
  });

  it("does not merge across items or streams", () => {
    const merged = coalesceRuntimeEvents([
      delta("a", "1"),
      delta("b", "2"),
      delta("a", "3"),
      delta("a", "4", "assistant_text"),
    ]);

    expect(merged).toHaveLength(4);
    expect(merged.map((e) => (e as { itemId: string }).itemId)).toEqual(["a", "b", "a", "a"]);
  });

  it("preserves interleaved output exactly when two items stream at once", () => {
    const merged = coalesceRuntimeEvents([
      delta("a", "a1"),
      delta("a", "a2"),
      delta("b", "b1"),
      delta("a", "a3"),
    ]);

    const perItem = merged.reduce<Record<string, string>>((acc, event) => {
      const e = event as unknown as { itemId: string; delta: string };
      acc[e.itemId] = (acc[e.itemId] ?? "") + e.delta;
      return acc;
    }, {});
    expect(perItem).toEqual({ a: "a1a2a3", b: "b1" });
  });
});

describe("RuntimeWriteQueue bounds", () => {
  it("defers writes until flushThread and coalesces once", () => {
    const writes: Array<{ threadId: string; events: readonly RuntimeEvent[] }> = [];
    const queue = new RuntimeWriteQueue((threadId, events) => writes.push({ threadId, events }));

    expect(queue.enqueue("t1", [started("a")]).kind).toBe("accepted");
    for (let i = 0; i < 40; i += 1) queue.enqueue("t1", [delta("a", `chunk${i} `)]);
    expect(writes).toHaveLength(0);
    expect(queue.pendingEvents()).toBe(41);

    const outcome = queue.flushThread("t1");

    expect(outcome.kind).toBe("committed");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.events).toHaveLength(2);
    expect(writes[0]!.events[1]).toMatchObject({ delta: expect.stringContaining("chunk39 ") });
    expect(queue.hasPending()).toBe(false);
  });

  it("refuses events past the per-thread byte bound without evicting accepted ones", () => {
    const writes: RuntimeEvent[][] = [];
    const queue = new RuntimeWriteQueue((_threadId, events) => writes.push([...events]), {
      maxPendingBytesPerThread: 1_200,
      maxPendingBytesGlobal: 100_000,
    });

    expect(queue.enqueue("t1", [bigDelta(400)]).kind).toBe("accepted");
    const second = queue.enqueue("t1", [bigDelta(400)]);
    expect(second.kind).toBe("accepted");

    const refused = queue.enqueue("t1", [bigDelta(400)]);
    expect(refused.kind).toBe("refused");
    expect(refused.reason).toBe("thread-bytes");
    expect(refused.scope).toBe("thread");
    expect(refused.refusedEvents).toBe(1);
    // Accepted events are untouched: the queue is at its per-thread bound.
    expect(queue.pendingEvents()).toBe(2);

    queue.flushThread("t1");
    expect(writes).toHaveLength(1);
    // The two accepted deltas coalesce into one write; nothing was evicted.
    expect(writes[0]).toHaveLength(1);
    expect((writes[0]![0] as { delta: string }).delta).toHaveLength(800);
  });

  it("bounds the global count across threads", () => {
    const queue = new RuntimeWriteQueue(() => undefined, {
      maxPendingEventsGlobal: 2,
      maxPendingBytesGlobal: 1_000_000,
    });
    expect(queue.enqueue("t1", [delta("a", "1"), delta("a", "2")]).kind).toBe("accepted");
    const refused = queue.enqueue("t2", [delta("b", "1")]);
    expect(refused.kind).toBe("refused");
    expect(refused.reason).toBe("global-events");
    expect(refused.scope).toBe("global");
    expect(queue.pendingEvents()).toBe(2);
  });

  it("admits one lone oversize event into an empty thread and forces a flush", () => {
    const queue = new RuntimeWriteQueue(() => undefined, {
      maxPendingBytesPerThread: 512,
      maxPendingBytesGlobal: 10_000,
    });
    const accepted = queue.enqueue("t1", [bigDelta(2_000)]);
    expect(accepted.kind).toBe("accepted");
    expect(queue.forceFlushThreadIds()).toEqual(["t1"]);

    // The thread is no longer empty, so a following event cannot join it.
    const refused = queue.enqueue("t1", [delta("a", "tail")]);
    expect(refused.kind).toBe("refused");
    expect(queue.pendingEvents()).toBe(1);
  });

  it("refuses an event larger than the global budget instead of faking a bound", () => {
    const queue = new RuntimeWriteQueue(() => undefined, {
      maxPendingBytesGlobal: 1_000,
      maxPendingBytesPerThread: 500,
    });
    const refused = queue.enqueue("t1", [bigDelta(2_000)]);
    expect(refused.kind).toBe("refused");
    expect(refused.reason).toBe("global-bytes");
    expect(refused.scope).toBe("global");
    expect(queue.pendingEvents()).toBe(0);
  });

  it("takes ownership of admitted events without mutating the caller's array", () => {
    const writes: RuntimeEvent[][] = [];
    const queue = new RuntimeWriteQueue((_threadId, events) => writes.push([...events]));
    const batch = Object.freeze([delta("a", "one "), delta("a", "two")]);
    queue.enqueue("t1", batch);
    expect(batch).toHaveLength(2);
    queue.flushThread("t1");
    expect(writes[0]).toHaveLength(1);
    expect(writes[0]![0]).toMatchObject({ delta: "one two" });
  });

  it("retains queued writes when a flush fails so they can be retried", () => {
    let fail = true;
    const writes: string[] = [];
    const queue = new RuntimeWriteQueue((threadId) => {
      if (fail) throw Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
      writes.push(threadId);
    });
    queue.enqueue("t1", [delta("a", "x")]);

    const failed = queue.flushThread("t1");
    expect(failed.kind).toBe("failed");
    expect(queue.pendingEvents()).toBe(1);
    fail = false;
    const retried = queue.flushThread("t1");
    expect(retried.kind).toBe("committed");
    expect(writes).toEqual(["t1"]);
  });

  it("flushes oldest-pending first within the budget and stops at the first failure", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const order: string[] = [];
    let failThread: string | null = null;
    const queue = new RuntimeWriteQueue((threadId) => {
      if (threadId === failThread) throw Object.assign(new Error("full"), { code: "SQLITE_FULL" });
      order.push(threadId);
    });
    queue.enqueue("old", [delta("a", "1")]);
    vi.advanceTimersByTime(1_000);
    queue.enqueue("new", [delta("b", "1")]);
    queue.enqueue("newer", [delta("c", "1")]);

    const budgeted = queue.flushBudgeted({ maxThreads: 2, maxBytes: 1_000_000, maxMs: 100 });
    expect(order).toEqual(["old", "new"]);
    expect(budgeted.flushedThreads).toBe(2);
    expect(budgeted.remainingThreads).toBe(1);

    failThread = "newer";
    const failed = queue.flushBudgeted({ maxThreads: 4, maxBytes: 1_000_000, maxMs: 100 });
    expect(failed.failure?.threadId).toBe("newer");
    expect(queue.hasPending("newer")).toBe(true);
  });

  it("refuses an event above the hard single-event bound with the exact reason", () => {
    const queue = new RuntimeWriteQueue(() => undefined, { maxSingleEventBytes: 1_000 });
    const refused = queue.enqueue("t1", [bigDelta(2_000)]);
    expect(refused).toMatchObject({ kind: "refused", reason: "oversize", scope: "thread" });
    expect(queue.pendingEvents()).toBe(0);
  });

  it("commits a backlog in chunk-bounded transactions through flushBudgeted", () => {
    const chunkSizes: number[] = [];
    const queue = new RuntimeWriteQueue((_threadId, events) => chunkSizes.push(events.length));
    for (let index = 0; index < 1_200; index += 1) {
      queue.enqueue("t1", [delta(`i${index % 2}`, "x")]);
    }
    const first = queue.flushBudgeted({
      maxThreads: 4,
      maxBytes: 16 * 1_024 * 1_024,
      maxMs: 100,
      chunk: { maxEvents: 500, maxBytes: 1_024 * 1_024 },
    });
    expect(first.committedEvents).toBe(500);
    expect(queue.hasPending("t1")).toBe(true);

    queue.flushBudgeted({
      maxThreads: 4,
      maxBytes: 16 * 1_024 * 1_024,
      maxMs: 100,
      chunk: { maxEvents: 500, maxBytes: 1_024 * 1_024 },
    });
    queue.flushBudgeted({
      maxThreads: 4,
      maxBytes: 16 * 1_024 * 1_024,
      maxMs: 100,
      chunk: { maxEvents: 500, maxBytes: 1_024 * 1_024 },
    });
    expect(queue.hasPending("t1")).toBe(false);
    // Coalescing may merge same-item runs inside a chunk, so the committed
    // event counts are bounded by the chunk, never by the whole backlog.
    expect(chunkSizes.reduce((total, size) => total + size, 0)).toBeLessThanOrEqual(1_200);
    expect(chunkSizes.every((size) => size <= 500)).toBe(true);
  });

  it("reports oldest pending age and queue stats", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const queue = new RuntimeWriteQueue(() => undefined);
    queue.enqueue("t1", [delta("a", "x")]);
    vi.advanceTimersByTime(5_000);
    expect(queue.oldestPendingAgeMs()).toBe(5_000);
    const stats = queue.stats();
    expect(stats.pendingThreads).toBe(1);
    expect(stats.pendingEvents).toBe(1);
    expect(stats.admittedEvents).toBe(1);
    expect(stats.refusedEvents).toBe(0);
  });

  it("drops a thread's queued writes only through discard", () => {
    const writes: string[] = [];
    const queue = new RuntimeWriteQueue((threadId) => writes.push(threadId));
    queue.enqueue("t1", [delta("a", "stale")]);
    queue.discard("t1");
    expect(queue.hasPending("t1")).toBe(false);
    queue.flushThread("t1");
    expect(writes).toEqual([]);
  });
});
