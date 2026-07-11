import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import {
  toWebSocketUrl,
  type RemoteGitSummaries,
  type RemoteAccessSessionSummary,
  type RemotePushRegistration,
  type RemoteSettings,
  type RemoteSettingsPatch,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import type { RemoteThreadCommand, ScheduledTask, ScheduledTaskInput } from "@/shared/contracts";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorProcedureName,
} from "@/shared/ipc";
import { buildPairingUrl } from "@/shared/remote/pairingUrl";
import { RemoteHttpError, RemoteAuthStore, type AuthenticatedRemoteSession } from "./auth";
import type { RemoteAccessIdentity } from "./identity";
import type { PortProxy } from "./portForward/portProxy";
import type { RemoteBrowserGateway } from "./RemoteBrowserGateway";
import type { RemotePortForwardGateway } from "./RemotePortForwardGateway";
import { normalizeHostForUrl, RemoteServerSecurity } from "./server/security";
import type {
  BufferedSupervisorEvent,
  RemoteBroadcastEvent,
  RemoteServerContext,
} from "./server/context";
import {
  DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES,
  DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES,
  handleUpgrade,
  WebSocketHeartbeat,
} from "./server/wsConnections";
import { handleHttp } from "./server/httpRouter";
import { RemoteRuntimePersistence } from "./server/runtimePersistence";
import { persistRemoteThreadStateEvent } from "./server/threadStatePersistence";

const EVENT_BUFFER_LIMIT = 500;

export interface RemoteAccessServerInfo {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly pairingUrl: string;
}

