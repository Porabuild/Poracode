import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { ProjectTreeService } from "./projectTree";

/**
 * Regression guard for the large-directory listing cost: sorting with a
 * per-comparison `localeCompare` took ~240 ms for 5,000 entries (shared
 * collator: ~15 ms). The budget sits between the two with headroom for
 * slower CI runners.
 */
const FILE_COUNT = 5_000;
const MEDIAN_BUDGET_MS = 120;

describe("ProjectTreeService listing performance", () => {
  let tempDir: string;
  let location: ProjectLocation;
  const service = new ProjectTreeService();

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "poracode-project-tree-perf-"));
    location =
      process.platform === "win32"
        ? { kind: "windows", path: tempDir }
        : { kind: "posix", path: tempDir };
    for (let i = 0; i < FILE_COUNT; i += 1) {
      writeFileSync(join(tempDir, `file-${i}.txt`), "");
    }
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("lists a flat 5,000-file directory within budget", async () => {
    // Warm up filesystem caches and JIT before timing.
    await service.listProjectTree({ projectLocation: location, directoryPath: "" });

    const samples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const start = performance.now();
      const result = await service.listProjectTree({
        projectLocation: location,
        directoryPath: "",
      });
      samples.push(performance.now() - start);
      expect(result.entries).toHaveLength(FILE_COUNT);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;
    expect(median).toBeLessThan(MEDIAN_BUDGET_MS);
  });
});
