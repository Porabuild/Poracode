import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  IPC_QUEUE_SAMPLE_FORMAT_VERSION,
  type IpcQueueSample,
} from "@/shared/diagnostics/ipcQueueSample";

/** Allocated only for opt-in diagnostics. Retains numbers and a fresh observation identity. */
export class IpcQueueProbe {
  private readonly instanceId = randomUUID();
  private peakWaitingMessages = 0;
  private peakWaitingEstimatedBytes = 0;
  private sendAttempts = 0;
  private sendAttemptEstimatedBytes = 0;
  private shedMessages = 0;
  private shedEstimatedBytes = 0;

  admittedAt(): number {
    return performance.now();
  }

  observeWaiting(messages: number, bytes: number): void {
    this.peakWaitingMessages = Math.max(this.peakWaitingMessages, messages);
    this.peakWaitingEstimatedBytes = Math.max(this.peakWaitingEstimatedBytes, bytes);
  }

  attemptSend(bytes: number): void {
    this.sendAttempts++;
    this.sendAttemptEstimatedBytes += bytes;
  }

  shed(messages: number, bytes: number): void {
    this.shedMessages += messages;
    this.shedEstimatedBytes += bytes;
  }

  sample(input: {
    queue: readonly { queuedAt?: number }[];
    waitingEstimatedBytes: number;
    maxWaitingMessages: number;
    maxWaitingEstimatedBytes: number;
    terminalBatchMessages: number;
    inFlightMessages: number;
    backpressured: boolean;
    failed: boolean;
  }): IpcQueueSample {
    const now = performance.now();
    let oldest = now;
    let untimedWaitingMessages = 0;
    for (const entry of input.queue) {
      if (
        entry.queuedAt === undefined ||
        !Number.isFinite(entry.queuedAt) ||
        entry.queuedAt < 0 ||
        entry.queuedAt > now
      ) {
        untimedWaitingMessages++;
      } else {
        oldest = Math.min(oldest, entry.queuedAt);
      }
    }
    return {
      formatVersion: IPC_QUEUE_SAMPLE_FORMAT_VERSION,
      instanceId: this.instanceId,
      observedAtMonotonicMs: now,
      waitingMessages: input.queue.length,
      waitingEstimatedBytes: input.waitingEstimatedBytes,
      oldestQueuedMessageAgeMs: input.queue.length && !untimedWaitingMessages ? now - oldest : null,
      untimedWaitingMessages,
      peakWaitingMessages: this.peakWaitingMessages,
      peakWaitingEstimatedBytes: this.peakWaitingEstimatedBytes,
      maxWaitingMessages: input.maxWaitingMessages,
      maxWaitingEstimatedBytes: input.maxWaitingEstimatedBytes,
      terminalBatchMessages: input.terminalBatchMessages,
      inFlightMessages: input.inFlightMessages,
      backpressured: input.backpressured,
      failed: input.failed,
      sendAttempts: this.sendAttempts,
      sendAttemptEstimatedBytes: this.sendAttemptEstimatedBytes,
      shedMessages: this.shedMessages,
      shedEstimatedBytes: this.shedEstimatedBytes,
    };
  }
}
