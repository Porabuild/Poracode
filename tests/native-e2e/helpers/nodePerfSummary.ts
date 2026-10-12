import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  IPC_QUEUE_NAMES,
  IPC_QUEUE_SAMPLE_FORMAT_VERSION,
  type IpcQueueName,
} from "../../../src/shared/diagnostics/ipcQueueSample";
import type { PerformanceWriterStats } from "../../../src/shared/diagnostics/performanceEvidenceWriter";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCounter(value: unknown): value is number {
  return isNonnegativeNumber(value) && Number.isSafeInteger(value);
}

function isSupportedFormat(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2;
}

interface NodePerfQueueSummary {
  observedSamples: number;
  unavailableSamples: number;
  errorSamples: number;
  unknownAgeSamples: number;
  waitingEstimatedBytesMax: number | null;
  oldestQueuedMessageAgeMsMax: number | null;
  shedMessagesMax: number | null;
}

interface NodePerfEndRecord {
  readonly reason: "shutdown" | "budget" | "error";
  readonly complete: boolean;
  readonly beforeFinal: PerformanceWriterStats;
}

function readEndRecord(record: Record<string, unknown>): NodePerfEndRecord | null {
  const stats = asRecord(record.beforeFinal);
  if (
    (record.reason !== "shutdown" && record.reason !== "budget" && record.reason !== "error") ||
    typeof record.complete !== "boolean" ||
    !stats ||
    !isCounter(stats.acceptedRecords) ||
    !isCounter(stats.writtenRecords) ||
    !isCounter(stats.writtenBytes) ||
    !isCounter(stats.droppedRecords) ||
    typeof stats.budgetExceeded !== "boolean" ||
    (stats.error !== null &&
      stats.error !== "open" &&
      stats.error !== "write" &&
      stats.error !== "close")
  )
    return null;
  return {
    reason: record.reason,
    complete: record.complete,
    beforeFinal: {
      acceptedRecords: stats.acceptedRecords,
      writtenRecords: stats.writtenRecords,
      writtenBytes: stats.writtenBytes,
      droppedRecords: stats.droppedRecords,
      budgetExceeded: stats.budgetExceeded,
      error: stats.error,
    },
  };
}

/** Unpublished derived summary v2; writer/queue formats are unchanged.
 * Format 1 supplies process metrics only. Missing/invalid measurements stay null. */
export interface NodePerfRoleSummary {
  readonly summaryVersion: 2;
  /** Nonblank lines with invalid JSON, record shape, ordering, or a mismatched format. */
  readonly invalidRecords: number;
  /** Sample envelopes whose format is neither 1 nor 2 (including absent versions). */
  readonly unsupportedFormatSamples: number;
  readonly startFormatVersion: 1 | 2 | null;
  /** Writer evidence before the final append/close, not proof that close succeeded. */
  readonly end: NodePerfEndRecord | null;
  /** Recognized start, newline-terminated shutdown end, no loss/errors, matching counts/bytes. */
  readonly complete: boolean;
  readonly role: string;
  readonly file: string;
  readonly samples: number;
  /** Coverage of the supported samples only; independent of recording completeness.
   * Queue coverage remains in queueMaxima's observation/status counters. */
  readonly processCoverage: {
    readonly status: "none" | "partial" | "complete";
    readonly eventLoopDelayP99Samples: number;
    readonly eventLoopDelayMaxSamples: number;
    readonly cpuSamples: number;
    readonly rssSamples: number;
  };
  readonly eventLoopDelayP99MaxMs: number | null;
  readonly eventLoopDelayMaxMs: number | null;
  readonly cpuOneCorePercentMax: number | null;
  readonly rssBytesMax: number | null;
  /** Last valid observed RSS, not an inferred value for a missing trailing measurement. */
  readonly rssBytesLast: number | null;
  readonly queueMaxima: Readonly<Record<string, NodePerfQueueSummary>>;
}

