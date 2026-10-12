import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readProcessOutput } from "./asyncSampling.ts";
import { ProcessCpuSampler } from "./processCpuSampler.ts";

vi.mock("./asyncSampling.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./asyncSampling.ts")>()),
  readProcessOutput: vi.fn<typeof readProcessOutput>(),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(readProcessOutput).mockReset();
});
afterEach(() => vi.useRealTimers());

it.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
  "joins CPU probes and distinguishes failed observation from zero CPU use",
  async () => {
    const pending = Promise.withResolvers<string | null>();
    vi.mocked(readProcessOutput).mockReturnValueOnce(pending.promise);
    const sampler = new ProcessCpuSampler(10);
    sampler.start(100);
    await Promise.resolve();
    let joined = false;
    const stop = sampler.stop().then(() => {
      joined = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(joined).toBe(false);
    pending.resolve(null);
    await stop;
    expect(sampler.summary()).toMatchObject({
      samplerVersion: 1,
      samples: 1,
      probeFailures: 1,
      processes: [],
      observedWindowMs: null,
    });
  },
);

it.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
  "does not report a malformed parent table as a valid partial CPU tree",
  async () => {
    vi.mocked(readProcessOutput).mockResolvedValue(
      "10 1 0:00.00 Sun Sep 13 03:20:06 2026\nmalformed parent",
    );
    const sampler = new ProcessCpuSampler(10);
    sampler.start();
    await sampler.stop();
    expect(sampler.summary()).toMatchObject({ probeFailures: 1, processes: [] });
  },
);
