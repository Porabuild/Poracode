import {
  REMOTE_HTTP_MAX_ERROR_MESSAGE_LENGTH,
  type RemoteHttpBridgeOpenDescriptor,
  type RemoteHttpBridgeSettledMessage,
} from "@/shared/remote/httpBridgeProtocol";

/**
 * Narrow port surface the bridge engine consumes. The utility host adapts
 * `MessagePortMain` to this; tests drive it with an in-process pair.
 */
export interface RemoteHttpBridgeWorkerPort {
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
  onMessage(listener: (message: unknown) => void): void;
  onClose(listener: () => void): void;
}

export type RemoteHttpBridgeLogEvent = Readonly<Record<string, string | number>>;

export interface RemoteHttpBridgeServiceOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBodyBytes?: number;
  readonly maxRequestBodyBytes?: number;
  readonly uploadRetentionBudgetBytes?: number;
  readonly maxActiveRequests?: number;
  readonly maxActiveRequestsPerWindow?: number;
  readonly portLingerMs?: number;
  readonly onSettled?: (message: RemoteHttpBridgeSettledMessage) => void;
  /** Env-gated, payload-free counter logging. Never includes URLs or headers. */
  readonly log?: (event: RemoteHttpBridgeLogEvent) => void;
}

export type ActiveState = "collecting" | "dispatching" | "streaming" | "retired";

export interface ActiveRequest {
  readonly descriptor: RemoteHttpBridgeOpenDescriptor;
  readonly port: RemoteHttpBridgeWorkerPort;
  readonly controller: AbortController;
  state: ActiveState;
  /**
   * Single retained body buffer, allocated to the admitted declared length on
   * the first upload chunk. It is also the fetch body (or a view of it) for
   * 307/308 replay, so the utility holds one copy rather than a chunk list
   * plus a concatenated duplicate.
   */
  body: Uint8Array | null;
  uploadBytes: number;
  /** Declared bytes not received yet; `reservedBytes + uploadBytes === accountedBytes`. */
  reservedBytes: number;
  /** Total bytes this request holds against the aggregate upload budget. */
  accountedBytes: number;
  credit: number;
  creditWaiters: Array<() => void>;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  deadline: ReturnType<typeof setTimeout> | null;
  linger: ReturnType<typeof setTimeout> | null;
  receivedBytes: number;
  sentBytes: number;
}

export interface MutableCounters {
  openedRequests: number;
  completedRequests: number;
  failedRequests: number;
  cancelledRequests: number;
  timedOutRequests: number;
  rejectedRequests: number;
  protocolViolations: number;
  uploadedBytes: number;
  downloadedBytes: number;
}

export function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer !== null) clearTimeout(timer);
}

export function unrefTimer(timer: unknown): void {
  (timer as { unref?: () => void } | null)?.unref?.();
}

export function boundedMessage(message: string): string {
  const clean = message.trim();
  if (clean.length === 0) return "Remote request failed.";
  return clean.length > REMOTE_HTTP_MAX_ERROR_MESSAGE_LENGTH
    ? clean.slice(0, REMOTE_HTTP_MAX_ERROR_MESSAGE_LENGTH)
    : clean;
}

/** Copy a bytes view so the posted message owns exactly the chunk it reports. */
export function exactBytes(value: Uint8Array, offset: number, length: number): Uint8Array {
  if (
    offset === 0 &&
    length === value.byteLength &&
    value.byteOffset === 0 &&
    value.buffer instanceof ArrayBuffer &&
    value.buffer.byteLength === value.byteLength
  ) {
    return value;
  }
  const copy = new Uint8Array(length);
  copy.set(value.subarray(offset, offset + length));
  return copy;
}

/**
 * Production engine for one remote HTTP request. Owns the Node fetch, the
 * replayable upload retention, the credit-gated response pump, cancellation,
 * and the 60 s / 64 MiB limits. It never touches Electron and never hands body
 * bytes to main: all frames go to the per-request renderer port.
 */
