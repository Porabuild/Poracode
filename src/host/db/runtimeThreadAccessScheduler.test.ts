import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeThreadAccessScheduler } from "./runtimeThreadAccessScheduler";

afterEach(() => {
  vi.useRealTimers();
});

describe("runtime thread access availability", () => {
  it("reports released slots while queued mutations still acquire their own gate", async () => {
    const available = vi.fn<(threadId: string) => void>();
    const scheduler = new RuntimeThreadAccessScheduler({ onThreadAccessAvailable: available });
    const fence = scheduler.beginFence("a", 0, 1);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mutation = scheduler.runMutation("a", "truncate", () => held);
    scheduler.settleFence(fence);
    expect(available).toHaveBeenCalledExactlyOnceWith("a");
    await Promise.resolve();
    release();
    await mutation;
    expect(available.mock.calls).toEqual([["a"], ["a"]]);
    scheduler.dispose();
  });

  it("wakes after an owner releases even when a bounded mutation waiter expired", async () => {
    vi.useFakeTimers();
    const available = vi.fn<(threadId: string) => void>();
    const scheduler = new RuntimeThreadAccessScheduler({
      onThreadAccessAvailable: available,
      mutationDeadlineMs: 10,
      fenceMaxHoldMs: 100,
    });
    const fence = scheduler.beginFence("a", 0, 1);
    const refusal = scheduler
      .runMutation("a", "truncate", () => {})
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(11);
    expect(await refusal).toMatchObject({ name: "RuntimePersistenceBusyError" });
    expect(available).toHaveBeenCalledExactlyOnceWith("a");
    scheduler.settleFence(fence);
    expect(available.mock.calls).toEqual([["a"], ["a"]]);
    scheduler.dispose();
  });

  it("does not wake retired listeners during scheduler disposal", () => {
    const available = vi.fn<(threadId: string) => void>();
    const scheduler = new RuntimeThreadAccessScheduler({ onThreadAccessAvailable: available });
    scheduler.beginFence("a", 0, 1);
    scheduler.dispose();
    expect(available).not.toHaveBeenCalled();
    expect(scheduler.waiterCount()).toBe(0);
  });
});
