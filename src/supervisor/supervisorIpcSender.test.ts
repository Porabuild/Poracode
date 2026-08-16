import type { SupervisorEvent, SupervisorReply } from "@/shared/ipc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupervisorIpcSender } from "./supervisorIpcSender";

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