export interface RemoteAccessServerOptions {
  readonly appVersion: string;
  readonly identity: RemoteAccessIdentity;
  /**
   * Dev mode. Loosens CORS to trust any loopback web origin
   * (`http://localhost:<port>` / `http://127.0.0.1:<port>` / `[::1]`), so the
   * mobile PWA served from the Vite dev server (`localhost:3100`) can pair
   * without an explicit `pairingAppUrl`/`trustedCorsOrigins` entry. Never widens
   * trust beyond loopback, and is off in production.
   */
  readonly isDev?: boolean;
  readonly host: string;
  readonly advertisedHost?: string;
  /**
   * Full advertised origin (e.g. `https://machine.tailnet.ts.net` or a custom
   * reverse-proxy origin). When set it wins over `host`/`advertisedHost`/`port`
   * for the advertised `httpBaseUrl`: the origin is used verbatim (any path is
   * dropped), a trailing slash is normalized on, and `wsBaseUrl` derives from it
   * (https → wss). Requests arriving with this origin are trusted for CORS.
   */
  readonly advertisedBaseUrl?: string;
  readonly pairingAppUrl?: string;
  readonly trustedCorsOrigins?: readonly string[];
  readonly tokenExchangeRateLimit?: {
    readonly maxAttempts: number;
    readonly windowMs: number;
  };
  /**
   * Server-side ping interval for pruning half-open remote sockets. Set to 0 in
   * tests only when a heartbeat would make assertions nondeterministic.
   */
  readonly webSocketHeartbeatIntervalMs?: number;
  /** Maximum inbound WebSocket message payload accepted from a remote client. */
  readonly maxWebSocketPayloadBytes?: number;
  /**
   * Maximum bytes the server will queue per outbound WebSocket before dropping
   * the client. Reconnect + replay/snapshot resync is safer than unbounded
   * memory growth behind a slow mobile or relay connection.
   */
  readonly maxWebSocketOutboundBufferBytes?: number;
  /**
   * Dev-mode URL of the mobile PWA on the Vite dev server (e.g.
   * `http://192.168.1.5:3100/mobile.html`). Pairing links are minted on this
   * origin with the desktop API in `?host=...`, and `/app`/`/pair` still
   * redirect there as a fallback so the phone gets hot reload.
   */
  readonly devMobileAppUrl?: string;
  readonly port: number;
  readonly authStore?: RemoteAuthStore;
  callSupervisor<Name extends SupervisorProcedureName>(
    name: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>>;
  /**
   * Forwards a thread-metadata command to the desktop renderer, which owns
   * thread metadata and persists it. Returns false when no renderer window is
   * available to receive the command.
   */
  dispatchThreadCommand?(command: RemoteThreadCommand): boolean;
  /** Built-in browser bridge: tab commands plus screencast mirroring. */
  readonly browser?: RemoteBrowserGateway;
  /** Local dev-server discovery + raw TCP port forwarding. Absent on hosts
   * that don't support it (returns 503). */
  readonly portForward?: RemotePortForwardGateway;
  /** Authenticated HTTP/WS reverse-proxy session layer sitting in front of
   * `portForward`'s raw TCP forwards (see `/forward/<id>/enter` and the proxy
   * fallthrough in `httpRouter`). Absent on hosts that don't support it
   * (`POST /api/ports/enter` returns 503; the proxy fallthrough and enter
   * route simply have no session to resolve, so they behave as if no forward
   * were ever opened). */
  readonly portProxy?: PortProxy;
  /**
   * Remote-editable desktop settings (the AI helpers). `update` merges a
   * patch into the settings file and notifies the desktop renderer; both
   * return the remote-editable subset only — never the full settings file.
   */
  readonly settings?: {
    read(): RemoteSettings;
    update(patch: RemoteSettingsPatch): RemoteSettings;
  };
  readonly schedules?: {
    list(): ScheduledTask[];
    create(task: ScheduledTaskInput): ScheduledTask;
    update(id: string, task: ScheduledTaskInput): ScheduledTask;
    delete(id: string): void;
    runNow(id: string): ScheduledTask;
  };
  /** Latest per-thread git/PR summaries published by the desktop renderer. */
  gitSummaries?(): RemoteGitSummaries;
  /**
   * Push-notification registration sink. The server stays pure — the store and
   * `PushCoordinator` live in the wiring layer (`main.ts` / headless host) and
   * are injected here. Absent on hosts that don't support push (returns 503).
   */
  readonly pushRegistrations?: {
    upsert(registration: RemotePushRegistration): void;
    remove(deviceId: string): void;
  };
}

/**
 * Event `type`s a remote client actually consumes, so only these are buffered
 * on the replayable stream and broadcast. Chatty supervisor events no remote
 * client reads (`lsp-message`, `git-changed`, `project-tree-changed`,
 * `provider-usage*`, `agent-detected`, `thread-osc-*`) waste phone bandwidth
 * and churn the bounded replay buffer (causing spurious resync-required), so we
 * drop them here.
 *
 * Derived from the remote client consumers (kept in sync with them):
 * - `src/mobile/storeSync.ts` `dispatchRemoteSupervisorEvent`: the
 *   `thread-runtime-event(s)[-multi]` pre-pass (live chat content), the
 *   `remote-git-summaries` out-of-band handler, and the switch cases
 *   (`thread-state`, `thread-pending-steer`, `thread-reset`, `thread-exited`,
 *   `agent-status-updated`, `windows-agent-statuses`, `wsl-agent-statuses`).
 * - `src/renderer/state/remoteServersStore.ts` `shouldRefreshRemoteServerAfterEvent`
 *   (adds `remote-projects-changed` / `remote-threads-changed`).
 *
 * `thread-output` is intentionally absent: it short-circuits to
 * `broadcastTerminalOutput` before reaching this allowlist.
 */
const REMOTELY_CONSUMED_EVENT_TYPES: ReadonlySet<RemoteBroadcastEvent["type"]> = new Set([
  // Live chat runtime content.
  "thread-runtime-event",
  "thread-runtime-events",
  "thread-runtime-events-multi",
  // Thread lifecycle.
  "thread-state",
  "thread-pending-steer",
  "thread-reset",
  "thread-exited",
  // Agent status.
  "agent-status-updated",
  "windows-agent-statuses",
  "wsl-agent-statuses",
  // Out-of-band remote events.
  "remote-git-summaries",
  "remote-projects-changed",
  "remote-threads-changed",
]);

export class RemoteAccessServer {
  private readonly auth: RemoteAuthStore;
  private readonly server: Server;
  private readonly wss: WebSocketServer;
  private readonly security: RemoteServerSecurity;
  private readonly heartbeat: WebSocketHeartbeat;
  private readonly clients = new Map<WebSocket, AuthenticatedRemoteSession>();
  private readonly clientLiveness = new Map<WebSocket, boolean>();
  /** Per-connection terminal ids the client opted into live `terminal-output` for. */
  private readonly terminalWatches = new Map<WebSocket, Set<string>>();
  private readonly runtimePersistence = new RemoteRuntimePersistence();
  private readonly eventBuffer: BufferedSupervisorEvent[] = [];
  private readonly context: RemoteServerContext;
  private seq = 0;
  private info: RemoteAccessServerInfo | null = null;

