import { describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RuntimeEvent } from "@/shared/contracts";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import { RuntimeEventBuffer } from "./runtimeEventBuffer";

function delta(threadId: string, itemId: string, stream: string, text: string): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId,
    stream: stream as "assistant_text",
    delta: text,
  } as RuntimeEvent;
}

function flushNow(buffer: RuntimeEventBuffer): SupervisorEvent[] {
  const emitted: SupervisorEvent[] = [];
  vi.useFakeTimers();
  try {
    // Append schedules a 16ms timer; run it out.
    vi.advanceTimersByTime(20);
    void buffer;
  } finally {
    vi.useRealTimers();
  }
  return emitted;
}

describe("RuntimeEventBuffer", () => {
  it("merges consecutive deltas for the same item and stream in a single-thread tick", () => {
    const emitted: SupervisorEvent[] = [];
    const buffer = new RuntimeEventBuffer((event) => {
      emitted.push(event);
    });
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "Hello"));
    buffer.append("t1", delta("t1", "item-1", "assistant_text", ", "));
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "world"));
    buffer.flush();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: "thread-runtime-event", threadId: "t1" });
    const event = (emitted[0] as { event: { delta: string } }).event;
    expect(event.delta).toBe("Hello, world");
  });

  it("keeps deltas apart across items, streams, and interleaved events", () => {
    const emitted: SupervisorEvent[] = [];
    const buffer = new RuntimeEventBuffer((event) => {
      emitted.push(event);
    });
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "a"));
    buffer.append("t1", delta("t1", "item-2", "assistant_text", "b"));
    buffer.append(
      "t1",
      delta("t1", "item-1", "reasoning" as "assistant_text", "c") as RuntimeEvent,
    );
    buffer.flush();

    expect(emitted).toHaveLength(1);
    const events = (emitted[0] as { events: RuntimeEvent[] }).events;
    expect(events.map((e) => (e as { delta: string }).delta)).toEqual(["a", "b", "c"]);
  });

  it("coalesces per thread in the multi-thread envelope", () => {
    const emitted: SupervisorEvent[] = [];
    const buffer = new RuntimeEventBuffer((event) => {
      emitted.push(event);
    });
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "one "));
    buffer.append("t2", delta("t2", "item-9", "assistant_text", "x"));
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "two"));
    buffer.flush();

    expect(emitted).toHaveLength(1);
    const multi = emitted[0] as unknown as {
      type: string;
      batches: { threadId: string; events: { delta: string }[] }[];
    };
    expect(multi.type).toBe("thread-runtime-events-multi");
    const t1 = multi.batches.find((b) => b.threadId === "t1");
    expect(t1?.events.map((e) => e.delta)).toEqual(["one two"]);
    expect(multi.batches.find((b) => b.threadId === "t2")?.events).toHaveLength(1);
  });

  it("never emits empty batches when the batch window closes", () => {
    const emitted: SupervisorEvent[] = [];
    const buffer = new RuntimeEventBuffer((event) => {
      emitted.push(event);
    });
    buffer.flush();
    expect(emitted).toHaveLength(0);
  });

  it("emits merged batches through the timer path identically", async () => {
    const emitted: SupervisorEvent[] = [];
    const buffer = new RuntimeEventBuffer((event) => {
      emitted.push(event);
    });
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "ti"));
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "mer"));
    await new Promise((r) => setTimeout(r, 25));
    expect(emitted).toHaveLength(1);
    const event = (emitted[0] as { event: { delta: string } }).event;
    expect(event.delta).toBe("timer");
    void flushNow;
  });
});

