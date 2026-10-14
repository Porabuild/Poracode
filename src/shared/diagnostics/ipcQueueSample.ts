export const IPC_QUEUE_SAMPLE_FORMAT_VERSION = 1;

/** Recorder-owned lifetime. Stopping capture is permanent for this recording. */
export interface IpcQueueCapture {
  readonly active: boolean;
}

/** Application-owned waiting queue only; sizes use the sender's admission estimator.
 * Native IPC bytes and terminal-coalescer bytes/ages are not measured here. */
export interface IpcQueueSample {
  readonly formatVersion: typeof IPC_QUEUE_SAMPLE_FORMAT_VERSION;
  readonly instanceId: string;
  readonly observedAtMonotonicMs: number;
  readonly waitingMessages: number;
  readonly waitingEstimatedBytes: number;
  /** Time since first queue admission, including earlier send attempts for a queued retry. */
  readonly oldestQueuedMessageAgeMs: number | null;
  /** Any missing/invalid admission time makes the oldest age unknown, never zero. */
  readonly untimedWaitingMessages: number;
  readonly peakWaitingMessages: number;
  readonly peakWaitingEstimatedBytes: number;
  readonly maxWaitingMessages: number;
  readonly maxWaitingEstimatedBytes: number;
  readonly terminalBatchMessages: number;
  readonly inFlightMessages: number;
  readonly backpressured: boolean;
  readonly failed: boolean;
  /** Send-adapter attempts, including local rejection; not peer acknowledgments. */
  readonly sendAttempts: number;
  readonly sendAttemptEstimatedBytes: number;
  readonly shedMessages: number;
  readonly shedEstimatedBytes: number;
}

export const IPC_QUEUE_NAMES = [
  "main-to-backend",
  "backend-to-main",
  "supervisor-to-host",
] as const;
export type IpcQueueName = (typeof IPC_QUEUE_NAMES)[number];
