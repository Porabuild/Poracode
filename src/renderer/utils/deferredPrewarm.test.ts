import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferredPrewarmRunner } from "./deferredPrewarm";

describe("deferred prewarm scheduling", () => {
  let online = true;
  let nextId = 0;
  const queued = new Map<number, () => void>();
  const stops: Array<() => void> = [];
  const runIdle = () => {
    const entry = queued.entries().next().value;
    expect(entry).toBeDefined();
    const [id, callback] = entry!;
    queued.delete(id);
    callback();
  };
  beforeEach(() => {
    online = true;
    nextId = 0;
    queued.clear();
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
      queued.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal("cancelIdleCallback", (id: number) => queued.delete(id));
  });
  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pauses before a queued browser import without consuming its task, then resumes once", async () => {
    const first = vi.fn<() => Promise<void>>(async () => {});
    const second = vi.fn<() => Promise<void>>(async () => {});
    const start = createDeferredPrewarmRunner([first, second]);
    stops.push(start({ requiresOnline: true }));
    expect(queued.size).toBe(1);
    online = false;
    runIdle();
    expect(first).not.toHaveBeenCalled();
    expect(queued.size).toBe(0);
    online = true;
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    expect(queued.size).toBe(1);
    runIdle();
    await vi.waitFor(() => expect(queued.size).toBe(1));
    expect(first).toHaveBeenCalledTimes(1);
    runIdle();
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("online"));
    expect(queued.size).toBe(0);
  });

  it("a stopped run's late import cannot release or cancel its newer owner", async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const second = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          releaseSecond = resolve;
        }),
    );
    const third = vi.fn<() => Promise<void>>(async () => {});
    const start = createDeferredPrewarmRunner([first, second, third]);
    const oldStop = start();
    stops.push(oldStop);
    runIdle();
    oldStop();
    stops.push(start());
    runIdle();
    expect(second).toHaveBeenCalledTimes(1);
    releaseFirst();
    await Promise.resolve();
    await Promise.resolve();
    stops.push(start());
    expect(queued.size).toBe(0);
    releaseSecond();
    await vi.waitFor(() => expect(queued.size).toBe(1));
    oldStop();
    expect(queued.size).toBe(1);
    runIdle();
    await vi.waitFor(() => expect(third).toHaveBeenCalledTimes(1));
  });

  it("local packaged prewarm runs offline without an online listener", async () => {
    online = false;
    const listen = vi.spyOn(window, "addEventListener");
    const task = vi.fn<() => Promise<void>>(async () => {});
    stops.push(createDeferredPrewarmRunner([task])({ requiresOnline: false }));
    expect(queued.size).toBe(1);
    runIdle();
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(1));
    expect(listen.mock.calls.some(([type]) => type === "online")).toBe(false);
  });

  it("best-effort failures finish the queue and release the online listener", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const failure = vi.fn<() => Promise<void>>(() => {
      throw Error("fixture import failure");
    });
    const last = vi.fn<() => Promise<void>>(async () => {});
    const start = createDeferredPrewarmRunner([failure, last]);
    stops.push(start({ requiresOnline: true }));
    runIdle();
    await vi.waitFor(() => expect(queued.size).toBe(1));
    runIdle();
    await vi.waitFor(() =>
      expect(remove.mock.calls.some(([type]) => type === "online")).toBe(true),
    );
    window.dispatchEvent(new Event("online"));
    stops.push(start({ requiresOnline: true }));
    expect(last).toHaveBeenCalledTimes(1);
    expect(queued.size).toBe(0);
  });

  it("the timer fallback pauses and stopped offline work cannot restart", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    online = false;
    const task = vi.fn<() => Promise<void>>(async () => {});
    const stop = createDeferredPrewarmRunner([task])({ requiresOnline: true });
    stops.push(stop);
    expect(vi.getTimerCount()).toBe(0);
    online = true;
    window.dispatchEvent(new Event("online"));
    expect(vi.getTimerCount()).toBe(1);
    online = false;
    await vi.advanceTimersByTimeAsync(250);
    expect(task).not.toHaveBeenCalled();
    online = true;
    window.dispatchEvent(new Event("online"));
    stop();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(500);
    expect(task).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
