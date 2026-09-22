import type { TerminalSize, Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { DecodeFrameResult } from "@/renderer/state/remote/engine";
import type { RemoteServerEventSocketEntry } from "./eventSocketRegistry";
import type {
  OpenRemoteThread,
  RemoteServerRecord,
  RemoteServersState,
  RemoteSocketLike,
} from "./types";

export interface EventSocketRecoveryState {
  threadIds: Set<string>;
  /** Queued recovery frames carry the measured size of the RAW wire frame
   * (UTF-16 upper bound), so recovery accounting never re-serializes an event
   * just to size it. */
  queuedEvents: Array<{ readonly seq: number; readonly event: unknown; readonly bytes: number }>;
  queuedBytes: number;
  overflowed: boolean;
  baselineSeqByThread: Map<string, number>;
}

export function createEventSocketRecoveryState(): EventSocketRecoveryState {
  return {
    threadIds: new Set<string>(),
    queuedEvents: [],
    queuedBytes: 0,
    overflowed: false,
    baselineSeqByThread: new Map<string, number>(),
  };
}

/**
 * Shared bag for the current socket of one event-stream session. Recovery
 * buffers and the in-flight resync promise are session-scoped (same object
 * across reconnects) so a dead socket's recovery cannot be reused on its
 * replacement. Mutable method slots are filled by the resync and message
 * binders so neither module imports the other.
 */
export interface EventSocketConnectionContext {
  readonly server: RemoteServerRecord;
  readonly entry: RemoteServerEventSocketEntry;
  readonly socket: RemoteSocketLike;
  readonly client: RemoteDesktopClient;
  readonly get: () => RemoteServersState;
  readonly set: (
    partial:
      | RemoteServersState
      | Partial<RemoteServersState>
      | ((state: RemoteServersState) => RemoteServersState | Partial<RemoteServersState>),
  ) => void;
  readonly buildOpenThread: (
    desktopId: string,
    snapshot: {
      readonly thread: Thread;
      readonly terminalScrollback?: string | undefined;
      readonly terminalSize?: TerminalSize | undefined;
    },
  ) => OpenRemoteThread;
  readonly setRemoteServerFailure: (
    desktopId: string,
    status: "offline" | "error",
    message: string,
  ) => void;
  readonly isCurrent: () => boolean;
  readonly forceReconnect: (socket: RemoteSocketLike) => void;
  readonly noteClientDetectedLoss: () => void;
  /** A3: decode one raw socket frame through this connection's engine lane.
   * Bulk frames never fall back to a synchronous UI parse on failure; the
   * typed rejection drives the client-detected-loss resync below. */
  readonly decodeFrame: (raw: string) => Promise<DecodeFrameResult>;
  /** Platform has no Worker global at all (some embeds, jsdom tests): frames
   * are consumed inline at receive time, exactly as the pre-A3 client did.
   * This is a capability, never a failure fallback. */
  readonly decodeInline: boolean;
  readonly recovery: EventSocketRecoveryState;
  readonly resyncSlots: {
    promise: Promise<boolean> | null;
    socket: RemoteSocketLike | null;
  };
  dispatchForwardEvent: (forward: unknown, sequence: number, recoveryReplay?: boolean) => void;
  recoverInterestedThreads: (beforeReplay?: () => void) => Promise<boolean>;
}