describe("RuntimeEventBuffer B1 pause and bounds", () => {
  function bigDelta(threadId: string, bytes: number): RuntimeEvent {
    return {
      type: "content.delta",
      threadId,
      itemId: "item-1",
      stream: "command_output",
      delta: "x".repeat(bytes),
    } as RuntimeEvent;
  }

  it("holds canonical events while paused and flushes them in order on resume", () => {
    const emitted: SupervisorEvent[] = [];
    const buffer = new RuntimeEventBuffer((event) => {
      emitted.push(event);
    });
    buffer.setPaused(true);
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "one "));
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "two"));
    buffer.flush();
    expect(emitted).toHaveLength(0);
    expect(buffer.hasPending()).toBe(true);

    buffer.setPaused(false);
    expect(emitted).toHaveLength(1);
    expect(buffer.hasPending()).toBe(false);
    const event = (emitted[0] as { event: { delta: string } }).event;
    expect(event.delta).toBe("one two");
  });

  it("reports a per-thread overflow once while paused and keeps the bounded batch", () => {
    const emitted: SupervisorEvent[] = [];
    const overflows: unknown[] = [];
    const buffer = new RuntimeEventBuffer(
      (event) => {
        emitted.push(event);
      },
      {
        maxPendingEventsPerThread: 2,
        maxPendingBytesPerThread: 10_000,
        maxPendingEventsGlobal: 100,
        maxPendingBytesGlobal: 1_000_000,
        onOverflow: (info) => overflows.push(info),
      },
    );
    buffer.setPaused(true);
    buffer.append("t1", bigDelta("t1", 10));
    buffer.append("t1", bigDelta("t1", 10));
    buffer.append("t1", bigDelta("t1", 10));

    expect(overflows).toHaveLength(1);
    expect(overflows[0]).toMatchObject({ threadId: "t1", reason: "thread", pendingEvents: 3 });
    // The batch is retained for the resume path; the cap is not an eviction.
    expect(buffer.pendingStats().events).toBe(3);
    buffer.setPaused(false);
    expect(emitted).toHaveLength(1);
  });

  it("reports global overflow and never flushes while paused", () => {
    const emitted: SupervisorEvent[] = [];
    const overflows: Array<{ threadId: string; reason: string }> = [];
    const buffer = new RuntimeEventBuffer(
      (event) => {
        emitted.push(event);
      },
      {
        maxPendingEventsPerThread: 100,
        maxPendingBytesPerThread: 1_000_000,
        maxPendingEventsGlobal: 2,
        maxPendingBytesGlobal: 1_000_000,
        onOverflow: (info) => overflows.push({ threadId: info.threadId, reason: info.reason }),
      },
    );
    buffer.setPaused(true);
    buffer.append("t1", bigDelta("t1", 10));
    buffer.append("t2", bigDelta("t2", 10));
    buffer.append("t3", bigDelta("t3", 10));

    expect(emitted).toHaveLength(0);
    expect(overflows.length).toBeGreaterThanOrEqual(1);
    expect(overflows.some((info) => info.reason === "global")).toBe(true);
  });

  it("flushes immediately instead of overflowing when not paused", () => {
    const emitted: SupervisorEvent[] = [];
    const overflows: unknown[] = [];
    const buffer = new RuntimeEventBuffer(
      (event) => {
        emitted.push(event);
      },
      {
        maxPendingEventsGlobal: 1,
        maxPendingBytesGlobal: 1_000_000,
        onOverflow: (info) => overflows.push(info),
      },
    );
    buffer.append("t1", bigDelta("t1", 10));
    buffer.append("t2", bigDelta("t2", 10));

    expect(emitted.length).toBeGreaterThanOrEqual(1);
    expect(overflows).toHaveLength(0);
  });
});

