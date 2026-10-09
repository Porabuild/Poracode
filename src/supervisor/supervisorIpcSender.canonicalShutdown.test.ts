import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { SupervisorIpcSender } from "./supervisorIpcSender";
import { RuntimeEventRouter } from "./runtime/threadSession/runtimeEventRouter";
import type { RuntimeEvent } from "@/shared/contracts";

const event = {
  type: "thread-runtime-event",
  threadId: "thread",
  event: { type: "item.started", threadId: "thread", itemId: "final", itemType: "tool_call" },
} satisfies SupervisorEvent;

function fixture() {
  const sender = new SupervisorIpcSender({
    send: (_message, callback) => {
      callback(null);
      return true;
    },
    onError: vi.fn<(error: Error) => void>(),
  });
  const generation = sender.getCanonicalFlowGeneration();
  sender.setCanonicalCredit({ windowBytes: 1_000_000, generation });
  sender.emit(event);
  return { sender, generation };
}

function bufferedFixture(credit = true) {
  const wire: SupervisorEvent[] = [];
  const sender = new SupervisorIpcSender({
    send: (message, callback) => {
      if (!("type" in message)) throw new Error("Unexpected reply in canonical fixture");
      wire.push(message);
      callback(null);
      return true;
    },
    onError: vi.fn<(error: Error) => void>(),
    onCanonicalCapacityChange: (bytes) => router.setCanonicalCapacity(bytes),
    canonicalDrain: {
      flush: () => router.flushAllForShutdown(),
      hasPending: () => router.hasPending(),
    },
  });
  const router = new RuntimeEventRouter((message, meta) => sender.emit(message, meta), {
    canonicalCapacity: () => sender.canonicalCreditRemaining(),
  });
  const generation = sender.getCanonicalFlowGeneration();
  if (credit) sender.setCanonicalCredit({ windowBytes: 1_000_000, generation });
  return { sender, router, generation, wire };
}

