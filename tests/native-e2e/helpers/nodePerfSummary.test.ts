import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PerformanceEvidenceWriter } from "../../../src/shared/diagnostics/performanceEvidenceWriter";
import { summarizeNodePerfDirectory } from "./nodePerfSummary";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixtureDirectory() {
  const root = mkdtempSync(join(tmpdir(), "node-perf-summary-"));
  roots.push(root);
  return root;
}
function serialize(records: unknown[]) {
  return records.map((r) => `${JSON.stringify(r)}\n`).join("");
}
function summarizeRaw(contents: string) {
  const root = fixtureDirectory();
  writeFileSync(join(root, "backend.ndjson"), contents);
  return summarizeNodePerfDirectory(root)[0]!;
}
function summarize(records: unknown[]) {
  return summarizeRaw(serialize(records));
}
const start = { kind: "start", formatVersion: 2, role: "backend" };
function endRecord(records: unknown[]) {
  // The writer has no version on end records; these counters exclude the end itself.
  return {
    kind: "end",
    reason: "shutdown",
    complete: true,
    beforeFinal: {
      acceptedRecords: records.length,
      writtenRecords: records.length,
      writtenBytes: Buffer.byteLength(serialize(records)),
      droppedRecords: 0,
      budgetExceeded: false,
      error: null,
    },
  };
}
function observed(bytes: number, age: number | null, shed: number) {
  return {
    name: "supervisor-to-host",
    status: "observed",
    sample: {
      formatVersion: 1,
      waitingEstimatedBytes: bytes,
      oldestQueuedMessageAgeMs: age,
      shedMessages: shed,
    },
  };
}
function sample(queues: unknown[]) {
  return { kind: "sample", formatVersion: 2, ipcQueues: { samplingWorkMs: 1, queues } };
}
function measuredSample(value: unknown) {
  return {
    ...sample([]),
    eventLoopDelay: { p99Ms: value, maxMs: value },
    cpu: { oneCorePercent: value },
    memory: { rssBytes: value },
  };
}
const noMeasurements = {
  eventLoopDelayP99MaxMs: null,
  eventLoopDelayMaxMs: null,
  cpuOneCorePercentMax: null,
  rssBytesMax: null,
  rssBytesLast: null,
};