  constructor(private readonly options: RemoteAccessServerOptions) {
    this.auth = options.authStore ?? new RemoteAuthStore();
    this.security = new RemoteServerSecurity({
      getHttpBaseUrl: () => this.info?.httpBaseUrl,
      options,
      auth: this.auth,
    });
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: options.maxWebSocketPayloadBytes ?? DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES,
    });
    this.heartbeat = new WebSocketHeartbeat({
      intervalMs: options.webSocketHeartbeatIntervalMs,
      clients: this.clients,
      clientLiveness: this.clientLiveness,
    });
    this.context = this.buildContext();
    this.server = createServer((req, res) => {
      void handleHttp(this.context, req, res);
    });
    this.server.on("upgrade", (req, socket, head) => {
      void handleUpgrade(this.context, req, socket, head);
    });
  }

  private buildContext(): RemoteServerContext {
    const server = this;
    return {
      options: this.options,
      auth: this.auth,
      wss: this.wss,
      security: this.security,
      clients: this.clients,
      clientLiveness: this.clientLiveness,
      terminalWatches: this.terminalWatches,
      eventBuffer: this.eventBuffer,
      get seq() {
        return server.seq;
      },
      requireInfo: () => this.requireInfo(),
      requireSettingsGateway: () => this.requireSettingsGateway(),
      requireSchedulesGateway: () => this.requireSchedulesGateway(),
      requireBrowserGateway: () => this.requireBrowserGateway(),
      requirePortForwardGateway: () => this.requirePortForwardGateway(),
      requirePortProxy: () => this.requirePortProxy(),
      requirePushRegistrations: () => this.requirePushRegistrations(),
      publishSupervisorEvent: (event) => this.publishSupervisorEvent(event),
      publishThreadsChanged: (threadIds) => this.publishThreadsChanged(threadIds),
      send: (ws, message) => this.send(ws, message),
      sendRaw: (ws, data) => this.sendRaw(ws, data),
    };
  }

  async start(): Promise<RemoteAccessServerInfo> {
    if (this.info) return this.info;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.options.port, this.options.host);
    });

    const address = this.server.address() as AddressInfo;
    const httpBaseUrl = this.resolveHttpBaseUrl(address.port);
    const pairingCredential = this.auth.issuePairingCredential({
      label: "Startup pairing",
    });

    this.info = {
      httpBaseUrl,
      wsBaseUrl: toWebSocketUrl(httpBaseUrl).toString(),
      pairingUrl: this.mintPairingUrl(httpBaseUrl, pairingCredential.credential),
    };
    this.heartbeat.start();
    return this.info;
  }

  /**
   * Stops the server. Resolves once the HTTP server has actually closed so a
   * caller (e.g. the headless host) can safely tear down the database afterward
   * without crashing an in-flight request. Idle keep-alive sockets are dropped
   * immediately; active requests are given a short grace period to finish.
   */
  async dispose(): Promise<void> {
    this.runtimePersistence.dispose();
    this.heartbeat.stop();
    for (const client of this.clients.keys()) {
      client.terminate();
    }
    this.clients.clear();
    this.clientLiveness.clear();
    this.terminalWatches.clear();
    this.wss.close();
    // Drop idle keep-alive connections so close() doesn't wait on them, but let
    // any in-flight request complete (up to the grace timeout).
    this.server.closeIdleConnections?.();
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 5000);
      this.server.close(() => done());
    });
    this.info = null;
  }

  getInfo(): RemoteAccessServerInfo | null {
    return this.info;
  }

  listAccessSessions(): RemoteAccessSessionSummary[] {
    return this.auth.listAccessSessions();
  }

  revokeAccessSession(sessionId: string): boolean {
    const revoked = this.auth.revokeAccessSession(sessionId);
    if (!revoked) return false;
    for (const [client, session] of this.clients) {
      if (session.sessionId === sessionId) {
        client.close(1008, "Remote access session revoked");
      }
    }
    return true;
  }

  /** Pushes an event onto the replayable WS event stream. Out-of-band desktop
   * events (git summaries) ride the same stream as supervisor events. */
  publishSupervisorEvent(event: RemoteBroadcastEvent): void {
    this.runtimePersistence.handleEvent(event);
    if (event.type === "thread-state") {
      persistRemoteThreadStateEvent(event);
    }

    // Terminal output is high-volume and ephemeral: keep it off the replayable
    // event stream (replaying PTY bytes would garble the screen) and only send
    // it to clients that opted into that terminal via `terminal-watch`.
    if (event.type === "thread-output") {
      this.broadcastTerminalOutput(event.threadId, event.data);
      return;
    }
    // Only buffer + broadcast events a remote client actually consumes; chatty
    // supervisor events no client reads would waste bandwidth and churn the
    // bounded replay buffer (see REMOTELY_CONSUMED_EVENT_TYPES).
    if (!REMOTELY_CONSUMED_EVENT_TYPES.has(event.type)) {
      return;
    }
    const seq = ++this.seq;
    const entry = { seq, event };
    this.eventBuffer.push(entry);
    if (this.eventBuffer.length > EVENT_BUFFER_LIMIT) {
      this.eventBuffer.splice(0, this.eventBuffer.length - EVENT_BUFFER_LIMIT);
    }
    this.broadcast({
      type: "event",
      seq,
      event,
    });
  }

  private publishThreadsChanged(threadIds: readonly string[]): void {
    this.publishSupervisorEvent({
      type: "remote-threads-changed",
      threadIds: [...new Set(threadIds)],
    });
  }

  /** Streams PTY bytes to watching clients, dropping them on a congested socket
   * (the terminal self-heals on the next write; back-buffering would lag). */
  private broadcastTerminalOutput(id: string, data: string): void {
    let serialized: string | null = null;
    for (const [client, watched] of this.terminalWatches) {
      if (!watched.has(id)) continue;
      if (client.readyState !== client.OPEN) continue;
      if (client.bufferedAmount > 1_500_000) continue;
      serialized ??= JSON.stringify({ type: "terminal-output", id, data });
      this.sendRaw(client, serialized);
    }
  }

  issuePairingUrl(label?: string): string {
    const info = this.requireInfo();
    const issued = this.auth.issuePairingCredential({
      ...(label ? { label } : {}),
    });
    return this.mintPairingUrl(info.httpBaseUrl, issued.credential);
  }

  private mintPairingUrl(httpBaseUrl: string, credential: string): string {
    const pairingAppUrl = this.options.pairingAppUrl ?? this.options.devMobileAppUrl;
    return buildPairingUrl({
      httpBaseUrl,
      credential,
      ...(pairingAppUrl ? { pairingAppUrl } : {}),
    });
  }

  private requireOption<
    K extends
      | "browser"
      | "portForward"
      | "portProxy"
      | "pushRegistrations"
      | "settings"
      | "schedules",
  >(key: K, code: string, message: string): NonNullable<RemoteAccessServerOptions[K]> {
    const value = this.options[key];
    if (!value) {
      throw new RemoteHttpError(code, message, 503);
    }
    return value as NonNullable<RemoteAccessServerOptions[K]>;
  }

  private requireBrowserGateway(): RemoteBrowserGateway {
    return this.requireOption(
      "browser",
      "browser_unavailable",
      "The desktop browser is not available.",
    );
  }

  private requirePortForwardGateway(): RemotePortForwardGateway {
    return this.requireOption(
      "portForward",
      "ports_unavailable",
      "Port forwarding is not available on this desktop.",
    );
  }

  private requirePortProxy(): PortProxy {
    return this.requireOption(
      "portProxy",
      "ports_unavailable",
      "Port forwarding is not available on this desktop.",
    );
  }

  private requirePushRegistrations(): NonNullable<RemoteAccessServerOptions["pushRegistrations"]> {
    return this.requireOption(
      "pushRegistrations",
      "push_unavailable",
      "Push notifications are not available on this desktop.",
    );
  }

  private requireSettingsGateway(): NonNullable<RemoteAccessServerOptions["settings"]> {
    return this.requireOption(
      "settings",
      "settings_unavailable",
      "Desktop settings are not available.",
    );
  }

  private requireSchedulesGateway(): NonNullable<RemoteAccessServerOptions["schedules"]> {
    return this.requireOption(
      "schedules",
      "schedules_unavailable",
      "Scheduled tasks are not available on this desktop.",
    );
  }

  private broadcast(message: RemoteWebSocketServerMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients.keys()) {
      this.sendRaw(client, data);
    }
  }

  private send(ws: WebSocket, message: RemoteWebSocketServerMessage): void {
    this.sendRaw(ws, JSON.stringify(message));
  }

  private sendRaw(ws: WebSocket, data: string): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;
    const maxBuffered =
      this.options.maxWebSocketOutboundBufferBytes ?? DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES;
    if (ws.bufferedAmount + Buffer.byteLength(data, "utf8") > maxBuffered) {
      this.dropWebSocketClient(ws);
      return false;
    }
    try {
      ws.send(data);
      return true;
    } catch {
      this.dropWebSocketClient(ws);
      return false;
    }
  }

  private dropWebSocketClient(ws: WebSocket): void {
    this.clients.delete(ws);
    this.clientLiveness.delete(ws);
    this.terminalWatches.delete(ws);
    try {
      ws.terminate();
    } catch {
      // ignore
    }
  }

  /**
   * Advertised HTTP base URL (trailing slash). A full `advertisedBaseUrl`
   * (Tailscale HTTPS / custom public origin) wins over the bind host+port; its
   * origin is used verbatim so the reverse proxy's own port (443) is advertised
   * rather than the local listen port.
   */
  private resolveHttpBaseUrl(listenPort: number): string {
    const advertisedBaseUrl = this.options.advertisedBaseUrl?.trim();
    if (advertisedBaseUrl) {
      try {
        return `${new URL(advertisedBaseUrl).origin}/`;
      } catch {
        // Fall through to the host/port form on a malformed advertised URL.
      }
    }
    const bindHost = this.options.host;
    const host =
      this.options.advertisedHost?.trim() ||
      (bindHost === "0.0.0.0" || bindHost === "::" ? "127.0.0.1" : bindHost);
    return `http://${normalizeHostForUrl(host)}:${listenPort}/`;
  }

  private requireInfo(): RemoteAccessServerInfo {
    if (!this.info) {
      throw new Error("Remote access server has not started.");
    }
    return this.info;
  }
}
