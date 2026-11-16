import { describe, expect, it, vi } from "vitest";
import {
  MAX_TERMINAL_INPUT_UNITS,
  TerminalInputQueue,
  registerTerminalInputQueue,
  sendTerminalInput,
} from "./terminalInputQueue";

function setup() {
  const first = Promise.withResolvers<void>();
  const write = vi
    .fn<(data: string) => Promise<void>>()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValue(undefined);
  const isCurrent = vi.fn<() => boolean>(() => true);
  const onError = vi.fn<() => void>();
  const queue = new TerminalInputQueue(write, isCurrent, onError);
  return { first, write, isCurrent, onError, queue };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("TerminalInputQueue", () => {
  it("serializes delayed writes and batches typing, paste, control keys and Unicode exactly once", async () => {
    const { first, queue, write, onError } = setup();
    queue.enqueue("a");
    const suffix = ["b", "paste\r\n", "\x03", "\x1b[D", "é漢😀", "\r"];
    for (const data of suffix) queue.enqueue(data);
    expect(write.mock.calls).toEqual([["a"]]);
    first.resolve();
    await settle();
    expect(write.mock.calls).toEqual([["a"], [suffix.join("")]]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("stops on an ambiguous failure, drops the suffix, reports once and never retries", async () => {
    const { first, queue, write, onError } = setup();
    queue.enqueue("possibly executed\r");
    queue.enqueue("must not execute\r");
    first.reject(new Error("response lost"));
    await settle();
    queue.enqueue("later");
    expect(write).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reports synchronous transport failures", async () => {
    const onError = vi.fn<() => void>();
    const queue = new TerminalInputQueue(
      () => {
        throw new Error("closed");
      },
      () => true,
      onError,
    );
    queue.enqueue("a");
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    "drops pending bytes and ignores late completion after disposal (reject=%s)",
    async (reject) => {
      const { first, queue, write, onError } = setup();
      queue.enqueue("a");
      queue.enqueue("stale");
      queue.dispose();
      if (reject) first.reject(new Error("gone"));
      else first.resolve();
      await settle();
      queue.enqueue("later");
      expect(write).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "reset fences stale failure and waits for the outstanding write (reject=%s)",
    async (reject) => {
      const { first, queue, write, onError } = setup();
      queue.enqueue("old");
      queue.enqueue("stale suffix");
      queue.reset();
      queue.enqueue("new PTY");
      expect(write).toHaveBeenCalledTimes(1);
      if (reject) first.reject(new Error("old session"));
      else first.resolve();
      await settle();
      expect(write.mock.calls).toEqual([["old"], ["new PTY"]]);
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it("bounds in-flight plus pending input without sending a partial paste", async () => {
    const { first, queue, write, onError } = setup();
    queue.enqueue("a");
    queue.enqueue("x".repeat(MAX_TERMINAL_INPUT_UNITS - 1));
    queue.enqueue("😀");
    first.resolve();
    await settle();
    expect(write.mock.calls).toEqual([["a"]]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized first paste", () => {
    const { queue, write, onError } = setup();
    queue.enqueue("x".repeat(MAX_TERMINAL_INPUT_UNITS + 1));
    expect(write).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch a queued suffix after the host identity changes", async () => {
    const { first, queue, write, isCurrent, onError } = setup();
    queue.enqueue("a");
    queue.enqueue("stale");
    isCurrent.mockReturnValue(false);
    first.resolve();
    await settle();
    expect(write.mock.calls).toEqual([["a"]]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("does not fail input for a transient watch failure before any input exists", async () => {
    const { first, queue, write, onError } = setup();
    queue.stop(false);
    queue.enqueue("first key after initial snapshot");
    expect(write).toHaveBeenCalledWith("first key after initial snapshot");
    first.resolve();
    await settle();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not replay queued bytes after disconnect/reconnect", async () => {
    const { first, queue, write, onError } = setup();
    queue.enqueue("a");
    queue.enqueue("stale");
    queue.stop();
    first.resolve();
    await settle();
    queue.enqueue("after reconnect");
    expect(write.mock.calls).toEqual([["a"]]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("keeps the write barrier across multiple handoffs without retaining discarded input", async () => {
    const a = setup();
    const b = setup();
    const c = setup();
    c.write.mockReset().mockResolvedValue(undefined);
    const offA = registerTerminalInputQueue("handoff", a.queue);
    a.queue.enqueue("in flight");
    offA();
    expect(sendTerminalInput("handoff", "unmounted input")).toBe(false);
    const offB = registerTerminalInputQueue("handoff", b.queue);
    b.queue.enqueue("discarded with intermediate mount");
    offB();
    const offC = registerTerminalInputQueue("handoff", c.queue);
    try {
      expect(sendTerminalInput("handoff", "final mount")).toBe(true);
      expect(b.write).not.toHaveBeenCalled();
      expect(c.write).not.toHaveBeenCalled();
      a.first.resolve();
      await c.queue.pendingWrite;
      expect(b.write).not.toHaveBeenCalled();
      expect(c.write.mock.calls).toEqual([["final mount"]]);
      expect(c.onError).not.toHaveBeenCalled();
    } finally {
      offA();
      offB();
      offC();
    }
  });

  it("reports missing and disposed input queues to shortcut callers", async () => {
    const { first, queue } = setup();
    expect(sendTerminalInput("missing-queue", "a")).toBe(false);
    const unregister = registerTerminalInputQueue("unmounted-queue", queue);
    expect(sendTerminalInput("unmounted-queue", "a")).toBe(true);
    unregister();
    expect(sendTerminalInput("unmounted-queue", "b")).toBe(false);
    first.resolve();
    await queue.pendingWrite;
    expect(sendTerminalInput("unmounted-queue", "c")).toBe(false);
  });

  it("keeps terminals independent and accessory input ordered with xterm input", async () => {
    const a = setup();
    const b = setup();
    const offA = registerTerminalInputQueue("a", a.queue);
    const offB = registerTerminalInputQueue("b", b.queue);
    try {
      a.queue.enqueue("typed");
      sendTerminalInput("a", "\r");
      sendTerminalInput("b", "other");
      expect(a.write.mock.calls).toEqual([["typed"]]);
      expect(b.write.mock.calls).toEqual([["other"]]);
      a.first.resolve();
      await settle();
      expect(a.write.mock.calls).toEqual([["typed"], ["\r"]]);
      offA();
      sendTerminalInput("a", "stale");
      expect(a.write).toHaveBeenCalledTimes(2);
    } finally {
      offA();
      offB();
      b.first.resolve();
    }
  });
});
