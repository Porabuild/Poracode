import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedLoopbackBootstrap } from "@/shared/managedLoopback";
import {
  consumeManagedLoopbackBootstrap,
  prewarmManagedLoopbackBootstrap,
} from "./managedLoopbackBootstrapPrewarm";

const bootstrap: ManagedLoopbackBootstrap = {
  endpoint: "http://127.0.0.1:49152/",
  pairingUrl: "http://127.0.0.1:49152/#token=fixture",
};

describe("managed loopback bootstrap prewarm", () => {
  afterEach(() => vi.useRealTimers());

  it("starts before the renderer asks and shares a pending result once", async () => {
    const owner = {};
    const pending = Promise.withResolvers<ManagedLoopbackBootstrap | null>();
    const request = vi.fn<() => Promise<ManagedLoopbackBootstrap | null>>(() => pending.promise);
    prewarmManagedLoopbackBootstrap(owner, request);
    expect(request).toHaveBeenCalledOnce();
    const read = consumeManagedLoopbackBootstrap(owner, request);
    expect(request).toHaveBeenCalledOnce();
    pending.resolve(bootstrap);
    await expect(read).resolves.toBe(bootstrap);
  });

  it("gets a fresh credential on subsequent reload or reconnect requests", async () => {
    const owner = {};
    const fresh = { ...bootstrap, pairingUrl: "http://127.0.0.1:49152/#token=replacement" };
    const request = vi
      .fn<() => Promise<ManagedLoopbackBootstrap | null>>()
      .mockResolvedValueOnce(bootstrap)
      .mockResolvedValue(fresh);
    prewarmManagedLoopbackBootstrap(owner, request);
    await expect(consumeManagedLoopbackBootstrap(owner, request)).resolves.toBe(bootstrap);
    await expect(consumeManagedLoopbackBootstrap(owner, request)).resolves.toBe(fresh);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("never shares a window's prepared credential with another window", async () => {
    const owner = {};
    const request = vi.fn<() => Promise<ManagedLoopbackBootstrap | null>>(async () => bootstrap);
    const otherRequest = vi.fn<() => Promise<ManagedLoopbackBootstrap | null>>(async () => null);
    prewarmManagedLoopbackBootstrap(owner, request);
    await expect(consumeManagedLoopbackBootstrap({}, otherRequest)).resolves.toBeNull();
    expect(otherRequest).toHaveBeenCalledOnce();
    await expect(consumeManagedLoopbackBootstrap(owner, request)).resolves.toBe(bootstrap);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([null, new Error("Backend starting")])(
    "retries a failed prewarm through the normal bootstrap path (%s)",
    async (failure) => {
      const owner = {};
      const request = vi.fn<() => Promise<ManagedLoopbackBootstrap | null>>();
      if (failure instanceof Error) request.mockRejectedValueOnce(failure);
      else request.mockResolvedValueOnce(failure);
      request.mockResolvedValue(bootstrap);
      prewarmManagedLoopbackBootstrap(owner, request);
      await expect(consumeManagedLoopbackBootstrap(owner, request)).resolves.toBe(bootstrap);
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it("discards prepared credentials after a delayed page load", async () => {
    vi.useFakeTimers();
    const owner = {};
    const request = vi.fn<() => Promise<ManagedLoopbackBootstrap | null>>(async () => bootstrap);
    prewarmManagedLoopbackBootstrap(owner, request);
    await vi.advanceTimersByTimeAsync(30_000);
    await consumeManagedLoopbackBootstrap(owner, request);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rechecks age when a pending prewarm finishes", async () => {
    vi.useFakeTimers();
    const owner = {};
    const pending = Promise.withResolvers<ManagedLoopbackBootstrap | null>();
    const request = vi
      .fn<() => Promise<ManagedLoopbackBootstrap | null>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(bootstrap);
    prewarmManagedLoopbackBootstrap(owner, request);
    const read = consumeManagedLoopbackBootstrap(owner, request);
    await vi.advanceTimersByTimeAsync(30_000);
    pending.resolve(bootstrap);
    await expect(read).resolves.toBe(bootstrap);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("preserves a replacement prewarm when an earlier navigation settles late", async () => {
    const owner = {};
    const pending = Promise.withResolvers<ManagedLoopbackBootstrap | null>();
    const firstRequest = vi.fn<() => Promise<ManagedLoopbackBootstrap | null>>(
      () => pending.promise,
    );
    const replacement = { ...bootstrap, pairingUrl: "http://127.0.0.1:49152/#token=new-page" };
    const nextRequest = vi.fn<() => Promise<ManagedLoopbackBootstrap | null>>(
      async () => replacement,
    );
    prewarmManagedLoopbackBootstrap(owner, firstRequest);
    prewarmManagedLoopbackBootstrap(owner, nextRequest);
    pending.resolve(bootstrap);
    await expect(consumeManagedLoopbackBootstrap(owner, nextRequest)).resolves.toBe(replacement);
    expect(nextRequest).toHaveBeenCalledOnce();
  });
});
