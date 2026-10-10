import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import * as runtimeEventSize from "@/shared/runtimeEventSize";
import { CanonicalFlowLedger } from "../../canonicalFlowLedger";
import { RuntimeEventBuffer, type RuntimeEventBufferOptions } from "./runtimeEventBuffer";

function delta(threadId: string, text: string, itemId = "item-1"): RuntimeEvent {
  return { type: "content.delta", threadId, itemId, stream: "assistant_text", delta: text };
}

function eventsOf(envelope: SupervisorEvent): RuntimeEvent[] {
  switch (envelope.type) {
    case "thread-runtime-event":
      return [envelope.event];
    case "thread-runtime-events":
      return envelope.events;
    case "thread-runtime-events-multi":
      return envelope.batches.flatMap((batch) => batch.events);
    default:
      throw new Error(`Unexpected envelope: ${envelope.type}`);
  }
}

function creditBuffer(remaining: number, options: RuntimeEventBufferOptions = {}) {
  const state = { remaining, accepts: true };
  const sent: SupervisorEvent[] = [];
  const charges: number[] = [];
  const emit = vi.fn<(envelope: SupervisorEvent, meta?: { estimatedBytes?: number }) => boolean>(
    (envelope, meta) => {
      if (!state.accepts) return false;
      const bytes = meta!.estimatedBytes!;
      // Stop markers use the control reserve; content must fit the live credit.
      const available = eventsOf(envelope).some((event) => event.type !== "error")
        ? state.remaining
        : Number.POSITIVE_INFINITY;
      expect(bytes).toBeLessThanOrEqual(available);
      state.remaining -= bytes;
      sent.push(envelope);
      charges.push(bytes);
      return true;
    },
  );
  const buffer = new RuntimeEventBuffer(emit, {
    ...options,
    canonicalCapacity: () => state.remaining,
  });
  return { buffer, state, sent, charges, emit };
}