describe("canonical shutdown admission drain", () => {
  afterEach(() => vi.useRealTimers());

  it("does not equate completed IPC callbacks with host-resolved canonical envelopes", async () => {
    vi.useFakeTimers();
    const { sender, generation } = fixture();
    let settled = false;
    const drained = sender.flushAndWait(1_000).then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    sender.acknowledgeCanonicalFlow(1, generation);
    await expect(drained).resolves.toBe(true);
  });

  it("fails at the existing deadline when the host never resolves the final envelope", async () => {
    vi.useFakeTimers();
    const { sender } = fixture();
    const drained = sender.flushAndWait(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(drained).resolves.toBe(false);
  });

  it("waits for the credit-held tail and its own ACK after the first ACK releases it", async () => {
    vi.useFakeTimers();
    const { sender, router, generation, wire } = bufferedFixture();
    router.append("thread", { ...event.event, itemId: "first" });
    router.flush();
    const firstCost = 1_000_000 - sender.canonicalCreditRemaining();
    sender.setCanonicalCredit({ windowBytes: firstCost, generation });
    router.append("thread", event.event);
    let settled = false;
    const drained = sender.flushAndWait(1_000).then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    expect(wire).toHaveLength(1);
    expect(router.hasPending()).toBe(true);
    expect(settled).toBe(false);

    sender.acknowledgeCanonicalFlow(1, generation);
    await Promise.resolve();
    expect(wire).toHaveLength(2);
    expect(router.hasPending()).toBe(false);
    expect(settled).toBe(false);
    sender.acknowledgeCanonicalFlow(2, "previous-boot");
    await Promise.resolve();
    expect(settled).toBe(false);
    sender.acknowledgeCanonicalFlow(2, generation);
    await expect(drained).resolves.toBe(true);
  });

  it.each(["paused", "zero-credit"] as const)(
    "fails shutdown with an empty sender queue and a %s producer tail",
    async (reason) => {
      vi.useFakeTimers();
      const { sender, router, generation, wire } = bufferedFixture();
      if (reason === "paused") router.setPaused(true);
      else sender.setCanonicalCredit({ windowBytes: 0, generation });
      router.append("thread", event.event);
      const drained = sender.flushAndWait(1_000);
      expect(sender.queueDepth.messages).toBe(0);
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(drained).resolves.toBe(false);
      expect(wire).toHaveLength(0);
      expect(router.hasPending()).toBe(true);
    },
  );

  it("publishes all unsubscribed child tails once without requiring ACKs from a legacy host", async () => {
    vi.useFakeTimers();
    const { sender, router, wire } = bufferedFixture(false);
    for (const threadId of ["a", "b"]) {
      router.append(threadId, {
        type: "item.started",
        threadId,
        itemId: `child-${threadId}`,
        itemType: "assistant_message",
        parentItemId: `parent-${threadId}`,
      });
      router.append(threadId, {
        type: "content.delta",
        threadId,
        itemId: `child-${threadId}`,
        stream: "assistant_text",
        delta: `tail-${threadId}`,
      });
    }
    router.flush();
    expect(wire).toHaveLength(0);
    await expect(sender.flushAndWait(1_000)).resolves.toBe(true);
    const events = wire.flatMap((message): RuntimeEvent[] => {
      if (message.type === "thread-runtime-event") return [message.event];
      if (message.type === "thread-runtime-events") return message.events;
      if (message.type === "thread-runtime-events-multi")
        return message.batches.flatMap((batch) => batch.events);
      return [];
    });
    expect(events).toHaveLength(4);
    expect(events.filter((e) => e.type === "content.delta").map((e) => e.delta)).toEqual([
      "tail-a",
      "tail-b",
    ]);
    const envelopeCount = wire.length;
    await expect(sender.flushAndWait(1_000)).resolves.toBe(true);
    expect(wire).toHaveLength(envelopeCount);
  });

  it("includes producer-flush time in the existing shutdown deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const flush = vi.fn<() => void>(() => vi.advanceTimersByTime(600));
    const sender = new SupervisorIpcSender({
      send: (_message, callback) => {
        callback(null);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
      canonicalDrain: { flush, hasPending: () => true },
    });
    sender.flush();
    expect(flush).not.toHaveBeenCalled();
    let settled = false;
    const drained = sender.flushAndWait(1_000).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(399);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(drained).resolves.toBe(false);
    expect(flush).toHaveBeenCalledOnce();
  });

  it("refuses success when the producer flush finishes after the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const sender = new SupervisorIpcSender({
      send: (_message, callback) => {
        callback(null);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
      canonicalDrain: {
        flush: () => vi.advanceTimersByTime(1_001),
        hasPending: () => false,
      },
    });
    await expect(sender.flushAndWait(1_000)).resolves.toBe(false);
  });

  it("refuses a late ACK even if the timeout callback has not dispatched", async () => {
    vi.useFakeTimers();
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const { sender, generation } = fixture();
      const drained = sender.flushAndWait(1_000);
      clock.mockReturnValue(1_001);
      sender.acknowledgeCanonicalFlow(1, generation);
      await expect(drained).resolves.toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  it("refuses clean shutdown after a private tail is dropped by the default full bulk queue", async () => {
    vi.useFakeTimers();
    const callbacks: Array<(error: Error | null) => void> = [];
    const onDropped = vi.fn<(dropped: { bytes: number; type: string }) => void>();
    let sends = 0;
    const sender = new SupervisorIpcSender({
      send: (_message, callback) => {
        sends++;
        callbacks.push(callback);
        return sends !== 1;
      },
      onError: vi.fn<(error: Error) => void>(),
      onCanonicalOverflow: vi.fn<(error: Error, message: SupervisorEvent) => void>(),
      onCanonicalDropped: onDropped,
      onCanonicalCapacityChange: (bytes) => router.setCanonicalCapacity(bytes),
      canonicalDrain: {
        flush: () => router.flushAllForShutdown(),
        hasPending: () => router.hasPending(),
      },
    });
    const router = new RuntimeEventRouter((message, meta) => sender.emit(message, meta), {
      canonicalCapacity: () => sender.canonicalCreditRemaining(),
    });
    const generation = sender.getCanonicalFlowGeneration();
    const mb = 1024 * 1024;
    sender.setCanonicalCredit({ windowBytes: 16 * mb, generation });
    // One native send is in flight and the actual default 8 MiB bulk queue is full.
    for (let i = 0; i < 9; i++) sender.emit(event, { estimatedBytes: mb });
    expect(sender.queueDepth.bytes).toBe(8 * mb);
    router.append("thread", {
      type: "item.started",
      threadId: "thread",
      itemId: "child",
      itemType: "assistant_message",
      parentItemId: "parent",
    });
    const drained = sender.flushAndWait(1_000);
    expect(onDropped).toHaveBeenCalledOnce();
    while (callbacks.length) callbacks.shift()!(null);
    sender.acknowledgeCanonicalFlow(9, generation);
    await expect(drained).resolves.toBe(false);
  });
});
