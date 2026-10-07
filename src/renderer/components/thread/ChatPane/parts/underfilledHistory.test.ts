import { describe, expect, it, vi } from "vitest";
import { createUnderfilledHistoryTrigger, type HistoryStartReached } from "./underfilledHistory";

describe("underfilled history", () => {
  const measured = (oldestEntryId: string | undefined, onStartReached: HistoryStartReached) => ({
    threadId: "thread-1",
    oldestEntryId,
    scroller: { clientHeight: 776, scrollHeight: 776 },
    onStartReached,
  });

  it("waits for actual data after an empty initial measurement", () => {
    const trigger = createUnderfilledHistoryTrigger().measure;
    const onStartReached = vi.fn<HistoryStartReached>();
    expect(trigger(measured(undefined, onStartReached))).toBe(false);
    expect(onStartReached).not.toHaveBeenCalled();
    expect(trigger(measured("tail", onStartReached))).toBe(true);
    expect(onStartReached).toHaveBeenCalledOnce();
  });

  it("deduplicates measurements and synchronous reentry at the same boundary", () => {
    const trigger = createUnderfilledHistoryTrigger().measure;
    const onStartReached = vi.fn<HistoryStartReached>(() => {
      expect(trigger(measured("tail", onStartReached))).toBe(false);
    });
    trigger(measured("tail", onStartReached));
    trigger(measured("tail", onStartReached));
    expect(onStartReached).toHaveBeenCalledOnce();
  });

  it("continues when a prepend changes the oldest timeline entry", () => {
    const trigger = createUnderfilledHistoryTrigger().measure;
    const onStartReached = vi.fn<HistoryStartReached>();
    trigger(measured("tail", onStartReached));
    trigger(measured("older", onStartReached));
    trigger(measured("older", onStartReached));
    expect(onStartReached).toHaveBeenCalledTimes(2);
  });

  it("leaves overflowing lists to their normal edge and resets after overflow", () => {
    const trigger = createUnderfilledHistoryTrigger().measure;
    const onStartReached = vi.fn<HistoryStartReached>();
    trigger(measured("tail", onStartReached));
    expect(
      trigger({
        ...measured("tail", onStartReached),
        scroller: { clientHeight: 776, scrollHeight: 900 },
      }),
    ).toBe(false);
    expect(onStartReached).toHaveBeenCalledOnce();
    trigger(measured("tail", onStartReached));
    expect(onStartReached).toHaveBeenCalledTimes(2);
  });

  it("resets on thread replacement and empty data", () => {
    const trigger = createUnderfilledHistoryTrigger().measure;
    const onStartReached = vi.fn<HistoryStartReached>();
    trigger(measured("tail", onStartReached));
    trigger({ ...measured("tail", onStartReached), threadId: "thread-2" });
    trigger({ ...measured(undefined, onStartReached), threadId: "thread-2" });
    trigger({ ...measured("tail", onStartReached), threadId: "thread-2" });
    expect(onStartReached).toHaveBeenCalledTimes(3);
  });

  it("does not request an unmeasured, hidden or unavailable boundary", () => {
    const trigger = createUnderfilledHistoryTrigger().measure;
    const onStartReached = vi.fn<HistoryStartReached>();
    trigger({ ...measured("tail", onStartReached), scroller: null });
    trigger({
      ...measured("tail", onStartReached),
      scroller: { clientHeight: 0, scrollHeight: 0 },
    });
    trigger({ ...measured("tail", onStartReached), onStartReached: undefined });
    expect(onStartReached).not.toHaveBeenCalled();
    trigger(measured("tail", onStartReached));
    expect(onStartReached).toHaveBeenCalledOnce();
  });

  it("continues a different measured prepend only after the pending page settles", async () => {
    const trigger = createUnderfilledHistoryTrigger();
    let resolve!: (loaded: boolean) => void;
    const page = new Promise<boolean>((done) => {
      resolve = done;
    });
    const onStartReached = vi.fn<HistoryStartReached>().mockReturnValueOnce(page);
    trigger.measure(measured("tail", onStartReached));
    expect(trigger.measure(measured("older", onStartReached))).toBe(false);
    trigger.measure(measured("older", onStartReached));
    expect(onStartReached).toHaveBeenCalledOnce();
    resolve(true);
    await page;
    expect(onStartReached).toHaveBeenCalledTimes(2);
    trigger.measure(measured("older", onStartReached));
    expect(onStartReached).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "does not retry failed paging-state commits and permits one explicit retry (reject: %s)",
    async (reject) => {
      const trigger = createUnderfilledHistoryTrigger();
      const onStartReached = vi
        .fn<HistoryStartReached>()
        .mockImplementationOnce(() =>
          reject ? Promise.reject(new Error("temporary")) : Promise.resolve(false),
        )
        .mockResolvedValue(false);
      const value = measured("tail", onStartReached);
      trigger.measure(value);
      await Promise.resolve();
      for (let count = 0; count < 20; count++) trigger.measure(value);
      expect(onStartReached).toHaveBeenCalledOnce();
      expect(trigger.retry(value)).toBe(true);
      expect(trigger.retry(value)).toBe(false);
      await Promise.resolve();
      for (let count = 0; count < 20; count++) trigger.measure(value);
      expect(onStartReached).toHaveBeenCalledTimes(2);
    },
  );

  it("does not make a first request from public retry intent", () => {
    const trigger = createUnderfilledHistoryTrigger();
    const onStartReached = vi.fn<HistoryStartReached>();
    expect(trigger.retry(measured("tail", onStartReached))).toBe(false);
    expect(onStartReached).not.toHaveBeenCalled();
  });

  it.each(["thread", "empty", "overflow", "hidden", "unmounted"] as const)(
    "invalidates a queued continuation on %s before an old page settles",
    async (change) => {
      const trigger = createUnderfilledHistoryTrigger();
      let resolve!: (loaded: boolean) => void;
      const page = new Promise<boolean>((done) => {
        resolve = done;
      });
      const onStartReached = vi.fn<HistoryStartReached>().mockReturnValueOnce(page);
      trigger.measure(measured("tail", onStartReached));
      const next = measured("older", onStartReached);
      trigger.measure(next);
      if (change === "thread") trigger.measure({ ...next, threadId: "thread-2" });
      if (change === "empty") trigger.measure({ ...next, oldestEntryId: undefined });
      if (change === "overflow")
        trigger.measure({ ...next, scroller: { clientHeight: 776, scrollHeight: 900 } });
      if (change === "hidden")
        trigger.measure({ ...next, scroller: { clientHeight: 0, scrollHeight: 0 } });
      if (change === "unmounted") trigger.reset();
      resolve(true);
      await page;
      expect(onStartReached).toHaveBeenCalledTimes(change === "thread" ? 2 : 1);
    },
  );

  it("rechecks the owning scroller geometry before a deferred continuation", async () => {
    const trigger = createUnderfilledHistoryTrigger();
    let resolve!: (loaded: boolean) => void;
    const page = new Promise<boolean>((done) => {
      resolve = done;
    });
    const onStartReached = vi.fn<HistoryStartReached>().mockReturnValueOnce(page);
    trigger.measure(measured("tail", onStartReached));
    const next = measured("older", onStartReached);
    trigger.measure(next);
    next.scroller.scrollHeight = 900;
    resolve(true);
    await page;
    expect(onStartReached).toHaveBeenCalledOnce();
  });
});