function stopMarker(threadId: string): SupervisorEvent {
  return {
    type: "thread-runtime-event",
    threadId,
    event: { type: "error", threadId, message: "stopped" },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RuntimeEventBuffer healthy acknowledgement batching", () => {
  it("keeps the timer cadence for 33 staggered 100 Hz streams with healthy cumulative acks", () => {
    function runCadence(notifyBuffer: boolean) {
      vi.setSystemTime(0);
      const estimate = vi.spyOn(runtimeEventSize, "estimateRuntimeEventBytes");
      estimate.mockClear();
      const ledger = new CanonicalFlowLedger({ generation: "cadence", maxEntries: 2_048 });
      ledger.setWindow({ windowBytes: 8 * 1024 * 1024, generation: ledger.generation });
      const expected = new Map<string, string>();
      const received = new Map<string, string>();
      const sentAt: number[] = [];
      let emittedEvents = 0;
      let acknowledgements = 0;
      let ackScheduled = false;
      const buffer = new RuntimeEventBuffer(
        (envelope, meta) => {
          expect(meta?.estimatedBytes).toBeTypeOf("number");
          ledger.assign(meta!.estimatedBytes!);
          expect(ledger.remaining()).toBeGreaterThan(0);
          sentAt.push(Date.now());
          for (const event of eventsOf(envelope)) {
            if (event.type !== "content.delta") throw new Error("Expected a delta");
            received.set(event.threadId, (received.get(event.threadId) ?? "") + event.delta);
            emittedEvents += 1;
          }
          // Model the host's cumulative acknowledgement, two milliseconds
          // after admission. Credit stays healthy throughout this workload.
          if (!ackScheduled) {
            ackScheduled = true;
            setTimeout(() => {
              ackScheduled = false;
              if (!ledger.acknowledge(ledger.highestSeq(), ledger.generation)) {
                throw new Error("Cumulative acknowledgement was rejected");
              }
              acknowledgements += 1;
              if (notifyBuffer) buffer.setCanonicalCapacity(ledger.remaining());
            }, 2);
          }
        },
        { canonicalCapacity: () => ledger.remaining() },
      );
      const flush = vi.spyOn(buffer, "flush");

      // 3,300 source events / 528,000 text units in one simulated second.
      // Stagger thread phases across the 10 ms source period so an ack can
      // arrive between threads as it does with independent provider streams.
      for (let ms = 0; ms < 1_000; ms += 1) {
        for (let thread = 0; thread < 33; thread += 1) {
          if (ms % 10 !== thread % 10) continue;
          const threadId = `thread-${thread}`;
          const text = String(ms).padStart(3, "0").padEnd(160, "x");
          expected.set(threadId, (expected.get(threadId) ?? "") + text);
          buffer.append(threadId, delta(threadId, text));
        }
        vi.advanceTimersByTime(1);
      }
      vi.advanceTimersByTime(20);

      expect(received).toEqual(expected);
      expect(buffer.pendingStats()).toEqual({ events: 0, bytes: 0, threads: 0 });
      expect(ledger.outstanding()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      return {
        envelopes: sentAt.length,
        emittedEvents,
        estimatorCalls: estimate.mock.calls.length,
        flushCalls: flush.mock.calls.length,
        acknowledgements,
        firstEnvelopeAt: sentAt[0],
      };
    }

    // The control still acknowledges the real ledger; only the notification
    // to the buffer is omitted, leaving the existing 16 ms batching intact.
    const timerOnly = runCadence(false);
    expect(timerOnly).toEqual({
      envelopes: 63,
      emittedEvents: 2_071,
      estimatorCalls: 7_442,
      flushCalls: 63,
      acknowledgements: 63,
      firstEnvelopeAt: 16,
    });
    // Before the fix, the same notified run produced 493 envelopes, 3,279
    // coalesced events, 13,137 estimates and 494 flush calls (no content loss).
    expect(runCadence(true)).toEqual(timerOnly);
  });

  it("preserves the original deadline across healthy notifications and a brief credit outage", () => {
    const { buffer, state, sent } = creditBuffer(100_000);
    buffer.append("t1", delta("t1", "first"));
    vi.advanceTimersByTime(5);
    state.remaining = 0;
    buffer.setCanonicalCapacity(100_000); // The argument cannot override live credit.
    vi.advanceTimersByTime(5);
    state.remaining = 100_000;
    buffer.setCanonicalCapacity(0);
    buffer.append("t2", delta("t2", "second"));
    for (let ms = 10; ms < 15; ms += 1) {
      buffer.setCanonicalCapacity(state.remaining);
      vi.advanceTimersByTime(1);
    }
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(1);
    expect(eventsOf(sent[0]!)).toEqual([delta("t1", "first"), delta("t2", "second")]);
  });
});

describe("RuntimeEventBuffer held batch release", () => {
  it.each(["capacity", "sender"])(
    "refreshes later chunk sizes after a %s callback changes their payload",
    (callback) => {
      const events = [
        delta("t1", "seed", "i1"),
        delta("t1", "seed", "i2"),
        delta("t1", "seed", "i3"),
        delta("t1", "seed", "i4"),
        delta("t1", "seed", "i5"),
        delta("t2", "seed", "i6"),
      ];
      const chunkLimit = Math.max(...events.map(runtimeEventSize.estimateRuntimeEventBytes));
      let armed = false;
      const changeLaterChunk = () => {
        if (!armed) return;
        armed = false;
        const later = events[3]!;
        if (later.type !== "content.delta") throw new Error("Expected a delta");
        later.delta = "changed λ 😀".repeat(1_000);
      };
      const received: RuntimeEvent[] = [];
      const groups: string[][] = [];
      const buffer = new RuntimeEventBuffer(
        (envelope, meta) => {
          const sent = eventsOf(envelope);
          expect(meta?.estimatedBytes).toBe(
            256 +
              sent.reduce(
                (sum, event) => sum + runtimeEventSize.estimateRuntimeEventBytes(event),
                0,
              ),
          );
          received.push(...sent);
          groups.push(sent.map((event) => ("itemId" in event ? event.itemId : "")));
          if (callback === "sender") changeLaterChunk();
        },
        {
          maxEnvelopeBytesPerThread: chunkLimit,
          maxEnvelopeBytesTotal: 2 * (256 + chunkLimit),
          canonicalCapacity: () => {
            if (callback === "capacity") changeLaterChunk();
            return Number.POSITIVE_INFINITY;
          },
        },
      );
      for (const event of events) buffer.append(event.threadId, event);
      armed = true;
      buffer.flush();
      expect(armed).toBe(false);
      expect(received).toEqual(events);
      expect(groups).toEqual([["i1", "i2"], ["i3"], ["i4"], ["i5", "i6"]]);
      expect(buffer.pendingStats()).toEqual({ events: 0, bytes: 0, threads: 0 });
    },
  );

  it("does not repeat global overflow notifications after nested child admission", () => {
    let capacity = 0;
    const notified: string[] = [];
    const sent: SupervisorEvent[] = [];
    let buffer!: RuntimeEventBuffer;
    buffer = new RuntimeEventBuffer(
      (e) => {
        sent.push(e);
      },
      {
        canonicalCapacity: () => capacity,
        maxPendingBytesGlobal: 5_000,
        maxPendingBytesPerThread: 4_000,
        onOverflow: (info) => {
          notified.push(info.threadId);
          if (info.threadId === "a") buffer.append("large", delta("large", "private tail"));
        },
      },
    );
    buffer.append("a", delta("a", "a".repeat(1_000)));
    buffer.append("b", delta("b", "b".repeat(1_000)));
    buffer.append("large", delta("large", "c".repeat(6_000)));
    expect(notified).toEqual(["large", "a", "b"]);
    capacity = Number.POSITIVE_INFINITY;
    buffer.setCanonicalCapacity(capacity);
    const contents = sent.flatMap(eventsOf).filter((e) => e.type === "content.delta");
    expect(contents.map((e) => e.delta).join("")).toBe(
      "a".repeat(1_000) + "b".repeat(1_000) + "c".repeat(6_000) + "private tail",
    );
    expect(buffer.hasPending()).toBe(false);
  });

  it.each([1, 2])(
    "releases %i zero-credit thread(s) immediately using live capacity",
    (threads) => {
      const { buffer, state, sent } = creditBuffer(0);
      const events = Array.from({ length: threads }, (_, index) => delta(`t${index}`, "held"));
      for (const event of events) buffer.append(event.threadId, event);
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(1_000);
      buffer.setCanonicalCapacity(100_000);
      expect(sent).toHaveLength(0);

      state.remaining = 100_000;
      buffer.setCanonicalCapacity(0);
      expect(sent.flatMap(eventsOf)).toEqual(events);
      expect(buffer.pendingStats()).toEqual({ events: 0, bytes: 0, threads: 0 });
    },
  );

  it.each([1, 2])(
    "releases %i thread(s) after a timer found positive but insufficient credit, without another append",
    (threads) => {
      const { buffer, state, sent } = creditBuffer(1);
      const events = Array.from({ length: threads }, (_, index) => delta(`t${index}`, "held"));
      const bytes =
        256 +
        events.reduce((sum, event) => sum + runtimeEventSize.estimateRuntimeEventBytes(event), 0);
      for (const event of events) buffer.append(event.threadId, event);
      vi.advanceTimersByTime(16);
      expect(sent).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      state.remaining = bytes - 1;
      buffer.setCanonicalCapacity(bytes);
      expect(sent).toHaveLength(0);

      vi.advanceTimersByTime(1_000);
      state.remaining = bytes;
      buffer.setCanonicalCapacity(0);
      expect(sent.flatMap(eventsOf)).toEqual(events);
      expect(state.remaining).toBe(0);
      expect(buffer.hasPending()).toBe(false);

      // The late release must leave the next healthy batch able to schedule.
      state.remaining = 100_000;
      buffer.append("next", delta("next", "fresh"));
      buffer.setCanonicalCapacity(state.remaining);
      expect(sent).toHaveLength(1);
      vi.advanceTimersByTime(16);
      expect(sent).toHaveLength(2);
    },
  );

  it("retries when credit disappears after append but before the batch timer fires", () => {
    const { buffer, state, sent } = creditBuffer(100_000);
    buffer.append("t1", delta("t1", "held"));
    state.remaining = 0;
    buffer.setCanonicalCapacity(0);
    vi.advanceTimersByTime(100);
    expect(sent).toHaveLength(0);
    state.remaining = 100_000;
    buffer.setCanonicalCapacity(state.remaining);
    expect(sent.flatMap(eventsOf)).toEqual([delta("t1", "held")]);
  });

  it.each(["single", "multi"])(
    "releases a partial %s-thread tail at exact credit bounds before its stop marker",
    (layout) => {
      const events = Array.from({ length: 3 }, (_, index) =>
        delta(layout === "single" ? "t0" : `t${index}`, "x".repeat(400), `item-${index}`),
      );
      const eventBytes = runtimeEventSize.estimateRuntimeEventBytes(events[0]!);
      const envelopeBytes = 256 + eventBytes;
      const { buffer, state, sent, charges } = creditBuffer(envelopeBytes, {
        maxEnvelopeBytesPerThread: eventBytes,
        maxEnvelopeBytesTotal: envelopeBytes,
      });
      for (const event of events) buffer.append(event.threadId, event);
      vi.advanceTimersByTime(16);
      expect(sent.flatMap(eventsOf)).toEqual(events.slice(0, 1));
      expect(buffer.pendingStats().events).toBe(2);
      const marker = stopMarker(events[2]!.threadId);
      buffer.queueStopMarker(events[2]!.threadId, marker);
      expect(sent).toHaveLength(1);

      for (let index = 1; index < events.length; index += 1) {
        state.remaining = envelopeBytes;
        buffer.setCanonicalCapacity(envelopeBytes);
        expect(sent.slice(0, index + 1).flatMap(eventsOf)).toEqual(events.slice(0, index + 1));
        expect(buffer.pendingStats().events).toBe(events.length - index - 1);
      }
      expect(sent.at(-1)).toEqual(marker);
      expect(sent).toHaveLength(4);
      expect(charges.slice(0, 3)).toEqual([envelopeBytes, envelopeBytes, envelopeBytes]);
      expect(buffer.pendingStats()).toEqual({ events: 0, bytes: 0, threads: 0 });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([1, 2])(
    "retries %i sender-refused thread(s) on a same-credit notification",
    (threads) => {
      const { buffer, state, sent, emit } = creditBuffer(100_000);
      state.accepts = false;
      const events = Array.from({ length: threads }, (_, index) => delta(`t${index}`, "held"));
      for (const event of events) buffer.append(event.threadId, event);
      vi.advanceTimersByTime(16);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(sent).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);

      buffer.setCanonicalCapacity(state.remaining);
      expect(emit).toHaveBeenCalledTimes(2);
      expect(sent).toHaveLength(0);
      state.accepts = true;
      buffer.setCanonicalCapacity(state.remaining);
      expect(sent.flatMap(eventsOf)).toEqual(events);
      expect(buffer.hasPending()).toBe(false);
    },
  );

  it.each(["single", "multi"])(
    "retries only the refused %s-thread tail after a partial send with positive credit",
    (layout) => {
      const events = Array.from({ length: 3 }, (_, index) =>
        delta(layout === "single" ? "t0" : `t${index}`, "held", `item-${index}`),
      );
      const eventBytes = runtimeEventSize.estimateRuntimeEventBytes(events[0]!);
      const { buffer, state, sent, emit } = creditBuffer(100_000, {
        maxEnvelopeBytesPerThread: eventBytes,
        maxEnvelopeBytesTotal: 256 + eventBytes,
      });
      const accept = emit.getMockImplementation()!;
      emit.mockImplementationOnce((envelope, meta) => {
        const accepted = accept(envelope, meta);
        state.accepts = false;
        return accepted;
      });
      for (const event of events) buffer.append(event.threadId, event);
      vi.advanceTimersByTime(16);
      expect(sent.flatMap(eventsOf)).toEqual(events.slice(0, 1));
      expect(emit).toHaveBeenCalledTimes(2);
      expect(buffer.pendingStats().events).toBe(2);
      expect(state.remaining).toBeGreaterThan(0);

      state.accepts = true;
      buffer.setCanonicalCapacity(state.remaining);
      expect(sent.flatMap(eventsOf)).toEqual(events);
      expect(buffer.pendingStats()).toEqual({ events: 0, bytes: 0, threads: 0 });
    },
  );

  it("holds acknowledgements, explicit releases and stop markers while paused, then retries after resume", () => {
    const { buffer, state, sent } = creditBuffer(100_000);
    const event = delta("t1", "held");
    const marker = stopMarker("t1");
    buffer.append("t1", event);
    buffer.setPaused(true);
    vi.advanceTimersByTime(16);
    buffer.setCanonicalCapacity(state.remaining);
    buffer.releaseThread("t1");
    buffer.queueStopMarker("t1", marker);
    expect(sent).toHaveLength(0);

    state.remaining = 1;
    buffer.setPaused(false);
    expect(sent).toHaveLength(0);
    state.remaining = 100_000;
    buffer.setCanonicalCapacity(state.remaining);
    expect(sent.flatMap(eventsOf)).toEqual([event, ...eventsOf(marker)]);
    expect(buffer.hasPending()).toBe(false);
  });

  it.each(["release", "clearThread", "clear"])(
    "forgets a blocked thread after %s without fragmenting another thread's fresh batch",
    (action) => {
      const { buffer, state, sent } = creditBuffer(0);
      buffer.append("held", delta("held", "old"));
      state.remaining = 100_000;
      buffer.append("fresh", delta("fresh", "new"));
      vi.advanceTimersByTime(7);
      if (action === "release") buffer.releaseThread("held");
      else if (action === "clearThread") buffer.clearAllForThread("held");
      else {
        buffer.clear();
        buffer.append("fresh", delta("fresh", "new"));
      }
      expect(vi.getTimerCount()).toBe(1);
      const beforeAck = sent.length;
      buffer.setCanonicalCapacity(state.remaining);
      expect(sent).toHaveLength(beforeAck);
      vi.advanceTimersByTime(action === "clear" ? 15 : 8);
      expect(sent).toHaveLength(beforeAck);
      vi.advanceTimersByTime(1);
      expect(sent.slice(beforeAck).flatMap(eventsOf)).toEqual([delta("fresh", "new")]);
    },
  );

  it("retries unvisited multi-thread tails after the first blocked thread is cleared", () => {
    const events = [delta("t0", "held"), delta("t1", "held"), delta("t2", "held")];
    const { buffer, state, sent } = creditBuffer(1, {
      maxEnvelopeBytesTotal: 256 + runtimeEventSize.estimateRuntimeEventBytes(events[0]!),
    });
    for (const event of events) buffer.append(event.threadId, event);
    vi.advanceTimersByTime(16);
    buffer.clearAllForThread("t0");
    state.remaining = 100_000;
    buffer.setCanonicalCapacity(state.remaining);
    expect(sent.flatMap(eventsOf)).toEqual(events.slice(1));
    expect(buffer.hasPending()).toBe(false);
  });

  it.each(["thread", "global"])(
    "still reports a %s cap once when positive credit cannot release the batch",
    (cap) => {
      const onOverflow = vi.fn<NonNullable<RuntimeEventBufferOptions["onOverflow"]>>();
      const { buffer, state, sent } = creditBuffer(1, {
        ...(cap === "thread" ? { maxPendingEventsPerThread: 2 } : { maxPendingEventsGlobal: 2 }),
        onOverflow,
      });
      const events = Array.from({ length: 3 }, (_, index) => delta("t1", "held", `item-${index}`));
      for (const event of events) buffer.append(event.threadId, event);
      expect(onOverflow).toHaveBeenCalledTimes(1);
      expect(onOverflow).toHaveBeenCalledWith(
        expect.objectContaining({ reason: cap, creditBound: true }),
      );
      expect(sent).toHaveLength(0);
      buffer.setCanonicalCapacity(state.remaining);
      expect(onOverflow).toHaveBeenCalledTimes(1);
      expect(buffer.pendingStats().events).toBe(3);
      state.remaining = 100_000;
      buffer.setCanonicalCapacity(state.remaining);
      expect(sent.flatMap(eventsOf)).toEqual(events);
    },
  );
});
