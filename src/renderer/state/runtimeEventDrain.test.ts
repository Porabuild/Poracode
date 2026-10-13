import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { drainRuntimeEventQueue } from "./runtimeEventDrain";
import { RuntimeEventQueue } from "./runtimeEventQueue";

const events = (threadId: string, count: number): RuntimeEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    type: "content.delta",
    threadId,
    itemId: "item",
    stream: "assistant_text",
    delta: String(i),
  }));

type Apply = Parameters<typeof drainRuntimeEventQueue>[2];

describe("drainRuntimeEventQueue", () => {
  it("yields after an expensive apply and serves another thread on continuation", () => {
    const queue = new RuntimeEventQueue();
    queue.enqueue("busy", events("busy", 1_200));
    queue.enqueue("steered", events("steered", 1));
    let time = 0;
    const apply = vi.fn<Apply>(() => {
      time += 6;
    });

    expect(
      drainRuntimeEventQueue(
        queue,
        () => true,
        apply,
        4,
        () => time,
      ),
    ).toEqual({
      drainedThreads: 1,
      drainedEvents: 512,
      hasMore: true,
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![0][0]!.threadId).toBe("busy");

    const continuation = drainRuntimeEventQueue(
      queue,
      () => true,
      apply,
      4,
      () => time,
    );
    expect(apply.mock.calls[1]![0][0]!.threadId).toBe("steered");
    expect(continuation.hasMore).toBe(true);
  });

  it("batches small updates from five threads in one store commit", () => {
    const queue = new RuntimeEventQueue();
    for (let i = 0; i < 5; i++) queue.enqueue(String(i), events(String(i), 2));
    const apply = vi.fn<Apply>();
    expect(
      drainRuntimeEventQueue(
        queue,
        () => true,
        apply,
        4,
        () => 0,
      ),
    ).toEqual({
      drainedThreads: 5,
      drainedEvents: 10,
      hasMore: false,
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![1]).toEqual({ drainedThreads: 5, drainedEvents: 10 });
  });

  it("rechecks thread eligibility between slices after post-apply recovery starts", () => {
    const queue = new RuntimeEventQueue();
    queue.enqueue("busy", events("busy", 600));
    queue.enqueue("recovering", events("recovering", 1));
    const apply = vi.fn<Apply>(() => queue.block("recovering"));
    const result = drainRuntimeEventQueue(
      queue,
      () => true,
      apply,
      4,
      () => 0,
    );
    expect(result).toEqual({ drainedThreads: 1, drainedEvents: 600, hasMore: false });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(queue.getDiagnostics().queuedEvents).toBe(1);
  });

  it("keeps synchronous recovery flushes atomic regardless of apply cost", () => {
    const queue = new RuntimeEventQueue();
    queue.enqueue("busy", events("busy", 1_200));
    queue.enqueue("other", events("other", 1));
    const apply = vi.fn<Apply>();
    expect(drainRuntimeEventQueue(queue, () => true, apply, Infinity)).toEqual({
      drainedThreads: 2,
      drainedEvents: 1_201,
      hasMore: false,
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![0][0]!.events).toHaveLength(1_200);
  });
});
