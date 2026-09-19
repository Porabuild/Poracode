import { createServer, type IncomingMessage, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket, WebSocketServer } from "ws";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { HttpServerConnections } from "@/shared/httpServerConnections";
import {
  toWebSocketUrl,
  remoteAccessScopesForPreset,
  type RemoteAccessScopePreset,
  type RemoteGitSummaries,
  type RemoteAccessSessionSummary,
  type RemoteAccessTokenResult,
  type RemoteHostMode,
  type RemoteHostUpdateStatus,
  type RemotePushRegistration,
  type RemotePushRegistrationRouting,
  type RemoteSettings,
  type RemoteSettingsPatch,
  type RemoteTokenExchangePayload,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import type { GitStateInterest, GitStateSnapshot } from "@/shared/gitState";
import type { LiveEventInterests } from "@/shared/liveEventInterests";
import { TerminalBaselineStreamScheduler } from "./server/terminalBaselineStream";
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
  RuntimeEvent,
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
  SupervisorEvent,
  SupervisorProcedureName,
} from "@/shared/ipc";
import { buildPairingUrl, formatCertFingerprint } from "@/shared/remote/pairingUrl";
import { RemoteHttpError, RemoteAuthStore, type AuthenticatedRemoteSession } from "./auth";
import { remoteAccessBindRefusal } from "./config";
import { loadRemoteAccessTlsMaterial } from "./server/tlsMaterial";
import type { RemoteAccessIdentity } from "./identity";
import {
  FORWARD_ORIGIN_UNAVAILABLE,
  type ForwardOriginAvailability,
  type ForwardOriginIdentity,
} from "./portForward/forwardOriginIdentity";
import { ForwardOriginPolicy, isForwardOriginAuthority } from "./portForward/forwardOrigin";
import type { PortProxy } from "./portForward/portProxy";
import type { RemoteBrowserGatewayLike } from "./RemoteBrowserGateway";
import type { RemotePortForwardGateway } from "./RemotePortForwardGateway";
import {
  FORWARD_DISPATCH_ID_HEADER,
  FORWARD_DISPATCH_ORIGIN_HEADER,
  handleRemoteAccessHttpRequest,
  handleRemoteAccessUpgrade,
} from "./server/forwardOriginDispatch";
import { normalizeHostForUrl, RemoteServerSecurity } from "./server/security";
import {
  REMOTE_AUDIT_LOG_VERSION,
  type RemoteAuditEvent,
  type RemoteAuditSink,
} from "./server/auditLog";
import type {
  BufferedSupervisorEvent,
  RemoteBroadcastEvent,
  RemoteServerContext,
} from "./server/context";
import {
  DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES,
  DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES,
  REMOTE_PER_MESSAGE_DEFLATE,
  WebSocketHeartbeat,
  rejectUpgrade,
} from "./server/wsConnections";
import { persistSupervisorEvent } from "./server/runtimePersistence";
import { projectGitStatePatchForInterests } from "./server/gitStateProjection";
import { filterEventForItemInterests } from "./server/itemInterestFilter";
import {
  capBroadcastEvent,
  DEFAULT_EVENT_BUFFER_MAX_BYTES,
  maxBroadcastEventBytes,
  trimEventBuffer,
} from "./server/eventSizeGuard";
import {
  buildCursorTaggedTerminalOutput,
  TerminalCursorSyncRegistry,
} from "./server/terminalCursorSync";
import {
  registerDesktopInternalStreamHost,
  replayDesktopEvents,
  type DesktopInternalReplayContext,
} from "./server/desktopInternalStream";
import { writeError } from "./server/httpResponses";

// WS5 P1-9: under streaming load the old 500-entry cap was exhausted by small
// content deltas long before the 8 MB byte budget, forcing reconnecting
// clients into full resyncs. The byte budget bounds memory either way, so the
// entry cap only needs to bound worst-case entry counts.
const EVENT_BUFFER_LIMIT = 4_000;
const EVENT_BUFFER_MAX_BYTES = DEFAULT_EVENT_BUFFER_MAX_BYTES;
const DEFAULT_LISTEN_RETRY_ATTEMPTS = 5;
const DEFAULT_LISTEN_RETRY_DELAY_MS = 500;
const DEFAULT_MAX_CONCURRENT_INGRESS_WORK = 128;
const DEFAULT_MAX_CONCURRENT_INGRESS_WORK_PER_SOURCE = 32;
/**
 * Reserved control-priority capacity (Gate 4 fairness): slots of the ingress
 * semaphore bulk traffic can never occupy, so Stop/approval-class requests
 * stay admissible under bulk saturation. Mirrors the desktop path's tested
 * admission classes — `SupervisorClient` admits `interruptThread` /
 * `resolveThreadServerRequest` / `closeThread` ahead of serialized thread
 * mutations "so a long-running mutation can still be interrupted". The
 * reservation bounds total capacity; it never reorders already-admitted work.
 */
const DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY = 16;
const DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY_PER_SOURCE = 4;

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
type IngressWorkClass = "control" | "bulk";

const INGRESS_CONTROL_ROUTE_SUFFIXES: ReadonlySet<string> = new Set([
  "/interrupt",
  "/close",
  "/terminal/close",
  "/requests/resolve",
]);

/** Route suffix of a POST to `/api/threads/<single-segment-id>/...` when it is
 * one of the stop/answer control routes; `null` for everything else. Shape
 * mirrors `threadIdFromPath` in `httpRouter.ts` (raw id, no decoded `/`). */
function ingressControlRouteSuffix(pathname: string): string | null {
  if (!pathname.startsWith("/api/threads/")) return null;
  const rest = pathname.slice("/api/threads/".length);
  const cut = rest.lastIndexOf("/");
  if (cut <= 0) return null;
  const id = rest.slice(0, cut);
  if (!id || id.includes("/")) return null;
  const suffix = rest.slice(cut);
  return INGRESS_CONTROL_ROUTE_SUFFIXES.has(suffix) ? suffix : null;
}

function firstHostHeaderValue(value: string | string[] | undefined): string | null {
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
function resolveControlReserve(
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

export interface RemoteAccessServerOptions {
  readonly appVersion: string;
  /** Adapter hosting this shared server core. Defaults to the Electron desktop. */
  readonly hostMode?: RemoteHostMode;
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
  readonly tls?: {
    readonly cert: string;
    readonly key: string;
    readonly fingerprint: string;
  } | null;
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
  private readonly server: Server;
  private readonly connections: HttpServerConnections;
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
  private readonly reservedIngressControlCapacity: number;
  private readonly reservedIngressControlCapacityPerSource: number;
  private readonly ingressWorkBySource = new WeakMap<object, number>();
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
    this.maxConcurrentIngressWork =
      options.maxConcurrentIngressWork ?? DEFAULT_MAX_CONCURRENT_INGRESS_WORK;
    this.maxConcurrentIngressWorkPerSource =
      options.maxConcurrentIngressWorkPerSource ?? DEFAULT_MAX_CONCURRENT_INGRESS_WORK_PER_SOURCE;
    if (
      !Number.isSafeInteger(this.maxConcurrentIngressWork) ||
      this.maxConcurrentIngressWork <= 0
    ) {
      throw new Error("maxConcurrentIngressWork must be a positive safe integer.");
    }
    if (
      !Number.isSafeInteger(this.maxConcurrentIngressWorkPerSource) ||
      this.maxConcurrentIngressWorkPerSource <= 0
    ) {
      throw new Error("maxConcurrentIngressWorkPerSource must be a positive safe integer.");
    }
    // An explicit reservation that would consume a whole budget is a
    // configuration error and fails loudly. The DEFAULTS only reserve a slice
    // of the production-sized budgets, so when a host runs with a tiny
    // explicit budget (tests), the default reservation clamps to
    // `max - 1`: bulk always keeps at least one slot, and the admission
    // behavior for those budgets is exactly the pre-reservation behavior.
    this.reservedIngressControlCapacity = resolveControlReserve(
      "reservedIngressControlCapacity",
      options.reservedIngressControlCapacity,
      DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY,
      this.maxConcurrentIngressWork,
    );
    this.reservedIngressControlCapacityPerSource = resolveControlReserve(
      "reservedIngressControlCapacityPerSource",
      options.reservedIngressControlCapacityPerSource,
      DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY_PER_SOURCE,
      this.maxConcurrentIngressWorkPerSource,
    );
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
      sendRaw: (ws, data) => {
        if (ws.readyState !== WebSocket.OPEN) return false;
        ws.send(data);
        return true;
      },
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
    // Forward child-origin dispatch runs in front of the app's own HTTP/WS
    // routing: a recognized child origin (or any authority inside the
    // configured forward namespace) is proxied or bounded-errored there and
    // NEVER falls through to Poracode API/PWA handlers.
    const requestHandler = (req: IncomingMessage, res: import("node:http").ServerResponse) => {
      void this.runIngressWork(
        () => handleRemoteAccessHttpRequest(this.context, req, res),
        req.socket,
        this.classifyIngressRequest(req),
      ).catch((error: unknown) => {
        if (!res.destroyed && !res.writableEnded) {
          if (res.headersSent) res.destroy();
          else writeError(res, error);
        }
      });
    };
    this.server = this.tls
      ? createHttpsServer({ cert: this.tls.cert, key: this.tls.key }, requestHandler)
      : createServer(requestHandler);
    this.connections = new HttpServerConnections(this.server);
    this.server.on("upgrade", (req, socket, head) => {
      if (this.stopping) {
        rejectUpgrade(socket, 503, "Service Unavailable");
        return;
      }
      // Upgrades stay bulk: the control class is the stop/approval POST
      // routes, which need only HTTP. The upgrade handshake is cheap and the
      // established socket never holds an ingress slot.
      void this.runIngressWork(
        () => handleRemoteAccessUpgrade(this.context, req, socket, head),
        socket,
      ).catch(() => socket.destroy());
    });
  }

  private buildContext(): RemoteServerContext {
    const server = this;
    const context: RemoteServerContext = {
      options: this.options,
      auth: this.auth,
      wss: this.wss,
      security: this.security,
      clients: this.clients,
      replayingClients: this.replayingClients,
      clientLiveness: this.clientLiveness,
      terminalWatches: this.terminalWatches,
      terminalCursorSync: this.terminalCursorSync,
      terminalBaselineStreams: this.terminalBaselineStreams,
      gitStateInterests: this.gitStateInterests,
      itemInterests: this.itemInterests,
      eventBuffer: this.eventBuffer,
      backgroundTasksByThread: this.backgroundTasksByThread,
      get seq() {
        return server.seq;
      },
      get stopping() {
        return server.stopping;
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
      scopeEventForClient: (event, client) => this.scopeEventForClient(event, client),
      send: (ws, message) => this.send(ws, message),
      sendRaw: (ws, data, onSent) => this.sendRaw(ws, data, onSent),
      notifyEventInterestsChanged: () => this.notifyEventInterestsChanged(),
      runIngressWork: (operation, source) => this.runIngressWork(operation, source),
      waitForSupervisorEvent: (match, timeoutMs) => this.waitForSupervisorEvent(match, timeoutMs),
    };
    registerDesktopInternalStreamHost(context, {
      attachClient: (ws, lastDesktopSeq) => this.attachDesktopInternalClient(ws, lastDesktopSeq),
      detachClient: (ws) => this.detachDesktopInternalClient(ws),
    });
    return context;
  }

  /**
   * Admits a loopback desktop-internal connection to the desktop-only
   * replayable stream and resumes it from the client's `lastDesktopSeq`
   * cursor, mirroring the shared stream's reconnect semantics (no cursor or a
   * current one replays nothing; a cursor ahead of the server's — a server
   * restart — earns `resync-required`; otherwise the bounded buffer replays
   * the missing range).
   */
  private attachDesktopInternalClient(ws: WebSocket, lastDesktopSeq: number | null): void {
    if (this.stopping) return;
    this.desktopInternalClients.add(ws);
    if (lastDesktopSeq === null || lastDesktopSeq === this.desktopSeq) return;
    if (lastDesktopSeq > this.desktopSeq) {
      this.send(ws, {
        type: "resync-required",
        seq: this.seq,
        reason: "Desktop event stream reset; request a fresh snapshot.",
      });
      return;
    }
    this.desktopReplayingClients.add(ws);
    replayDesktopEvents(this.desktopReplayContext(), ws, lastDesktopSeq);
  }

  private detachDesktopInternalClient(ws: WebSocket): void {
    this.desktopInternalClients.delete(ws);
    this.desktopReplayingClients.delete(ws);
  }

  private desktopReplayContext(): DesktopInternalReplayContext {
    const server = this;
    return {
      get seq() {
        return server.seq;
      },
      get desktopSeq() {
        return server.desktopSeq;
      },
      desktopEventBuffer: server.desktopEventBuffer,
      desktopReplayingClients: server.desktopReplayingClients,
      send: (ws, message) => server.send(ws, message),
      sendRaw: (ws, data, onSent) => server.sendRaw(ws, data, onSent),
    };
  }

  private runIngressWork<T>(
    operation: () => T | PromiseLike<T>,
    source?: object,
    workClass: IngressWorkClass = "bulk",
  ): Promise<T> {
    if (this.stopping) {
      return Promise.reject(new RemoteHttpError("host_stopping", "The host is stopping.", 503));
    }
    // Reserved control capacity, not reordering: bulk fills only the
    // non-reserved portion of the same semaphore, so under bulk saturation a
    // Stop/approval request still finds free slots, while already-admitted
    // work keeps its continuation order and every absolute maximum still
    // bounds both classes (a control flood hits the same global ceiling).
    const globalCeiling =
      workClass === "control" ? this.maxConcurrentIngressWork : this.bulkIngressCeiling();
    if (this.ingressWorkCount >= globalCeiling) {
      return Promise.reject(
        new RemoteHttpError(
          "host_busy",
          "The host is busy with other requests; retry shortly.",
          503,
        ),
      );
    }
    const sourceCount = source === undefined ? 0 : (this.ingressWorkBySource.get(source) ?? 0);
    const sourceCeiling =
      workClass === "control"
        ? this.maxConcurrentIngressWorkPerSource
        : this.bulkIngressPerSourceCeiling();
    if (source !== undefined && sourceCount >= sourceCeiling) {
      return Promise.reject(
        new RemoteHttpError(
          "host_busy",
          "This client has too much work in flight; retry shortly.",
          503,
        ),
      );
    }
    this.ingressWorkCount += 1;
    if (source !== undefined) this.ingressWorkBySource.set(source, sourceCount + 1);
    return this.work.run(operation).finally(() => {
      this.ingressWorkCount -= 1;
      if (source !== undefined) {
        const next = (this.ingressWorkBySource.get(source) ?? 1) - 1;
        if (next > 0) this.ingressWorkBySource.set(source, next);
        else this.ingressWorkBySource.delete(source);
      }
    });
  }

  /** The ingress capacity bulk work may consume: everything except the
   * reserved control slice of the semaphore. */
  private bulkIngressCeiling(): number {
    return this.maxConcurrentIngressWork - this.reservedIngressControlCapacity;
  }

  /** The per-source capacity bulk work may consume. */
  private bulkIngressPerSourceCeiling(): number {
    return this.maxConcurrentIngressWorkPerSource - this.reservedIngressControlCapacityPerSource;
  }

  /**
   * Classifies one inbound HTTP request for admission. Control is the narrow
   * stop/answer surface (`POST /api/threads/<id>/{interrupt,close,
   * terminal/close,requests/resolve}`); forwarded-application traffic is
   * always bulk even on a control-shaped path — on a child origin every path,
   * `/api/*` included, belongs to the forwarded application. Child
   * authorities are recognized from configured ingress identities (direct +
   * registered relay) plus previously minted labels that stayed reserved
   * after a configuration change; relayed child dispatch is recognized by the
   * reserved `x-poracode-forward-{id,origin}` headers the local adapter sets
   * (relay *API* dispatch carries neither and stays classifiable).
   * Classification is fail-closed toward bulk: anything unrecognized keeps
   * exactly the pre-reservation admission behavior.
   */
  private classifyIngressRequest(req: IncomingMessage): IngressWorkClass {
    if (req.method !== "POST") return "bulk";
    const host = firstHostHeaderValue(req.headers.host);
    if (host && this.isForwardChildAuthority(host)) return "bulk";
    if (
      req.headers[FORWARD_DISPATCH_ID_HEADER] !== undefined ||
      req.headers[FORWARD_DISPATCH_ORIGIN_HEADER] !== undefined
    ) {
      return "bulk";
    }
    try {
      const { pathname } = new URL(req.url ?? "/", "http://poracode.invalid");
      return ingressControlRouteSuffix(pathname) === null ? "bulk" : "control";
    } catch {
      return "bulk";
    }
  }

  private isForwardChildAuthority(authority: string): boolean {
    // A minted child label stays reserved even once its ingress configuration
    // is gone, so it must keep classifying as forwarded traffic.
    if (isForwardOriginAuthority(authority)) return true;
    for (const identity of this.activeForwardOriginIdentities()) {
      let policy = this.ingressPolicyCache.get(identity);
      if (!policy) {
        policy = new ForwardOriginPolicy(identity.baseUrl);
        this.ingressPolicyCache.set(identity, policy);
      }
      if (policy.containsHostname(authority)) return true;
    }
    return false;
  }

  private activeForwardOriginIdentities(): ForwardOriginIdentity[] {
    const direct = this.options.forwardOrigin;
    const relay = this.options.getRelayForwardOrigin?.();
    return [...(direct ? [direct] : []), ...(relay ? [relay] : [])];
  }

  private waitForSupervisorEvent(
    match: (event: RemoteBroadcastEvent) => boolean,
    timeoutMs: number,
  ): Promise<RemoteBroadcastEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.supervisorEventListeners.delete(listener);
        reject(new Error("Timed out waiting for supervisor event."));
      }, timeoutMs);
      timer.unref?.();
      const listener = (event: RemoteBroadcastEvent) => {
        if (!match(event)) return;
        clearTimeout(timer);
        this.supervisorEventListeners.delete(listener);
        resolve(event);
      };
      this.supervisorEventListeners.add(listener);
    });
  }

  private notifyEventInterestsChanged(): void | Promise<void> {
    const terminalThreadIds = new Set<string>();
    for (const watched of this.terminalWatches.values()) {
      for (const threadId of watched) terminalThreadIds.add(threadId);
    }

    const runtimeThreadIds = new Set<string>();
    let allRuntimeEvents = false;
    for (const [client, session] of this.clients) {
      if (!session.scopes.includes("session:read")) continue;
      const interests = this.itemInterests.get(client);
      if (!interests) {
        allRuntimeEvents = true;
        continue;
      }
      for (const threadId of interests) runtimeThreadIds.add(threadId);
    }
    const interests = {
      terminalThreadIds: [...terminalThreadIds].sort(),
      runtimeThreadIds: [...runtimeThreadIds].sort(),
      allRuntimeEvents,
    };
    // Includes final connection cleanup after external admission has closed.
    return this.work.run(() => this.options.onEventInterestsChanged?.(interests));
  }

  start(): Promise<RemoteAccessServerInfo> {
    if (this.stopping) return Promise.reject(new Error("Remote access server is stopping."));
    if (this.info) return Promise.resolve(this.info);
    if (this.starting) return this.starting;
    const starting = this.startListening();
    this.starting = starting;
    void starting.catch(() => {
      if (!this.stopping && this.starting === starting) this.starting = undefined;
    });
    return starting;
  }

  private async startListening(): Promise<RemoteAccessServerInfo> {
    // Gate 6 items 4.1/4.2: a plaintext all-interfaces bind starts only with
    // the explicit acknowledgement — OR with configured TLS material, which
    // makes the wide bind encrypted. Enforced here (not just at config
    // resolution) so a programmatically supplied host cannot bypass it.
    const bindRefusal = remoteAccessBindRefusal(this.options.host, {
      tlsConfigured: this.tls !== null,
    });
    if (bindRefusal) throw new Error(`[poracode] ${bindRefusal}`);
    const maxAttempts = this.options.listenRetryAttempts ?? DEFAULT_LISTEN_RETRY_ATTEMPTS;
    for (let attempt = 1; ; attempt += 1) {
      if (this.stopping) throw new Error("Remote access server is stopping.");
      try {
        await this.listenOnce();
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EADDRINUSE" || attempt >= maxAttempts || this.stopping) throw error;
        try {
          await delay(this.options.listenRetryDelayMs ?? DEFAULT_LISTEN_RETRY_DELAY_MS, undefined, {
            signal: this.listenCancellation.signal,
          });
        } catch {
          throw new Error("Remote access server is stopping.");
        }
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
    this.recordAudit("pair", {
      detail: { label: "Startup pairing", scopes: pairingCredential.scopes.join(" ") },
    });

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
      try {
        this.server.listen(this.options.port, this.options.host);
      } catch (error) {
        this.server.off("error", onError);
        this.server.off("listening", onListening);
        reject(error);
      }
    });
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
    this.closing = Promise.resolve().then(() => this.finishDispose());
    return this.closing;
  }

  private async finishDispose(): Promise<void> {
    this.heartbeat.stop();
    for (const client of this.clients.keys()) {
      client.terminate();
    }
    this.clients.clear();
    this.replayingClients.clear();
    this.clientLiveness.clear();
    this.terminalWatches.clear();
    this.terminalCursorSync.clearAll();
    this.terminalBaselineStreams.clearAll();
    this.desktopInternalClients.clear();
    this.desktopReplayingClients.clear();
    this.desktopEventBuffer.length = 0;
    this.gitStateInterests.clear();
    this.itemInterests.clear();
    void Promise.resolve(this.notifyEventInterestsChanged()).catch(() => {});
    // Abort host-side gateway requests before waiting for handlers. A public
    // key fetch can otherwise hold the handler until its transport timeout.
    await this.options.pushRegistrations?.dispose?.();
    const webSocketsClosed = new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await this.starting?.catch(() => undefined);
    await Promise.all([
      this.connections.close(this.options.shutdownConnectionGraceMs ?? 5_000),
      webSocketsClosed,
    ]);
    await this.work.drain();
    this.supervisorEventListeners.clear();
    this.info = null;
    this.activePairingCredential = null;
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

  revokeAccessSession(sessionId: string): boolean {
    const revoked = this.auth.revokeAccessSession(sessionId);
    if (!revoked) return false;
    this.recordAudit("revoke", { detail: { sessionId } });
    for (const [client, session] of this.clients) {
      if (session.sessionId === sessionId) {
        client.close(1008, "Remote access session revoked");
      }
    }
    return true;
  }

  /**
   * Gate 6 item 4.7 (S7): appends one structured audit line. The sink is
   * optional; audit failures never propagate into the request path (the file
   * sink contains its own I/O errors).
   */
  private recordAudit(
    kind: RemoteAuditEvent["kind"],
    input: { sessionId?: string; detail?: RemoteAuditEvent["detail"] } = {},
  ): void {
    this.options.audit?.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: new Date().toISOString(),
      kind,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.detail ? { detail: input.detail } : {}),
    });
  }

  /** Pushes an event onto the replayable WS event stream. Out-of-band desktop
   * events (git summaries) ride the same stream as supervisor events. */
  publishSupervisorEvent(event: RemoteBroadcastEvent): void {
    for (const listener of this.supervisorEventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn("[remote] supervisor event waiter failed:", error);
      }
    }
    this.updateBackgroundTasks(event);
    if (this.options.ownsSupervisorPersistence !== false) {
      persistSupervisorEvent(event);
    }

    // Terminal output is high-volume and ephemeral: keep it off the replayable
    // event stream (replaying PTY bytes would garble the screen) and only send
    // it to clients that opted into that terminal via `terminal-watch`.
    if (event.type === "thread-output") {
      this.broadcastTerminalOutput(event);
      return;
    }
    // Only buffer + broadcast events a remote client actually consumes; chatty
    // supervisor events no client reads would waste bandwidth and churn the
    // bounded replay buffer (see REMOTELY_CONSUMED_EVENT_TYPES). The withheld
    // desktop-only families instead feed the desktop-internal stream, where
    // loopback desktop sessions consume them without widening the external
    // event surface.
    if (!REMOTELY_CONSUMED_EVENT_TYPES.has(event.type)) {
      this.publishDesktopInternalEvent(event);
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
      this.replayingClients.clear();
      this.broadcast({
        type: "resync-required",
        seq,
        reason: "Event too large for the live stream; request a fresh snapshot.",
      });
      return;
    }
    this.eventBuffer.push({
      seq,
      event: capped.event,
      bytes: capped.bytes,
      json: capped.json,
    });
    trimEventBuffer(this.eventBuffer, EVENT_BUFFER_LIMIT, EVENT_BUFFER_MAX_BYTES);
    // Some events are tailored per connection: pull-request bodies go only to the
    // client reviewing that PR, and transcript content only to clients watching
    // that thread. Every client still receives an event for every seq — only the
    // content differs — which keeps the replay contiguity check valid.
    if (this.needsPerClientScoping(capped.event)) {
      for (const client of this.clients.keys()) {
        if (this.replayingClients.has(client)) continue;
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

  /**
   * Fans one desktop-only supervisor event out to the desktop-internal loopback
   * sessions on its own contiguous replayable sequence. Never touches the
   * shared buffer, the shared `seq`, or any non-desktop-internal client, so the
   * desktop event set can never leak to external or native clients. No
   * per-client scoping applies here: these families are global (usage, LSP,
   * OSC, crossagent), not transcript content.
   */
  private publishDesktopInternalEvent(event: RemoteBroadcastEvent): void {
    if (!DESKTOP_INTERNAL_EVENT_TYPES.has(event.type)) return;
    if (this.desktopInternalClients.size === 0) return;
    const seq = ++this.desktopSeq;
    // Same safety valve as the shared stream: an event too large for one frame
    // would terminate every desktop session and do it again on replay. Advance
    // `desktopSeq` without buffering and tell the sessions to resync.
    const capped = capBroadcastEvent(
      event,
      maxBroadcastEventBytes(
        this.options.maxWebSocketOutboundBufferBytes ?? DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES,
      ),
    );
    if (capped.kind === "undeliverable") {
      this.options.onOversizedEventDropped?.({ type: event.type, bytes: capped.bytes });
      this.desktopReplayingClients.clear();
      for (const client of this.desktopInternalClients) {
        this.send(client, {
          type: "resync-required",
          seq: this.seq,
          reason: "Desktop event too large for the live stream; request a fresh snapshot.",
        });
      }
      return;
    }
    this.desktopEventBuffer.push({
      seq,
      event: capped.event,
      bytes: capped.bytes,
      json: capped.json,
    });
    trimEventBuffer(this.desktopEventBuffer, EVENT_BUFFER_LIMIT, EVENT_BUFFER_MAX_BYTES);
    const data = `{"type":"desktop-event","seq":${seq},"event":${capped.json}}`;
    for (const client of this.desktopInternalClients) {
      if (this.desktopReplayingClients.has(client)) continue;
      this.sendRaw(client, data);
    }
  }

  /** Drops every cached background-task level. The supervisor process that
   * reported them is gone after a crash-restart; its fresh sessions report
   * their own levels, so stale entries must not shadow the live read. */
  clearBackgroundTaskLevels(): void {
    this.backgroundTasksByThread.clear();
  }

  private updateBackgroundTasks(event: RemoteBroadcastEvent): void {
    if (event.type === "thread-reset" || event.type === "thread-exited") {
      this.backgroundTasksByThread.set(event.threadId, []);
      return;
    }
    const runtimeEvents: readonly RuntimeEvent[] =
      event.type === "thread-runtime-event"
        ? [event.event]
        : event.type === "thread-runtime-events"
          ? event.events
          : event.type === "thread-runtime-events-multi"
            ? event.batches.flatMap((batch) => batch.events)
            : [];
    for (const runtimeEvent of runtimeEvents) {
      if (runtimeEvent.type === "background_tasks.changed") {
        this.backgroundTasksByThread.set(runtimeEvent.threadId, [...runtimeEvent.tasks]);
      }
    }
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

  /**
   * Streams PTY bytes to watching clients.
   *
   * - Legacy watchers: lossy 1.5MB skip (terminal self-heals; keeps old clients
   *   compatible with silent backpressure drops).
   * - Reliable cursor-sync watchers: hard outbound-limit path only — congestion
   *   disconnects rather than silently gapping the cursor stream. Frames are
   *   tagged with generation/fromCursor/toCursor for the active watchId.
   */
  private broadcastTerminalOutput(
    event: Extract<SupervisorEvent, { type: "thread-output" }>,
  ): void {
    const id = event.threadId;
    const data = event.data;
    let legacySerialized: string | null = null;
    for (const [client, watched] of this.terminalWatches) {
      if (!watched.has(id)) continue;
      if (client.readyState !== client.OPEN) continue;

      const reliable = this.terminalCursorSync.getReliable(client, id);
      if (reliable) {
        // Reliable path: never silently skip. sendRaw disconnects on hard limit.
        const tagged = buildCursorTaggedTerminalOutput(
          id,
          data,
          reliable.watchId,
          event.terminalInstanceId,
          event.outputLength,
        );
        this.sendRaw(client, JSON.stringify(tagged));
        continue;
      }

      // Legacy path: drop frames on a congested socket.
      if (client.bufferedAmount > 1_500_000) continue;
      legacySerialized ??= JSON.stringify({ type: "terminal-output", id, data });
      this.sendRaw(client, legacySerialized);
    }
  }

  /**
   * Mints a fresh pairing URL, replacing the displayed QR credential. The
   * grant defaults to the operator preset (Gate 6 item 4.3); hosts offering a
   * read-only device pass `preset: "viewer"`.
   */
  issuePairingUrl(label?: string, options?: { readonly preset?: RemoteAccessScopePreset }): string {
    const info = this.requireInfo();
    if (this.activePairingCredential) {
      this.auth.revokePairingCredential(this.activePairingCredential);
    }
    const issued = this.issuePresetPairingCredential(label, options?.preset);
    this.activePairingCredential = issued.credential;
    const pairingUrl = this.mintPairingUrl(info.httpBaseUrl, issued.credential);
    this.info = { ...info, pairingUrl, pairingExpiresAt: issued.expiresAt };
    this.notifyPairingChanged();
    return pairingUrl;
  }

  /**
   * One-time local-control grants coexist without replacing the displayed QR.
   * Accepts the same scope presets as {@link issuePairingUrl}.
   */
  issueIndependentPairingUrl(
    label?: string,
    options?: { readonly preset?: RemoteAccessScopePreset },
  ): string {
    if (this.stopping) throw new Error("Remote access server is stopping.");
    const info = this.requireInfo();
    const issued = this.issuePresetPairingCredential(label, options?.preset);
    return this.mintPairingUrl(info.httpBaseUrl, issued.credential);
  }

  private issuePresetPairingCredential(
    label: string | undefined,
    preset?: RemoteAccessScopePreset,
  ) {
    const issued = this.auth.issuePairingCredential({
      ...(label ? { label } : {}),
      ...(preset ? { scopes: remoteAccessScopesForPreset(preset) } : {}),
    });
    // Gate 6 item 4.7 (S7): every issued (or rotated) pairing credential is an
    // audited event. Revoked superseded credentials ride the same line.
    this.recordAudit("pair", {
      detail: {
        ...(label ? { label } : {}),
        ...(preset ? { preset } : {}),
        scopes: issued.scopes.join(" "),
      },
    });
    return issued;
  }

  private exchangePairingCredential(input: RemoteTokenExchangePayload): RemoteAccessTokenResult {
    if (input.grantType === "refresh_token") {
      if (!input.refreshToken) {
        throw new RemoteHttpError("invalid_refresh_token", "Invalid refresh token.", 401);
      }
      const refreshed = this.auth.refreshAccessToken({ refreshToken: input.refreshToken });
      this.recordAudit("token_exchange", {
        detail: {
          grant: "refresh_token",
          scopes: refreshed.scopes.join(" "),
        },
      });
      return refreshed;
    }
    if (!input.credential) {
      throw new RemoteHttpError("invalid_pairing_token", "Invalid pairing token.", 401);
    }
    const result = this.auth.exchangePairingCredential({
      credential: input.credential,
      ...(input.scopes ? { scopes: input.scopes } : {}),
      ...(input.client ? { client: input.client } : {}),
    });
    this.recordAudit("token_exchange", {
      detail: {
        grant: "pairing-token",
        scopes: result.scopes.join(" "),
        ...(input.client?.label ? { clientLabel: input.client.label } : {}),
        ...(input.client?.deviceType ? { deviceType: input.client.deviceType } : {}),
      },
    });
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
    const pairingAppUrl = this.options.pairingAppUrl ?? this.options.devWebAppUrl;
    const fingerprint = this.tls?.fingerprint;
    return buildPairingUrl({
      httpBaseUrl,
      credential,
      ...(pairingAppUrl ? { pairingAppUrl } : {}),
      ...(fingerprint ? { certFingerprint: formatCertFingerprint(fingerprint) } : {}),
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

  private requireBrowserGateway(): RemoteBrowserGatewayLike {
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

  /**
   * Asks every connected client to discard incremental state and refetch
   * authoritative data. Used when the supervisor shed bulk traffic in transit
   * (supervisor-output-shed): the events never reached persistence, so no
   * replay can repair them — clients must resync terminal output from the
   * supervisor, which remains the authoritative PTY source.
   */
  broadcastResyncRequired(reason: string): void {
    this.broadcast({ type: "resync-required", seq: this.seq, reason });
  }

  /** Fans an already-serialized message out to every client. Lets the caller
   * serialize a large body once instead of per send. */
  private broadcastRaw(data: string): void {
    for (const client of this.clients.keys()) {
      if (this.replayingClients.has(client)) continue;
      this.sendRaw(client, data);
    }
  }

  private send(ws: WebSocket, message: RemoteWebSocketServerMessage): void {
    this.sendRaw(ws, JSON.stringify(message));
  }

  private sendRaw(ws: WebSocket, data: string, onSent?: (error?: Error) => void): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;
    const maxBuffered =
      this.options.maxWebSocketOutboundBufferBytes ?? DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES;
    if (ws.bufferedAmount + Buffer.byteLength(data, "utf8") > maxBuffered) {
      this.dropWebSocketClient(ws);
      return false;
    }
    try {
      if (onSent) ws.send(data, onSent);
      else ws.send(data);
      return true;
    } catch {
      this.dropWebSocketClient(ws);
      return false;
    }
  }

  private dropWebSocketClient(ws: WebSocket): void {
    this.clients.delete(ws);
    this.replayingClients.delete(ws);
    this.clientLiveness.delete(ws);
    this.terminalWatches.delete(ws);
    this.terminalCursorSync.clearConnection(ws);
    this.detachDesktopInternalClient(ws);
    this.gitStateInterests.delete(ws);
    this.itemInterests.delete(ws);
    void Promise.resolve(this.notifyEventInterestsChanged()).catch(() => {});
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
    const scheme = this.tls ? "https" : "http";
    return `${scheme}://${normalizeHostForUrl(host)}:${listenPort}`;
  }

  /**
   * Gate 6 item 4.2: the SHA-256 leaf-certificate fingerprint the pairing QR
   * carries (clients pin it on first pair), or null on the plaintext listener.
   */
  tlsFingerprint(): string | null {
    return this.tls?.fingerprint ?? null;
  }

  private requireInfo(): RemoteAccessServerInfo {
    if (!this.info) {
      throw new Error("Remote access server has not started.");
    }
    return this.info;
  }
}
