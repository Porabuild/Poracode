import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  ProcessPerformanceSampler,
  type ProcessPerformanceSample,
} from "./processPerformanceSampler";

const execute = promisify(execFile);
const fixture = resolve("src/shared/diagnostics/fixtures/processPerformance.mjs");

describe("in-process performance observations", () => {
  it("records no timer observations as missing rather than a zero-delay success", () => {
    const sampler = new ProcessPerformanceSampler();
    try {
      const value = sampler.sample();
      expect(value.eventLoopDelay).toMatchObject({
        count: 0,
        minMs: null,
        p95Ms: null,
        maxMs: null,
      });
      expect(value.gc.count).toBe(0);
      const serialized = JSON.stringify(value);
      sampler.sample();
      expect(JSON.stringify(value)).toBe(serialized);
    } finally {
      sampler.dispose();
    }
    expect(() => sampler.sample()).toThrow("disposed");
    sampler.dispose();
  });

  it("observes CPU work, a real event-loop stall and forced GC in an owned Node process", async () => {
    const { stdout } = await execute(process.execPath, ["--expose-gc", fixture], {
      timeout: 5_000,
      env: {
        ...process.env,
        SYNTHETIC_SECRET_FOR_PRIVACY_CHECK: "never-record-this-fixture-value",
      },
    });
    const data = JSON.parse(stdout) as {
      idle: ProcessPerformanceSample;
      busy: ProcessPerformanceSample;
      drained: ProcessPerformanceSample;
      ownCpu: { user: number; system: number };
    };
    expect(data.busy.cpu.userMs + data.busy.cpu.systemMs).toBeGreaterThanOrEqual(
      (data.ownCpu.user + data.ownCpu.system) / 1_000,
    );
    expect(data.busy.eventLoopDelay.maxMs).toBeGreaterThan(70);
    expect(data.busy.gc.count).toBeGreaterThan(0);
    expect(data.busy.gc.durationMs).toBeGreaterThan(0);
    expect(data.busy.fromMonotonicMs).toBe(data.idle.toMonotonicMs);
    expect(data.drained.fromMonotonicMs).toBe(data.busy.toMonotonicMs);
    expect(data.busy.memory.rssBytes).toBeGreaterThan(0);
    expect(stdout).not.toContain("never-record-this-fixture-value");
  });

  it("does not keep an otherwise finished process alive", async () => {
    await expect(
      execute(process.execPath, [fixture, "unref"], { timeout: 3_000 }),
    ).resolves.toMatchObject({ stdout: "" });
  });
});
