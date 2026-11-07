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

/**
 * Shared bag for the current socket of one event-stream session. Mutable
 * method slots are filled by the resync and message binders so neither module
 * imports the other.
 */
export interface EventSocketConnectionContext {
  readonly server: RemoteServerRecord;
  readonly entry: RemoteServerEventSocketEntry;
  readonly socket: RemoteSocketLike;
  /** Resume cursor sent for this socket; HTTP snapshots cannot advance it. */
  readonly resumeCursor: number;
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
  readonly renewDecoder: () => void;
  /** Platform has no Worker global at all (some embeds, jsdom tests): frames
   * are consumed inline at receive time, exactly as the pre-A3 client did.
   * This is a capability, never a failure fallback. */
  readonly decodeInline: boolean;
  dispatchForwardEvent: (
    forward: unknown,
    sequence: number,
    omittedRuntimeThreadIds?: readonly string[],
  ) => void;
  recoverInterestedThreads: (onlyThreadIds?: ReadonlySet<string>) => Promise<boolean>;
}
