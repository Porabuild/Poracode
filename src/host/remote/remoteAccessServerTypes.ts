import type { Server } from "node:http";
import type { WebSocket, WebSocketServer } from "ws";
import type { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import type { HttpServerConnections } from "@/shared/httpServerConnections";
import type {
  RemoteGitSummaries,
  RemoteHostMode,
  RemoteHostUpdateStatus,
  RemotePushRegistration,
  RemotePushRegistrationRouting,
  RemoteSettings,
  RemoteSettingsPatch,
} from "@/shared/remote";
import type { GitStateInterest, GitStateSnapshot } from "@/shared/gitState";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import type { TerminalBaselineStreamScheduler } from "./server/terminalBaselineStream";
import type {
  BackgroundTask,
  CheckpointRevertResult,
  McpLaunchSnapshot,
  McpServer,
  Project,
  ProjectLocation,
  PrWatch,
  PrWatchAgentSync,
  PrWatchInput,
  RemoteThreadCommand,
  ScheduledTask,
  ScheduledTaskInput,
  ScheduledTaskRun,
} from "@/shared/contracts";
import type {
  RemoteMcpSettingsCommand,
  RemoteMcpSettingsScope,
} from "@/shared/remote/contract/routeSchemas";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorProcedureName,
} from "@/shared/ipc";
import { RemoteHttpError, type AuthenticatedRemoteSession, type RemoteAuthStore } from "./auth";
import type { RemoteAccessIdentity } from "./identity";
import type { ForwardOriginIdentity } from "./portForward/forwardOriginIdentity";
import type { ForwardOriginPolicy } from "./portForward/forwardOrigin";
import type { PortProxy } from "./portForward/portProxy";
import type { RemoteBrowserGatewayLike } from "./RemoteBrowserGateway";
import type { RemotePortForwardGateway } from "./RemotePortForwardGateway";
import type { RemoteAuditSink } from "./server/auditLog";
import type { BufferedSupervisorEvent, RemoteBroadcastEvent } from "./server/context";
import type { WebSocketHeartbeat } from "./server/wsConnections";
import { DEFAULT_EVENT_BUFFER_MAX_BYTES } from "./server/eventSizeGuard";
import type { TerminalCursorSyncRegistry } from "./server/terminalCursorSync";

// WS5 P1-9: under streaming load the old 500-entry cap was exhausted by small
// content deltas long before the 8 MB byte budget, forcing reconnecting
// clients into full resyncs. The byte budget bounds memory either way, so the
// entry cap only needs to bound worst-case entry counts.
export const EVENT_BUFFER_LIMIT = 4_000;
export const EVENT_BUFFER_MAX_BYTES = DEFAULT_EVENT_BUFFER_MAX_BYTES;
export const DEFAULT_LISTEN_RETRY_ATTEMPTS = 5;
export const DEFAULT_LISTEN_RETRY_DELAY_MS = 500;
export const DEFAULT_MAX_CONCURRENT_INGRESS_WORK = 128;
export const DEFAULT_MAX_CONCURRENT_INGRESS_WORK_PER_SOURCE = 32;
/**
 * Reserved control-priority capacity (Gate 4 fairness): slots of the ingress
 * semaphore bulk traffic can never occupy, so Stop/approval-class requests
 * stay admissible under bulk saturation. Mirrors the desktop path's tested
 * admission classes — `SupervisorClient` admits `interruptThread` /
 * `resolveThreadServerRequest` / `closeThread` ahead of serialized thread
 * mutations "so a long-running mutation can still be interrupted". The
 * reservation bounds total capacity; it never reorders already-admitted work.
 */
export const DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY = 16;
export const DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY_PER_SOURCE = 4;

/**
 * HTTP classes for {@link RemoteAccessServer.runIngressWork}. `control` is the
 * narrow stop/answer-an-active-session surface: POSTs to `/api/threads/<id>`
 * routes dispatching to the same supervisor procedures the desktop path
 * treats as control (`interruptThread`, `closeThread` — including the
 * shell-aware `/terminal/close` — and `resolveThreadServerRequest`, the
 * approval surface). Everything else, WebSocket upgrades included, is bulk
 * and is shed with 503 under saturation exactly as before; control keeps the
 * reserved slots and shares the same absolute maxima, so a control flood
 * cannot grow admission past the old bounds.
 */
export type IngressWorkClass = "control" | "bulk";

