import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import {
  toWebSocketUrl,
  type RemoteAccessScope,
  type RemoteGitSummaries,
  type RemoteAccessSessionSummary,
  type RemoteAccessTokenResult,
  type RemoteClientMetadata,
  type RemoteHostMode,
  type RemotePushRegistration,
  type RemoteSettings,
  type RemoteSettingsPatch,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import type { GitStateInterest, GitStateSnapshot } from "@/shared/gitState";
import type {
  McpLaunchSnapshot,
  Project,
  PrWatch,
  PrWatchInput,
  RemoteThreadCommand,
  ScheduledTask,
  ScheduledTaskInput,
} from "@/shared/contracts";
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
  REMOTE_PER_MESSAGE_DEFLATE,
  WebSocketHeartbeat,
} from "./server/wsConnections";
import { handleHttp } from "./server/httpRouter";
import { persistSupervisorEvent } from "./server/runtimePersistence";
import { projectGitStatePatchForInterests } from "./server/gitStateProjection";
import { filterEventForItemInterests } from "./server/itemInterestFilter";
import {
  capBroadcastEvent,
  DEFAULT_EVENT_BUFFER_MAX_BYTES,
  maxBroadcastEventBytes,
  trimEventBuffer,
} from "./server/eventSizeGuard";

const EVENT_BUFFER_LIMIT = 500;
const EVENT_BUFFER_MAX_BYTES = DEFAULT_EVENT_BUFFER_MAX_BYTES;
const DEFAULT_LISTEN_RETRY_ATTEMPTS = 5;
const DEFAULT_LISTEN_RETRY_DELAY_MS = 500;

export interface RemoteAccessServerInfo {
  readonly httpBaseUrl: string;
  readonly localHttpBaseUrl: string;
  readonly tailscaleHttpBaseUrl?: string;
  readonly wsBaseUrl: string;
  readonly pairingUrl: string;
  /** ISO expiry of the credential carried by `pairingUrl`. */
  readonly pairingExpiresAt: string;
}

export interface RemoteAccessServerOptions {
  readonly appVersion: string;
  /** Adapter hosting this shared server core. Defaults to the Electron desktop. */
  readonly hostMode?: RemoteHostMode;
  readonly identity: RemoteAccessIdentity;
  /**
   * Whether the hosting process is running in development mode. Loopback PWA
   * origins are trusted in every mode so a localhost development client can
   * connect to any packaged or headless Poracode app.
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
  /** Tailscale HTTPS origin exposed alongside the LAN origin in pairing UI. */
  readonly tailscaleHttpBaseUrl?: string;
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
  /** Same-port retries absorb brief listener overlap during app relaunches. */
  readonly listenRetryAttempts?: number;
  readonly listenRetryDelayMs?: number;
  readonly authStore?: RemoteAuthStore;
  /**
   * Whether this server owns supervisor-event persistence. Headless servers do;
   * desktop servers opt out because desktop main persists before broadcasting.
   */
  readonly ownsSupervisorPersistence?: boolean;
  /**
   * Notified when an event could not be shrunk enough to ride the live stream
   * and clients were told to resync instead. Diagnostics only — the transport
   * self-heals either way.
   */
  readonly onOversizedEventDropped?: (info: { type: string; bytes: number }) => void;
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
  /** Resolve authoritative MCP settings for a remotely launched persisted thread. */
  resolveMcpLaunchSnapshot?(projectId: string): McpLaunchSnapshot;
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
   * Remote-editable desktop settings (AI helpers, agent/model configuration,
   * and persistent composer MCP enablement). `update` merges a patch into the
   * settings file and notifies the desktop renderer; both return the
   * remote-editable subset only — never the full settings file.
   */
  readonly settings?: {
    read(): RemoteSettings;
    update(patch: RemoteSettingsPatch): RemoteSettings;
  };
  /** Persists an attachment uploaded by an authenticated remote composer. */
  readonly attachments?: {
    save(input: { threadId: string; fileName: string; data: Uint8Array }): string;
  };
  readonly schedules?: {
    list(): ScheduledTask[];
    create(task: ScheduledTaskInput): ScheduledTask;
    update(id: string, task: ScheduledTaskInput): ScheduledTask;
    delete(id: string): void;
    runNow(id: string): ScheduledTask;
  };
  /** Persistent PR automation owned by the host process. */
  readonly prWatches?: {
    get(projectId: string, prNumber: number): PrWatch | null;
    requestCheck(projectId: string, prNumber: number): void;
    upsert(input: PrWatchInput): PrWatch;
    delete(projectId: string, prNumber: number): void;
  };
  /** Latest per-thread git/PR summaries published by the desktop renderer. */
  gitSummaries?(): RemoteGitSummaries;
  /** Canonical Git/PR read model owned by the host process. */
  readonly gitState?: {
    getSnapshot(): GitStateSnapshot;
    setInterests(ownerId: string, interests: readonly GitStateInterest[]): void;
    clearInterests(ownerId: string): void;
    refreshTarget(input: {
      projectId: string;
      worktreePath?: string | undefined;
      branch?: string | undefined;
      includePrDetails?: boolean | undefined;
    }): Promise<void>;
    refreshPullRequestReviewBundle(input: {
      projectId: string;
      prNumber: number;
      branch?: string | undefined;
    }): Promise<void>;
    refreshProjectPullRequests(projectId: string): Promise<void>;
  };
  /**
   * Push-notification registration sink. The server stays pure — the store and
   * `PushCoordinator` live in the wiring layer (`main.ts` / headless host) and
   * are injected here. Absent on hosts that don't support push (returns 503).
   */
  readonly pushRegistrations?: {
    webPublicKey(): Promise<string>;
    upsert(registration: RemotePushRegistration): void;
    remove(deviceId: string): void;
  };
  /** Notifies the desktop shell after the active pairing code rotates. */
  readonly onPairingChanged?: () => void;
  /** Keeps a live desktop renderer in sync with project mutations made over HTTP. */
  readonly onProjectsChanged?: (projects: readonly Project[]) => void;
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
  "remote-git-state",
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
  /** Per-connection Git interests, so PR bodies only reach clients that asked. */
  private readonly gitStateInterests = new Map<WebSocket, readonly GitStateInterest[]>();
  /** Per-connection transcript-content scoping; absent = receives everything. */
  private readonly itemInterests = new Map<WebSocket, ReadonlySet<string>>();
  private readonly eventBuffer: BufferedSupervisorEvent[] = [];
  private readonly context: RemoteServerContext;
  private seq = 0;
  private info: RemoteAccessServerInfo | null = null;
  private activePairingCredential: string | null = null;
  private stopping = false;

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
      perMessageDeflate: REMOTE_PER_MESSAGE_DEFLATE,
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
      gitStateInterests: this.gitStateInterests,
      itemInterests: this.itemInterests,
      eventBuffer: this.eventBuffer,
      get seq() {
        return server.seq;
      },
      exchangePairingCredential: (input) => this.exchangePairingCredential(input),
      requireInfo: () => this.requireInfo(),
      requireSettingsGateway: () => this.requireSettingsGateway(),
      requireSchedulesGateway: () => this.requireSchedulesGateway(),
      requirePrWatchesGateway: () => this.requirePrWatchesGateway(),
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
    if (this.stopping) throw new Error("Remote access server is stopping.");

