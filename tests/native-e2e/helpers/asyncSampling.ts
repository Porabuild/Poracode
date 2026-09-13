import { execFile } from "node:child_process";

/** No shell and no synchronous process work on the measured client's event loop. */
export function readProcessOutput(fields: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "ps",
      ["-Ao", fields],
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 1_000,
        killSignal: "SIGKILL",
        env: { ...process.env, LC_ALL: "C" },
      },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

export interface SamplingTiming {
  readonly mode: "asynchronous-fixed-delay";
  readonly completedProbes: number;
  readonly unexpectedFailures: number;
  readonly totalProbeDurationMs: number;
  readonly maxProbeDurationMs: number;
}

/** Wait between completed probes; slow probes never accumulate or overlap.
 * stop() joins the pending probe before callers serialize final evidence. */
export class AsyncSamplingLoop {
  private active = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | undefined;
  private completedProbes = 0;
  private unexpectedFailures = 0;
  private totalProbeDurationMs = 0;
  private maxProbeDurationMs = 0;

  constructor(private readonly sample: () => Promise<void>) {}

  start(intervalMs: number): void {
    if (!Number.isFinite(intervalMs) || intervalMs < 1) {
      throw new Error("Sampling interval must be a positive number of milliseconds");
    }
    if (this.active) return;
    if (this.pending) throw new Error("Await sampler.stop() before restarting a probe");
    this.active = true;
    this.run(intervalMs);
  }

  async stop(): Promise<void> {
    this.active = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    await this.pending;
  }

  /** Join only the probe already in progress; periodic sampling keeps running. */
  async joinPending(): Promise<void> {
    await this.pending;
  }

  timing(): SamplingTiming {
    return {
      mode: "asynchronous-fixed-delay",
      completedProbes: this.completedProbes,
      unexpectedFailures: this.unexpectedFailures,
      totalProbeDurationMs: this.totalProbeDurationMs,
      maxProbeDurationMs: this.maxProbeDurationMs,
    };
  }

  private run(intervalMs: number): void {
    const started = performance.now();
    this.pending = Promise.resolve()
      .then(this.sample)
      .catch(() => {
        this.unexpectedFailures += 1;
      })
      .finally(() => {
        const duration = performance.now() - started;
        this.completedProbes += 1;
        this.totalProbeDurationMs += duration;
        this.maxProbeDurationMs = Math.max(this.maxProbeDurationMs, duration);
        this.pending = undefined;
        if (this.active) {
          this.timer = setTimeout(() => this.run(intervalMs), intervalMs);
          this.timer.unref();
        }
      });
  }
}
