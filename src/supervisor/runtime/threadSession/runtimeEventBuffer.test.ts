import { describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RuntimeEvent } from "@/shared/contracts";
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
    const buffer = new RuntimeEventBuffer((event) => emitted.push(event));
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
    const buffer = new RuntimeEventBuffer((event) => emitted.push(event));
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
    const buffer = new RuntimeEventBuffer((event) => emitted.push(event));
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
    const buffer = new RuntimeEventBuffer((event) => emitted.push(event));
    buffer.flush();
    expect(emitted).toHaveLength(0);
  });

  it("emits merged batches through the timer path identically", async () => {
    const emitted: SupervisorEvent[] = [];
    const buffer = new RuntimeEventBuffer((event) => emitted.push(event));
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "ti"));
    buffer.append("t1", delta("t1", "item-1", "assistant_text", "mer"));
    await new Promise((r) => setTimeout(r, 25));
    expect(emitted).toHaveLength(1);
    const event = (emitted[0] as { event: { delta: string } }).event;
    expect(event.delta).toBe("timer");
    void flushNow;
  });
});
