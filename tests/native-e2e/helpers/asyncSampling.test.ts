import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncSamplingLoop } from "./asyncSampling.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("asynchronous evidence sampling", () => {
  it("lets client work proceed while one slow probe runs, then joins it on stop", async () => {
    const pending = Promise.withResolvers<void>();
    let calls = 0;
    let clientTicks = 0;
    const heartbeat = setInterval(() => clientTicks++, 10);
    const loop = new AsyncSamplingLoop(async () => {
      calls++;
      await pending.promise;
    });
    loop.start(10);
    await vi.advanceTimersByTimeAsync(100);
    expect(clientTicks).toBe(10);
    expect(calls).toBe(1);
    let stopped = false;
    const stop = loop.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(stopped).toBe(false);
    expect(calls).toBe(1);
    expect(() => loop.start(10)).toThrow("Await sampler.stop()");
    pending.resolve();
    await stop;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);
    expect(loop.timing()).toMatchObject({ completedProbes: 1, unexpectedFailures: 0 });
    clearInterval(heartbeat);
  });

  it("starts the next interval after completion and allows restart after the joined stop", async () => {
    let calls = 0;
    const loop = new AsyncSamplingLoop(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    loop.start(20);
    loop.start(1);
    await vi.advanceTimersByTimeAsync(49);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    const stop = loop.stop();
    await vi.advanceTimersByTimeAsync(30);
    await stop;
    loop.start(20);
    const restartedStop = loop.stop();
    await vi.advanceTimersByTimeAsync(30);
    await restartedStop;
    expect(calls).toBe(3);
    expect(loop.timing().completedProbes).toBe(3);
  });

  it("records unexpected probe failures and refuses invalid intervals", async () => {
    const loop = new AsyncSamplingLoop(async () => {
      throw new Error("probe failed");
    });
    for (const interval of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => loop.start(interval)).toThrow("positive number");
    }
    loop.start(10);
    await loop.stop();
    expect(loop.timing()).toMatchObject({ completedProbes: 1, unexpectedFailures: 1 });
  });
});
