import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_QUIT_CLEANUP_TIMEOUT_MS,
  raceWithTimeout,
  settlesWithinTimeout,
} from "./appQuitCleanup";

describe("raceWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the work finishes first", async () => {
    await expect(raceWithTimeout(Promise.resolve("ok"), APP_QUIT_CLEANUP_TIMEOUT_MS)).resolves.toBe(
      undefined,
    );
  });

  it("resolves when the work rejects so quit can continue", async () => {
    await expect(
      raceWithTimeout(Promise.reject(new Error("ssh hung")), APP_QUIT_CLEANUP_TIMEOUT_MS),
    ).resolves.toBe(undefined);
  });

  it("resolves when the work never settles", async () => {
    vi.useFakeTimers();
    const pending = raceWithTimeout(new Promise(() => undefined), APP_QUIT_CLEANUP_TIMEOUT_MS);
    const seen = vi.fn<() => void>();
    void pending.then(seen);
    expect(seen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(APP_QUIT_CLEANUP_TIMEOUT_MS);
    await pending;
    expect(seen).toHaveBeenCalledOnce();
  });
});

describe("settlesWithinTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports a work that settled first, whichever way it settled", async () => {
    await expect(settlesWithinTimeout(Promise.resolve("ok"), 1_000)).resolves.toBe(true);
    await expect(
      settlesWithinTimeout(Promise.reject(new Error("save failed")), 1_000),
    ).resolves.toBe(true);
  });

  it("reports a work that never settles once the timeout elapses", async () => {
    vi.useFakeTimers();
    const seen = vi.fn<(result: boolean) => void>();
    const pending = settlesWithinTimeout(new Promise(() => undefined), 1_000).then(seen);
    expect(seen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(seen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(seen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("releases its timeout once the work settles", async () => {
    vi.useFakeTimers();
    await settlesWithinTimeout(Promise.resolve(), 1_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
