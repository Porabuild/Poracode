import { spawnSync } from "node:child_process";
import { cpus, loadavg } from "node:os";

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
  readonly cpuCount: number;
  readonly probeFailures: number;
}

export class HostLoadSampler {
  private readonly samples: HostLoadSample[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private probeFailures = 0;
  private readonly cpuCount = cpus().length;

  start(intervalMs = 2_000): void {
    if (this.timer) return;
    this.sample();
    this.timer = setInterval(() => this.sample(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  allSamples(): readonly HostLoadSample[] {
    return this.samples;
  }

  /** Aggregate over samples with `atMs` in `[fromMs, toMs]`. */
  window(fromMs: number, toMs: number): HostLoadWindow {
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

  summary(): HostLoadSummary {
    return {
      ...this.window(0, Number.MAX_SAFE_INTEGER),
      cpuCount: this.cpuCount,
      probeFailures: this.probeFailures,
    };
  }

  private sample(): void {
    const loads = loadavg();
    const load1 = loads[0] ?? 0;
    const load5 = loads[1] ?? 0;
    const foreign = this.countForeignBuildProcesses();
    const sample: HostLoadSample = {
      atMs: Date.now(),
      load1: Math.round(load1 * 100) / 100,
      load5: Math.round(load5 * 100) / 100,
      foreignBuildProcesses: foreign,
      contaminated: foreign === null || foreign > 0 || load1 > this.cpuCount,
    };
    this.samples.push(sample);
  }

  private countForeignBuildProcesses(): number | null {
    const result = spawnSync("ps", ["-Ao", "pid=,ppid=,command="], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 1_000,
    });
    if (result.error || result.status !== 0 || typeof result.stdout !== "string") {
      this.probeFailures += 1;
      return null;
    }
    const foreign = countForeignTools(result.stdout);
    if (foreign === null) this.probeFailures += 1;
    return foreign;
  }
}
