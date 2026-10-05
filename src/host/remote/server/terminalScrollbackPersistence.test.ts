import { describe, expect, it, vi } from "vitest";
import { TerminalScrollbackPersistence } from "./terminalScrollbackPersistence";

describe("TerminalScrollbackPersistence", () => {
  it("coalesces output and flushes it at terminal exit", () => {
    const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>();
    const persistence = new TerminalScrollbackPersistence({ append });

    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "one",
      outputLength: 3,
      terminalInstanceId: "gen-test",
    });
    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "two",
      outputLength: 6,
      terminalInstanceId: "gen-test",
    });
    expect(append).not.toHaveBeenCalled();

    persistence.handle({ type: "thread-exited", threadId: "thread-1", exitCode: 0 });
    expect(append).toHaveBeenCalledWith("thread-1", "onetwo", 6);
  });

  it("drops pending output and clears durable state on reset", () => {
    const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>();
    const clear = vi.fn<(threadId: string) => void>();
    const persistence = new TerminalScrollbackPersistence({ append, clear });

    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "old",
      outputLength: 3,
      terminalInstanceId: "gen-test",
    });
    persistence.handle({ type: "thread-reset", threadId: "thread-1" });
    persistence.flush();

    expect(append).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith("thread-1");
  });

  it("does not persist transient shell-action output", () => {
    const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>();
    const persistence = new TerminalScrollbackPersistence({ append });
    persistence.handle({
      type: "thread-output",
      threadId: "shell:git-status",
      data: "noise",
      outputLength: 5,
      terminalInstanceId: "gen-test",
    });
    persistence.flush();
    expect(append).not.toHaveBeenCalled();
  });

  it("flushes pending output before a generation change (mirrors SupervisorIpcSender)", () => {
    const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>();
    const persistence = new TerminalScrollbackPersistence({ append });

    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "old",
      outputLength: 3,
      terminalInstanceId: "gen-a",
    });
    persistence.handle({
      type: "thread-output",
      threadId: "thread-1",
      data: "new",
      outputLength: 3,
      terminalInstanceId: "gen-b",
    });

    // Old generation flushed immediately; new generation still pending.
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith("thread-1", "old", 3);

    persistence.flush();
    expect(append).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenLastCalledWith("thread-1", "new", 3);
  });
});

