import { type ForkOptions, type MessagePortMain } from "electron";
import type {
  RemoteHttpBridgeSettledMessage,
  RemoteHttpBridgeStats,
} from "@/shared/remote/httpBridgeProtocol";

/** Structural slice of `WebContents` the supervisor needs (test-injectable). */
export interface RemoteHttpBridgeRendererTarget {
  readonly id: number;
  isDestroyed(): boolean;
  postMessage(channel: string, message: unknown, transfer: MessagePortMain[]): void;
}

/** Structural slice of `UtilityProcess` the supervisor needs (test-injectable). */
export interface RemoteHttpBridgeUtilityProcessLike {
  readonly pid?: number | undefined;
  postMessage(message: unknown, transfer?: MessagePortMain[]): void;
  kill(): boolean;
  once(event: "spawn", listener: () => void): unknown;
  on(event: "spawn", listener: () => void): unknown;
  on(event: "exit", listener: (code: number | null) => void): unknown;
  on(event: "message", listener: (message: unknown) => void): unknown;
  /** Detach a listener attached with `on`/`once` (Electron returns an EventEmitter). */
  off?(event: "spawn" | "exit" | "message", listener: (...args: never[]) => void): unknown;
}

export interface RemoteHttpBridgeSupervisorOptions {
  readonly utilityPath: string;
  readonly isPackaged?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly createChannel?: () => { port1: MessagePortMain; port2: MessagePortMain };
  readonly forkUtility?: (
    modulePath: string,
    options: ForkOptions,
  ) => RemoteHttpBridgeUtilityProcessLike;
  /** Spawn deadline for one fork attempt (tests shrink it). */
  readonly spawnTimeoutMs?: number;
  /** Payload-free settle notification for diagnostics/live probes. */
  readonly onSettled?: (message: RemoteHttpBridgeSettledMessage) => void;
  readonly log?: (message: string) => void;
}

export interface ActiveRecord {
  readonly requestId: string;
  readonly senderId: number;
  /**
   * Assigned once the shared start publishes a generation. A reservation is
   * inserted synchronously with generation 0 *before* the start is awaited, so
   * duplicate/cap admission counts include pending starts and a pre-port
   * cancel/window abort can retire the reservation.
   */
  generation: number;
  state: "starting" | "active";
  /** Set when a pre-port cancel or window lifecycle event retires this record. */
  cancelled: boolean;
  safetyTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * One owned fork attempt. It exists from before `spawn` until the child is
 * published, retired on failure, or its exit event is handled. A retired
 * attempt is never published as the supervisor's live child, and every attempt
 * consumes a generation before forking so a retry cannot reuse one.
 */
export interface UtilityAttempt {
  readonly child: RemoteHttpBridgeUtilityProcessLike;
  readonly generation: number;
  retired: boolean;
  spawnTimer: ReturnType<typeof setTimeout> | null;
  /** Detaches the persistent exit/message listeners once the attempt is over. */
  detach: (() => void) | null;
}

export const EMPTY_STATS: RemoteHttpBridgeStats = {
  activeRequests: 0,
  openedRequests: 0,
  completedRequests: 0,
  failedRequests: 0,
  cancelledRequests: 0,
  timedOutRequests: 0,
  rejectedRequests: 0,
  protocolViolations: 0,
  uploadedBytes: 0,
  downloadedBytes: 0,
  retainedUploadBytes: 0,
  peakRetainedUploadBytes: 0,
  reservedUploadBytes: 0,
  uploadAccountedBytes: 0,
  peakUploadAccountedBytes: 0,
};

export const SPAWN_TIMEOUT_MS = 10_000;
export const STATS_QUERY_TIMEOUT_MS = 2000;

export function unrefTimer(timer: unknown): void {
  (timer as { unref?: () => void } | null)?.unref?.();
}

export function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer !== null) clearTimeout(timer);
}

export function readInspectExecArgv(
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
): string[] | undefined {
  if (isPackaged) return undefined;
  const raw = env.PORACODE_REMOTE_HTTP_BRIDGE_INSPECT_PORT?.trim();
  if (!raw) return undefined;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return [`--inspect=127.0.0.1:${port}`];
}

/**
 * Main-process owner of the off-main remote HTTP bridge (V4 F8).
 *
 * Control plane only: authenticates the invoking webContents/frame, admits
 * requests under bounded caps, lazily forks one utility process per generation,
 * hands per-request `MessageChannelMain` port halves to the utility and the
 * renderer, and routes cancellation/lifecycle. It never carries body bytes and
 * never auto-retries a dispatched request; an exited utility fences its
 * generation and the next `open` starts a fresh one.
 */