    const maxAttempts = this.options.listenRetryAttempts ?? DEFAULT_LISTEN_RETRY_ATTEMPTS;
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.listenOnce();
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EADDRINUSE" || attempt >= maxAttempts || this.stopping) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, this.options.listenRetryDelayMs ?? DEFAULT_LISTEN_RETRY_DELAY_MS),
        );
      }
    }

    if (this.stopping) throw new Error("Remote access server is stopping.");

    const address = this.server.address() as AddressInfo;
    const localHttpBaseUrl = this.resolveLocalHttpBaseUrl(address.port);
    const httpBaseUrl = this.resolveHttpBaseUrl(address.port);
    const pairingCredential = this.auth.issuePairingCredential({
      label: "Startup pairing",
    });
    this.activePairingCredential = pairingCredential.credential;

    this.info = {
      httpBaseUrl,
      localHttpBaseUrl,
      ...(this.options.tailscaleHttpBaseUrl
        ? { tailscaleHttpBaseUrl: new URL(this.options.tailscaleHttpBaseUrl).origin }
        : {}),
      wsBaseUrl: toWebSocketUrl(httpBaseUrl).toString(),
      pairingUrl: this.mintPairingUrl(httpBaseUrl, pairingCredential.credential),
      pairingExpiresAt: pairingCredential.expiresAt,
    };
    this.heartbeat.start();
    return this.info;
  }

  private listenOnce(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
  }

  /**
   * Stops the server. Resolves once the HTTP server has actually closed so a
   * caller (e.g. the headless host) can safely tear down the database afterward
   * without crashing an in-flight request. Idle keep-alive sockets are dropped
   * immediately; active requests are given a short grace period to finish.
   */
  async dispose(): Promise<void> {
    this.stopping = true;
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
    this.activePairingCredential = null;
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
    if (this.options.ownsSupervisorPersistence !== false) {
      persistSupervisorEvent(event);
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
    // An event larger than the per-event budget would make `sendRaw` terminate
    // every connected client, and would do it again on replay after they
    // reconnect. Withhold its largest payload fields so the live stream stays
    // deliverable; the full payload was persisted above and reaches clients on
    // the next HTTP history fetch.
    const capped = capBroadcastEvent(
      event,
      maxBroadcastEventBytes(
        this.options.maxWebSocketOutboundBufferBytes ?? DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES,
      ),
    );
    if (capped.kind === "undeliverable") {
      // Nothing about this event can ride the socket. `seq` has still advanced,
      // so leaving it out of the replay buffer makes both currently-connected
      // and later-reconnecting clients converge on the same self-healing path:
      // refetch authoritative state over HTTP.
      this.options.onOversizedEventDropped?.({ type: event.type, bytes: capped.bytes });
      this.broadcast({
        type: "resync-required",
        seq,
        reason: "Event too large for the live stream; request a fresh snapshot.",
      });
      return;
    }
    this.eventBuffer.push({ seq, event: capped.event, bytes: capped.bytes });
    trimEventBuffer(this.eventBuffer, EVENT_BUFFER_LIMIT, EVENT_BUFFER_MAX_BYTES);
    // Some events are tailored per connection: pull-request bodies go only to the
    // client reviewing that PR, and transcript content only to clients watching
    // that thread. Every client still receives an event for every seq — only the
    // content differs — which keeps the replay contiguity check valid.
    if (this.needsPerClientScoping(capped.event)) {
      for (const client of this.clients.keys()) {
        const scoped = this.scopeEventForClient(capped.event, client);
        this.sendRaw(
          client,
          scoped === capped.event
            ? `{"type":"event","seq":${seq},"event":${capped.json}}`
            : JSON.stringify({ type: "event", seq, event: scoped }),
        );
      }
      return;
    }
    // The wrapper is assembled by concatenation so a multi-megabyte event body
    // is serialized exactly once per publish rather than once here and again in
    // `broadcast`.
    this.broadcastRaw(`{"type":"event","seq":${seq},"event":${capped.json}}`);
  }

  /** True for event types whose content varies per connection. */
  private needsPerClientScoping(event: RemoteBroadcastEvent): boolean {
    return (
      event.type === "remote-git-state" ||
      event.type === "thread-runtime-event" ||
      event.type === "thread-runtime-events" ||
      event.type === "thread-runtime-events-multi"
    );
  }

  /** Applies every per-connection projection for `client`. */
  private scopeEventForClient(
    event: RemoteBroadcastEvent,
    client: WebSocket,
  ): RemoteBroadcastEvent {
    if (event.type === "remote-git-state") return this.scopeGitStateEvent(event, client);
    return filterEventForItemInterests(event, this.itemInterests.get(client) ?? null);
  }

  /** Narrows a git-state patch to what `client` declared an interest in. */
  private scopeGitStateEvent(
    event: Extract<RemoteBroadcastEvent, { type: "remote-git-state" }>,
    client: WebSocket,
  ): RemoteBroadcastEvent {
    const interests = this.gitStateInterests.get(client) ?? [];
    const patch = projectGitStatePatchForInterests(event.patch, interests);
    return patch === event.patch ? event : { ...event, patch };
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
    if (this.activePairingCredential) {
      this.auth.revokePairingCredential(this.activePairingCredential);
    }
    const issued = this.auth.issuePairingCredential({
      ...(label ? { label } : {}),
    });
    this.activePairingCredential = issued.credential;
    const pairingUrl = this.mintPairingUrl(info.httpBaseUrl, issued.credential);
    this.info = { ...info, pairingUrl, pairingExpiresAt: issued.expiresAt };
    this.notifyPairingChanged();
    return pairingUrl;
  }

  private exchangePairingCredential(input: {
    readonly credential: string;
    readonly scopes?: readonly RemoteAccessScope[];
    readonly client?: RemoteClientMetadata;
  }): RemoteAccessTokenResult {
    const result = this.auth.exchangePairingCredential(input);
    this.issuePairingUrl("Automatic pairing");
    return result;
  }

  private notifyPairingChanged(): void {
    try {
      this.options.onPairingChanged?.();
    } catch (error) {
      console.warn("[poracode] failed to notify desktop after pairing code rotation:", error);
    }
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
      | "schedules"
      | "prWatches",
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

  private requirePrWatchesGateway(): NonNullable<RemoteAccessServerOptions["prWatches"]> {
    return this.requireOption(
      "prWatches",
      "pr_watches_unavailable",
      "PR automation is not available on this desktop.",
    );
  }

  private broadcast(message: RemoteWebSocketServerMessage): void {
    this.broadcastRaw(JSON.stringify(message));
  }

  /** Fans an already-serialized message out to every client. Lets the caller
   * serialize a large body once instead of per send. */
  private broadcastRaw(data: string): void {
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
    return `${this.resolveLocalHttpBaseUrl(listenPort)}/`;
  }

  private resolveLocalHttpBaseUrl(listenPort: number): string {
    const bindHost = this.options.host;
    const host =
      this.options.advertisedHost?.trim() ||
      (bindHost === "0.0.0.0" || bindHost === "::" ? "127.0.0.1" : bindHost);
    return `http://${normalizeHostForUrl(host)}:${listenPort}`;
  }

  private requireInfo(): RemoteAccessServerInfo {
    if (!this.info) {
      throw new Error("Remote access server has not started.");
    }
    return this.info;
  }
}
