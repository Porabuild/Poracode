import type { WebSocket, WebSocketServer } from "ws";
import type {
  RemoteGitSummariesEvent,
  RemoteProjectsChangedEvent,
  RemoteThreadsChangedEvent,
  RemoteWebSocketServerMessage,
} from "@/shared/remote";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AuthenticatedRemoteSession, RemoteAuthStore } from "../auth";
import type { PortProxy } from "../portForward/portProxy";
import type { RemoteBrowserGateway } from "../RemoteBrowserGateway";
import type { RemotePortForwardGateway } from "../RemotePortForwardGateway";
import type { RemoteAccessServerInfo, RemoteAccessServerOptions } from "../RemoteAccessServer";
import type { RemoteServerSecurity } from "./security";

export type RemoteBroadcastEvent =
  | SupervisorEvent
  | RemoteGitSummariesEvent
  | RemoteProjectsChangedEvent
  | RemoteThreadsChangedEvent;

export interface BufferedSupervisorEvent {
  readonly seq: number;
  readonly event: RemoteBroadcastEvent;
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
  readonly eventBuffer: BufferedSupervisorEvent[];
  /** Live in-memory event sequence; read through a getter so replays see the
   * current value rather than a snapshot taken at context-build time. */
  readonly seq: number;
  requireInfo(): RemoteAccessServerInfo;
  requireSettingsGateway(): NonNullable<RemoteAccessServerOptions["settings"]>;
  requireSchedulesGateway(): NonNullable<RemoteAccessServerOptions["schedules"]>;
  requireBrowserGateway(): RemoteBrowserGateway;
  requirePortForwardGateway(): RemotePortForwardGateway;
  requirePortProxy(): PortProxy;
  requirePushRegistrations(): NonNullable<RemoteAccessServerOptions["pushRegistrations"]>;
  publishSupervisorEvent(event: RemoteBroadcastEvent): void;
  publishThreadsChanged(threadIds: readonly string[]): void;
  send(ws: WebSocket, message: RemoteWebSocketServerMessage): void;
  sendRaw(ws: WebSocket, data: string): boolean;
}
