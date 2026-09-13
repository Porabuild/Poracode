import { AsyncSamplingLoop, readProcessOutput } from "./asyncSampling.ts";
import { ProcessCpuAccounting, parseProcessCpuTable } from "./processCpuAccounting.ts";

/** External POSIX observation complements in-process CPU/event-loop traces.
 * No CPU budget is asserted from this partial process-tree observation. */
export class ProcessCpuSampler {
  private readonly accounting: ProcessCpuAccounting;
  private readonly loop = new AsyncSamplingLoop(() => this.sample());
  private samples = 0;
  private probeFailures = 0;

  constructor(rootPid: number) {
    this.accounting = new ProcessCpuAccounting(rootPid);
  }

  start(intervalMs = 1000): void {
    this.loop.start(intervalMs);
  }
  stop(): Promise<void> {
    return this.loop.stop();
  }

  summary() {
    return {
      samplerVersion: 1,
      source: "ps cumulative process CPU time",
      timingReference:
        "monotonic probe completion; snapshot timing varies within the recorded probe duration",
      supportedPlatform: process.platform === "darwin" || process.platform === "linux",
      samples: this.samples,
      probeFailures: this.probeFailures + this.loop.timing().unexpectedFailures,
      sampling: this.loop.timing(),
      ...this.accounting.summary(),
    };
  }

  private async sample(): Promise<void> {
    this.samples++;
    if (process.platform !== "darwin" && process.platform !== "linux") {
      this.probeFailures++;
      return;
    }
    const output = await readProcessOutput("pid=,ppid=,time=,lstart=");
    const rows = output === null ? null : parseProcessCpuTable(output);
    if (!rows) {
      this.probeFailures++;
      return;
    }
    this.accounting.observe(rows, performance.now());
  }
}
