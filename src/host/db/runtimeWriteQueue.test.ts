import { describe, expect, it, vi } from "vitest";
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

describe("RuntimeWriteQueue", () => {
  it("defers writes until the flush window elapses, then writes once", () => {
    vi.useFakeTimers();
    try {
      const writes: Array<{ threadId: string; events: RuntimeEvent[] }> = [];
      const queue = new RuntimeWriteQueue(
        (threadId, events) => writes.push({ threadId, events }),
        250,
      );

      queue.enqueue("t1", [started("a")]);
      for (let i = 0; i < 40; i += 1) queue.enqueue("t1", [delta("a", `chunk${i} `)]);
      expect(writes).toHaveLength(0);

      vi.advanceTimersByTime(250);

      expect(writes).toHaveLength(1);
      expect(writes[0]!.events).toHaveLength(2);
      expect(writes[0]!.events[1]).toMatchObject({ delta: expect.stringContaining("chunk39 ") });
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes one thread on demand and leaves the others queued", () => {
    vi.useFakeTimers();
    try {
      const writes: string[] = [];
      const queue = new RuntimeWriteQueue((threadId) => writes.push(threadId), 250);
      queue.enqueue("t1", [delta("a", "x")]);
      queue.enqueue("t2", [delta("b", "y")]);

      queue.flush("t1");

      expect(writes).toEqual(["t1"]);
      vi.advanceTimersByTime(250);
      expect(writes).toEqual(["t1", "t2"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a thread's queued writes when its rows are being replaced", () => {
    vi.useFakeTimers();
    try {
      const writes: string[] = [];
      const queue = new RuntimeWriteQueue((threadId) => writes.push(threadId), 250);
      queue.enqueue("t1", [delta("a", "stale")]);

      queue.discard("t1");
      vi.advanceTimersByTime(250);

      expect(writes).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains queued writes when a flush fails so they can be retried", () => {
    let fail = true;
    const writes: string[] = [];
    const queue = new RuntimeWriteQueue((threadId) => {
      if (fail) throw new Error("busy");
      writes.push(threadId);
    });
    queue.enqueue("t1", [delta("a", "x")]);

    expect(() => queue.flush()).toThrow("busy");
    fail = false;
    queue.flush();

    expect(writes).toEqual(["t1"]);
  });

  it("retries a failed timer-driven flush", () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      let fail = true;
      const writes: string[] = [];
      const queue = new RuntimeWriteQueue((threadId) => {
        if (fail) throw new Error("busy");
        writes.push(threadId);
      }, 250);
      queue.enqueue("t1", [delta("a", "x")]);

      vi.advanceTimersByTime(250);
      fail = false;
      vi.advanceTimersByTime(250);

      expect(writes).toEqual(["t1"]);
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
      vi.useRealTimers();
    }
  });
});
