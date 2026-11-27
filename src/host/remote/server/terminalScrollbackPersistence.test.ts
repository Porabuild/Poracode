import { describe, expect, it, vi } from "vitest";
import type { TerminalColumnChange } from "@/shared/terminalColumnHistory";
import { MAX_TERMINAL_COLUMN_CHANGES } from "@/shared/terminalColumnHistory";
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

describe("TerminalScrollbackPersistence column geometry", () => {
  type AppendFn = (
    threadId: string,
    data: string,
    outputLength: number,
    columnChanges?: TerminalColumnChange[],
  ) => void;
  function widthOutput(
    threadId: string,
    data: string,
    outputLength: number,
    terminalColumns?: number,
    terminalInstanceId = "gen",
  ) {
    return {
      type: "thread-output",
      threadId,
      data,
      outputLength,
      terminalInstanceId,
      ...(terminalColumns === undefined ? {} : { terminalColumns }),
    } as const;
  }

  it("coalesces buffered width transitions into one absolute-cursor change list", () => {
    const append = vi.fn<AppendFn>();
    const persistence = new TerminalScrollbackPersistence({ append });
    persistence.handle(widthOutput("thread-1", "aaa", 3, 48));
    persistence.handle(widthOutput("thread-1", "bbb", 6));
    persistence.handle(widthOutput("thread-1", "ccc", 9, 100));
    persistence.handle(widthOutput("thread-1", "ddd", 12, 100));
    persistence.flush();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith("thread-1", "aaabbbcccddd", 12, [
      { fromCursor: 0, columns: 48 },
      { fromCursor: 3, columns: null },
      { fromCursor: 6, columns: 100 },
    ]);
  });

  it("keeps the legacy three-argument append when no event carried a width", () => {
    const append = vi.fn<AppendFn>();
    const persistence = new TerminalScrollbackPersistence({ append });
    persistence.handle(widthOutput("thread-1", "abc", 3));
    persistence.handle(widthOutput("thread-1", "def", 6));
    persistence.flush();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]).toHaveLength(3);
    expect(append).toHaveBeenCalledWith("thread-1", "abcdef", 6);
  });

  it("drops geometry for the whole batch on non-contiguous pending offsets", () => {
    const append = vi.fn<AppendFn>();
    const persistence = new TerminalScrollbackPersistence({ append });
    persistence.handle(widthOutput("thread-1", "aaa", 3, 48));
    // outputLength 10 with 3 units leaves a gap: earlier widths must not be
    // applied to raw bytes whose cursor positions shifted.
    persistence.handle(widthOutput("thread-1", "bbb", 10, 100));
    persistence.handle(widthOutput("thread-1", "ccc", 13, 100));
    persistence.flush();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]).toHaveLength(3);
    expect(append).toHaveBeenCalledWith("thread-1", "aaabbbccc", 13);
  });

  it("bounds coalesced width churn to the retained span cap", () => {
    const append = vi.fn<AppendFn>();
    const persistence = new TerminalScrollbackPersistence({ append });
    for (let index = 0; index < 1100; index++) {
      persistence.handle(widthOutput("thread-1", "x", index + 1, index % 2 === 0 ? 48 : 100));
    }
    persistence.flush();
    const changes = append.mock.calls[0]?.[3];
    expect(changes?.length).toBeLessThanOrEqual(MAX_TERMINAL_COLUMN_CHANGES);
    // The oldest spans fall off the bounded history and read as unknown.
    expect(changes?.[0]).toEqual({ fromCursor: 0, columns: null });
    expect(changes?.at(-1)).toEqual({ fromCursor: 1099, columns: 100 });
  });

  it("retries a failed flush with the identical column changes", () => {
    vi.useFakeTimers();
    try {
      let fail = true;
      const append = vi.fn<AppendFn>(() => {
        if (fail) throw Object.assign(new Error("full"), { code: "SQLITE_FULL" });
      });
      const persistence = new TerminalScrollbackPersistence({ append });
      persistence.handle(widthOutput("thread-1", "aa", 2, 48));
      vi.advanceTimersByTime(250);
      expect(append).toHaveBeenCalledTimes(1);
      fail = false;
      persistence.flush();
      expect(append).toHaveBeenCalledTimes(2);
      expect(append).toHaveBeenLastCalledWith("thread-1", "aa", 2, [
        { fromCursor: 0, columns: 48 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the legacy three-argument append for malformed cursors with a valid width", () => {
    const append = vi.fn<AppendFn>();
    const persistence = new TerminalScrollbackPersistence({ append });
    // outputLength below the batch length yields a negative fromCursor.
    persistence.handle(widthOutput("thread-1", "abcde", 2, 48));
    // An unsafe cursor must not reach TerminalColumnHistory.record either.
    persistence.handle(widthOutput("thread-2", "ab", 2 ** 53, 100));
    persistence.flush();
    expect(append).toHaveBeenCalledTimes(2);
    for (const call of append.mock.calls) expect(call).toHaveLength(3);
    expect(append).toHaveBeenCalledWith("thread-1", "abcde", 2);
    expect(append).toHaveBeenCalledWith("thread-2", "ab", 2 ** 53);
  });

  it("flushes each terminal generation with only its own widths", () => {
    const append = vi.fn<AppendFn>();
    const persistence = new TerminalScrollbackPersistence({ append });
    persistence.handle(widthOutput("thread-1", "old", 3, 48, "gen-a"));
    persistence.handle(widthOutput("thread-1", "new", 3, 100, "gen-b"));
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith("thread-1", "old", 3, [{ fromCursor: 0, columns: 48 }]);
    persistence.flush();
    expect(append).toHaveBeenLastCalledWith("thread-1", "new", 3, [
      { fromCursor: 0, columns: 100 },
    ]);
  });
});
