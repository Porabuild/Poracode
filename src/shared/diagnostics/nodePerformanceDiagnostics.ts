import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { performance } from "node:perf_hooks";
import { IpcQueueObservations } from "./ipcQueueObservations";
import {
  IPC_QUEUE_SAMPLE_FORMAT_VERSION,
  type IpcQueueCapture,
  type IpcQueueName,
  type IpcQueueSample,
} from "./ipcQueueSample";
import {
  PerformanceEvidenceWriter,
  type PerformanceWriterStats,
} from "./performanceEvidenceWriter";
import {
  PROCESS_PERFORMANCE_FORMAT_VERSION,
  ProcessPerformanceSampler,
} from "./processPerformanceSampler";

type ProcessRole = "desktop-main" | "backend" | "supervisor" | "server" | "relay";
const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_MAX_BYTES = 64 * 1_024 * 1_024;
const STOP_TIMEOUT_MS = 500;
export const NODE_PERFORMANCE_EVIDENCE_FORMAT_VERSION = 2;

export interface NodePerformanceDiagnostics {
  readonly queueCapture: IpcQueueCapture;
  observeIpcQueue(name: IpcQueueName, reader: () => IpcQueueSample | undefined): void;
  stop(): Promise<void>;
}

function optionalInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Error("Invalid performance diagnostics configuration.");
  return parsed;
}

/** Opt-in local evidence only. The caller creates its disposable output directory before launch. */
export function startNodePerformanceDiagnostics(
  role: ProcessRole,
  environment: NodeJS.ProcessEnv = process.env,
): NodePerformanceDiagnostics | undefined {
  const directory = environment.PORACODE_PERF_OUTPUT_DIR;
  if (!directory) return undefined;
  let intervalMs: number;
  let maxBytes: number;
  try {
    if (!isAbsolute(directory)) throw new Error("Performance output directory must be absolute.");
    intervalMs = optionalInteger(
      environment.PORACODE_PERF_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      100,
      60_000,
    );
    maxBytes = optionalInteger(
      environment.PORACODE_PERF_MAX_BYTES,
      DEFAULT_MAX_BYTES,
      65_536,
      512 * 1_024 * 1_024,
    );
  } catch {
    console.warn(
      "[performance] Invalid local diagnostics configuration; recording was not started.",
    );
    return undefined;
  }
  const sampler = new ProcessPerformanceSampler();
  const queueCapture = { active: true };
  const queues = new IpcQueueObservations();
  const writer = new PerformanceEvidenceWriter(
    join(directory, `${role}-${process.pid}-${randomUUID()}.ndjson`),
    maxBytes,
  );
  let sequence = 0;
  let completion: Promise<void> | undefined;
  let warningReported = false;
  writer.append({
    kind: "start",
    formatVersion: NODE_PERFORMANCE_EVIDENCE_FORMAT_VERSION,
    processSampleFormatVersion: PROCESS_PERFORMANCE_FORMAT_VERSION,
    ipcQueueSampleFormatVersion: IPC_QUEUE_SAMPLE_FORMAT_VERSION,
    role,
    pid: process.pid,
    parentPid: process.ppid,
    nodeVersion: process.versions.node,
    ...(process.versions.electron ? { electronVersion: process.versions.electron } : {}),
    timeOriginEpochMs: performance.timeOrigin,
    startedMonotonicMs: performance.now(),
    intervalMs,
    maxBytes,
    cpuScope: "process",
    eventLoopScope: "current-thread",
    gcAndHeapScope: "current-isolate",
    eventLoopDelayMode: "timer-callback",
    eventLoopDelayWindow: "callback completion; an interval may start before the window",
    eventLoopDelayResolutionMs: 1,
    observerOverhead: "included; qualify overhead with a separate disabled-control run",
    ipcQueueScope: "registered application waiting queues only; sizes are admission estimates",
    ipcQueueExclusions: "native IPC buffers, terminal coalescer bytes/ages, peer acknowledgments",
  });

  function warnIncomplete(stats?: PerformanceWriterStats): void {
    if (warningReported) return;
    warningReported = true;
    console.warn(
      "[performance] Local diagnostics are incomplete (%s); this recording cannot qualify a performance gate.",
      stats?.error ?? (stats?.budgetExceeded ? "budget" : "dropped-or-unflushed-records"),
    );
  }

  function appendSample(): void {
    const { formatVersion: processSampleFormatVersion, ...sample } = sampler.sample();
    writer.append({
      kind: "sample",
      formatVersion: NODE_PERFORMANCE_EVIDENCE_FORMAT_VERSION,
      processSampleFormatVersion,
      sequence: sequence++,
      writer: writer.stats(),
      ...sample,
      ipcQueues: queues.sample(),
    });
  }

  function capture(): void {
    appendSample();
    const state = writer.stats();
    if (state.error || state.budgetExceeded) void stop(state.error ? "error" : "budget");
  }

  const timer = setInterval(capture, intervalMs);
  timer.unref();

  function stop(reason: "shutdown" | "budget" | "error" = "shutdown"): Promise<void> {
    if (completion) return completion;
    clearInterval(timer);
    if (reason === "shutdown") appendSample();
    queueCapture.active = false;
    sampler.dispose();
    completion = finish(reason);
    return completion;
  }

  async function finish(reason: "shutdown" | "budget" | "error"): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const state = await Promise.race([
      writer.finish(reason),
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), STOP_TIMEOUT_MS);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    if (!state || state.error || state.budgetExceeded || state.droppedRecords)
      warnIncomplete(state);
  }

  return {
    queueCapture,
    observeIpcQueue: (name, reader) => {
      if (!completion) queues.register(name, reader);
    },
    stop: () => stop(),
  };
}
