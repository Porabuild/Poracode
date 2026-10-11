import { cpus, loadavg } from "node:os";
import { AsyncSamplingLoop, readProcessOutput, type SamplingTiming } from "./asyncSampling.ts";

/**
 * Periodically samples host CPU/memory contention while an experiment runs, so
 * latency numbers can be interpreted against real machine load. A sample is
 * `contaminated` when foreign build/test tooling is present, the process probe
 * fails, or 1-minute load exceeds CPU count. Tool presence is a conservative
 * contention indicator, not proof of CPU utilization.
 */

const BUILD_ACTIVITY_PATTERN =
  /(?:^|[/\\\s(])(?:xcodebuild|swift-?frontend|SwiftCompile|swiftc|clang(?:\+\+)?|llvm-[\w-]+|gradlew?|javac|kotlinc|cargo|rustc|vitest|jest|playwright|esbuild|tsc)(?=$|[\s/\\).])/i;

function countForeignTools(output: string): number | null {
  const rows = output.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3]! }] : [];
  });
  if (!rows.some((row) => row.pid === process.pid)) return null;
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const owned = new Set([process.pid]);
  let parent = byPid.get(process.pid)?.ppid;
  while (parent && !owned.has(parent)) {
    owned.add(parent);
    parent = byPid.get(parent)?.ppid;
  }
  // Only this worker's descendants belong to its workload; sibling workers
  // under the same test runner still count as concurrent work.
  const descendants = new Set([process.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
        descendants.add(row.pid);
        owned.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => !owned.has(row.pid) && BUILD_ACTIVITY_PATTERN.test(row.command))
    .length;
}

export interface HostLoadSample {
  readonly atMs: number;
  /** Completion time of the asynchronous process probe started at atMs. */
  readonly probeCompletedAtMs: number;
  readonly load1: number;
  readonly load5: number;
  /** Count of foreign build/test processes; null when the probe failed. */
  readonly foreignBuildProcesses: number | null;
  readonly contaminated: boolean;
}

export interface HostLoadWindow {
  readonly samples: number;
  readonly contaminatedSamples: number;
  readonly peakLoad1: number;
  readonly maxForeignBuildProcesses: number | null;
}

export interface HostLoadSummary extends HostLoadWindow {
  readonly samplerVersion: 2;
  readonly sampling: SamplingTiming;
  readonly cpuCount: number;
  readonly probeFailures: number;
}

export class HostLoadSampler {
  private readonly samples: HostLoadSample[] = [];
  private readonly loop = new AsyncSamplingLoop(() => this.sample());
  private probeFailures = 0;
  private readonly cpuCount = cpus().length;

  start(intervalMs = 2_000): void {
    this.loop.start(intervalMs);
  }

  stop(): Promise<void> {
    return this.loop.stop();
  }

  allSamples(): readonly HostLoadSample[] {
    return this.samples;
  }

  /** Fix the window before joining its pending probe, so evidence neither loses
   * an in-flight failure nor expands the workload interval during the wait. */
  async window(fromMs: number, toMs: number): Promise<HostLoadWindow> {
    await this.loop.joinPending();
    const inWindow = this.samples.filter((sample) => sample.atMs >= fromMs && sample.atMs <= toMs);
    const loads = inWindow.map((sample) => sample.load1);
    const procs = inWindow
      .map((sample) => sample.foreignBuildProcesses)
      .filter((value): value is number => value !== null);
    return {
      samples: inWindow.length,
      contaminatedSamples: inWindow.filter((sample) => sample.contaminated).length,
      peakLoad1: loads.length > 0 ? Math.round(Math.max(...loads) * 100) / 100 : 0,
      maxForeignBuildProcesses: procs.length > 0 ? Math.max(...procs) : null,
    };
  }

  async summary(): Promise<HostLoadSummary> {
    return {
      ...(await this.window(0, Date.now())),
      samplerVersion: 2,
      sampling: this.loop.timing(),
      cpuCount: this.cpuCount,
      probeFailures: this.probeFailures + this.loop.timing().unexpectedFailures,
    };
  }

  private async sample(): Promise<void> {
    const atMs = Date.now();
    const loads = loadavg();
    const load1 = loads[0] ?? 0;
    const load5 = loads[1] ?? 0;
    const foreign = await this.countForeignBuildProcesses();
    const sample: HostLoadSample = {
      atMs,
      probeCompletedAtMs: Date.now(),
      load1: Math.round(load1 * 100) / 100,
      load5: Math.round(load5 * 100) / 100,
      foreignBuildProcesses: foreign,
      contaminated: foreign === null || foreign > 0 || load1 > this.cpuCount,
    };
    this.samples.push(sample);
  }

  private async countForeignBuildProcesses(): Promise<number | null> {
    const output = await readProcessOutput("pid=,ppid=,command=");
    if (output === null) {
      this.probeFailures += 1;
      return null;
    }
    const foreign = countForeignTools(output);
    if (foreign === null) this.probeFailures += 1;
    return foreign;
  }
}
