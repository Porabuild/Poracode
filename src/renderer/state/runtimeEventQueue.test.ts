import { describe, expect, it } from "vitest";
import {
  RuntimeEventQueue,
  runtimeBatchAppliedSequences,
  runtimeBatchHasPartialFrame,
} from "./runtimeEventQueue";

const event = (text: string) =>
  ({
    type: "item.delta",
    threadId: "thread",
    itemId: "item",
    delta: { text },
  }) as never;

describe("RuntimeEventQueue", () => {
  it("keeps independent thread queues bounded and drains selected threads", () => {
    const queue = new RuntimeEventQueue({ maxEvents: 3, maxBytes: 10_000, maxThreadBytes: 10_000 });
    expect(queue.enqueue("a", [event("a")])).toMatchObject({ accepted: true });
    expect(queue.enqueue("b", [event("b")])).toMatchObject({ accepted: true });
    expect(queue.drain((threadId) => threadId === "a")).toEqual([
      { threadId: "a", events: [event("a")] },
    ]);
    expect(queue.getDiagnostics()).toMatchObject({ queuedEvents: 1, blockedThreads: 0 });
    expect(queue.drain(() => true)).toEqual([{ threadId: "b", events: [event("b")] }]);
    expect(queue.getDiagnostics()).toMatchObject({ queuedEvents: 0, queuedBytes: 0 });
  });

  it("drops the incomplete thread batch and blocks it after overflow", () => {
    const queue = new RuntimeEventQueue({ maxEvents: 1, maxBytes: 10_000, maxThreadBytes: 10_000 });
    queue.enqueue("thread", [event("one")]);
    expect(queue.enqueue("thread", [event("two"), event("three")])).toEqual({
      accepted: false,
      overflowed: true,
      blocked: true,
    });
    expect(queue.drain(() => true)).toEqual([]);
    expect(queue.enqueue("thread", [event("late")])).toMatchObject({ blocked: true });
    expect(queue.getDiagnostics()).toMatchObject({
      queuedEvents: 1,
      blockedThreads: 1,
      overflowCount: 1,
    });
  });

  it("resumes only after the caller completes authoritative recovery", () => {
    const queue = new RuntimeEventQueue({ maxEvents: 2, maxBytes: 10_000, maxThreadBytes: 10_000 });
    queue.enqueue("thread", [event("one")]);
    expect(queue.enqueue("thread", [event("two"), event("three")]).overflowed).toBe(true);
    expect(queue.enqueue("thread", [event("blocked")]).blocked).toBe(true);
    queue.resume("thread");
    expect(queue.enqueue("thread", [event("recovered")]).accepted).toBe(true);
  });

  it("retains a bounded tail received during recovery until resume", () => {
    const queue = new RuntimeEventQueue({ maxEvents: 1, maxBytes: 10_000, maxThreadBytes: 10_000 });
    queue.enqueue("thread", [event("one")]);
    expect(queue.enqueue("thread", [event("two"), event("three")]).overflowed).toBe(true);
    expect(queue.enqueue("thread", [event("after-baseline")])).toMatchObject({
      accepted: true,
      blocked: true,
    });
    expect(queue.drain(() => true)).toEqual([]);
    queue.resume("thread");
    expect(queue.drain(() => true)).toEqual([
      { threadId: "thread", events: [event("after-baseline")] },
    ]);
  });

  it("drops a recovered tail already covered by the authoritative sequence", () => {
    const queue = new RuntimeEventQueue({ maxEvents: 2, maxBytes: 10_000, maxThreadBytes: 10_000 });
    queue.enqueue("thread", [event("one")], 1);
    expect(queue.enqueue("thread", [event("two"), event("three")], 2).overflowed).toBe(true);
    queue.enqueue("thread", [event("covered")], 2);
    queue.enqueue("thread", [event("new")], 3);
    queue.discardThroughSequence("thread", 2);
    queue.resume("thread");
    expect(queue.drain(() => true)).toEqual([{ threadId: "thread", events: [event("new")] }]);
  });

  it("does not unblock a recovery when a reset discards stale queued data", () => {
    const queue = new RuntimeEventQueue({ maxEvents: 2, maxBytes: 10_000, maxThreadBytes: 10_000 });
    queue.enqueue("thread", [event("one")]);
    expect(queue.enqueue("thread", [event("two"), event("three")]).overflowed).toBe(true);
    queue.discard("thread");
    expect(queue.enqueue("thread", [event("still-blocked")]).blocked).toBe(true);
    queue.resume("thread");
    expect(queue.enqueue("thread", [event("recovered")]).accepted).toBe(true);
  });

  it("arbitrates interleaved ipc and loopback sequences independently", () => {
    const queue = new RuntimeEventQueue({ maxEvents: 8, maxBytes: 10_000, maxThreadBytes: 10_000 });
    expect(queue.enqueue("thread", [event("ipc-5")], 5, "ipc").accepted).toBe(true);
    expect(queue.enqueue("thread", [event("loopback-1")], 1, "loopback").accepted).toBe(true);
    queue.discardThroughSequence("thread", 5, "ipc");
    expect(queue.drain(() => true)).toEqual([
      { threadId: "thread", events: [event("loopback-1")] },
    ]);
  });

  it("budgets a large drain into ordered units and reports remaining work", () => {
    const queue = new RuntimeEventQueue({
      maxEvents: 2_000,
      maxBytes: 10_000_000,
      maxThreadBytes: 10_000_000,
    });
    const events = Array.from({ length: 1_200 }, (_, index) => event(`item-${index}`));
    queue.enqueue("thread", events);

    const first = queue.drainBudgeted(() => true, 0);
    expect(first.hasMore).toBe(true);
    expect(first.batches).toHaveLength(1);
    expect(first.batches[0]!.events).toHaveLength(512);

    const second = queue.drainBudgeted(() => true, 0);
    expect(second.hasMore).toBe(true);
    expect(second.batches[0]!.events).toHaveLength(512);

    const third = queue.drainBudgeted(() => true, 0);
    expect(third.hasMore).toBe(false);
    expect(third.batches[0]!.events).toHaveLength(176);

    // Order is preserved across the slice boundaries.
    expect([
      ...first.batches[0]!.events,
      ...second.batches[0]!.events,
      ...third.batches[0]!.events,
    ]).toEqual(events);
    expect(queue.getDiagnostics()).toMatchObject({ queuedEvents: 0, queuedBytes: 0 });
  });

  it("keeps whole-thread batches atomic for the synchronous drain", () => {
    const queue = new RuntimeEventQueue({
      maxEvents: 2_000,
      maxBytes: 10_000_000,
      maxThreadBytes: 10_000_000,
    });
    const events = Array.from({ length: 1_200 }, (_, index) => event(`item-${index}`));
    queue.enqueue("thread", events);
    const drained = queue.drain(() => true);
    expect(drained).toEqual([{ threadId: "thread", events }]);
  });

  it("caps the combined slice and rotates a busy thread behind waiting threads", () => {
    const queue = new RuntimeEventQueue();
    queue.enqueue(
      "busy",
      Array.from({ length: 1_200 }, (_, i) => event(`busy-${i}`)),
      7,
    );
    queue.enqueue("steered", [event("steer")], 8, "loopback");
    queue.enqueue(
      "background",
      Array.from({ length: 600 }, (_, i) => event(`other-${i}`)),
      9,
    );

    const first = queue.drainBudgeted(
      () => true,
      4,
      () => 0,
    );
    expect(first.batches.map((batch) => batch.threadId)).toEqual(["busy"]);
    expect(first.batches[0]!.events).toHaveLength(512);
    expect(runtimeBatchHasPartialFrame(first.batches[0]!)).toBe(true);
    expect(runtimeBatchAppliedSequences(first.batches[0]!)).toEqual({});

    const second = queue.drainBudgeted(
      () => true,
      4,
      () => 0,
    );
    expect(second.batches.map((batch) => batch.threadId)).toEqual(["steered", "background"]);
    expect(second.batches.reduce((count, batch) => count + batch.events.length, 0)).toBe(512);
    expect(runtimeBatchAppliedSequences(second.batches[0]!)).toEqual({ loopback: 8 });

    const remaining = queue.drain(() => true);
    expect(remaining.map((batch) => batch.threadId)).toEqual(["busy", "background"]);
    expect(runtimeBatchAppliedSequences(remaining[0]!)).toEqual({ ipc: 7 });
    expect(runtimeBatchAppliedSequences(remaining[1]!)).toEqual({ ipc: 9 });
  });

  it("skips blocked threads without letting them prevent a continuation", () => {
    const queue = new RuntimeEventQueue();
    queue.enqueue("recovering", [event("held")]);
    queue.block("recovering");
    queue.enqueue(
      "a",
      Array.from({ length: 600 }, () => event("a")),
    );
    queue.enqueue("b", [event("b")]);
    expect(queue.drainBudgeted(() => true, 0).hasMore).toBe(true);
    expect(queue.drainBudgeted(() => true, 0).batches[0]!.threadId).toBe("b");
    expect(queue.drain(() => true)[0]!.threadId).toBe("a");
    expect(queue.drainBudgeted(() => true, 0)).toEqual({ batches: [], hasMore: false });
    queue.resume("recovering");
    expect(queue.drain(() => true)[0]!.threadId).toBe("recovering");
  });
});