describe("RuntimeEventBuffer canonical credit and chunking (B1)", () => {
  function textDelta(threadId: string, itemId: string, bytes: number): RuntimeEvent {
    return {
      type: "content.delta",
      threadId,
      itemId,
      stream: "command_output",
      delta: "x".repeat(bytes),
    } as RuntimeEvent;
  }

  /** Same accounting the buffer and sender share for one single-thread envelope. */
  function singleEnvelopeBytes(event: RuntimeEvent): number {
    return 256 + estimateRuntimeEventBytes(event);
  }

  it("emits only what the live credit covers and retains the tail in order", () => {
    vi.useFakeTimers();
    const emitted: SupervisorEvent[] = [];
    const metas: Array<number | undefined> = [];
    let credit = 0;
    const first = textDelta("t1", "item-1", 400);
    const second = textDelta("t1", "item-2", 400);
    const firstBytes = singleEnvelopeBytes(first);
    const secondBytes = singleEnvelopeBytes(second);
    const buffer = new RuntimeEventBuffer(
      (event, meta) => {
        emitted.push(event);
        metas.push(meta?.estimatedBytes);
        // Model the sender ledger: emitted bytes are charged immediately.
        if (meta?.estimatedBytes !== undefined) credit -= meta.estimatedBytes;
      },
      // One event per chunk, so the credit gate decides chunk by chunk.
      { canonicalCapacity: () => credit, maxEnvelopeBytesPerThread: firstBytes },
    );

    buffer.append("t1", first);
    buffer.append("t1", second);
    buffer.flush();
    expect(emitted).toHaveLength(0);
    expect(buffer.pendingStats()).toMatchObject({ events: 2, threads: 1 });

    // Only the first chunk fits: it is emitted, the tail stays bounded.
    credit = firstBytes;
    buffer.setCanonicalCapacity(credit);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: "thread-runtime-event", threadId: "t1" });
    expect(metas).toEqual([firstBytes]);
    expect(buffer.pendingStats()).toMatchObject({ events: 1, threads: 1 });

    // The sender ledger charges the exact same estimate the gate used.
    const charged = metas[0]!;
    credit = charged + secondBytes;
    buffer.setCanonicalCapacity(credit);
    expect(emitted).toHaveLength(2);
    expect((emitted[1] as { event: { itemId: string } }).event.itemId).toBe("item-2");
    expect(buffer.hasPending()).toBe(false);
    vi.useRealTimers();
  });

  it("stops the producer when the healthy path cannot release a capped batch", () => {
    vi.useFakeTimers();
    const emitted: SupervisorEvent[] = [];
    const overflows: Array<{ threadId: string; reason: string; creditBound?: boolean }> = [];
    let credit = 1; // positive but smaller than any envelope
    const buffer = new RuntimeEventBuffer(
      (event) => {
        emitted.push(event);
      },
      {
        canonicalCapacity: () => credit,
        maxPendingEventsPerThread: 2,
        onOverflow: (info) => overflows.push(info),
      },
    );

    buffer.append("t1", textDelta("t1", "item-1", 10));
    buffer.append("t1", textDelta("t1", "item-2", 10));
    // Healthy path: the cap is exceeded, the flush cannot fit the credit, and
    // the overflow hook stops the producer instead of growing without limit.
    buffer.append("t1", textDelta("t1", "item-3", 10));
    expect(overflows).toEqual([
      expect.objectContaining({ threadId: "t1", reason: "thread", creditBound: true }),
    ]);
    expect(emitted).toHaveLength(0);
    expect(buffer.pendingStats().events).toBe(3);

    // Credit returning flushes the retained batch unchanged, in order.
    credit = Number.POSITIVE_INFINITY;
    buffer.setCanonicalCapacity(credit);
    expect(emitted).toHaveLength(1);
    const events = (emitted[0] as { events: RuntimeEvent[] }).events;
    expect(events.map((event) => (event as { itemId: string }).itemId)).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ]);
    vi.useRealTimers();
  });

  it("chunks one thread's batch at the per-thread envelope bound", () => {
    vi.useFakeTimers();
    const emitted: SupervisorEvent[] = [];
    const events = Array.from({ length: 4 }, (_, index) => textDelta("t1", `item-${index}`, 300));
    const bound = singleEnvelopeBytes(events[0]!) + 1;
    const buffer = new RuntimeEventBuffer(
      (event) => {
        emitted.push(event);
      },
      { maxEnvelopeBytesPerThread: bound, maxEnvelopeBytesTotal: 10 * bound },
    );
    for (const event of events) buffer.append("t1", event);
    buffer.flush();

    expect(emitted.length).toBeGreaterThan(1);
    for (const envelope of emitted) {
      const chunk = Array.isArray((envelope as { events?: RuntimeEvent[] }).events)
        ? (envelope as { events: RuntimeEvent[] }).events
        : [(envelope as { event: RuntimeEvent }).event];
      const chunkBytes = chunk.reduce((sum, event) => sum + estimateRuntimeEventBytes(event), 0);
      expect(chunkBytes).toBeLessThanOrEqual(bound);
    }
    vi.useRealTimers();
  });

  it("refuses a single event above the hard single-event bound", () => {
    const emitted: SupervisorEvent[] = [];
    const overflows: Array<{ reason: string }> = [];
    const buffer = new RuntimeEventBuffer(
      (event) => {
        emitted.push(event);
      },
      { maxSingleEventBytes: 1_000, onOverflow: (info) => overflows.push(info) },
    );
    buffer.append("t1", textDelta("t1", "item-1", 5_000));

    expect(overflows).toEqual([expect.objectContaining({ threadId: "t1", reason: "oversize" })]);
    expect(emitted).toHaveLength(0);
    expect(buffer.hasPending()).toBe(false);
  });

  it("holds a stop marker behind retained content and releases it after the tail", () => {
    vi.useFakeTimers();
    const emitted: SupervisorEvent[] = [];
    let credit = 0;
    const buffer = new RuntimeEventBuffer(
      (event) => {
        emitted.push(event);
      },
      { canonicalCapacity: () => credit },
    );
    buffer.append("t1", textDelta("t1", "item-1", 50));
    buffer.flush();
    buffer.queueStopMarker("t1", {
      type: "thread-runtime-event",
      threadId: "t1",
      event: { type: "error", threadId: "t1", message: "stopped" },
    });
    // Nothing is published ahead of the content it supersedes.
    expect(emitted).toHaveLength(0);
    expect(buffer.hasPending()).toBe(true);

    credit = Number.POSITIVE_INFINITY;
    buffer.setCanonicalCapacity(credit);
    expect(emitted).toHaveLength(2);
    expect((emitted[0] as { event: { delta?: string } }).event.delta).toBeDefined();
    expect((emitted[1] as { event: { type: string } }).event.type).toBe("error");
    expect(buffer.hasPending()).toBe(false);
    vi.useRealTimers();
  });
});
