import { afterEach, describe, expect, it, vi } from "vitest";
import { ownMediaImageReads } from "./ownedMediaImageReads";

afterEach(() => vi.useRealTimers());

describe("media image-action ownership", () => {
  it("pins a pre-renewal read until it finishes, then releases once and refuses new reads", async () => {
    let finish!: (bytes: Uint8Array<ArrayBuffer>) => void;
    const release = vi.fn<() => Promise<void>>(async () => {});
    const owner = ownMediaImageReads(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      release,
    );
    const reading = owner.readImageBytes();
    await Promise.resolve();
    const retirement = owner.release();
    expect(owner.release()).toBe(retirement);
    expect(release).not.toHaveBeenCalled();
    await expect(owner.readImageBytes()).rejects.toThrow("released");
    finish(new Uint8Array([1, 2]));
    await expect(reading).resolves.toEqual(new Uint8Array([1, 2]));
    await retirement;
    expect(release).toHaveBeenCalledOnce();
  });

  it("bounds retirement even when a stalled transport ignores cancellation", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const release = vi.fn<() => Promise<void>>(async () => {});
    const owner = ownMediaImageReads((readSignal) => {
      signal = readSignal;
      return new Promise(() => {});
    }, release);
    const reading = owner.readImageBytes();
    const outcome = reading.catch((error: unknown) => error);
    const retirement = owner.release();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await outcome).toMatchObject({ message: "Media image read timed out." });
    await retirement;
    expect(signal.aborted).toBe(true);
    expect(release).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
