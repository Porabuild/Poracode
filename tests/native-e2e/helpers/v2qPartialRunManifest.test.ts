import { describe, expect, it } from "vitest";
import {
  buildContaminationRecord,
  buildPartialRunManifest,
  type PartialRunManifestInput,
} from "./v2qPartialRunManifest.ts";
import type { HostLoadSummary } from "./hostLoadSampler.ts";

function input(overrides: Partial<PartialRunManifestInput> = {}): PartialRunManifestInput {
  return {
    spec: {
      id: "v2q-unit",
      label: "unit fixture",
    } as PartialRunManifestInput["spec"],
    arm: null,
    failure: "budget verdicts: {...}",
    timeline: { settled: 1_000 },
    clientAccounting: { "v2q-c01": { offscreenBulkBytes: 0 } },
    contamination: { samples: 12, contaminatedSamples: 0 },
    memory: { rssBytesMax: 100 },
    processCpu: { oneCorePercentMax: 3 },
    nodePerf: [{ role: "main", samples: 4 }],
    ...overrides,
  };
}

describe("v2q partial run manifest", () => {
  it("records the failure plus whatever summaries exist", () => {
    const manifest = buildPartialRunManifest(input());
    expect(manifest.partial).toBe(true);
    expect(manifest.failure).toBe("budget verdicts: {...}");
    expect(manifest.reason).toContain("did not complete its final run.json write");
    expect(manifest.cell.id).toBe("v2q-unit");
    expect(manifest.environment.contamination).toEqual({ samples: 12, contaminatedSamples: 0 });
    expect(manifest.results.timeline).toEqual({ settled: 1_000 });
    expect(manifest.results.clientAccounting).toEqual({ "v2q-c01": { offscreenBulkBytes: 0 } });
    expect(manifest.results.memory).toEqual({ rssBytesMax: 100 });
    expect(manifest.results.processCpu).toEqual({ oneCorePercentMax: 3 });
    expect(manifest.results.nodePerf).toEqual([{ role: "main", samples: 4 }]);
  });

  it("stays null-safe when every sampler is missing and nothing failed", () => {
    const manifest = buildPartialRunManifest(
      input({
        arm: null,
        failure: null,
        contamination: null,
        memory: null,
        processCpu: null,
        nodePerf: [],
      }),
    );
    expect(manifest.failure).toBeNull();
    expect(manifest.arm).toBeNull();
    expect(manifest.environment.contamination).toBeNull();
    expect(manifest.results.memory).toBeNull();
    expect(manifest.results.processCpu).toBeNull();
    expect(manifest.results.nodePerf).toEqual([]);
  });

  it("never carries budget verdicts or pass/fail semantics", () => {
    const serialized = JSON.stringify(buildPartialRunManifest(input()));
    expect(serialized).not.toContain("budgetVerdict");
    expect(serialized).not.toContain("inputToPaint");
    expect(serialized).not.toContain('"passed"');
  });

  it("marks a contaminated window as ineligible for a capacity claim", () => {
    const clean = buildContaminationRecord({
      samples: 10,
      contaminatedSamples: 0,
      peakLoad1: 2.5,
      maxForeignBuildProcesses: 0,
      samplerVersion: 2,
      sampling: {} as HostLoadSummary["sampling"],
      cpuCount: 4,
      probeFailures: 0,
    });
    expect(clean).toMatchObject({ capacityClaimAllowed: true, contaminatedSamples: 0 });

    const contaminated = buildContaminationRecord({
      samples: 10,
      contaminatedSamples: 3,
      peakLoad1: 9,
      maxForeignBuildProcesses: 2,
      samplerVersion: 2,
      sampling: {} as HostLoadSummary["sampling"],
      cpuCount: 4,
      probeFailures: 1,
    });
    expect(contaminated).toMatchObject({ capacityClaimAllowed: false });
    expect(String((contaminated as Record<string, unknown>).policy)).toContain(
      "no capacity claim is made from a contaminated window",
    );
  });

  it("returns null contamination when the host-load sampler never started", () => {
    expect(buildContaminationRecord(null)).toBeNull();
  });
});
