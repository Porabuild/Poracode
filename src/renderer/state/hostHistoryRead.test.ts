import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteClientError } from "@/shared/remote/client";
import {
  INITIAL_HISTORY_RETRY_DELAYS_MS,
  isRetryableHistoryReadError,
  readWithHistoryRetries,
} from "./hostHistoryRead";

const transient = () => new RemoteClientError("bad gateway", 502, "bad_gateway");
const busy = () => new RemoteClientError("busy", 503, "persistence_busy");

/** Captures a read's rejection so a test asserts on it after the timers ran. */
const settle = (read: Promise<unknown>): Promise<{ readonly error?: unknown }> =>
  read.then(
    () => ({}),
    (error: unknown) => ({ error }),
  );

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isRetryableHistoryReadError", () => {
  it("retries transport failures and a busy host's persistence refusals only", () => {
    expect(isRetryableHistoryReadError(transient())).toBe(true);
    expect(isRetryableHistoryReadError(busy())).toBe(true);
    expect(isRetryableHistoryReadError(new RemoteClientError("gone", 404, "not_found"))).toBe(
      false,
    );
    expect(isRetryableHistoryReadError(new RemoteClientError("x", 503, "other"))).toBe(false);
    expect(isRetryableHistoryReadError(new Error("boom"))).toBe(false);
  });
});

describe("readWithHistoryRetries", () => {
  it("retries a transient failure on the shared backoff and returns the later result", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(transient())
      .mockRejectedValueOnce(busy())
      .mockResolvedValueOnce("tail");
    const result = readWithHistoryRetries(read, { isCurrent: () => true });

    await vi.advanceTimersByTimeAsync(INITIAL_HISTORY_RETRY_DELAYS_MS[0]);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(INITIAL_HISTORY_RETRY_DELAYS_MS[1]);
    await expect(result).resolves.toBe("tail");
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("fails after the retries are spent and at once for a permanent error", async () => {
    const stuck = vi.fn<() => Promise<string>>().mockRejectedValue(transient());
    const spent = settle(readWithHistoryRetries(stuck, { isCurrent: () => true }));
    await vi.advanceTimersByTimeAsync(INITIAL_HISTORY_RETRY_DELAYS_MS[0]);
    await vi.advanceTimersByTimeAsync(INITIAL_HISTORY_RETRY_DELAYS_MS[1]);
    expect((await spent).error).toMatchObject({ message: "bad gateway" });
    expect(stuck).toHaveBeenCalledTimes(INITIAL_HISTORY_RETRY_DELAYS_MS.length + 1);

    const permanent = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new RemoteClientError("gone", 404, "not_found"));
    const refused = await settle(readWithHistoryRetries(permanent, { isCurrent: () => true }));
    expect(refused.error).toMatchObject({ message: "gone" });
    expect(permanent).toHaveBeenCalledTimes(1);
  });

  it("does not retry once the connection the read started on is replaced", async () => {
    let current = true;
    const read = vi.fn<() => Promise<string>>().mockRejectedValue(transient());
    const outcome = settle(readWithHistoryRetries(read, { isCurrent: () => current }));
    current = false;
    await vi.advanceTimersByTimeAsync(INITIAL_HISTORY_RETRY_DELAYS_MS[0]);
    expect((await outcome).error).toMatchObject({ message: "bad gateway" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("ends a backoff early when its connection is replaced", async () => {
    let replace = () => {};
    let current = true;
    const read = vi.fn<() => Promise<string>>().mockRejectedValue(transient());
    const outcome = settle(
      readWithHistoryRetries(read, {
        isCurrent: () => current,
        onReplaced: (listener) => {
          replace = listener;
          return () => {};
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    current = false;
    replace();
    expect((await outcome).error).toMatchObject({ message: "bad gateway" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("stops at once when the caller cancels", async () => {
    const controller = new AbortController();
    const read = vi.fn<() => Promise<string>>().mockRejectedValue(transient());
    const outcome = settle(
      readWithHistoryRetries(read, { signal: controller.signal, isCurrent: () => true }),
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error("cancelled"));
    expect((await outcome).error).toBeDefined();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