export function summarizeNodePerfDirectory(directory: string): NodePerfRoleSummary[] {
  if (!existsSync(directory)) return [];
  const summaries: NodePerfRoleSummary[] = [];
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".ndjson"))) {
    const path = join(directory, file);
    let role = "unknown";
    let samples = 0;
    let invalidRecords = 0;
    let unsupportedFormatSamples = 0;
    let startFormatVersion: 1 | 2 | null = null;
    let end: NodePerfEndRecord | null = null;
    let records = 0;
    let recordBytes = 0;
    let endMatchesFile = false;
    let p99Max: number | null = null;
    let delayMax: number | null = null;
    let cpuMax: number | null = null;
    let rssMax: number | null = null;
    let rssLast: number | null = null;
    const processCounts = {
      eventLoopDelayP99Samples: 0,
      eventLoopDelayMaxSamples: 0,
      cpuSamples: 0,
      rssSamples: 0,
    };
    const queues: Record<string, NodePerfQueueSummary> = {};
    const contents = readFileSync(path, "utf8");
    for (const line of contents.split("\n")) {
      const precedingBytes = recordBytes;
      recordBytes += Buffer.byteLength(line) + 1;
      if (!line.trim()) continue;
      records++;
      let parsed: Record<string, unknown> | null;
      try {
        parsed = asRecord(JSON.parse(line));
      } catch {
        invalidRecords++;
        continue;
      }
      if (!parsed || end) {
        invalidRecords++;
        continue;
      }
      if (parsed.kind === "start") {
        if (
          records !== 1 ||
          !isSupportedFormat(parsed.formatVersion) ||
          typeof parsed.role !== "string" ||
          !parsed.role.trim()
        ) {
          invalidRecords++;
          continue;
        }
        startFormatVersion = parsed.formatVersion;
        role = parsed.role;
        continue;
      }
      if (parsed.kind === "end") {
        end = readEndRecord(parsed);
        if (!end) invalidRecords++;
        else
          endMatchesFile =
            end.beforeFinal.writtenRecords === records - 1 &&
            end.beforeFinal.writtenBytes === precedingBytes;
        continue;
      }
      if (parsed.kind !== "sample") {
        invalidRecords++;
        continue;
      }
      if (!isSupportedFormat(parsed.formatVersion)) {
        unsupportedFormatSamples += 1;
        continue;
      }
      if (startFormatVersion !== null && parsed.formatVersion !== startFormatVersion) {
        invalidRecords++;
        continue;
      }
      samples += 1;
      const delay = asRecord(parsed.eventLoopDelay);
      if (isNonnegativeNumber(delay?.p99Ms)) {
        p99Max = Math.max(p99Max ?? 0, delay.p99Ms);
        processCounts.eventLoopDelayP99Samples++;
      }
      if (isNonnegativeNumber(delay?.maxMs)) {
        delayMax = Math.max(delayMax ?? 0, delay.maxMs);
        processCounts.eventLoopDelayMaxSamples++;
      }
      const cpu = asRecord(parsed.cpu);
      if (isNonnegativeNumber(cpu?.oneCorePercent)) {
        cpuMax = Math.max(cpuMax ?? 0, cpu.oneCorePercent);
        processCounts.cpuSamples++;
      }
      const memory = asRecord(parsed.memory);
      if (isNonnegativeNumber(memory?.rssBytes)) {
        rssMax = Math.max(rssMax ?? 0, memory.rssBytes);
        rssLast = memory.rssBytes;
        processCounts.rssSamples++;
      }
      if (parsed.formatVersion !== 2) continue; // Format 1 contains no queue observations.
      const ipcQueues = asRecord(parsed.ipcQueues);
      if (!Array.isArray(ipcQueues?.queues)) continue;
      for (const entry of ipcQueues.queues) {
        const observation = asRecord(entry);
        if (!observation) continue;
        if (!IPC_QUEUE_NAMES.includes(observation.name as IpcQueueName)) continue;
        const name = observation.name as IpcQueueName;
        const current = (queues[name] ??= {
          observedSamples: 0,
          unavailableSamples: 0,
          errorSamples: 0,
          unknownAgeSamples: 0,
          waitingEstimatedBytesMax: null,
          oldestQueuedMessageAgeMsMax: null,
          shedMessagesMax: null,
        });
        if (observation.status === "unavailable") {
          current.unavailableSamples++;
          continue;
        }
        if (observation.status !== "observed") {
          current.errorSamples++;
          continue;
        }
        const sample = asRecord(observation.sample);
        const bytes = sample?.waitingEstimatedBytes;
        const shed = sample?.shedMessages;
        const age = sample?.oldestQueuedMessageAgeMs;
        if (
          sample?.formatVersion !== IPC_QUEUE_SAMPLE_FORMAT_VERSION ||
          !isNonnegativeNumber(bytes) ||
          !isNonnegativeNumber(shed) ||
          !(age === null || isNonnegativeNumber(age))
        ) {
          current.errorSamples++;
          continue;
        }
        current.observedSamples++;
        current.waitingEstimatedBytesMax = Math.max(current.waitingEstimatedBytesMax ?? 0, bytes);
        current.shedMessagesMax = Math.max(current.shedMessagesMax ?? 0, shed);
        if (age === null) current.unknownAgeSamples++;
        else
          current.oldestQueuedMessageAgeMsMax = Math.max(
            current.oldestQueuedMessageAgeMsMax ?? 0,
            age,
          );
      }
    }
    summaries.push({
      summaryVersion: 2,
      invalidRecords,
      unsupportedFormatSamples,
      startFormatVersion,
      end,
      complete:
        startFormatVersion !== null &&
        end !== null &&
        endMatchesFile &&
        contents.endsWith("\n") &&
        invalidRecords === 0 &&
        unsupportedFormatSamples === 0 &&
        end.reason === "shutdown" &&
        end.complete &&
        end.beforeFinal.error === null &&
        !end.beforeFinal.budgetExceeded &&
        end.beforeFinal.droppedRecords === 0 &&
        end.beforeFinal.acceptedRecords === end.beforeFinal.writtenRecords,
      role,
      file,
      samples,
      processCoverage: {
        status: Object.values(processCounts).every((count) => count === 0)
          ? "none"
          : Object.values(processCounts).every((count) => count === samples)
            ? "complete"
            : "partial",
        ...processCounts,
      },
      eventLoopDelayP99MaxMs: p99Max,
      eventLoopDelayMaxMs: delayMax,
      cpuOneCorePercentMax: cpuMax,
      rssBytesMax: rssMax,
      rssBytesLast: rssLast,
      queueMaxima: queues,
    });
  }
  return summaries;
}
