import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_QUIT_CLEANUP_TIMEOUT_MS, raceWithTimeout } from "./appQuitCleanup";

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
