import { spawnSync } from "node:child_process";

/**
 * Periodically samples the resident memory of one process and all of its
 * descendants (`ps` snapshot → parent closure), recording the peak of the
 * summed RSS. This is a measurement aid for load-profile evidence: samples are
 * recorded, never asserted against a budget.
 */

export interface ProcessMemorySummary {
  readonly samples: number;
  readonly probeFailures: number;
  /** Peak summed RSS (host + descendants) in KB across the sampled window. */
  readonly peakTotalRssKb: number | null;
  /** RSS of the tracked process alone at its peak, KB (null when unprobed). */
  readonly peakOwnRssKb: number | null;
}

interface PsRow {
  readonly pid: number;
  readonly ppid: number;
  readonly rssKb: number;
}

function readProcessTable(): PsRow[] | null {
  const result = spawnSync("ps", ["-eo", "pid=,ppid=,rss="], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 1_000,
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") return null;
  const rows: PsRow[] = [];
  for (const line of result.stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/u.exec(line);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), rssKb: Number(match[3]) });
  }
  return rows;
}

export class ProcessMemorySampler {
  private readonly ownRss = new Map<number, number>();
  private peakTotalKb: number | null = null;
  private probeFailures = 0;
  private sampleCount = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly rootPid: number) {}

  start(intervalMs = 1_000): void {
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

  summary(): ProcessMemorySummary {
    const ownValues = [...this.ownRss.values()];
    return {
      samples: this.sampleCount,
      probeFailures: this.probeFailures,
      peakTotalRssKb: this.peakTotalKb,
      peakOwnRssKb: ownValues.length > 0 ? Math.max(...ownValues) : null,
    };
  }

  private sample(): void {
    this.sampleCount += 1;
    const rows = readProcessTable();
    if (!rows) {
      this.probeFailures += 1;
      return;
    }
    const byPid = new Map(rows.map((row) => [row.pid, row]));
    const root = byPid.get(this.rootPid);
    if (!root) return; // Process not (yet or anymore) present.
    this.ownRss.set(this.rootPid, root.rssKb);
    const descendants = new Set<number>([this.rootPid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
          descendants.add(row.pid);
          changed = true;
        }
      }
    }
    let total = 0;
    for (const pid of descendants) total += byPid.get(pid)?.rssKb ?? 0;
    if (this.peakTotalKb === null || total > this.peakTotalKb) this.peakTotalKb = total;
  }
}