const INGRESS_CONTROL_ROUTE_SUFFIXES: ReadonlySet<string> = new Set([
  "/interrupt",
  "/close",
  "/terminal/close",
  "/requests/resolve",
]);

/** Route suffix of a POST to `/api/threads/<single-segment-id>/...` when it is
 * one of the stop/answer control routes; `null` for everything else. Shape
 * mirrors `threadIdFromPath` in `httpRouter.ts` (raw id, no decoded `/`). */
export function ingressControlRouteSuffix(pathname: string): string | null {
  if (!pathname.startsWith("/api/threads/")) return null;
  const rest = pathname.slice("/api/threads/".length);
  const cut = rest.lastIndexOf("/");
  if (cut <= 0) return null;
  const id = rest.slice(0, cut);
  if (!id || id.includes("/")) return null;
  const suffix = rest.slice(cut);
  return INGRESS_CONTROL_ROUTE_SUFFIXES.has(suffix) ? suffix : null;
}

export function firstHostHeaderValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolves the effective control reservation for one semaphore. An explicit
 * reservation must be a non-negative safe integer below `max` (a value that
 * would consume the whole budget is a loud configuration error — bulk would
 * never be admitted). The default reservation scales with the budget — one
 * eighth, capped at the default slice — so production keeps the documented
 * reserved capacity while small explicit budgets (tests) resolve to zero
 * reserve and keep exactly the pre-reservation admission behavior.
 */
export function resolveControlReserve(
  field: string,
  explicit: number | undefined,
  fallback: number,
  max: number,
): number {
  if (explicit !== undefined) {
    if (!Number.isSafeInteger(explicit) || explicit < 0 || explicit >= max) {
      throw new Error(`${field} must be a non-negative safe integer below ${max}.`);
    }
    return explicit;
  }
  return Math.min(fallback, Math.floor(max / 8));
}

export interface RemoteAccessServerInfo {
  readonly httpBaseUrl: string;
  readonly localHttpBaseUrl: string;
  readonly tailscaleHttpBaseUrl?: string;
  readonly wsBaseUrl: string;
  readonly pairingUrl: string;
  /** ISO expiry of the credential carried by `pairingUrl`. */
  readonly pairingExpiresAt: string;
}

type RemoteAccessListenerTls = {
  readonly cert: string;
  readonly key: string;
  readonly fingerprint: string;
};

