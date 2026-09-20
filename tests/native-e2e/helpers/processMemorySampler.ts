import { AsyncSamplingLoop, readProcessOutput, type SamplingTiming } from "./asyncSampling.ts";

/**
 * Periodically samples the resident memory of one process and all of its
 * descendants (`ps` snapshot → parent closure), recording the peak of the
 * summed RSS. This is a measurement aid for load-profile evidence: samples are
 * recorded, never asserted against a budget.
 */

export interface ProcessMemorySummary {
  /** Version 3 uses asynchronous, joined probes; version 2 corrected own RSS peaks. */
  readonly samplerVersion: 3;
  readonly sampling: SamplingTiming;
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

async function readProcessTable(): Promise<PsRow[] | null> {
  const output = await readProcessOutput("pid=,ppid=,rss=");
  if (output === null) return null;
  const rows: PsRow[] = [];
  for (const line of output.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/u.exec(line);
    if (!match) continue;
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), rssKb: Number(match[3]) });
  }
  return rows;
}

export class ProcessMemorySampler {
  private peakOwnKb: number | null = null;
  private peakTotalKb: number | null = null;
  private probeFailures = 0;
  private sampleCount = 0;
  private readonly loop = new AsyncSamplingLoop(() => this.sample());

  constructor(private readonly rootPid: number) {}

  start(intervalMs = 1_000): void {
    this.loop.start(intervalMs);
  }

  stop(): Promise<void> {
    return this.loop.stop();
  }

  summary(): ProcessMemorySummary {
    return {
      samplerVersion: 3,
      sampling: this.loop.timing(),
      samples: this.sampleCount,
      probeFailures: this.probeFailures + this.loop.timing().unexpectedFailures,
      peakTotalRssKb: this.peakTotalKb,
      peakOwnRssKb: this.peakOwnKb,
    };
  }

  private async sample(): Promise<void> {
    this.sampleCount += 1;
    const rows = await readProcessTable();
    if (!rows) {
      this.probeFailures += 1;
      return;
    }
    const byPid = new Map(rows.map((row) => [row.pid, row]));
    const root = byPid.get(this.rootPid);
    if (!root) return; // Process not (yet or anymore) present.
    this.peakOwnKb = Math.max(this.peakOwnKb ?? 0, root.rssKb);
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