describe("TerminalScrollbackPersistence B1 bounds and failure contract", () => {
  function output(threadId: string, data: string, outputLength = data.length) {
    return {
      type: "thread-output",
      threadId,
      data,
      outputLength,
      terminalInstanceId: "gen",
    } as const;
  }

  it("retains a failed flush, never throws, and commits on retry", () => {
    vi.useFakeTimers();
    try {
      let fail = true;
      const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>(() => {
        if (fail) throw Object.assign(new Error("full"), { code: "SQLITE_FULL" });
      });
      const persistence = new TerminalScrollbackPersistence({
        append,
        maxPendingBytes: 1_000,
        maxPendingBytesPerThread: 1_000,
      });

      persistence.handle(output("thread-1", "one"));
      vi.advanceTimersByTime(250);
      expect(append).toHaveBeenCalledTimes(1);
      expect(persistence.getPendingBytes()).toBe(3);

      fail = false;
      persistence.flush();
      expect(append).toHaveBeenCalledTimes(2);
      expect(persistence.getPendingBytes()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops rebuildable pending output at the hard cap and requests a resync", () => {
    vi.useFakeTimers();
    try {
      const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>(() => {
        throw Object.assign(new Error("full"), { code: "SQLITE_FULL" });
      });
      const onOverflow = vi.fn<(threadIds: string[]) => void>();
      const persistence = new TerminalScrollbackPersistence({
        append,
        onOverflow,
        maxPendingBytes: 10,
        maxPendingBytesPerThread: 10,
      });

      persistence.handle(output("thread-1", "x".repeat(20)));

      expect(onOverflow).toHaveBeenCalledWith(["thread-1"]);
      expect(persistence.getPendingBytes()).toBe(0);
      expect(persistence.getDroppedBytes()).toBe(20);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never lets a clear failure escape the supervisor handler", () => {
    const clear = vi.fn<(threadId: string) => void>(() => {
      throw Object.assign(new Error("readonly"), { code: "SQLITE_READONLY" });
    });
    const persistence = new TerminalScrollbackPersistence({
      append: vi.fn<(threadId: string, data: string, outputLength: number) => void>(),
      clear,
    });
    expect(() => persistence.handle({ type: "thread-reset", threadId: "thread-1" })).not.toThrow();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("enforces the per-thread cap after failure even below the global cap", () => {
    const onOverflow = vi.fn<(threadIds: string[]) => void>();
    const persistence = new TerminalScrollbackPersistence({
      append: () => {
        throw Object.assign(new Error("full"), { code: "SQLITE_FULL" });
      },
      onOverflow,
      maxPendingBytes: 1000,
      maxPendingBytesPerThread: 10,
    });
    persistence.handle(output("thread-1", "x".repeat(20)));
    expect(persistence.getPendingBytes()).toBe(0);
    expect(persistence.getDroppedBytes()).toBe(20);
    expect(onOverflow).toHaveBeenCalledWith(["thread-1"]);
  });

  it("bounds small batches across threads and retains that bound through failed retries", () => {
    vi.useFakeTimers();
    try {
      const onOverflow = vi.fn<(threadIds: string[]) => void>();
      const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>(() => {
        throw Object.assign(new Error("full"), { code: "SQLITE_FULL" });
      });
      const persistence = new TerminalScrollbackPersistence({
        append,
        onOverflow,
        maxPendingBytes: 10,
        maxPendingBytesPerThread: 1000,
      });
      persistence.handle(output("thread-1", "aaaaaa"));
      persistence.handle(output("thread-2", "bbbbbb"));
      expect(persistence.getPendingBytes()).toBe(6);
      expect(persistence.getDroppedBytes()).toBe(6);
      expect(onOverflow).toHaveBeenCalledWith(["thread-1"]);
      const attempts = append.mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect(persistence.getPendingBytes()).toBe(6);
      expect(append.mock.calls.slice(attempts).every(([threadId]) => threadId === "thread-2")).toBe(
        true,
      );
      persistence.handle({ type: "thread-reset", threadId: "thread-2" });
      expect(persistence.getPendingBytes()).toBe(0);
      const finalAttempts = append.mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect(append).toHaveBeenCalledTimes(finalAttempts);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes failed old-generation accounting before accepting its replacement", () => {
    vi.useFakeTimers();
    try {
      let fail = true;
      const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>(() => {
        if (fail) throw Object.assign(new Error("full"), { code: "SQLITE_FULL" });
      });
      const persistence = new TerminalScrollbackPersistence({ append });
      persistence.handle(output("thread-1", "old"));
      persistence.handle({ ...output("thread-1", "new"), terminalInstanceId: "new-generation" });
      expect(persistence.getPendingBytes()).toBe(3);
      fail = false;
      persistence.flush();
      expect(append).toHaveBeenLastCalledWith("thread-1", "new", 3);
      expect(persistence.getPendingBytes()).toBe(0);
      vi.runAllTimers();
    } finally {
      vi.useRealTimers();
    }
  });

  it("accounts for UTF-8 bytes when a surrogate pair crosses output chunks", () => {
    const append = vi.fn<(threadId: string, data: string, outputLength: number) => void>();
    const persistence = new TerminalScrollbackPersistence({ append });
    persistence.handle(output("thread-1", "\ud83d", 1));
    expect(persistence.getPendingBytes()).toBe(3);
    persistence.handle(output("thread-1", "\ude00", 2));
    expect(persistence.getPendingBytes()).toBe(4);
    persistence.flush();
    expect(append).toHaveBeenCalledWith("thread-1", "😀", 2);
    expect(persistence.getPendingBytes()).toBe(0);
  });
});
