import { performance } from "node:perf_hooks";
import {
  IPC_QUEUE_NAMES,
  IPC_QUEUE_SAMPLE_FORMAT_VERSION,
  type IpcQueueName,
  type IpcQueueSample,
} from "./ipcQueueSample";

type QueueReader = () => IpcQueueSample | undefined;
type QueueObservation = { name: IpcQueueName } & (
  | { status: "observed"; sample: IpcQueueSample }
  | { status: "unavailable" | "error" }
);

/** A closed set of local numeric probes, with one current reader per queue. */
export class IpcQueueObservations {
  private readonly readers = new Map<IpcQueueName, QueueReader>();

  register(name: IpcQueueName, reader: QueueReader): boolean {
    if (!IPC_QUEUE_NAMES.includes(name)) return false;
    this.readers.set(name, reader);
    return true;
  }

  sample(): { samplingWorkMs: number; queues: QueueObservation[] } {
    const startedAt = performance.now();
    const queues: QueueObservation[] = [];
    for (const name of IPC_QUEUE_NAMES) {
      const reader = this.readers.get(name);
      if (!reader) continue;
      try {
        const value = reader();
        if (value === undefined) {
          queues.push({ name, status: "unavailable" });
          continue;
        }
        const sample = numericSample(value);
        queues.push(sample ? { name, status: "observed", sample } : { name, status: "error" });
      } catch {
        // Error text and arbitrary returned properties may contain application content.
        queues.push({ name, status: "error" });
      }
    }
    return { samplingWorkMs: performance.now() - startedAt, queues };
  }
}

/** Copy a fixed schema: adding fields to a sender never silently expands the evidence payload. */
function numericSample(value: IpcQueueSample): IpcQueueSample | undefined {
  const sample: IpcQueueSample = {
    formatVersion: value.formatVersion,
    instanceId: value.instanceId,
    observedAtMonotonicMs: value.observedAtMonotonicMs,
    waitingMessages: value.waitingMessages,
    waitingEstimatedBytes: value.waitingEstimatedBytes,
    oldestQueuedMessageAgeMs: value.oldestQueuedMessageAgeMs,
    untimedWaitingMessages: value.untimedWaitingMessages,
    peakWaitingMessages: value.peakWaitingMessages,
    peakWaitingEstimatedBytes: value.peakWaitingEstimatedBytes,
    maxWaitingMessages: value.maxWaitingMessages,
    maxWaitingEstimatedBytes: value.maxWaitingEstimatedBytes,
    terminalBatchMessages: value.terminalBatchMessages,
    inFlightMessages: value.inFlightMessages,
    backpressured: value.backpressured,
    failed: value.failed,
    sendAttempts: value.sendAttempts,
    sendAttemptEstimatedBytes: value.sendAttemptEstimatedBytes,
    shedMessages: value.shedMessages,
    shedEstimatedBytes: value.shedEstimatedBytes,
  };
  if (
    sample.formatVersion !== IPC_QUEUE_SAMPLE_FORMAT_VERSION ||
    typeof sample.instanceId !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(sample.instanceId) ||
    typeof sample.backpressured !== "boolean" ||
    typeof sample.failed !== "boolean" ||
    Object.entries(sample).some(([key, field]) => {
      if (key === "instanceId" || key === "backpressured" || key === "failed") return false;
      if (key === "oldestQueuedMessageAgeMs" && field === null) return false;
      return typeof field !== "number" || !Number.isFinite(field) || field < 0;
    })
  )
    return undefined;
  return sample;
}