export interface RemoteAccessServerOptions {
  readonly appVersion: string;
  /** Adapter hosting this shared server core. Defaults to the Electron desktop. */
  readonly hostMode?: RemoteHostMode;
  /**
   * V6 C.2: host-declared service capabilities for GET /api/host/describe.
   * Absent (most tests) fail closed to the unknown set.
   */
  readonly hostCapabilities?: import("@/shared/hostControlProtocol").HostServiceCapabilities;
  readonly identity: RemoteAccessIdentity;
  /**
   * Whether the hosting process is running in development mode. Loopback web
   * origins are trusted in every mode so a localhost development client can
   * connect to any packaged or headless Poracode app.
   */
  readonly isDev?: boolean;
  /** The bind host for the listener. Composition roots pass the config-level
   * resolution ({@link remoteAccessHost} in `src/main/remote/config.ts` —
   * loopback by default; named `loopback`/`tailnet`/`lan` bind modes). A
   * plaintext all-interfaces host is refused at startup unless TLS material is
   * configured or the `PORACODE_ALLOW_PLAINTEXT_LAN=1` acknowledgement is set
   * (Gate 6 items 4.1/4.2), whoever supplied the host. */
  readonly host: string;
  /**
   * Gate 6 item 4.2 (TLS): HTTPS material for the listener. When set, the
   * server listens HTTPS, advertises `https` origins, and carries the leaf
   * certificate's SHA-256 fingerprint in every pairing URL so clients can pin
   * it. `null` forces plaintext (tests); UNSET resolves the material from the
   * environment (`PORACODE_REMOTE_TLS_CERT` + `PORACODE_REMOTE_TLS_KEY`) —
   * absent env stays plaintext, a broken env fails startup loudly.
   *
   * Structural shape on purpose: both a loaded material
   * (`RemoteAccessTlsMaterial`, with its configured paths) and generated
   * material (`GeneratedTlsMaterial` from `generateSelfSignedTlsMaterial`)
   * satisfy it, so compositions can hand either to the server unchanged.
   */
  readonly tls?: RemoteAccessListenerTls | null;
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
  /**
   * Socket addresses or CIDRs whose `X-Forwarded-For` the rate limiter may
   * honor (V6 A.6). Authenticated in-process relay dials (hop secret) are
   * the other way past this gate. Defaults to `PORACODE_REMOTE_TRUSTED_PROXIES`.
   */
  readonly trustedProxies?: readonly string[];
  /** Authenticated relay registration origin, cleared when registration is lost. */
  readonly getRelayPublicOrigin?: () => string | null;
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
   * Dev-mode URL of the canonical browser app on the Vite dev server. Pairing
   * links are minted on this origin with the desktop API in `?host=...`, and
   * the remote server root redirects there so any browser gets hot reload.
   */
  readonly devWebAppUrl?: string;
  readonly port: number;
  /** Same-port retries absorb brief listener overlap during app relaunches. */
  readonly listenRetryAttempts?: number;
  readonly listenRetryDelayMs?: number;
  /** Maximum concurrently admitted HTTP/WebSocket continuations. */
  readonly maxConcurrentIngressWork?: number;
  /** Maximum admitted continuations from one HTTP socket or WebSocket client. */
  readonly maxConcurrentIngressWorkPerSource?: number;
  /**
   * Ingress slots reserved for control-class work (Stop/approval POSTs — see
   * {@link IngressWorkClass}) that bulk traffic can never occupy, so control
   * stays admissible under bulk saturation. An explicit value must be a
   * non-negative safe integer below `maxConcurrentIngressWork` (bulk always
   * retains capacity); when unset, the default reservation scales with the
   * budget — one eighth, capped at the default slice — so small explicit
   * budgets resolve to zero reserve and unchanged admission behavior.
   */
  readonly reservedIngressControlCapacity?: number;
  /**
   * Per-source counterpart of `reservedIngressControlCapacity`: the reserved
   * slice of one source's allowance that bulk requests from that source can
   * never occupy, with the same scaling and validation rules.
   */
  readonly reservedIngressControlCapacityPerSource?: number;
  /** Grace before closing active transports; admitted handlers are still joined. */
  readonly shutdownConnectionGraceMs?: number;
  readonly authStore?: RemoteAuthStore;
  /**
   * Gate 6 item 4.7 (S7): structured audit sink for security-relevant remote
   * events (pair, token exchange, revoke, thread create/send/stop, file
   * read/write, forward open). Absent = no audit trail is written. Host
   * compositions wire {@link createRemoteAuditLog} (append-only JSONL under the
   * data root); rotation is item 4.9's seam.
   */
  readonly audit?: RemoteAuditSink;
  /**
   * Whether this server owns supervisor-event persistence. Headless servers do;
   * desktop servers opt out because the desktop backend host persists first.
   */
  readonly ownsSupervisorPersistence?: boolean;
  /**
   * Aggregate live-stream demand from all authenticated WebSocket clients.
   * May return a Promise; reliable terminal watches await it as the interest
   * activation barrier before reading a snapshot.
   */
  readonly onEventInterestsChanged?: (interests: LiveEventInterests) => void | Promise<void>;
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
   * Single-mutation owner for checkpoint truncates: performs the database
   * write and publishes one canonical `runtime.truncated` event through the
   * host event funnel. Required — the HTTP truncate route must never be able
   * to mutate without broadcasting, so a host without a publication owner
   * cannot accept truncates at all.
   */
  truncateThreadRuntime(threadId: string, itemId: string): void;
  /**
   * WS2: backend-owned compound checkpoint revert — provider rollback, file
   * checkpoint restore and durable transcript truncation as ONE journaled
   * operation keyed by the client's `operationKey`. The host owns publication
   * of the canonical `runtime.truncated` event through its event funnel.
   * Refusals (turn active) surface as 409 `thread_turn_active`. Optional: a
   * host without a revert owner answers 501 `checkpoint_revert_unavailable`.
   */
  revertCheckpoint?(input: {
    threadId: string;
    checkpointItemId: string;
    operationKey: string;
  }): Promise<CheckpointRevertResult>;
  /**
   * Forwards a thread-metadata command to the desktop renderer, which owns
   * thread metadata and persists it. Returns false when no renderer window is
   * available to receive the command.
   */
  dispatchThreadCommand?(command: RemoteThreadCommand): boolean | Promise<boolean>;
  /** Resolve authoritative MCP settings for a remotely launched persisted thread. */
  resolveMcpLaunchSnapshot?(projectId: string): McpLaunchSnapshot;
  /** Built-in browser bridge: tab commands plus screencast mirroring. */
  readonly browser?: RemoteBrowserGatewayLike;
  /** Local dev-server discovery + raw TCP port forwarding. Absent on hosts
   * that don't support it (returns 503). */
  readonly portForward?: RemotePortForwardGateway;
  /** Origin-bound proxy session layer for `portForward`'s raw TCP forwards
   * (enter tokens → one-use child-origin exchange → `__Host-` cookie
   * sessions). Absent on hosts that don't support it (`POST /api/ports/enter`
   * returns 503). */
  readonly portProxy?: PortProxy;
  /**
   * Configured browser-forward child-origin identity (isolated HTTPS origins
   * under `baseUrl`, owned via the persistent origin secret). Absent = browser
   * forwarding unavailable: `enterPath` is omitted from forward creation, the
   * browser entry routes fail with `forward_browser_unavailable`, and raw TCP
   * forwarding keeps working. Never inferred from visitor headers.
   */
  readonly forwardOrigin?: ForwardOriginIdentity;
  /** Current authenticated relay registration; null after disconnect or policy loss. */
  readonly getRelayForwardOrigin?: () => ForwardOriginIdentity | null;
  /**
   * Per-instance random 256-bit credential (base64url) the relay v2 local
   * adapter must present over loopback (reserved `x-poracode-forward-*`
   * headers) to inject a trusted forward context. Generated in the
   * composition root alongside `forwardOrigin`; never accepted from a
   * non-loopback peer or without a constant-time match.
   */
  readonly forwardDispatchKey?: string;
  /**
   * Remote-editable desktop settings (AI helpers, agent/model configuration,
   * and persistent composer MCP enablement). `update` merges a patch into the
   * settings file and notifies the desktop renderer; both return the
   * remote-editable subset only — never the full settings file.
   */
  readonly settings?: {
    read(): RemoteSettings;
    /** Update implementations may commit asynchronously (the settings
     * authority persists on its own queue); the route awaits the result. */
    update(patch: RemoteSettingsPatch): RemoteSettings | Promise<RemoteSettings>;
    readMcpServers(): { servers: McpServer[] };
    commandMcpServers(command: RemoteMcpSettingsCommand): { servers: McpServer[] };
    resolveScope(scope: RemoteMcpSettingsScope): {
      servers: McpServer[];
      projectLocation?: ProjectLocation;
    };
    resolveServer(
      scope: RemoteMcpSettingsScope,
      serverId: string,
    ): {
      server: McpServer;
      projectLocation?: ProjectLocation;
    };
  };
  /** Desktop app updater exposed to authenticated desktop clients. */
  readonly updates?: {
    currentVersion(): string;
    status(): RemoteHostUpdateStatus | null;
    check(): Promise<void>;
    install(): void;
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
    runs(id: string): ScheduledTaskRun[];
  };
  /** Persistent PR automation owned by the host process. */
  readonly prWatches?: {
    get(projectId: string, prNumber: number): PrWatch | null;
    requestCheck(projectId: string, prNumber: number): void;
    upsert(input: PrWatchInput): PrWatch;
    delete(projectId: string, prNumber: number): void;
    syncAgent(agent: PrWatchAgentSync): void;
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
    dispose?(): void | Promise<void>;
    upsert(registration: RemotePushRegistration): void;
    remove(deviceId: string, routing?: RemotePushRegistrationRouting): void;
  };
  /** Notifies the desktop shell after the active pairing code rotates. */
  readonly onPairingChanged?: () => void;
  /** Keeps a live desktop renderer in sync with project mutations made over HTTP. */
  readonly onProjectsChanged?: (projects: readonly Project[]) => void;
}

