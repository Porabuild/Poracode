import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startNodePerformanceDiagnostics } from "./nodePerformanceDiagnostics";
import {
  PerformanceEvidenceWriter,
  type PerformanceWriterStats,
} from "./performanceEvidenceWriter";

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function outputDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "node-performance-"));
  roots.push(root);
  return root;
}

describe("opt-in Node performance recording", () => {
  it("does not open files or start timers when disabled", () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    expect(startNodePerformanceDiagnostics("server", {})).toBeUndefined();
    expect(interval).not.toHaveBeenCalled();
  });

  it.each([
    { PORACODE_PERF_OUTPUT_DIR: "relative" },
    { PORACODE_PERF_INTERVAL_MS: "0" },
    { PORACODE_PERF_MAX_BYTES: "999999999999" },
  ])("rejects invalid configuration without exposing environment values", async (override) => {
    const root = await outputDirectory();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      startNodePerformanceDiagnostics("server", {
        PORACODE_PERF_OUTPUT_DIR: root,
        ...override,
        SYNTHETIC_SECRET: "private-fixture-value",
      }),
    ).toBeUndefined();
    expect(await readdir(root)).toEqual([]);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private-fixture-value");
  });

  it("records a real periodic sample and drains its own file on stop", async () => {
    const root = await outputDirectory();
    const recorder = startNodePerformanceDiagnostics("server", {
      PORACODE_PERF_OUTPUT_DIR: root,
      PORACODE_PERF_INTERVAL_MS: "100",
      SYNTHETIC_SECRET: "private-fixture-value",
    })!;
    try {
      await delay(130);
    } finally {
      await recorder.stop();
    }
    const files = await readdir(root);
    expect(files).toHaveLength(1);
    const text = await readFile(join(root, files[0]!), "utf8");
    const records = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records[0]).toMatchObject({
      kind: "start",
      role: "server",
      pid: process.pid,
      intervalMs: 100,
    });
    expect(records.filter((record) => record.kind === "sample").length).toBeGreaterThanOrEqual(2);
    expect(records.at(-1)).toMatchObject({ kind: "end", complete: true });
    expect(text).not.toContain("private-fixture-value");
    expect(text).not.toContain(root);
    await recorder.stop();
    expect(await readFile(join(root, files[0]!), "utf8")).toBe(text);
  });

  it("does not hold application shutdown indefinitely on stalled diagnostic output", async () => {
    const root = await outputDirectory();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalFinish = PerformanceEvidenceWriter.prototype.finish;
    const held = Promise.withResolvers<PerformanceWriterStats>();
    let writer: PerformanceEvidenceWriter | undefined;
    vi.spyOn(PerformanceEvidenceWriter.prototype, "finish").mockImplementation(
      function (this: PerformanceEvidenceWriter) {
        writer = this;
        return held.promise;
      },
    );
    vi.useFakeTimers();
    const recorder = startNodePerformanceDiagnostics("backend", {
      PORACODE_PERF_OUTPUT_DIR: root,
    })!;
    const stopped = recorder.stop();
    await vi.advanceTimersByTimeAsync(500);
    await stopped;
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0]?.[0]).toContain("cannot qualify a performance gate");
    vi.useRealTimers();
    // The injected stall belongs to the fixture; release and join it before cleanup.
    const final = await originalFinish.call(writer!, "shutdown");
    held.resolve(final);
  });
});
