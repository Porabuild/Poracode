export interface ProcessCpuRow {
  readonly pid: number;
  readonly ppid: number;
  readonly started: string;
  readonly cpuMs: number;
  readonly counterResolutionMs: number;
}

/** BSD/macOS mm:ss.hh and Linux [dd-]hh:mm:ss cumulative CPU counters. */
function parseCpuTime(value: string): { cpuMs: number; counterResolutionMs: number } | null {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  if (seconds >= 60 || (match[2] !== undefined && minutes >= 60)) return null;
  const fraction = match[5];
  const cpuMs =
    ((days * 24 + hours) * 3600 + minutes * 60 + seconds) * 1000 +
    (fraction ? Number(`0.${fraction}`) * 1000 : 0);
  if (!Number.isSafeInteger(cpuMs)) return null;
  return { cpuMs, counterResolutionMs: fraction ? 1000 / 10 ** fraction.length : 1000 };
}

/** Never retains argv or command text. A malformed row invalidates the whole
 * probe: silently omitting a parent could change the observed process tree. */
export function parseProcessCpuTable(output: string): ProcessCpuRow[] | null {
  const rows: ProcessCpuRow[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const match =
      /^\s*(\d+)\s+(\d+)\s+(\S+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s*$/u.exec(
        line,
      );
    if (!match) return null;
    const time = parseCpuTime(match[3]!);
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    if (!time || !Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(ppid)) return null;
    rows.push({ pid, ppid, started: match[4]!.replace(/\s+/gu, " "), ...time });
  }
  return rows.length ? rows : null;
}

interface ProcessCpuMetric {
  readonly pid: number;
  readonly started: string;
  readonly isRoot: boolean;
  samples: number;
  matchedIntervals: number;
  observedCpuMs: number;
  matchedWallMs: number;
  counterResolutionMs: number;
  peakIntervalCpuPercent: number | null;
}

/** CPU time is observed only between samples of the same PID/start identity.
 * It excludes unobserved short-lived processes and the final tail of exits. */
export class ProcessCpuAccounting {
  private rootStarted: string | undefined;
  private rootReplaced = false;
  private rootMissingSamples = 0;
  private counterRegressions = 0;
  private untrackedProcessSamples = 0;
  private lostProcessTails = 0;
  private firstAtMs: number | undefined;
  private lastAtMs: number | undefined;
  private previous = new Map<number, ProcessCpuRow>();
  private readonly metrics = new Map<string, ProcessCpuMetric>();

  constructor(
    private readonly rootPid: number,
    private readonly maxProcesses = 4096,
  ) {}

  observe(rows: readonly ProcessCpuRow[], atMs: number): void {
    if (this.rootReplaced) return;
    const root = rows.find((row) => row.pid === this.rootPid);
    if (!root) {
      this.rootMissingSamples++;
      this.lostProcessTails += this.previous.size;
      this.previous.clear();
      return;
    }
    if (this.rootStarted !== undefined && root.started !== this.rootStarted) {
      this.rootReplaced = true;
      this.lostProcessTails += this.previous.size;
      this.previous.clear();
      return;
    }
    this.rootStarted = root.started;
    this.firstAtMs ??= atMs;
    const elapsed = this.lastAtMs === undefined ? 0 : atMs - this.lastAtMs;
    const children = new Map<number, ProcessCpuRow[]>();
    for (const row of rows) {
      const list = children.get(row.ppid) ?? [];
      list.push(row);
      children.set(row.ppid, list);
    }
    const current = new Map<number, ProcessCpuRow>([[root.pid, root]]);
    for (const row of current.values()) {
      for (const child of children.get(row.pid) ?? []) current.set(child.pid, child);
    }
    for (const old of this.previous.values()) {
      if (current.get(old.pid)?.started !== old.started) this.lostProcessTails++;
    }
    for (const row of current.values()) {
      const key = `${row.pid}:${row.started}`;
      let metric = this.metrics.get(key);
      if (!metric) {
        if (this.metrics.size >= this.maxProcesses) {
          this.untrackedProcessSamples++;
          continue;
        }
        metric = {
          pid: row.pid,
          started: row.started,
          isRoot: row.pid === this.rootPid,
          samples: 0,
          matchedIntervals: 0,
          observedCpuMs: 0,
          matchedWallMs: 0,
          counterResolutionMs: row.counterResolutionMs,
          peakIntervalCpuPercent: null,
        };
        this.metrics.set(key, metric);
      }
      metric.samples++;
      metric.counterResolutionMs = Math.max(metric.counterResolutionMs, row.counterResolutionMs);
      const previous = this.previous.get(row.pid);
      if (!previous || previous.started !== row.started || elapsed <= 0) continue;
      const delta = row.cpuMs - previous.cpuMs;
      if (delta < 0) {
        this.counterRegressions++;
        continue;
      }
      metric.matchedIntervals++;
      metric.observedCpuMs += delta;
      metric.matchedWallMs += elapsed;
      metric.peakIntervalCpuPercent = Math.max(
        metric.peakIntervalCpuPercent ?? 0,
        (delta / elapsed) * 100,
      );
    }
    this.previous = current;
    this.lastAtMs = atMs;
  }

  summary() {
    return {
      identity:
        "PID and ps lstart (one-second resolution); same-second PID reuse is not distinguishable",
      accounting:
        "Matched cumulative CPU deltas only; 100 percent is one CPU core. Short-lived processes and exit tails can be unobserved; interval peaks reflect ps counter quantization.",
      rootReplaced: this.rootReplaced,
      rootMissingSamples: this.rootMissingSamples,
      counterRegressions: this.counterRegressions,
      untrackedProcessSamples: this.untrackedProcessSamples,
      lostProcessTails: this.lostProcessTails,
      observedWindowMs:
        this.lastAtMs === undefined || this.firstAtMs === undefined
          ? null
          : this.lastAtMs - this.firstAtMs,
      processes: [...this.metrics.values()].map((metric) => ({
        ...metric,
        meanObservedCpuPercent:
          metric.matchedWallMs > 0 ? (metric.observedCpuMs / metric.matchedWallMs) * 100 : null,
      })),
    };
  }
}
