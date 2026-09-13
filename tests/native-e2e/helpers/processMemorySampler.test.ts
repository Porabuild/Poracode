import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessMemorySampler } from "./processMemorySampler";

const probe = vi.hoisted(() => ({ tables: [] as Array<string | null> }));

vi.mock("node:child_process", () => ({
  spawnSync: () => {
    const table = probe.tables.shift() ?? null;
    return { status: table === null ? 1 : 0, stdout: table ?? "" };
  },
}));

beforeEach(() => {
  probe.tables = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("process memory evidence", () => {
  it("retains an earlier own-process peak separately from the process-tree peak", () => {
    probe.tables = [
      "10 1 400\n20 10 100\n30 20 50\n40 1 9000\n",
      "10 1 100\n20 10 800\n30 20 50\n40 1 9000\n",
    ];
    const sampler = new ProcessMemorySampler(10);
    sampler.start(100);
    vi.advanceTimersByTime(100);
    sampler.stop();

    expect(sampler.summary().peakOwnRssKb).toBe(400);
    expect(sampler.summary().peakTotalRssKb).toBe(950);
    expect(sampler.summary()).toMatchObject({ samplerVersion: 2, samples: 2, probeFailures: 0 });
  });

  it("preserves measured peaks after the root exits or a later probe fails", () => {
    probe.tables = ["10 1 400\n20 10 100\n", "20 1 900\n", null];
    const sampler = new ProcessMemorySampler(10);
    sampler.start(100);
    vi.advanceTimersByTime(200);
    sampler.stop();

    expect(sampler.summary()).toMatchObject({
      peakOwnRssKb: 400,
      peakTotalRssKb: 500,
      samples: 3,
      probeFailures: 1,
    });
  });

  it("reports unobserved memory as unknown rather than zero", () => {
    probe.tables = [null, "20 1 900\n"];
    const sampler = new ProcessMemorySampler(10);
    sampler.start(100);
    vi.advanceTimersByTime(100);
    sampler.stop();

    expect(sampler.summary()).toMatchObject({
      peakOwnRssKb: null,
      peakTotalRssKb: null,
      samples: 2,
      probeFailures: 1,
    });
  });
});
