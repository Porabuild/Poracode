import {
  isSupervisorOutputShedSignal,
  type SupervisorEvent,
  type SupervisorOutputShedSignal,
  type SupervisorReply,
} from "@/shared/ipc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupervisorIpcSender } from "./supervisorIpcSender";
import { createSupervisorOutputShedPolicy } from "./supervisorShedPolicy";

type Outbound = SupervisorEvent | SupervisorReply | SupervisorOutputShedSignal;

function output(threadId: string, data: string, outputLength = data.length): SupervisorEvent {
  return { type: "thread-output", threadId, data, outputLength, terminalInstanceId: "gen-1" };
}

function threadState(threadId: string): SupervisorEvent {
  return {
    type: "thread-state",
    threadId,
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
  };
}

describe("createSupervisorOutputShedPolicy", () => {
  afterEach(() => vi.useRealTimers());

  function saturatedSender(options: {
    onFatalError: (error: Error) => void;
    onMessagesShed?: (shed: { count: number; bytes: number }) => void;
    maxQueuedMessages?: number;
  }) {
    const sent: Outbound[] = [];
    let release: ((error: Error | null) => void) | undefined;
    const sender = new SupervisorIpcSender<SupervisorOutputShedSignal>({
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
      onFatalError: options.onFatalError,
      ...(options.onMessagesShed ? { onMessagesShed: options.onMessagesShed } : {}),
      ...(options.maxQueuedMessages ? { maxQueuedMessages: options.maxQueuedMessages } : {}),
      backpressureTimeoutMs: null,
      shedPolicy: createSupervisorOutputShedPolicy(),
    });
    return { sender, sent, release: () => release?.(null) };
  }

  it("classifies only terminal-output batches as sheddable", () => {
    const policy = createSupervisorOutputShedPolicy();
    const reply: SupervisorReply = { replyTo: "r", ok: true, data: null };
    expect(policy.isSheddable(output("t1", "x"))).toBe(true);
    expect(policy.isSheddable(threadState("t1"))).toBe(false);
    expect(policy.isSheddable(reply)).toBe(false);
  });

  it("sheds queued terminal output under overflow, announcing merged thread ids ahead of survivors", () => {
    vi.useFakeTimers();
    const onFatalError = vi.fn<(error: Error) => void>();
    const onMessagesShed = vi.fn<(shed: { count: number; bytes: number }) => void>();
    const { sender, sent, release } = saturatedSender({
      onFatalError,
      onMessagesShed,
      maxQueuedMessages: 4,
    });
    const reply: SupervisorReply = { replyTo: "r", ok: true, data: null };
    const flushBatch = () => vi.advanceTimersByTime(8);

    // Occupy the single in-flight slot, then overflow the queue with output
    // batches from two threads plus one protected event and one reply.
    sender.emit(output("t0", "in-flight", 9));
    flushBatch();
    sender.emit(output("t1", "aaaa", 4));
    flushBatch();
    sender.emit(output("t2", "bb", 2));
    flushBatch();
    sender.reply(reply);
    sender.emit(threadState("t3"));
    flushBatch();
    sender.emit(output("t1", "cccccc", 6));
    flushBatch();

    expect(onFatalError).not.toHaveBeenCalled();
    expect(onMessagesShed).toHaveBeenCalled();

    release();
    // The recovery signal names both shed threads and reaches the backend
    // before the surviving traffic (the reply and the thread-state event).
    const signalIndex = sent.findIndex((message) => isSupervisorOutputShedSignal(message));
    expect(signalIndex).toBeGreaterThanOrEqual(0);
    const signal = sent[signalIndex];
    expect(isSupervisorOutputShedSignal(signal)).toBe(true);
    const threadIds = isSupervisorOutputShedSignal(signal)
      ? new Set(signal.threadIds)
      : new Set<string>();
    expect(threadIds).toEqual(new Set(["t1", "t2"]));
    const after = sent
      .slice(signalIndex + 1)
      .filter((m): m is SupervisorEvent | SupervisorReply => !isSupervisorOutputShedSignal(m));
    expect(after).toContainEqual(reply);
    expect(after).toContainEqual(threadState("t3"));
    // The incoming newest batch was never shed — it legitimately follows the
    // signal. Every OLDER output batch for the shed threads is gone.
    const outputsAfterSignal = after.filter(
      (m): m is Extract<SupervisorEvent, { type: "thread-output" }> =>
        "type" in m && m.type === "thread-output",
    );
    expect(outputsAfterSignal).toMatchObject([{ threadId: "t1", data: "cccccc" }]);
  });

  it("merges a sustained stall into one growing signal covering every shed thread", () => {
    vi.useFakeTimers();
    const onFatalError = vi.fn<(error: Error) => void>();
    const { sender, sent, release } = saturatedSender({
      onFatalError,
      maxQueuedMessages: 3,
    });
    const flushBatch = () => vi.advanceTimersByTime(8);

    sender.emit(output("t0", "in-flight", 9));
    flushBatch();
    sender.emit(output("tA", "a", 1));
    flushBatch();
    sender.emit(output("tB", "b", 1));
    flushBatch();
    sender.emit(output("tC", "c", 1));
    flushBatch();
    // Overflows the 3-slot queue: sheds tA and tB, announces them, enqueues tC.
    sender.emit(output("tD", "d", 1));
    flushBatch();

    expect(onFatalError).not.toHaveBeenCalled();
    release();
    const signals = sent.filter((m) => isSupervisorOutputShedSignal(m));
    expect(signals).toHaveLength(1);
    const onlySignal = signals[0];
    const mergedThreadIds = isSupervisorOutputShedSignal(onlySignal)
      ? new Set(onlySignal.threadIds)
      : new Set<string>();
    expect(mergedThreadIds).toEqual(new Set(["tA", "tB"]));
  });

  it("never fires the fatal backpressure timer when backpressureTimeoutMs is null", () => {
    vi.useFakeTimers();
    const onFatalError = vi.fn<(error: Error) => void>();
    const { sender } = saturatedSender({ onFatalError });
    sender.emit(output("t0", "stuck", 5));
    // Far past the default 30s fatal backpressure timeout.
    vi.advanceTimersByTime(120_000);
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it("still fails closed when the queue overflows with non-sheddable traffic alone", () => {
    vi.useFakeTimers();
    const onFatalError = vi.fn<(error: Error) => void>();
    const sender = new SupervisorIpcSender<SupervisorOutputShedSignal>({
      send: () => false,
      onError: vi.fn<(error: Error) => void>(),
      onFatalError,
      maxQueuedMessages: 2,
      backpressureTimeoutMs: null,
      shedPolicy: createSupervisorOutputShedPolicy(),
    });

    sender.reply({ replyTo: "one", ok: true, data: null });
    sender.reply({ replyTo: "two", ok: true, data: null });
    sender.reply({ replyTo: "three", ok: true, data: null });
    sender.reply({ replyTo: "four", ok: true, data: null });

    expect(onFatalError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining("exceeded its limit") }),
    );
  });
});
