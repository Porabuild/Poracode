import type { WebSocket, WebSocketServer } from "ws";
import type {
  RemoteAccessScope,
  RemoteAccessTokenResult,
  RemoteClientMetadata,
  RemoteGitSummariesEvent,
  RemoteGitStateEvent,
  RemoteProjectsChangedEvent,
  RemoteThreadsChangedEvent,
  RemoteWebSocketServerMessage,
} from "@/shared/remote";
import type { SupervisorEvent } from "@/shared/ipc";
import type { GitStateInterest } from "@/shared/gitState";
import type { AuthenticatedRemoteSession, RemoteAuthStore } from "../auth";
import type { PortProxy } from "../portForward/portProxy";
import type { RemoteBrowserGatewayLike } from "../RemoteBrowserGateway";
import type { RemotePortForwardGateway } from "../RemotePortForwardGateway";
import type { RemoteAccessServerInfo, RemoteAccessServerOptions } from "../RemoteAccessServer";
import type { RemoteServerSecurity } from "./security";
import type { TerminalCursorSyncRegistry } from "./terminalCursorSync";

export type RemoteBroadcastEvent =
  | SupervisorEvent
  | RemoteGitSummariesEvent
  | RemoteGitStateEvent
  | RemoteProjectsChangedEvent
  | RemoteThreadsChangedEvent;

export interface BufferedSupervisorEvent {
  readonly seq: number;
  readonly event: RemoteBroadcastEvent;
  /** Serialized size of `event`, so the replay buffer can enforce a byte budget
   * and not just an entry count (see `eventSizeGuard.trimEventBuffer`). */
  readonly bytes: number;
}

/**
 * The slice of `RemoteAccessServer` state and helpers the extracted server
 * modules (`httpRouter`, `wsConnections`, `snapshots`, `threadCommands`)
 * operate on. The orchestrator builds this once and passes it to the free
 * functions in those modules so the class keeps ownership of the mutable state
 * (sessions, event buffer, options) while the behavior lives in focused files.
 */
export interface RemoteServerContext {
  readonly options: RemoteAccessServerOptions;
  readonly auth: RemoteAuthStore;
  readonly wss: WebSocketServer;
  readonly security: RemoteServerSecurity;
  readonly clients: Map<WebSocket, AuthenticatedRemoteSession>;
  readonly clientLiveness: Map<WebSocket, boolean>;
  readonly terminalWatches: Map<WebSocket, Set<string>>;
  /** Opt-in reliable terminal watches (cursor-sync v1). */
  readonly terminalCursorSync: TerminalCursorSyncRegistry;
  /** Git-state interests declared by each connection, so pull-request bodies are
   * only sent to the client that asked for them. */
  readonly gitStateInterests: Map<WebSocket, readonly GitStateInterest[]>;
  /** Threads each connection wants live transcript content for. Absent entry =
   * the client never declared any, so it keeps receiving everything. */
  readonly itemInterests: Map<WebSocket, ReadonlySet<string>>;
  readonly eventBuffer: BufferedSupervisorEvent[];
  /** Live in-memory event sequence; read through a getter so replays see the
   * current value rather than a snapshot taken at context-build time. */
  readonly seq: number;
  exchangePairingCredential(input: {
    readonly credential: string;
    readonly scopes?: readonly RemoteAccessScope[];
    readonly client?: RemoteClientMetadata;
  }): RemoteAccessTokenResult;
  requireInfo(): RemoteAccessServerInfo;
  requireSettingsGateway(): NonNullable<RemoteAccessServerOptions["settings"]>;
  requireSchedulesGateway(): NonNullable<RemoteAccessServerOptions["schedules"]>;
  requirePrWatchesGateway(): NonNullable<RemoteAccessServerOptions["prWatches"]>;
  requireBrowserGateway(): RemoteBrowserGatewayLike;
  requirePortForwardGateway(): RemotePortForwardGateway;
  requirePortProxy(): PortProxy;
  requirePushRegistrations(): NonNullable<RemoteAccessServerOptions["pushRegistrations"]>;
  publishSupervisorEvent(event: RemoteBroadcastEvent): void;
  publishThreadsChanged(threadIds: readonly string[]): void;
  send(ws: WebSocket, message: RemoteWebSocketServerMessage): void;
  sendRaw(ws: WebSocket, data: string): boolean;
  /**
   * Recomputes aggregate live-stream demand and notifies the backend host.
   * Awaitable so reliable terminal watches can establish the interest barrier
   * before taking a snapshot.
   */
  notifyEventInterestsChanged(): void | Promise<void>;
}