describe("node performance summary", () => {
  it.each([
    { label: "empty", records: [] },
    { label: "header-only", records: [start] },
    { label: "missing process metrics", records: [start, sample([])] },
  ])("keeps $label evidence unknown and incomplete", ({ records }) => {
    expect(summarize(records)).toMatchObject({
      ...noMeasurements,
      summaryVersion: 2,
      invalidRecords: 0,
      unsupportedFormatSamples: 0,
      complete: false,
      end: null,
      processCoverage: {
        status: "none",
        eventLoopDelayP99Samples: 0,
        eventLoopDelayMaxSamples: 0,
        cpuSamples: 0,
        rssSamples: 0,
      },
    });
  });

  it("preserves valid zero measurements and real writer shutdown evidence", async () => {
    const root = fixtureDirectory();
    const writer = new PerformanceEvidenceWriter(join(root, "backend.ndjson"), 65_536);
    writer.append(start);
    writer.append(measuredSample(0));
    await writer.finish("shutdown");
    expect(summarizeNodePerfDirectory(root)[0]).toMatchObject({
      summaryVersion: 2,
      role: "backend",
      startFormatVersion: 2,
      samples: 1,
      invalidRecords: 0,
      unsupportedFormatSamples: 0,
      complete: true,
      end: {
        reason: "shutdown",
        complete: true,
        beforeFinal: { acceptedRecords: 2, writtenRecords: 2, droppedRecords: 0, error: null },
      },
      processCoverage: {
        status: "complete",
        eventLoopDelayP99Samples: 1,
        eventLoopDelayMaxSamples: 1,
        cpuSamples: 1,
        rssSamples: 1,
      },
      eventLoopDelayP99MaxMs: 0,
      eventLoopDelayMaxMs: 0,
      cpuOneCorePercentMax: 0,
      rssBytesMax: 0,
      rssBytesLast: 0,
    });
  });

  it("retains partial measurements without treating a missing end as a shutdown", () => {
    const r = summarize([
      start,
      measuredSample(12),
      {
        ...measuredSample(3),
        eventLoopDelay: { p99Ms: 5, maxMs: 20 },
        cpu: { oneCorePercent: 18 },
      },
      sample([]),
    ]);
    expect(r).toMatchObject({
      complete: false,
      samples: 3,
      eventLoopDelayP99MaxMs: 12,
      eventLoopDelayMaxMs: 20,
      cpuOneCorePercentMax: 18,
      rssBytesMax: 12,
      rssBytesLast: 3,
      processCoverage: {
        status: "partial",
        eventLoopDelayP99Samples: 2,
        eventLoopDelayMaxSamples: 2,
        cpuSamples: 2,
        rssSamples: 2,
      },
    });
  });

  it.each([null, -1, "0", false, {}, []])(
    "rejects invalid metric %j without inventing zero",
    (value) => {
      const records = [start, measuredSample(value)];
      expect(summarize([...records, endRecord(records)])).toMatchObject({
        ...noMeasurements,
        complete: true,
        samples: 1,
        invalidRecords: 0,
        processCoverage: { status: "none" },
      });
    },
  );

  it("rejects non-finite JSON numbers and malformed metric containers", () => {
    const contents = `${serialize([
      start,
      { ...sample([]), eventLoopDelay: [], cpu: null, memory: "missing" },
    ])}{"kind":"sample","formatVersion":2,"eventLoopDelay":{"p99Ms":1e400,"maxMs":-1e400},"cpu":{"oneCorePercent":1e400},"memory":{"rssBytes":1e400}}\n`;
    expect(summarizeRaw(contents)).toMatchObject({
      ...noMeasurements,
      samples: 2,
      invalidRecords: 0,
      complete: false,
      processCoverage: { status: "none" },
    });
  });

  it("counts each process measurement independently and ignores invalid later RSS", () => {
    expect(
      summarize([
        start,
        { ...sample([]), eventLoopDelay: { p99Ms: null, maxMs: 4 } },
        { ...sample([]), cpu: { oneCorePercent: 0 }, memory: { rssBytes: 9 } },
        measuredSample(-1),
      ]),
    ).toMatchObject({
      eventLoopDelayP99MaxMs: null,
      eventLoopDelayMaxMs: 4,
      cpuOneCorePercentMax: 0,
      rssBytesMax: 9,
      rssBytesLast: 9,
      processCoverage: {
        status: "partial",
        eventLoopDelayP99Samples: 0,
        eventLoopDelayMaxSamples: 1,
        cpuSamples: 1,
        rssSamples: 1,
      },
    });
  });

  it("keeps an observed last RSS of zero after a larger value", () => {
    expect(
      summarize([start, measuredSample(10), measuredSample(0), measuredSample(-1)]),
    ).toMatchObject({
      rssBytesMax: 10,
      rssBytesLast: 0,
      processCoverage: { rssSamples: 2, status: "partial" },
    });
  });

  it("separates writer completeness from missing process coverage", () => {
    const records = [start, sample([])];
    expect(summarize([...records, endRecord(records)])).toMatchObject({
      ...noMeasurements,
      complete: true,
      processCoverage: { status: "none" },
    });
  });

  it("counts malformed JSON, non-object records, unknown kinds and truncated tails", () => {
    const contents = `${serialize([start, measuredSample(7)])}not-json\nnull\n[]\n42\n"sample"\ntrue\n{}\n{"kind":"future"}\n{"kind":"end"`;
    expect(summarizeRaw(contents)).toMatchObject({
      samples: 1,
      invalidRecords: 9,
      complete: false,
      end: null,
      rssBytesLast: 7,
    });
  });

  it("does not qualify corrupted evidence even with a clean end marker", () => {
    const records = [start, null, measuredSample(1)];
    expect(summarize([...records, endRecord(records)])).toMatchObject({
      complete: false,
      invalidRecords: 1,
      end: { complete: true },
    });
  });

  it("does not qualify an end record whose final newline was truncated", () => {
    const records = [start, measuredSample(1)];
    expect(summarizeRaw(serialize([...records, endRecord(records)]).slice(0, -1))).toMatchObject({
      complete: false,
      invalidRecords: 0,
      samples: 1,
      end: { complete: true },
    });
  });

  it.each([undefined, 0, 99, "2"])("rejects unsupported start format %j", (formatVersion) => {
    const records = [{ ...start, formatVersion }, measuredSample(5)];
    expect(summarize([...records, endRecord(records)])).toMatchObject({
      startFormatVersion: null,
      role: "unknown",
      complete: false,
      invalidRecords: 1,
      samples: 1,
      rssBytesLast: 5,
    });
  });

  it("counts unsupported samples separately and does not read their metrics", () => {
    const records = [
      start,
      { ...measuredSample(999), formatVersion: 99 },
      { kind: "sample", memory: { rssBytes: 999 } },
      measuredSample(0),
    ];
    expect(summarize([...records, endRecord(records)])).toMatchObject({
      complete: false,
      samples: 1,
      invalidRecords: 0,
      unsupportedFormatSamples: 2,
      rssBytesMax: 0,
    });
  });

  it("requires a start and rejects duplicate, out-of-order and mixed-format records", () => {
    const records = [measuredSample(1)];
    expect(summarize([...records, endRecord(records)])).toMatchObject({
      complete: false,
      startFormatVersion: null,
      invalidRecords: 0,
    });
    for (const invalid of [
      [start, start, measuredSample(1)],
      [measuredSample(1), start],
      [start, { ...measuredSample(1), formatVersion: 1 }],
      [start, endRecord([start]), measuredSample(1)],
      [start, endRecord([start]), endRecord([start])],
    ]) {
      expect(summarize(invalid)).toMatchObject({ complete: false, invalidRecords: 1 });
    }
  });

  it.each([
    { reason: "budget", complete: false },
    { reason: "error", complete: false },
    { reason: "shutdown", complete: false },
    { reason: "error", complete: true },
  ])("does not qualify end $reason / complete=$complete", (overrides) => {
    const records = [start, measuredSample(1)];
    expect(summarize([...records, { ...endRecord(records), ...overrides }])).toMatchObject({
      complete: false,
      invalidRecords: 0,
      end: overrides,
    });
  });

  it.each([
    { droppedRecords: 1 },
    { budgetExceeded: true },
    { error: "open" },
    { error: "write" },
    { error: "close" },
    { acceptedRecords: 3 },
    { writtenRecords: 1 },
    { writtenBytes: 0 },
  ])("does not qualify writer loss or inconsistent counters: %j", (stats) => {
    const records = [start, measuredSample(1)];
    const end = endRecord(records);
    expect(
      summarize([...records, { ...end, beforeFinal: { ...end.beforeFinal, ...stats } }]),
    ).toMatchObject({ complete: false, invalidRecords: 0, end: { beforeFinal: stats } });
  });

  it("detects missing whole records from the pre-final writer counts and bytes", () => {
    const records = [start, measuredSample(1), measuredSample(2)];
    expect(summarize([start, records[2], endRecord(records)])).toMatchObject({
      complete: false,
      invalidRecords: 0,
      samples: 1,
      end: { complete: true },
    });
  });

  it.each([
    { beforeFinal: null },
    { beforeFinal: {} },
    { complete: "true" },
    { reason: "finished" },
    { beforeFinal: { ...endRecord([]).beforeFinal, droppedRecords: -1 } },
    { beforeFinal: { ...endRecord([]).beforeFinal, writtenRecords: 0.5 } },
    { beforeFinal: { ...endRecord([]).beforeFinal, budgetExceeded: "false" } },
    { beforeFinal: { ...endRecord([]).beforeFinal, error: "unknown" } },
  ])("counts malformed writer end evidence: %j", (overrides) => {
    const records = [start, measuredSample(1)];
    expect(summarize([...records, { ...endRecord(records), ...overrides }])).toMatchObject({
      complete: false,
      invalidRecords: 1,
      end: null,
    });
  });

  it("reads nonzero nested queue samples without inventing wrapper queue names", () => {
    const r = summarize([
      { kind: "start", formatVersion: 2, role: "backend" },
      sample([observed(4096, 37, 2)]),
      sample([observed(2048, 51, 1)]),
    ]);
    expect(r).toMatchObject({ summaryVersion: 2, role: "backend", samples: 2 });
    expect(r.queueMaxima).toEqual({
      "supervisor-to-host": {
        observedSamples: 2,
        unavailableSamples: 0,
        errorSamples: 0,
        unknownAgeSamples: 0,
        waitingEstimatedBytesMax: 4096,
        oldestQueuedMessageAgeMsMax: 51,
        shedMessagesMax: 2,
      },
    });
  });
  it("keeps unavailable, failed, unsupported and unknown-age observations distinct from zero", () => {
    const r = summarize([
      sample([
        { name: "main-to-backend", status: "unavailable" },
        { name: "backend-to-main", status: "error" },
      ]),
      sample([observed(0, null, 0)]),
      sample([{ ...observed(9000, 100, 99), sample: { formatVersion: 99 } }]),
      { kind: "sample", formatVersion: 99, ipcQueues: { queues: [observed(9999, 200, 100)] } },
    ]);
    expect(r.unsupportedFormatSamples).toBe(1);
    expect(r.queueMaxima["main-to-backend"]).toMatchObject({
      observedSamples: 0,
      unavailableSamples: 1,
      waitingEstimatedBytesMax: null,
    });
    expect(r.queueMaxima["backend-to-main"]).toMatchObject({
      observedSamples: 0,
      errorSamples: 1,
      waitingEstimatedBytesMax: null,
    });
    expect(r.queueMaxima["supervisor-to-host"]).toMatchObject({
      observedSamples: 1,
      errorSamples: 1,
      unknownAgeSamples: 1,
      waitingEstimatedBytesMax: 0,
      oldestQueuedMessageAgeMsMax: null,
    });
  });
  it("preserves old format-1 process measurements without claiming queue coverage", () => {
    const records = [
      { ...start, formatVersion: 1 },
      { kind: "sample", formatVersion: 1, cpu: { oneCorePercent: 7 }, memory: { rssBytes: 1234 } },
    ];
    const r = summarize([...records, endRecord(records)]);
    expect(r).toMatchObject({
      summaryVersion: 2,
      startFormatVersion: 1,
      complete: true,
      samples: 1,
      invalidRecords: 0,
      unsupportedFormatSamples: 0,
      processCoverage: { status: "partial", cpuSamples: 1, rssSamples: 1 },
      eventLoopDelayP99MaxMs: null,
      eventLoopDelayMaxMs: null,
      cpuOneCorePercentMax: 7,
      rssBytesMax: 1234,
      rssBytesLast: 1234,
      queueMaxima: {},
    });
  });
});