/**
 * Mutable server internals extracted modules operate on. `RemoteAccessServer`
 * owns the fields; collaborators receive this view so private methods can move
 * without widening the public class API.
 */
export interface RemoteAccessServerHost {
  readonly options: RemoteAccessServerOptions;
  readonly auth: RemoteAuthStore;
  readonly tls: RemoteAccessListenerTls | null;
  readonly server: Server;
  readonly connections: HttpServerConnections;
  readonly work: AsyncWorkTracker;
  readonly wss: WebSocketServer;
  readonly heartbeat: WebSocketHeartbeat;
  readonly clients: Map<WebSocket, AuthenticatedRemoteSession>;
  readonly replayingClients: Set<WebSocket>;
  readonly clientLiveness: Map<WebSocket, boolean>;
  readonly terminalWatches: Map<WebSocket, Set<string>>;
  readonly terminalCursorSync: TerminalCursorSyncRegistry;
  readonly terminalBaselineStreams: TerminalBaselineStreamScheduler;
  readonly gitStateInterests: Map<WebSocket, readonly GitStateInterest[]>;
  readonly supervisorEventListeners: Set<(event: RemoteBroadcastEvent) => void>;
  readonly itemInterests: Map<WebSocket, ReadonlySet<string>>;
  readonly eventBuffer: BufferedSupervisorEvent[];
  desktopSeq: number;
  readonly desktopEventBuffer: BufferedSupervisorEvent[];
  readonly desktopInternalClients: Set<WebSocket>;
  readonly desktopReplayingClients: Set<WebSocket>;
  readonly backgroundTasksByThread: Map<string, readonly BackgroundTask[]>;
  readonly maxConcurrentIngressWork: number;
  readonly maxConcurrentIngressWorkPerSource: number;
  readonly reservedIngressControlCapacity: number;
  readonly reservedIngressControlCapacityPerSource: number;
  readonly ingressWorkBySource: WeakMap<object, number>;
  readonly ingressPolicyCache: WeakMap<ForwardOriginIdentity, ForwardOriginPolicy>;
  ingressWorkCount: number;
  seq: number;
  info: RemoteAccessServerInfo | null;
  activePairingCredential: string | null;
  readonly stopping: boolean;
  readonly listenCancellation: AbortController;
  starting: Promise<RemoteAccessServerInfo> | undefined;
  revokeAccessSession(sessionId: string): boolean;
  detachDesktopInternalClient(ws: WebSocket): void;
  notifyEventInterestsChanged(): void | Promise<void>;
  publishSupervisorEvent(event: RemoteBroadcastEvent): void;
}

