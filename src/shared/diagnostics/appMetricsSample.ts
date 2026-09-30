// Electron `app.getAppMetrics()` sample shape for desktop-main performance
// evidence. Type lives in shared so the diagnostics writer can reference it
// without importing Electron; only the Electron main process builds values.

export interface AppMetricsProcessSample {
  /** OS process id of the Chromium child or main process. */
  readonly pid: number;
  readonly type: string;
  /** Percent CPU used by the process since the last metrics sample (can exceed 100). */
  readonly cpuPercent: number;
  /** Cumulative CPU time in seconds since process start. */
  readonly cpuCumulativeSeconds: number;
  readonly idleWakeupsPerSecond?: number;
  /** Working set in KiB (Electron reports kilobytes). */
  readonly workingSetKiB: number;
  readonly peakWorkingSetKiB?: number;
  /** Private (anonymous) memory in KiB where the platform reports it. */
  readonly privateKiB?: number;
}

export interface AppMetricsSample {
  /** Monotonic timestamp of the collection, aligned with the enclosing sample. */
  readonly sampledMonotonicMs: number;
  readonly processes: readonly AppMetricsProcessSample[];
}
