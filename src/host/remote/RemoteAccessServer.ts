import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import {
  type RemoteAccessScopePreset,
  type RemoteAccessSessionSummary,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import type { GitStateInterest } from "@/shared/gitState";
import { TerminalBaselineStreamScheduler } from "./server/terminalBaselineStream";
import type { BackgroundTask, Project } from "@/shared/contracts";
import { RemoteAuthStore, RemoteHttpError, type AuthenticatedRemoteSession } from "./auth";
import type { EnvironmentProxyGatewayLike } from "./environments/types";
import { loadRemoteAccessTlsMaterial } from "./server/tlsMaterial";
import {
  FORWARD_ORIGIN_UNAVAILABLE,
  type ForwardOriginAvailability,
  type ForwardOriginIdentity,
} from "./portForward/forwardOriginIdentity";
import { ForwardOriginPolicy } from "./portForward/forwardOrigin";
import { imageTickets } from "./server/imageTickets";
import {
  handleRemoteAccessHttpRequest,
  handleRemoteAccessUpgrade,
} from "./server/forwardOriginDispatch";
import { RemoteServerSecurity } from "./server/security";
import type { RemoteAuditEvent } from "./server/auditLog";
import type {
  BufferedSupervisorEvent,
  RemoteBroadcastEvent,
  RemoteServerContext,
} from "./server/context";
import {
  DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES,
  REMOTE_PER_MESSAGE_DEFLATE,
  WebSocketHeartbeat,
  rejectUpgrade,
} from "./server/wsConnections";
import { TerminalCursorSyncRegistry } from "./server/terminalCursorSync";
import { registerDesktopInternalStreamHost } from "./server/desktopInternalStream";
import { writeError } from "./server/httpResponses";
import {
  PrincipalAdmissionController,
  resolvePrincipalAdmissionLimits,
} from "./server/principalAdmission";
import { LegacyBulkReadAdmission } from "./server/legacyBulkReadAdmission";
import {
  type IngressRequestClassification,
  type IngressWorkClass,
  type RemoteAccessServerHost,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
  requireBrowserGateway,
  requirePortForwardGateway,
  requirePortProxy,
  requirePrWatchesGateway,
  requirePushRegistrations,
  requireRemoteAccessInfo,
  requireSchedulesGateway,
  requireSettingsGateway,
} from "./remoteAccessServerTypes";
import {
  classifyIngressRequest,
  resolveIngressAdmissionLimits,
  runIngressWork,
} from "./remoteAccessServerIngress";
import {
  attachDesktopInternalClient,
  broadcastResyncRequired,
  detachDesktopInternalClient,
  notifyEventInterestsChanged,
  publishCatalogChanged,
  publishCatalogChangedRows,
  publishSupervisorEvent as publishSupervisorEventOnHost,
  publishThreadsChanged,
  scopeEventForClient,
  waitForSupervisorEvent,
} from "./remoteAccessServerEvents";
import {
  exchangePairingCredential,
  issueIndependentPairingUrl,
  issuePairingUrl,
  mintLoopbackRendererCredential,
  recordAudit,
} from "./remoteAccessServerPairing";
import {
  createRemoteAccessHttpServer,
  finishDispose,
  startListening,
} from "./remoteAccessServerListen";
import { dropWebSocketClient, send, sendControlFrame, sendRaw } from "./remoteAccessServerWs";
import { OUTBOUND_RECONCILE_SLACK_BYTES } from "./server/outboundBudget";

export type { RemoteAccessServerInfo, RemoteAccessServerOptions } from "./remoteAccessServerTypes";

/**
 * Event `type`s a remote client actually consumes, so only these are buffered
 * on the replayable stream and broadcast. Chatty supervisor events no remote
 * client reads (`lsp-message`, `git-changed`, `project-tree-changed`,
 * `provider-usage*`, `agent-detected`, `thread-osc-*`) waste client bandwidth
 * and churn the bounded replay buffer (causing spurious resync-required), so we
 * drop them here.
 *
 * Derived from the remote client consumers (kept in sync with them):
 * - `src/renderer/state/remote/sync.ts` `dispatchRemoteSupervisorEvent`: the
 *   `thread-runtime-event(s)[-multi]` pre-pass (live chat content), the
 *   `remote-git-summaries` out-of-band handler, and the switch cases
 *   (`thread-state`, `thread-pending-steer`, `thread-follow-up-queue`,
 *   `thread-reset`, `thread-exited`,
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
  "thread-follow-up-queue",
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
  "remote-user-notification",
]);

/**
 * Desktop-only supervisor event families (V5 plan 2.5): the `SupervisorEvent`
 * types no external client consumes, which `REMOTELY_CONSUMED_EVENT_TYPES`
 * therefore withholds from the shared replayable stream. Desktop-internal
 * loopback sessions (the co-located desktop renderer) receive them on a second
 * replayable `desktop-event` sequence so the unified loopback path keeps every
 * desktop feature; external and native clients NEVER observe these types — the
 * frames are gated on a loopback-origin upgrade opt-in
 * (`server/wsConnections.ts` + `server/desktopInternalStream.ts`) and the
 * types never enter the shared buffer or its replay.
 *
 * `thread-output` is absent by design on BOTH streams: PTY bytes stay off the
 * replayable event surface entirely and reach opted-in watchers (desktop
 * sessions included) through the `terminal-watch` machinery.
 */
const DESKTOP_INTERNAL_EVENT_TYPES: ReadonlySet<RemoteBroadcastEvent["type"]> = new Set([
  // Crossagent routing and selection telemetry.
  "crossagent-routing-override-changed",
  "crossagent-selection-used",
  // Experiments.
  "experiment-judge-progress",
  // Voice sessions.
  "thread-voice",
  // Terminal scrollback rebuild requests (drives the scrollback resync).
  "thread-scrollback-resync",
  // OSC shell notifications and events.
  "thread-osc-notification",
  "thread-osc-shell",
  // Agent detection churn no remote client reads.
  "agent-detected",
  // Provider usage snapshots.
  "provider-usage",
  "provider-usage-all",
  // Local-only projections.
  "git-changed",
  "project-tree-changed",
  // Language-server traffic.
  "lsp-message",
  "lsp-status",
]);

export class RemoteAccessServer {
  private readonly auth: RemoteAuthStore;
  private readonly tls: {
    readonly cert: string;
    readonly key: string;
    readonly fingerprint: string;
  } | null;
  private readonly server: import("node:http").Server;
  private readonly connections: import("@/shared/httpServerConnections").HttpServerConnections;
  private readonly work = new AsyncWorkTracker();
  private readonly wss: WebSocketServer;
  private readonly security: RemoteServerSecurity;
  private readonly heartbeat: WebSocketHeartbeat;
  private readonly clients = new Map<WebSocket, AuthenticatedRemoteSession>();
  private readonly replayingClients = new Set<WebSocket>();
  private readonly clientLiveness = new Map<WebSocket, boolean>();
  /** Per-connection terminal ids the client opted into live `terminal-output` for. */
  private readonly terminalWatches = new Map<WebSocket, Set<string>>();
  /** Opt-in reliable (cursor-sync) watch state, keyed per connection/terminal. */
  private readonly terminalCursorSync = new TerminalCursorSyncRegistry();
  /** Cursor-sync v2 chunked-baseline delivery scheduler. */
  private readonly terminalBaselineStreams: TerminalBaselineStreamScheduler;
  /** Per-connection Git interests, so PR bodies only reach clients that asked. */
  private readonly gitStateInterests = new Map<WebSocket, readonly GitStateInterest[]>();
  private readonly supervisorEventListeners = new Set<(event: RemoteBroadcastEvent) => void>();
  /** Per-connection transcript-content scoping; absent = receives everything. */
  private readonly itemInterests = new Map<WebSocket, ReadonlySet<string>>();
  /** B1: connections that declared `notices=v1` at upgrade. */
  private readonly noticeCapableClients = new Set<WebSocket>();
  /** Bounded catalog changes: connections that declared `catalogChanges=bounded-v1`. */
  private readonly boundedCatalogChangeClients = new Set<WebSocket>();
  private readonly eventBuffer: BufferedSupervisorEvent[] = [];
  /**
   * Desktop-internal stream state (V5 plan 2.5): a second, bounded replayable
   * buffer carrying ONLY the desktop-only supervisor families, fanned out
   * exclusively to loopback desktop-internal sessions. Its sequence is fully
   * independent of the shared `seq`, so external clients' contiguity contract
   * never observes a desktop-only type.
   */
  private desktopSeq = 0;
  private readonly desktopEventBuffer: BufferedSupervisorEvent[] = [];
  private readonly desktopInternalClients = new Set<WebSocket>();
  private readonly desktopReplayingClients = new Set<WebSocket>();
  private readonly backgroundTasksByThread = new Map<string, readonly BackgroundTask[]>();
  private readonly context: RemoteServerContext;
  private readonly maxConcurrentIngressWork: number;
  private readonly maxConcurrentIngressWorkPerSource: number;
  private readonly maxConcurrentIngressWorkPerAddress: number;
  private readonly reservedIngressControlCapacity: number;
  private readonly reservedIngressControlCapacityPerSource: number;
  /** B3 post-authentication principal/session budgets. */
  private readonly principalAdmission: PrincipalAdmissionController;
  /** B4 explicit admission for undeclared unbounded legacy reads. */
  private readonly legacyBulkReadAdmission = new LegacyBulkReadAdmission();
  /** C1 parent proxy gateway, resolved from the options factory with this
   * server's OWN principal admission controller (one shared budget owner). */
  private readonly environmentProxy: EnvironmentProxyGatewayLike | null;
  private readonly ingressWorkBySource = new WeakMap<object, number>();
  private readonly ingressWorkByAddress = new Map<string, number>();
  /** Parsed forward-origin policies for child-authority classification. */
  private readonly ingressPolicyCache = new WeakMap<ForwardOriginIdentity, ForwardOriginPolicy>();
  private ingressWorkCount = 0;
  private seq = 0;
  private info: RemoteAccessServerInfo | null = null;
  private activePairingCredential: string | null = null;
  private stopping = false;
  private readonly listenCancellation = new AbortController();
  private starting: Promise<RemoteAccessServerInfo> | undefined;
  private closing: Promise<void> | undefined;

  constructor(private readonly options: RemoteAccessServerOptions) {
    const limits = resolveIngressAdmissionLimits(options);
    this.maxConcurrentIngressWork = limits.maxConcurrentIngressWork;
    this.maxConcurrentIngressWorkPerSource = limits.maxConcurrentIngressWorkPerSource;
    this.maxConcurrentIngressWorkPerAddress = limits.maxConcurrentIngressWorkPerAddress;
    this.reservedIngressControlCapacity = limits.reservedIngressControlCapacity;
    this.reservedIngressControlCapacityPerSource = limits.reservedIngressControlCapacityPerSource;
    this.principalAdmission = new PrincipalAdmissionController(
      resolvePrincipalAdmissionLimits(options),
      // B3 immediate outbound pressure: over-budget sockets are terminated
      // through the same teardown path as any other slow peer. Termination does
      // not free their accounting — retained transport bytes stay reserved
      // until the send callbacks or the socket close release them.
      { evictSocket: (ws) => dropWebSocketClient(this.asHost(), ws) },
    );
    this.environmentProxy =
      options.environmentProxy?.({ principalAdmission: this.principalAdmission }) ?? null;
    this.auth = options.authStore ?? new RemoteAuthStore();
    // Gate 6 item 4.2 (TLS): material comes from the option when the
    // composition supplies it, otherwise from the environment. A partial or
    // unloadable env configuration throws here (startup failure), never
    // silently downgrades to plaintext.
    this.tls =
      options.tls === undefined
        ? loadRemoteAccessTlsMaterial()
        : options.tls === null
          ? null
          : options.tls;
    this.security = new RemoteServerSecurity({
      getHttpBaseUrl: () => this.info?.httpBaseUrl,
      getLocalHttpBaseUrl: () => this.info?.localHttpBaseUrl,
      options,
      auth: this.auth,
    });
    this.terminalBaselineStreams = new TerminalBaselineStreamScheduler({
      isCurrent: (ws, terminalId, watchId, epoch) =>
        this.terminalCursorSync.isCurrent(ws, terminalId, watchId, epoch),
      // B3: baseline chunks ride the same immediate outbound budget and
      // per-socket cap as every other frame. The scheduler's own credit window
      // already keeps them well below both, so this only closes the accounting
      // hole; a chunk that no longer fits terminates the slow peer exactly like
      // any other over-budget frame.
      sendRaw: (ws, data) => sendRaw(this.asHost(), ws, data),
      // B3: the retained-baseline reservation is released at the exact point
      // the stream leaves the scheduler (completed, replaced, or closed).
      onStreamRemoved: (ws, spec) => {
        this.principalAdmission.releaseBaseline(ws, spec.watchId, spec.epoch);
      },
    });
    this.wss = new WebSocketServer({
      noServer: true,
      // B3: ws's built-in auto-pong answers a received ping from inside the
      // receiver, before the application `ping` event and completely outside
      // `sendRaw`'s per-socket cap and aggregate reservation. A valid peer
      // that stops reading could then grow the transport queue with protocol
      // pongs while sending zero application bytes. The connection's own
      // `ping` handler (server/wsConnections.ts) replies through
      // `sendControlFrame`, so protocol frames are admitted, charged, and
      // released exactly like data frames.
      autoPong: false,
      maxPayload: options.maxWebSocketPayloadBytes ?? DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES,
      perMessageDeflate: REMOTE_PER_MESSAGE_DEFLATE,
    });
    this.heartbeat = new WebSocketHeartbeat({
      intervalMs: options.webSocketHeartbeatIntervalMs,
      clients: this.clients,
      clientLiveness: this.clientLiveness,
      // B3: the liveness ping rides the same budgeted control-frame path as
      // every other outbound frame; a peer whose ping cannot be admitted is
      // terminated like any over-budget recipient.
      sendPing: (ws) => {
        sendControlFrame(this.asHost(), ws, "ping");
      },
      // B3: aggregate budgets are enforced on every send, so the sweep is a
      // ground-truth audit only — it evicts a socket whose real transport
      // queue exceeds its accounted bytes by more than the audit allowance,
      // never a healthy peer, and it releases an evicted account only once its
      // transport retains nothing. After the autoPong fix, pings and pongs are
      // reserved like data frames; the allowance covers only frames the engine
      // cannot intercept before the transport queues them — ws-internal close
      // frames, at most one engine close frame plus one reply per socket, each
      // ≤ 127 framed bytes. It is an audit tolerance for that tiny finite
      // residue, not an admission bound for protocol traffic.
      onSweep: () => this.principalAdmission.reconcileOutboundBytes(OUTBOUND_RECONCILE_SLACK_BYTES),
    });
    this.context = this.buildContext();
    // Forward child-origin dispatch runs in front of the app's own HTTP/WS
    // routing: a recognized child origin (or any authority inside the
    // configured forward namespace) is proxied or bounded-errored there and
    // NEVER falls through to Poracode API/PWA handlers.
    const requestHandler = (req: IncomingMessage, res: import("node:http").ServerResponse) => {
      const classification = this.classifyIngressRequest(req);
      void this.runIngressWork(
        () => handleRemoteAccessHttpRequest(this.context, req, res, classification),
        req.socket,
        classification.workClass,
        classification.clientAddress,
      ).catch((error: unknown) => {
        if (!res.destroyed && !res.writableEnded) {
          if (res.headersSent) res.destroy();
          else writeError(res, error);
        }
      });
    };
    const created = createRemoteAccessHttpServer(this.tls, requestHandler, (req, socket, head) => {
      if (this.stopping) {
        rejectUpgrade(socket, 503, "Service Unavailable");
        return;
      }
      // Upgrades stay bulk: the control class is the stop/approval POST
      // routes, which need only HTTP. The upgrade handshake is cheap and the
      // established socket never holds an ingress slot. The resolved address
      // keys the pre-auth fairness bound (never identity).
      const clientAddress = this.security.resolveClientAddress(req);
      void this.runIngressWork(
        () => handleRemoteAccessUpgrade(this.context, req, socket, head),
        socket,
        "bulk",
        clientAddress,
      ).catch(() => socket.destroy());
    });
    this.server = created.server;
    this.connections = created.connections;
  }

  private asHost(): RemoteAccessServerHost {
    return this as unknown as RemoteAccessServerHost;
  }

  private buildContext(): RemoteServerContext {
    const server = this;
    const context: RemoteServerContext = {
      options: this.options,
      auth: this.auth,
      wss: this.wss,
      security: this.security,
      principalAdmission: this.principalAdmission,
      legacyBulkReadAdmission: this.legacyBulkReadAdmission,
      clients: this.clients,
      replayingClients: this.replayingClients,
      clientLiveness: this.clientLiveness,
      terminalWatches: this.terminalWatches,
      terminalCursorSync: this.terminalCursorSync,
      terminalBaselineStreams: this.terminalBaselineStreams,
      gitStateInterests: this.gitStateInterests,
      itemInterests: this.itemInterests,
      noticeCapableClients: this.noticeCapableClients,
      boundedCatalogChangeClients: this.boundedCatalogChangeClients,
      eventBuffer: this.eventBuffer,
      backgroundTasksByThread: this.backgroundTasksByThread,
      get seq() {
        return server.seq;
      },
      get stopping() {
        return server.stopping;
      },
      exchangePairingCredential: (input) => exchangePairingCredential(this.asHost(), input),
      requireInfo: () => requireRemoteAccessInfo(this.asHost()),
      requireSettingsGateway: () => requireSettingsGateway(this.options),
      requireSchedulesGateway: () => requireSchedulesGateway(this.options),
      requirePrWatchesGateway: () => requirePrWatchesGateway(this.options),
      requireBrowserGateway: () => requireBrowserGateway(this.options),
      requirePortForwardGateway: () => requirePortForwardGateway(this.options),
      requirePortProxy: () => requirePortProxy(this.options),
      environmentProxy: this.environmentProxy,
      requireEnvironmentProxyGateway: () => {
        if (!this.environmentProxy) {
          throw new RemoteHttpError(
            "environment_proxy_unavailable",
            "Server-owned environments are not available on this host.",
            503,
          );
        }
        return this.environmentProxy;
      },
      requirePushRegistrations: () => requirePushRegistrations(this.options),
      publishSupervisorEvent: (event) => this.publishSupervisorEvent(event),
      publishThreadsChanged: (threadIds) => publishThreadsChanged(this.asHost(), threadIds),
      publishCatalogChanged: () => publishCatalogChanged(this.asHost()),
      scopeEventForClient: (event, client) => scopeEventForClient(this.asHost(), event, client),
      send: (ws, message) => this.send(ws, message),
      sendRaw: (ws, data, onSent) => this.sendRaw(ws, data, onSent),
      notifyEventInterestsChanged: () => this.notifyEventInterestsChanged(),
      runIngressWork: (operation, source) => this.runIngressWork(operation, source),
      waitForSupervisorEvent: (match, timeoutMs) =>
        waitForSupervisorEvent(this.asHost(), match, timeoutMs),
    };
    registerDesktopInternalStreamHost(context, {
      attachClient: (ws, lastDesktopSeq) =>
        attachDesktopInternalClient(this.asHost(), ws, lastDesktopSeq),
      detachClient: (ws) => this.detachDesktopInternalClient(ws),
    });
    return context;
  }

  private detachDesktopInternalClient(ws: WebSocket): void {
    detachDesktopInternalClient(this.asHost(), ws);
  }

  private runIngressWork<T>(
    operation: () => T | PromiseLike<T>,
    source?: object,
    workClass: IngressWorkClass = "bulk",
    clientAddress?: string,
  ): Promise<T> {
    // B3: WebSocket-initiated continuations (terminal watch setup, browser
    // input) count against the connection's principal budget too. The lease is
    // released when the admitted work settles, not when the socket closes.
    const session = source instanceof WebSocket ? this.clients.get(source) : undefined;
    if (!session) {
      return runIngressWork(this.asHost(), operation, source, workClass, clientAddress);
    }
    let lease;
    try {
      lease = this.principalAdmission.tryAdmitWork(session.sessionId, workClass);
    } catch (error) {
      // Callers attach `.catch`; a synchronous throw here would bypass the
      // correlated watch-result path and look like a silent drop.
      return Promise.reject(error);
    }
    return runIngressWork(this.asHost(), operation, source, workClass, clientAddress).finally(
      () => {
        lease.release();
      },
    );
  }

  private classifyIngressRequest(req: IncomingMessage): IngressRequestClassification {
    return classifyIngressRequest(this.asHost(), req, this.security.resolveClientAddress(req));
  }

  private notifyEventInterestsChanged(): void | Promise<void> {
    return notifyEventInterestsChanged(this.asHost());
  }

  start(): Promise<RemoteAccessServerInfo> {
    if (this.stopping) return Promise.reject(new Error("Remote access server is stopping."));
    if (this.info) return Promise.resolve(this.info);
    if (this.starting) return this.starting;
    const starting = startListening(this.asHost());
    this.starting = starting;
    void starting.catch(() => {
      if (!this.stopping && this.starting === starting) this.starting = undefined;
    });
    return starting;
  }

  /**
   * Closes admission, then joins listener startup, transports and actual owned
   * continuations. A disconnected client or a transport deadline is never
   * evidence that a handler can no longer write to the database.
   */
  dispose(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopping = true;
    this.listenCancellation.abort();
    this.closing = Promise.resolve().then(async () => {
      // The server owns the gateway created by its factory. Cancel its live
      // upstream legs and keepalive pools before joining the transport/work
      // drain; a composition must never need an out-of-band proxy teardown.
      try {
        this.environmentProxy?.dispose();
      } finally {
        await finishDispose(this.asHost());
      }
    });
    return this.closing;
  }

  getInfo(): RemoteAccessServerInfo | null {
    return this.info;
  }

  /**
   * Availability facts for the versioned browser-forward capability descriptor
   * (the protocol/codegen integration is coordinator-owned; this is the host
   * hook). `available` distinguishes isolated browser-origin forwarding from
   * raw TCP forwarding, which stays available regardless.
   */
  forwardOriginAvailability(): ForwardOriginAvailability {
    return this.options.portProxy?.forwardOriginAvailability() ?? FORWARD_ORIGIN_UNAVAILABLE;
  }

  listAccessSessions(): RemoteAccessSessionSummary[] {
    return this.auth.listAccessSessions();
  }

  /** Last-resort sync drain for process-fatal handlers (V6 A.8). */
  flushAuditSync(): void {
    this.options.audit?.flushSync?.();
  }

  revokeAccessSession(sessionId: string): boolean {
    const revoked = this.auth.revokeAccessSession(sessionId);
    if (!revoked) return false;
    this.recordAudit("revoke", { detail: { sessionId } });
    imageTickets.revokeSession(sessionId);
    this.options.portForward?.revokeSessionTickets(sessionId);
    // C1: a revoked parent session closes its environment proxy legs (and its
    // outstanding environment upgrade tickets, dropped by the auth store's
    // revoke path) so the session cannot keep a live child leg.
    this.environmentProxy?.revokeSession(sessionId);
    for (const [client, session] of this.clients) {
      if (session.sessionId === sessionId) {
        client.close(1008, "Remote access session revoked");
      }
    }
    return true;
  }

  private recordAudit(
    kind: RemoteAuditEvent["kind"],
    input: { sessionId?: string; detail?: RemoteAuditEvent["detail"] } = {},
  ): void {
    recordAudit(this.asHost(), kind, input);
  }

  /** Pushes an event onto the replayable WS event stream. Out-of-band desktop
   * events (git summaries) ride the same stream as supervisor events. */
  publishSupervisorEvent(event: RemoteBroadcastEvent): void {
    publishSupervisorEventOnHost(
      this.asHost(),
      event,
      REMOTELY_CONSUMED_EVENT_TYPES,
      DESKTOP_INTERNAL_EVENT_TYPES,
    );
  }

  /**
   * Publishes a bounded thread-membership change. The shared publisher splits
   * the id list into small batched `remote-threads-changed` events (H3), so
   * host-local all-id producers receive the same bound as the housekeeping
   * sweep without a second batching algorithm.
   */
  publishThreadsChanged(threadIds: readonly string[]): void {
    publishThreadsChanged(this.asHost(), threadIds);
  }

  /**
   * Declaration-aware catalog membership publication. With no undeclared
   * connection and no embedding callback, only the bounded signal form is
   * published and the catalog is never read; otherwise the authoritative rows
   * are read once for the legacy full form.
   */
  publishCatalogChanged(): void {
    publishCatalogChanged(this.asHost());
  }

  /**
   * Same declaration-aware publication for a caller that already holds the
   * authoritative rows (host-local writers): no duplicate read, and the wire
   * parse is skipped when nothing consumes the full list.
   */
  publishCatalogChangedRows(projects: readonly Project[]): void {
    publishCatalogChangedRows(this.asHost(), projects);
  }

  /** Drops every cached background-task level. The supervisor process that
   * reported them is gone after a crash-restart; its fresh sessions report
   * their own levels, so stale entries must not shadow the live read. */
  clearBackgroundTaskLevels(): void {
    this.backgroundTasksByThread.clear();
  }

  /**
   * Mints a fresh pairing URL, replacing the displayed QR credential. The
   * grant defaults to the operator preset (Gate 6 item 4.3); hosts offering a
   * read-only device pass `preset: "viewer"`.
   */
  issuePairingUrl(label?: string, options?: { readonly preset?: RemoteAccessScopePreset }): string {
    return issuePairingUrl(this.asHost(), label, options);
  }

  /**
   * One-time local-control grants coexist without replacing the displayed QR.
   * Accepts the same scope presets as {@link issuePairingUrl}.
   */
  issueIndependentPairingUrl(
    label?: string,
    options?: { readonly preset?: RemoteAccessScopePreset },
  ): string {
    return issueIndependentPairingUrl(this.asHost(), label, options);
  }

  /**
   * Mints the co-located managed renderer's local attach credential (V5 plan
   * 2.5 completion): a fresh single-use operator pairing credential whose URL
   * is built on the LOOPBACK endpoint, so the desktop renderer can always
   * attach to its own server without that server being discoverable. Never
   * rotates the displayed QR credential (`activePairingCredential`) and never
   * republishes pairing info — reachable, not advertised. `null` once stopping
   * or before the listener is ready.
   */
  mintLoopbackRendererCredential(): {
    endpoint: string;
    pairingUrl: string;
    expiresAt: string;
  } | null {
    return mintLoopbackRendererCredential(this.asHost());
  }

  /**
   * Asks every connected client to discard incremental state and refetch
   * authoritative data. Used when the supervisor shed bulk traffic in transit
   * (supervisor-output-shed): the events never reached persistence, so no
   * replay can repair them — clients must resync terminal output from the
   * supervisor, which remains the authoritative PTY source.
   */
  broadcastResyncRequired(reason: string): void {
    broadcastResyncRequired(this.asHost(), reason);
  }

  private send(ws: WebSocket, message: RemoteWebSocketServerMessage): void {
    send(this.asHost(), ws, message);
  }

  private sendRaw(ws: WebSocket, data: string, onSent?: (error?: Error) => void): boolean {
    return onSent ? sendRaw(this.asHost(), ws, data, onSent) : sendRaw(this.asHost(), ws, data);
  }

  /**
   * Gate 6 item 4.2: the SHA-256 leaf-certificate fingerprint the pairing QR
   * carries (clients pin it on first pair), or null on the plaintext listener.
   */
  tlsFingerprint(): string | null {
    return this.tls?.fingerprint ?? null;
  }
}
