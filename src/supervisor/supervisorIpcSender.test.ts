import type { SupervisorEvent, SupervisorReply } from "@/shared/ipc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupervisorIpcSender, type SupervisorIpcShedPolicy } from "./supervisorIpcSender";

type OutboundMessage = SupervisorEvent | SupervisorReply;
type SendCallback = (error: Error | null) => void;

function output(
  threadId: string,
  data: string,
  outputLength: number,
  terminalInstanceId = "gen-1",
): SupervisorEvent {
  return { type: "thread-output", threadId, data, outputLength, terminalInstanceId };
}

describe("SupervisorIpcSender", () => {
  afterEach(() => vi.useRealTimers());

  it("coalesces terminal output per thread on an 8ms tick", () => {
    vi.useFakeTimers();
    const sent: OutboundMessage[] = [];
    const sender = new SupervisorIpcSender({
      send: (message, callback) => {
        sent.push(message);
        callback(null);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
    });

    sender.emit(output("one", "a", 1));
    sender.emit(output("one", "b", 2));
    sender.emit(output("two", "c", 1));
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(8);

    expect(sent).toEqual([output("one", "ab", 2), output("two", "c", 1)]);
  });

  it("does not coalesce terminal output across generation changes", () => {
    vi.useFakeTimers();
    const sent: OutboundMessage[] = [];
    const sender = new SupervisorIpcSender({
      send: (message, callback) => {
        sent.push(message);
        callback(null);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
    });

    sender.emit(output("one", "old", 3, "gen-a"));
    sender.emit(output("one", "new", 3, "gen-b"));
    expect(sent).toEqual([output("one", "old", 3, "gen-a")]);

    vi.advanceTimersByTime(8);
    expect(sent).toEqual([output("one", "old", 3, "gen-a"), output("one", "new", 3, "gen-b")]);
  });

  it("flushes terminal bytes before a following event", () => {
    vi.useFakeTimers();
    const sent: OutboundMessage[] = [];
    const sender = new SupervisorIpcSender({
      send: (message) => {
        sent.push(message);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
    });
    const state: SupervisorEvent = {
      type: "thread-state",
      threadId: "one",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    };

    sender.emit(output("one", "ready", 5));
    sender.emit(state);

    expect(sent).toEqual([output("one", "ready", 5), state]);
  });

  it("preserves terminal ordering before a following RPC reply", () => {
    vi.useFakeTimers();
    const sent: OutboundMessage[] = [];
    const sender = new SupervisorIpcSender({
      send: (message) => {
        sent.push(message);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
    });
    const reply: SupervisorReply = { replyTo: "one", ok: true, data: null };

    sender.emit(output("one", "ready", 5));
    sender.reply(reply);

    expect(sent).toEqual([output("one", "ready", 5), reply]);
  });

  it("waits for a saturated IPC send callback before draining more messages", () => {
    const sent: OutboundMessage[] = [];
    let release: ((error: Error | null) => void) | undefined;
    const onBackpressureChange = vi.fn<(paused: boolean) => void>();
    const sender = new SupervisorIpcSender({
      send: (message, callback) => {
        sent.push(message);
        if (sent.length === 1) {
          release = callback;
          return false;
        }
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
      onBackpressureChange,
    });
    const first: SupervisorReply = { replyTo: "one", ok: true, data: null };
    const second: SupervisorReply = { replyTo: "two", ok: true, data: null };

    sender.reply(first);
    sender.reply(second);
    expect(sent).toEqual([first]);
    expect(onBackpressureChange).toHaveBeenCalledWith(true);

    release?.(null);
    expect(sent).toEqual([first, second]);
    expect(onBackpressureChange).toHaveBeenLastCalledWith(false);
  });

  it("flushes a terminal batch when it reaches 64 KiB", () => {
    vi.useFakeTimers();
    const sent: OutboundMessage[] = [];
    const sender = new SupervisorIpcSender({
      send: (message) => {
        sent.push(message);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
    });

    sender.emit(output("one", "x".repeat(64 * 1024), 64 * 1024));

    expect(sent).toEqual([output("one", "x".repeat(64 * 1024), 64 * 1024)]);
  });

  it("retries a failed RPC reply once", () => {
    const sent: OutboundMessage[] = [];
    const onError = vi.fn<(error: Error) => void>();
    const onFatalError = vi.fn<(error: Error) => void>();
    const sender = new SupervisorIpcSender({
      send: (message, callback) => {
        sent.push(message);
        callback(sent.length === 1 ? new Error("send failed") : null);
        return true;
      },
      onError,
      onFatalError,
    });
    const reply: SupervisorReply = { replyTo: "one", ok: true, data: null };

    sender.reply(reply);

    expect(sent).toEqual([reply, reply]);
    expect(onError).toHaveBeenCalledOnce();
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it("fails closed when the bounded queue fills during backpressure", () => {
    let release: ((error: Error | null) => void) | undefined;
    const onFatalError = vi.fn<(error: Error) => void>();
    const sender = new SupervisorIpcSender({
      send: (_message, callback) => {
        release ??= callback;
        return false;
      },
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages: 2,
    });

    sender.reply({ replyTo: "one", ok: true, data: null });
    sender.reply({ replyTo: "two", ok: true, data: null });
    sender.reply({ replyTo: "three", ok: true, data: null });
    sender.reply({ replyTo: "four", ok: true, data: null });

    expect(onFatalError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining("exceeded its limit") }),
    );
    release?.(null);
  });

  it("fails closed when IPC backpressure never drains", () => {
    vi.useFakeTimers();
    const onFatalError = vi.fn<(error: Error) => void>();
    const sender = new SupervisorIpcSender({
      send: () => false,
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      backpressureTimeoutMs: 50,
    });

    sender.reply({ replyTo: "one", ok: true, data: null });
    vi.advanceTimersByTime(50);

    expect(onFatalError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining("did not drain") }),
    );
  });

  it("survives a permanent no-drain stall when the fatal timeout is disabled", () => {
    // Backend-host containment (C-2): main is a sibling consumer that
    // recovers through renderer-stream replay/resync, so the host's sender
    // must not self-destruct the authoritative host on a desktop-IPC stall.
    vi.useFakeTimers();
    const onFatalError = vi.fn<(error: Error) => void>();
    const sender = new SupervisorIpcSender({
      send: () => false,
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      backpressureTimeoutMs: null,
    });

    sender.reply({ replyTo: "one", ok: true, data: null });
    vi.advanceTimersByTime(60_000);

    expect(onFatalError).not.toHaveBeenCalled();
  });

  it("sheds the oldest policy-approved events instead of failing when the queue overflows", () => {
    vi.useFakeTimers();
    let release: ((error: Error | null) => void) | undefined;
    const onFatalError = vi.fn<(error: Error) => void>();
    const onMessagesShed = vi.fn<(shed: { count: number; bytes: number }) => void>();
    const sent: OutboundMessage[] = [];
    const sender = new SupervisorIpcSender<SupervisorEvent>({
      send: (message, callback) => {
        sent.push(message);
        if (sent.length === 1) {
          release = callback;
          return false;
        }
        callback(null);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages: 3,
      shedPolicy: {
        isSheddable: (message) => "type" in message,
        isRecoverySignal: () => false,
        createRecoverySignal: (shed) =>
          output((shed[0] as { threadId: string }).threadId, "shed", 4),
      },
      onMessagesShed,
    });
    const reply: SupervisorReply = { replyTo: "r", ok: true, data: null };
    const flushBatch = () => vi.advanceTimersByTime(8);

    sender.emit(output("t0", "in-flight", 9));
    flushBatch();
    sender.emit(output("t1", "oldest", 6));
    flushBatch();
    sender.reply(reply);
    sender.emit(output("t2", "newer", 5));
    flushBatch();
    sender.emit(output("t3", "newest", 6));
    flushBatch();

    expect(onFatalError).not.toHaveBeenCalled();
    expect(onMessagesShed).toHaveBeenCalledExactlyOnceWith({ count: 2, bytes: 267 });
    expect(sent).toEqual([output("t0", "in-flight", 9)]);

    release?.(null);
    // The recovery signal occupies the oldest shed entry's position, ahead
    // of the non-sheddable reply and every event queued behind it.
    expect(sent.slice(1)).toEqual([output("t1", "shed", 4), reply, output("t3", "newest", 6)]);
  });

  it("still fails closed when overflow survives shedding", () => {
    const onFatalError = vi.fn<(error: Error) => void>();
    const sender = new SupervisorIpcSender({
      send: () => false,
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages: 2,
      shedPolicy: {
        isSheddable: () => false,
        isRecoverySignal: () => false,
        createRecoverySignal: () => {
          throw new Error("never shed");
        },
      },
    });

    sender.reply({ replyTo: "one", ok: true, data: null });
    sender.reply({ replyTo: "two", ok: true, data: null });
    sender.reply({ replyTo: "three", ok: true, data: null });
    sender.reply({ replyTo: "four", ok: true, data: null });

    expect(onFatalError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining("exceeded its limit") }),
    );
  });

  it("waits for in-flight send callbacks during shutdown flush", async () => {
    const callbacks: SendCallback[] = [];
    const sender = new SupervisorIpcSender({
      send: (_message, callback) => {
        callbacks.push(callback);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
    });
    sender.emit(output("one", "ready", 5));

    const flushed = sender.flushAndWait(1_000);
    let settled = false;
    void flushed.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    for (const callback of callbacks) callback(null);
    await expect(flushed).resolves.toBe(true);
  });
});

/**
 * Mirrors the backend-host sender shape: sequenced bulk renderer traffic that
 * may shed, critical traffic that may not, and a range-typed recovery signal
 * announcing shed sequences.
 */
interface GapTestMessage {
  kind: "bulk" | "critical" | "gap";
  seq?: number;
  label?: string;
  from?: number;
  to?: number;
}

function rangePolicy(): SupervisorIpcShedPolicy<GapTestMessage> {
  return {
    isSheddable: (message) =>
      (message as GapTestMessage).kind === "bulk" && (message as GapTestMessage).seq !== undefined,
    isRecoverySignal: (message) => (message as GapTestMessage).kind === "gap",
    createRecoverySignal: (shed, previous) => {
      const seqs = shed.map((message) => (message as GapTestMessage).seq ?? 0);
      let from = Math.min(...seqs);
      let to = Math.max(...seqs);
      if ((previous as GapTestMessage | null)?.kind === "gap") {
        from = Math.min(from, (previous as GapTestMessage).from ?? from);
        to = Math.max(to, (previous as GapTestMessage).to ?? to);
      }
      return { kind: "gap", from, to };
    },
  };
}

describe("SupervisorIpcSender shed recovery signals", () => {
  function drainAll(callbacks: SendCallback[]): void {
    while (callbacks.length > 0) callbacks.shift()!(null);
  }

  it("sends an oversized event's recovery signal on an otherwise idle channel", () => {
    const sent: Array<SupervisorEvent | SupervisorReply | GapTestMessage> = [];
    const onFatalError = vi.fn<(error: Error) => void>();
    const sender = new SupervisorIpcSender<GapTestMessage>({
      send: (message, callback) => {
        sent.push(message);
        callback(null);
        return true;
      },
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedBytes: 256,
      shedPolicy: rangePolicy(),
    });

    sender.sendMessage({ kind: "bulk", seq: 1, label: "x".repeat(512) });

    expect(sent).toEqual([{ kind: "gap", from: 1, to: 1 }]);
    expect(sender.queueDepth).toEqual({ messages: 0, bytes: 0 });
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it("delivers the recovery signal before every message that survived the shed", () => {
    // Regression: the loss announcement must not trail the post-gap traffic,
    // or a sequence-consuming consumer raises its cursor across the lost
    // range and can never observe the need to resynchronize.
    const callbacks: SendCallback[] = [];
    const onFatalError = vi.fn<(error: Error) => void>();
    const onMessagesShed = vi.fn<(shed: { count: number; bytes: number }) => void>();
    const sent: Array<SupervisorEvent | SupervisorReply | GapTestMessage> = [];
    const sender = new SupervisorIpcSender<GapTestMessage>({
      send: (message, callback) => {
        sent.push(message);
        callbacks.push(callback);
        return false;
      },
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages: 4,
      shedPolicy: rangePolicy(),
      onMessagesShed,
    });

    sender.sendMessage({ kind: "bulk", seq: 1 });
    sender.sendMessage({ kind: "critical", label: "main-only" });
    sender.sendMessage({ kind: "bulk", seq: 2 });
    sender.sendMessage({ kind: "bulk", seq: 3 });
    sender.sendMessage({ kind: "bulk", seq: 4 });
    sender.sendMessage({ kind: "bulk", seq: 5 });

    drainAll(callbacks);

    expect(onFatalError).not.toHaveBeenCalled();
    expect(onMessagesShed).toHaveBeenCalledExactlyOnceWith({ count: 2, bytes: expect.any(Number) });
    expect(sent).toEqual([
      { kind: "bulk", seq: 1 },
      { kind: "critical", label: "main-only" },
      { kind: "gap", from: 2, to: 3 },
      { kind: "bulk", seq: 4 },
      { kind: "bulk", seq: 5 },
    ]);
  });

  it("collapses sustained overflow into one growing recovery signal", () => {
    // Regression: one signal per shed batch under a stalled consumer would
    // flood the bounded queue with non-sheddable signals until overflow
    // turned fatal again. Adjacent signals must merge into the oldest slot.
    const callbacks: SendCallback[] = [];
    const onFatalError = vi.fn<(error: Error) => void>();
    const sent: Array<SupervisorEvent | SupervisorReply | GapTestMessage> = [];
    const sender = new SupervisorIpcSender<GapTestMessage>({
      send: (message, callback) => {
        sent.push(message);
        callbacks.push(callback);
        return false;
      },
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages: 3,
      shedPolicy: rangePolicy(),
    });

    sender.sendMessage({ kind: "bulk", seq: 1 });
    sender.sendMessage({ kind: "critical", label: "main-only" });
    for (let seq = 2; seq <= 8; seq += 1) sender.sendMessage({ kind: "bulk", seq });

    drainAll(callbacks);

    expect(onFatalError).not.toHaveBeenCalled();
    // At a three-slot bound the stall regime stabilizes at one critical slot,
    // one marker slot, and the newest bulk: each further bulk is announced by
    // the merged marker and delivered in order. Nothing is lost silently.
    expect(sent).toEqual([
      { kind: "bulk", seq: 1 },
      { kind: "critical", label: "main-only" },
      { kind: "gap", from: 2, to: 7 },
      { kind: "bulk", seq: 8 },
    ]);
  });

  it("holds the configured bounds exactly under mixed critical and bulk traffic", () => {
    const callbacks: SendCallback[] = [];
    const onFatalError = vi.fn<(error: Error) => void>();
    const sent: Array<SupervisorEvent | SupervisorReply | GapTestMessage> = [];
    const sender = new SupervisorIpcSender<GapTestMessage>({
      send: (message, callback) => {
        sent.push(message);
        callbacks.push(callback);
        return false;
      },
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages: 4,
      maxQueuedBytes: 1_600,
      shedPolicy: rangePolicy(),
    });
    const assertWithinBounds = (): void => {
      expect(sender.queueDepth.messages).toBeLessThanOrEqual(4);
      expect(sender.queueDepth.bytes).toBeLessThanOrEqual(1_600);
    };

    sender.sendMessage({ kind: "bulk", seq: 1, label: "b".repeat(300) });
    sender.sendMessage({ kind: "critical", label: "c1" });
    for (let seq = 2; seq <= 4; seq += 1) {
      sender.sendMessage({ kind: "bulk", seq, label: "b".repeat(300) });
      assertWithinBounds();
    }
    sender.sendMessage({ kind: "critical", label: "c2" });
    assertWithinBounds();
    // Large candidate: no amount of shedding can make its bytes fit beside
    // the signal, so it is shed itself and announced by the merged marker.
    sender.sendMessage({ kind: "bulk", seq: 5, label: "B".repeat(1_500) });
    assertWithinBounds();

    expect(onFatalError).not.toHaveBeenCalled();
    expect(sender.queueDepth.messages).toBeLessThanOrEqual(4);
    expect(sender.queueDepth.bytes).toBeLessThanOrEqual(1_600);
    drainAll(callbacks);
    expect(sent).toEqual([
      { kind: "bulk", seq: 1, label: "b".repeat(300) },
      { kind: "critical", label: "c1" },
      { kind: "gap", from: 2, to: 5 },
      { kind: "critical", label: "c2" },
    ]);
  });

  it("keeps non-adjacent markers bounded, ordered, and covering every shed bulk", () => {
    const callbacks: SendCallback[] = [];
    const onFatalError = vi.fn<(error: Error) => void>();
    const sent: Array<SupervisorEvent | SupervisorReply | GapTestMessage> = [];
    const sender = new SupervisorIpcSender<GapTestMessage>({
      send: (message, callback) => {
        sent.push(message);
        callbacks.push(callback);
        return false;
      },
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages: 16,
      shedPolicy: rangePolicy(),
    });

    let sequence = 0;
    for (let round = 0; round < 12; round += 1) {
      sender.sendMessage({ kind: "critical", label: `c${round}` });
      sender.sendMessage({ kind: "bulk", seq: (sequence += 1) });
      sender.sendMessage({ kind: "bulk", seq: (sequence += 1) });
      expect(sender.queueDepth.messages).toBeLessThanOrEqual(16);
      expect(onFatalError).not.toHaveBeenCalled();
    }

    drainAll(callbacks);
    expect(onFatalError).not.toHaveBeenCalled();

    const markers = sent.filter((message): message is GapTestMessage =>
      Object.hasOwn(message as object, "from"),
    );
    expect(markers.length).toBeLessThanOrEqual(12);
    for (let index = 1; index < markers.length; index += 1) {
      expect(markers[index]!.from).toBeGreaterThan(markers[index - 1]!.to!);
    }
    const deliveredSeqs = new Set(
      sent
        .filter((message) => (message as GapTestMessage).kind === "bulk")
        .map((message) => (message as GapTestMessage).seq),
    );
    const covered = (seq: number): boolean =>
      deliveredSeqs.has(seq) || markers.some((marker) => marker.from! <= seq && seq <= marker.to!);
    const criticals = sent.filter((message) => (message as GapTestMessage).kind === "critical");
    expect(criticals).toHaveLength(12);
    for (let seq = 1; seq <= sequence; seq += 1) {
      expect(covered(seq)).toBe(true);
    }
  });
});