export function requireRemoteAccessOption<
  K extends
    | "browser"
    | "portForward"
    | "portProxy"
    | "pushRegistrations"
    | "settings"
    | "schedules"
    | "prWatches",
>(
  options: RemoteAccessServerOptions,
  key: K,
  code: string,
  message: string,
): NonNullable<RemoteAccessServerOptions[K]> {
  const value = options[key];
  if (!value) {
    throw new RemoteHttpError(code, message, 503);
  }
  return value as NonNullable<RemoteAccessServerOptions[K]>;
}

export function requireBrowserGateway(
  options: RemoteAccessServerOptions,
): RemoteBrowserGatewayLike {
  return requireRemoteAccessOption(
    options,
    "browser",
    "browser_unavailable",
    "The desktop browser is not available.",
  );
}

export function requirePortForwardGateway(
  options: RemoteAccessServerOptions,
): RemotePortForwardGateway {
  return requireRemoteAccessOption(
    options,
    "portForward",
    "ports_unavailable",
    "Port forwarding is not available on this desktop.",
  );
}

export function requirePortProxy(options: RemoteAccessServerOptions): PortProxy {
  return requireRemoteAccessOption(
    options,
    "portProxy",
    "ports_unavailable",
    "Port forwarding is not available on this desktop.",
  );
}

export function requirePushRegistrations(
  options: RemoteAccessServerOptions,
): NonNullable<RemoteAccessServerOptions["pushRegistrations"]> {
  return requireRemoteAccessOption(
    options,
    "pushRegistrations",
    "push_unavailable",
    "Push notifications are not available on this desktop.",
  );
}

export function requireSettingsGateway(
  options: RemoteAccessServerOptions,
): NonNullable<RemoteAccessServerOptions["settings"]> {
  return requireRemoteAccessOption(
    options,
    "settings",
    "settings_unavailable",
    "Desktop settings are not available.",
  );
}

export function requireSchedulesGateway(
  options: RemoteAccessServerOptions,
): NonNullable<RemoteAccessServerOptions["schedules"]> {
  return requireRemoteAccessOption(
    options,
    "schedules",
    "schedules_unavailable",
    "Scheduled tasks are not available on this desktop.",
  );
}

export function requirePrWatchesGateway(
  options: RemoteAccessServerOptions,
): NonNullable<RemoteAccessServerOptions["prWatches"]> {
  return requireRemoteAccessOption(
    options,
    "prWatches",
    "pr_watches_unavailable",
    "PR automation is not available on this desktop.",
  );
}

export function requireRemoteAccessInfo(host: RemoteAccessServerHost): RemoteAccessServerInfo {
  if (!host.info) {
    throw new Error("Remote access server has not started.");
  }
  return host.info;
}
