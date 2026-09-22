import { describe, expect, it, vi } from "vitest";
import type { NativeThreadActivityChange } from "@/shared/backendHostProtocol";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  createNativeThreadActivityProjection,
  NATIVE_THREAD_ACTIVITY_MAX_CHANGES_PER_MESSAGE,
} from "./nativeThreadActivity";

function threadState(threadId: string, status: string): SupervisorEvent {
  return {
    type: "thread-state",
    threadId,
    status: status as never,
    attention: "none",
    canResumeWithConfig: false,
  };
}

function createScheduler(): {
  scheduleFlush: (run: () => void, delayMs: number) => () => void;
  runAll: () => void;
  pending: () => number;
} {
  const queued: { run: () => void; delayMs: number; cancelled: boolean }[] = [];
  return {
    scheduleFlush: (run, delayMs) => {
      const entry = { run, delayMs, cancelled: false };
      queued.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    runAll: () => {
      const batch = queued.splice(0);
      for (const entry of batch) {
        if (!entry.cancelled) entry.run();
      }
    },
    pending: () => queued.filter((entry) => !entry.cancelled).length,
  };
}

describe("native thread activity projection", () => {
  it("coalesces per thread with last-writer-wins and flushes one batch", () => {
    const emit = vi.fn<(changes: NativeThreadActivityChange[]) => void>();
    const scheduler = createScheduler();
    const projection = createNativeThreadActivityProjection({
      emit,
      scheduleFlush: scheduler.scheduleFlush,
    });

    projection.observe(threadState("t1", "working"));
    projection.observe(threadState("t1", "idle"));
    projection.observe(threadState("t2", "launching"));
    projection.observe({ type: "thread-exited", threadId: "t3", exitCode: 0 } as SupervisorEvent);

    expect(emit).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(1);
    scheduler.runAll();

    expect(emit).toHaveBeenCalledExactlyOnceWith([
      { threadId: "t1", active: false },
      { threadId: "t2", active: true },
      { threadId: "t3", active: false },
    ]);
  });

  it("treats idle and error states as inactive and ignores unrelated events", () => {
    const emit = vi.fn<(changes: NativeThreadActivityChange[]) => void>();
    const scheduler = createScheduler();
    const projection = createNativeThreadActivityProjection({
      emit,
      scheduleFlush: scheduler.scheduleFlush,
    });

    projection.observe(threadState("t1", "error"));
    projection.observe({ type: "thread-output", threadId: "t9", data: "x" } as SupervisorEvent);
    projection.observe({ type: "thread-reset", threadId: "t8" } as SupervisorEvent);

    scheduler.runAll();
    expect(emit).toHaveBeenCalledExactlyOnceWith([{ threadId: "t1", active: false }]);
  });

  it("caps one batch and flushes the remainder on the next turn", () => {
    const emit = vi.fn<(changes: NativeThreadActivityChange[]) => void>();
    const delays: number[] = [];
    const scheduler = createScheduler();
    const projection = createNativeThreadActivityProjection({
      emit,
      maxChangesPerMessage: 2,
      scheduleFlush: (run, delayMs) => {
        delays.push(delayMs);
        return scheduler.scheduleFlush(run, delayMs);
      },
    });

    projection.observe(threadState("t1", "working"));
    projection.observe(threadState("t2", "working"));
    projection.observe(threadState("t3", "working"));
    scheduler.runAll();

    expect(emit).toHaveBeenNthCalledWith(1, [
      { threadId: "t1", active: true },
      { threadId: "t2", active: true },
    ]);
    // The capped remainder is scheduled immediately, not after the interval.
    expect(delays).toEqual([50, 0]);
    scheduler.runAll();
    expect(emit).toHaveBeenNthCalledWith(2, [{ threadId: "t3", active: true }]);
  });

  it("keeps the default cap above any realistic single-flush batch", () => {
    expect(NATIVE_THREAD_ACTIVITY_MAX_CHANGES_PER_MESSAGE).toBeGreaterThan(200);
  });

  it("stops emitting after dispose and cancels the pending flush", () => {
    const emit = vi.fn<(changes: NativeThreadActivityChange[]) => void>();
    const scheduler = createScheduler();
    const projection = createNativeThreadActivityProjection({
      emit,
      scheduleFlush: scheduler.scheduleFlush,
    });

    projection.observe(threadState("t1", "working"));
    projection.dispose();
    scheduler.runAll();
    projection.observe(threadState("t2", "working"));
    scheduler.runAll();

    expect(emit).not.toHaveBeenCalled();
  });

  it("flushes a reset-inactive transition without a preceding active state", () => {
    const emit = vi.fn<(changes: NativeThreadActivityChange[]) => void>();
    const scheduler = createScheduler();
    const projection = createNativeThreadActivityProjection({
      emit,
      scheduleFlush: scheduler.scheduleFlush,
    });

    // `markLiveThreadsInactive` emits only transitions for interrupted threads.
    projection.observe(threadState("t1", "inactive"));
    scheduler.runAll();
    expect(emit).toHaveBeenCalledExactlyOnceWith([{ threadId: "t1", active: false }]);
  });
});
