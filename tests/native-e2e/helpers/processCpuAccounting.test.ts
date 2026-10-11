import { describe, expect, it } from "vitest";
import {
  ProcessCpuAccounting,
  parseProcessCpuTable,
  type ProcessCpuRow,
} from "./processCpuAccounting.ts";

const started = "Sun Sep 13 03:20:06 2026";
const row = (pid: number, ppid: number, cpuMs: number, start = started): ProcessCpuRow => ({
  pid,
  ppid,
  cpuMs,
  started: start,
  counterResolutionMs: 10,
});

describe("external process CPU evidence", () => {
  it.each([
    ["0:00.35", 350, 10],
    ["123:45.67", 7425670, 10],
    ["00:02:03", 123000, 1000],
    ["1-02:03:04", 93784000, 1000],
  ])(
    "parses cumulative CPU %s without treating it as lifetime average percent",
    (time, ms, resolution) => {
      expect(parseProcessCpuTable(`10 1 ${time} ${started}`)?.[0]).toMatchObject({
        cpuMs: ms,
        counterResolutionMs: resolution,
      });
    },
  );
  it.each([
    "",
    "bad output",
    `10 1 00:00:99 ${started}`,
    `10 1 0:00.35 ${started}\nunparsed parent`,
  ])("refuses incomplete or malformed tables: %s", (table) => {
    expect(parseProcessCpuTable(table)).toBeNull();
  });

  it("reports same-process CPU deltas separately and excludes unrelated processes", () => {
    const accounting = new ProcessCpuAccounting(10);
    accounting.observe(
      [row(10, 1, 5000), row(20, 10, 100), row(30, 20, 200), row(99, 1, 9000)],
      1000,
    );
    expect(accounting.summary().processes.every((p) => p.meanObservedCpuPercent === null)).toBe(
      true,
    );
    accounting.observe(
      [row(10, 1, 5250), row(20, 10, 600), row(30, 20, 2200), row(99, 1, 99000)],
      2000,
    );
    expect(
      accounting.summary().processes.map((p) => [p.pid, p.observedCpuMs, p.meanObservedCpuPercent]),
    ).toEqual([
      [10, 250, 25],
      [20, 500, 50],
      [30, 2000, 200],
    ]);
  });

  it("does not charge a reused child PID or backward counter to the previous process", () => {
    const accounting = new ProcessCpuAccounting(10);
    accounting.observe([row(10, 1, 500), row(20, 10, 400)], 1000);
    accounting.observe([row(10, 1, 100), row(20, 10, 9000, "Sun Sep 13 03:20:07 2026")], 2000);
    expect(accounting.summary()).toMatchObject({ counterRegressions: 1, lostProcessTails: 1 });
    expect(accounting.summary().processes.every((p) => p.observedCpuMs === 0)).toBe(true);
  });

  it("refuses a replacement root and exposes missing exit tails", () => {
    const accounting = new ProcessCpuAccounting(10);
    accounting.observe([row(10, 1, 100), row(20, 10, 100)], 1000);
    accounting.observe([], 2000);
    accounting.observe([row(10, 1, 999999, "Sun Sep 13 03:20:07 2026")], 3000);
    expect(accounting.summary()).toMatchObject({
      rootMissingSamples: 1,
      rootReplaced: true,
      lostProcessTails: 2,
    });
    expect(accounting.summary().processes).toHaveLength(2);
  });

  it("bounds retained identities and returns immutable metric snapshots", () => {
    const accounting = new ProcessCpuAccounting(10, 1);
    accounting.observe([row(10, 1, 100), row(20, 10, 100)], 1000);
    const first = accounting.summary();
    accounting.observe([row(10, 1, 200), row(20, 10, 200)], 2000);
    expect(first.processes[0]?.observedCpuMs).toBe(0);
    expect(accounting.summary()).toMatchObject({ untrackedProcessSamples: 2 });
    expect(accounting.summary().processes).toHaveLength(1);
  });
});
