import { describe, expect, it, vi } from "vitest";
import { RemoteRefreshScheduler } from "./remoteRefreshScheduler";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("RemoteRefreshScheduler", () => {
  it("joins an in-flight refresh that already covers the request", async () => {
    const scheduler = new RemoteRefreshScheduler<number>();
    const pending = deferred<number>();
    const run = vi.fn<(options: object) => Promise<number>>(() => pending.promise);

    const first = scheduler.request("desktop-1", { includeAuxiliary: true }, run);
    const second = scheduler.request("desktop-1", { includeAuxiliary: false }, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    pending.resolve(1);
    await expect(second).resolves.toBe(1);
  });

  it("merges stronger requests into one trailing refresh", async () => {
    const scheduler = new RemoteRefreshScheduler<number>();
    const firstPending = deferred<number>();
    const run = vi
      .fn<(options: object) => Promise<number>>()
      .mockReturnValueOnce(firstPending.promise)
      .mockResolvedValueOnce(2);

    const first = scheduler.request("desktop-1", { includeAuxiliary: false }, run);
    const trailingA = scheduler.request(
      "desktop-1",
      { refreshSelectedThread: true, includeAuxiliary: false },
      run,
    );
    const trailingB = scheduler.request("desktop-1", { includeAuxiliary: true }, run);
    firstPending.resolve(1);

    await expect(first).resolves.toBe(1);
    await expect(Promise.all([trailingA, trailingB])).resolves.toEqual([2, 2]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith({
      refreshSelectedThread: true,
      resetLastSeenSeq: false,
      includeAuxiliary: true,
    });
  });

  it("queues a fresh snapshot for a signal that arrives during an older request", async () => {
    const scheduler = new RemoteRefreshScheduler<number>();
    const firstPending = deferred<number>();
    const run = vi
      .fn<(options: object) => Promise<number>>()
      .mockReturnValueOnce(firstPending.promise)
      .mockResolvedValueOnce(2);

    const first = scheduler.request("desktop-1", { includeAuxiliary: false }, run);
    const afterEvent = scheduler.request(
      "desktop-1",
      { includeAuxiliary: false, trailingIfInFlight: true },
      run,
    );
    firstPending.resolve(1);

    await expect(first).resolves.toBe(1);
    await expect(afterEvent).resolves.toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("starts a queued stronger refresh after the active refresh rejects", async () => {
    const scheduler = new RemoteRefreshScheduler<number>();
    const firstPending = deferred<number>();
    const run = vi
      .fn<(options: object) => Promise<number>>()
      .mockReturnValueOnce(firstPending.promise)
      .mockResolvedValueOnce(2);

    const first = scheduler.request("desktop-1", { includeAuxiliary: false }, run);
    const trailing = scheduler.request("desktop-1", { includeAuxiliary: true }, run);
    firstPending.reject(new Error("offline"));

    await expect(first).rejects.toThrow("offline");
    await expect(trailing).resolves.toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
