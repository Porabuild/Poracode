// Electron main-process builder for the additive `appMetrics` performance
// evidence field (desktop-main NDJSON only). Electron's `app.getAppMetrics()`
// covers every Chromium child plus the main process, so the desktop evidence
// gains per-process CPU/memory without new native dependencies.

import { app } from "electron";
import { performance } from "node:perf_hooks";
import type {
  AppMetricsProcessSample,
  AppMetricsSample,
} from "@/shared/diagnostics/appMetricsSample";

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function sampleElectronAppMetrics(): AppMetricsSample | null {
  const metrics = app.getAppMetrics();
  if (!Array.isArray(metrics) || metrics.length === 0) return null;
  const processes: AppMetricsProcessSample[] = [];
  for (const metric of metrics) {
    const cpuPercent = numberOrUndefined(metric.cpu?.percentCPUUsage);
    const cpuCumulativeSeconds = numberOrUndefined(metric.cpu?.cumulativeCPUUsage);
    const workingSetKiB = numberOrUndefined(metric.memory?.workingSetSize);
    if (
      cpuPercent === undefined ||
      cpuCumulativeSeconds === undefined ||
      workingSetKiB === undefined
    ) {
      continue;
    }
    const idleWakeupsPerSecond = numberOrUndefined(metric.cpu?.idleWakeupsPerSecond);
    const peakWorkingSetKiB = numberOrUndefined(metric.memory?.peakWorkingSetSize);
    const privateKiB = numberOrUndefined(metric.memory?.privateBytes);
    processes.push({
      pid: metric.pid,
      type: metric.type,
      cpuPercent,
      cpuCumulativeSeconds,
      ...(idleWakeupsPerSecond !== undefined ? { idleWakeupsPerSecond } : {}),
      workingSetKiB,
      ...(peakWorkingSetKiB !== undefined ? { peakWorkingSetKiB } : {}),
      ...(privateKiB !== undefined ? { privateKiB } : {}),
    });
  }
  if (processes.length === 0) return null;
  return { sampledMonotonicMs: performance.now(), processes };
}
