import {
  createHistogram,
  performance,
  PerformanceObserver,
  type PerformanceEntry,
} from "node:perf_hooks";

export const PROCESS_PERFORMANCE_FORMAT_VERSION = 1;

interface GarbageCollectionWindow {
  count: number;
  durationMs: number;
  maxDurationMs: number;
  /** Delivery can lag execution; these entries began before this observation window. */
  lateEntries: number;
}

export interface ProcessPerformanceSample {
  formatVersion: typeof PROCESS_PERFORMANCE_FORMAT_VERSION;
  fromMonotonicMs: number;
  toMonotonicMs: number;
  durationMs: number;
  cpu: { userMs: number; systemMs: number; oneCorePercent: number };
  eventLoop: { activeMs: number; idleMs: number; utilization: number };
  eventLoopDelay: {
    mode: "timer-callback";
    resolutionMs: number;
    /** An unfinished interval at capture; do not interpret no completed callbacks as zero delay. */
    pendingCallbackMs: number;
    count: number;
    exceeds: number;
    minMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    maxMs: number | null;
  };
  gc: GarbageCollectionWindow;
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
  };
  samplingWorkMs: number;
}

const emptyGc = (): GarbageCollectionWindow => ({
  count: 0,
  durationMs: 0,
  maxDurationMs: 0,
  lateEntries: 0,
});

/** CPU/RSS cover the process; event loop, heap and GC cover this thread/isolate. No event content. */
export class ProcessPerformanceSampler {
  private readonly delay = createHistogram();
  private readonly delayTimer: ReturnType<typeof setInterval>;
  private previousCallbackAt = performance.now();
  private readonly observer: PerformanceObserver;
  private readonly resolutionMs: number;
  private previousTime = performance.now();
  private previousCpu = process.cpuUsage();
  private previousLoop = performance.eventLoopUtilization();
  private gc = emptyGc();
  private disposed = false;

  constructor(resolutionMs = 1) {
    this.resolutionMs = resolutionMs;
    if (!Number.isSafeInteger(resolutionMs) || resolutionMs < 1)
      throw new Error("Performance sampling resolution must be a positive integer.");
    // Native monitorEventLoopDelay.reset() clears its previous timestamp and
    // loses the first post-reset stall. Keep that timestamp outside the histogram.
    this.delayTimer = setInterval(() => {
      const now = performance.now();
      this.delay.record(Math.max(1, Math.round((now - this.previousCallbackAt) * 1_000_000)));
      this.previousCallbackAt = now;
    }, resolutionMs);
    this.delayTimer.unref();
    this.observer = new PerformanceObserver((list) => this.observeGc(list.getEntries()));
    this.observer.observe({ entryTypes: ["gc"] });
  }

  sample(): ProcessPerformanceSample {
    if (this.disposed) throw new Error("Process performance sampler is disposed.");
    const sampledAt = performance.now();
    const cpu = process.cpuUsage();
    const loop = performance.eventLoopUtilization();
    const utilization = performance.eventLoopUtilization(loop, this.previousLoop);
    const durationMs = sampledAt - this.previousTime;
    this.observeGc(this.observer.takeRecords());
    const count = this.delay.count;
    const gc = this.gc;
    const memory = process.memoryUsage();
    const userMs = (cpu.user - this.previousCpu.user) / 1_000;
    const systemMs = (cpu.system - this.previousCpu.system) / 1_000;
    const result: ProcessPerformanceSample = {
      formatVersion: PROCESS_PERFORMANCE_FORMAT_VERSION,
      fromMonotonicMs: this.previousTime,
      toMonotonicMs: sampledAt,
      durationMs,
      cpu: {
        userMs,
        systemMs,
        oneCorePercent: durationMs > 0 ? ((userMs + systemMs) / durationMs) * 100 : 0,
      },
      eventLoop: {
        activeMs: utilization.active,
        idleMs: utilization.idle,
        utilization: utilization.utilization,
      },
      // Attribute complete callback intervals to this capture window. Intervals
      // can start in the preceding window; the raw duration includes the timer period.
      eventLoopDelay: {
        mode: "timer-callback",
        resolutionMs: this.resolutionMs,
        pendingCallbackMs: Math.max(0, sampledAt - this.previousCallbackAt),
        count,
        exceeds: this.delay.exceeds,
        minMs: count ? this.delay.min / 1_000_000 : null,
        p50Ms: count ? this.delay.percentile(50) / 1_000_000 : null,
        p95Ms: count ? this.delay.percentile(95) / 1_000_000 : null,
        p99Ms: count ? this.delay.percentile(99) / 1_000_000 : null,
        maxMs: count ? this.delay.max / 1_000_000 : null,
      },
      gc,
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
      },
      samplingWorkMs: 0,
    };
    this.delay.reset();
    this.gc = emptyGc();
    this.previousTime = sampledAt;
    this.previousCpu = cpu;
    this.previousLoop = loop;
    result.samplingWorkMs = performance.now() - sampledAt;
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.delayTimer);
    this.observer.disconnect();
  }

  private observeGc(entries: PerformanceEntry[]): void {
    for (const entry of entries) {
      this.gc.count += 1;
      this.gc.durationMs += entry.duration;
      this.gc.maxDurationMs = Math.max(this.gc.maxDurationMs, entry.duration);
      if (entry.startTime < this.previousTime) this.gc.lateEntries += 1;
    }
  }
}
