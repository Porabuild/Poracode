import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { ZodError } from "zod";
import {
  GIT_REMOTE_PROCEDURE_SCOPES,
  isGitRemoteProcedure,
  LIGHTCODE_REMOTE_PROTOCOL_VERSION,
  REMOTE_STANDARD_SCOPES,
  remoteBrowserCommandSchema,
  remoteGitCallPayloadSchema,
  remoteEnvironmentDescriptorSchema,
  remoteAgentStatusesSchema,
  remoteHttpErrorSchema,
  remoteProjectCommandSchema,
  remoteRuntimeSummarySchema,
  remoteSettingsPatchSchema,
  remoteShellSnapshotSchema,
  remoteThreadSnapshotSchema,
  remoteTokenExchangePayloadSchema,
  remoteWebSocketClientMessageSchema,
  toWebSocketUrl,
  type RemoteAccessScope,
  type RemoteAgentStatuses,
  type RemoteEnvironmentDescriptor,
  type RemoteGitSummaries,
  type RemoteGitSummariesEvent,
  type RemoteAccessSessionSummary,
  type RemoteProjectCommand,
  type RemoteProjectCommandResult,
  type RemoteProjectsChangedEvent,
  type RemoteSettings,
  type RemoteSettingsPatch,
  type RemoteShellSnapshot,
  type RemoteThreadSnapshot,
  type RemoteThreadsChangedEvent,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import {
  clearPendingSteerPayloadSchema,
  DEFAULT_TERMINAL_SIZE,
  interruptThreadPayloadSchema,
  remoteThreadCommandSchema,
  resolveThreadServerRequestPayloadSchema,
  closeThreadPayloadSchema,
  resizeTerminalPayloadSchema,
  sendThreadInputPayloadSchema,
  setPendingSteerPayloadSchema,
  startShellPayloadSchema,
  startThreadPayloadSchema,
  writeTerminalPayloadSchema,
  type RemoteThreadCommand,
  type Thread,
} from "@/shared/contracts";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorEvent,
  SupervisorProcedureName,
} from "@/shared/ipc";
import { ipcProcedureMap } from "@/shared/ipc";
import {
  dbDeleteProject,
  dbDeleteThread,
  dbGetProjects,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeSummaries,
  dbGetThreads,
  dbUpsertProject,
  dbUpsertThread,
} from "../db";
import { buildWorktreeLocation } from "@/shared/worktree";
import { makeThreadTitle, titlePromptFromSegments } from "@/shared/threadTitle";
import {
  parseBearerAuthorizationHeader,
  RemoteHttpError,
  RemoteAuthStore,
  type AuthenticatedRemoteSession,
} from "./auth";
import type { RemoteAccessIdentity } from "./identity";
import type { RemoteBrowserGateway } from "./RemoteBrowserGateway";
import {
  buildLocalPairingIconSvg,
  buildLocalPairingManifestJson,
  buildLocalPairingPageHtml,
  buildLocalPairingServiceWorkerJs,
} from "./pairingPage";
import { tryServeBuiltMobileApp } from "./staticMobileApp";
import { applyRemoteProjectCommand } from "./projectCommands";

const MAX_JSON_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES = MAX_JSON_BODY_BYTES;
const DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES = 4 * 1024 * 1024;
const EVENT_BUFFER_LIMIT = 500;
const DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;
const DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT = {
  maxAttempts: 20,
  windowMs: 5 * 60 * 1000,
} as const;
const NATIVE_WEBVIEW_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
]);

/** Sort order for a thread already known to the DB; remote-created rows that
 * aren't present yet sort to the top via a descending timestamp. */
function sortOrderForThread(threads: readonly Thread[], threadId: string): number {
  const index = threads.findIndex((thread) => thread.id === threadId);
  return index === -1 ? -Date.now() : index;
}

export interface RemoteAccessServerInfo {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly pairingUrl: string;
}

export interface RemoteAccessServerOptions {
  readonly appVersion: string;
  readonly identity: RemoteAccessIdentity;
  readonly host: string;
  readonly advertisedHost?: string;
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
  /**
   * Remote-editable desktop settings (the AI helpers). `update` merges a
   * patch into the settings file and notifies the desktop renderer; both
   * return the remote-editable subset only — never the full settings file.
   */
  readonly settings?: {
    read(): RemoteSettings;
    update(patch: RemoteSettingsPatch): RemoteSettings;
  };
  /** Latest per-thread git/PR summaries published by the desktop renderer. */
  gitSummaries?(): RemoteGitSummaries;
}

type RemoteBroadcastEvent =
  | SupervisorEvent
  | RemoteGitSummariesEvent
  | RemoteProjectsChangedEvent
  | RemoteThreadsChangedEvent;

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

interface BufferedSupervisorEvent {
  readonly seq: number;
  readonly event: RemoteBroadcastEvent;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

function normalizeHostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

/** IPv4/IPv6 loopback (relay proxies to loopback, so these are the relay hop). */
function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return normalized === "127.0.0.1" || normalized === "::1" || normalized.startsWith("127.");
}

/**
 * Keys the rate-limit bucket on the real visitor. Behind the relay, every
 * request arrives from loopback (`relayHost` proxies to the server's own
 * loopback port), which would collapse all remote devices into one shared
 * bucket and defeat per-client throttling. When the socket is loopback we trust
 * a forwarding header and take its first hop (the original client) instead;
 * direct LAN connections fall back to the socket's remote address.
 *
 * NOTE: `relayHost` (owned by another agent, `src/server`) must populate
 * `x-forwarded-for` with the visitor address for this to distinguish devices;
 * if the header is absent this degrades gracefully to the loopback address.
 */
function resolveRateLimitClient(req: IncomingMessage): string {
  const remoteAddress = req.socket.remoteAddress ?? "unknown";
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    return remoteAddress;
  }
  const forwarded = req.headers["x-forwarded-for"];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = rawForwarded?.split(",")[0]?.trim();
  return firstHop && firstHop.length > 0 ? firstHop : remoteAddress;
}

function normalizeCorsOrigin(rawOrigin: string): string | null {
  const trimmed = rawOrigin.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "null") return null;
  try {
    const url = new URL(trimmed);
    if (url.origin !== "null") return url.origin;
    if (url.protocol === "capacitor:" || url.protocol === "ionic:") {
      return `${url.protocol}//${url.host}`;
    }
    return null;
  } catch {
    return null;
  }
}

function buildPairingUrl(input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
  readonly pairingAppUrl?: string;
}): string {
  const pairingUrl = new URL("/pair", input.pairingAppUrl ?? input.httpBaseUrl);
  if (input.pairingAppUrl) {
    pairingUrl.searchParams.set("host", input.httpBaseUrl);
  }
  pairingUrl.hash = new URLSearchParams([["token", input.credential]]).toString();
  return pairingUrl.toString();
}

function threadIdFromPath(pathname: string, suffix: string): string | null {
  if (!pathname.startsWith("/api/threads/") || !pathname.endsWith(suffix)) {
    return null;
  }
  const raw = pathname.slice("/api/threads/".length, pathname.length - suffix.length);
  if (!raw) return null;
  if (raw.includes("/")) return null;
  try {
    const threadId = decodeURIComponent(raw);
    return threadId.includes("/") ? null : threadId;
  } catch {
    return null;
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_JSON_BODY_BYTES) {
      throw new RemoteHttpError("body_too_large", "Request body is too large.", 413);
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

/**
 * POST /api/threads/:threadId<suffix> endpoints that validate the body (merged
 * with the path's threadId) and forward it to a supervisor procedure.
 */
const THREAD_POST_ROUTES: ReadonlyArray<{
  readonly suffix: string;
  readonly scope: RemoteAccessScope;
  dispatch(
    call: RemoteAccessServerOptions["callSupervisor"],
    body: Record<string, unknown>,
  ): Promise<unknown>;
}> = [
  {
    suffix: "/send",
    scope: "session:operate",
    dispatch: (call, body) => call("sendThreadInput", sendThreadInputPayloadSchema.parse(body)),
  },
  {
    suffix: "/interrupt",
    scope: "session:operate",
    dispatch: (call, body) => call("interruptThread", interruptThreadPayloadSchema.parse(body)),
  },
  {
    suffix: "/close",
    scope: "session:operate",
    dispatch: (call, body) => call("closeThread", closeThreadPayloadSchema.parse(body)),
  },
  {
    suffix: "/steer/set",
    scope: "session:operate",
    dispatch: (call, body) => call("setPendingSteer", setPendingSteerPayloadSchema.parse(body)),
  },
  {
    suffix: "/steer/clear",
    scope: "session:operate",
    dispatch: (call, body) => call("clearPendingSteer", clearPendingSteerPayloadSchema.parse(body)),
  },
  {
    suffix: "/terminal/write",
    scope: "terminal:operate",
    dispatch: (call, body) => call("writeTerminal", writeTerminalPayloadSchema.parse(body)),
  },
  {
    suffix: "/terminal/resize",
    scope: "terminal:operate",
    dispatch: (call, body) => call("resizeTerminal", resizeTerminalPayloadSchema.parse(body)),
  },
  {
    // Closes a terminal by id. `closeThread` is shell-aware on the supervisor,
    // so this tears down a dev shell or a CLI thread's PTY alike.
    suffix: "/terminal/close",
    scope: "terminal:operate",
    dispatch: (call, body) => call("closeThread", closeThreadPayloadSchema.parse(body)),
  },
  {
    suffix: "/requests/resolve",
    scope: "requests:resolve",
    dispatch: (call, body) =>
      call("resolveThreadServerRequest", resolveThreadServerRequestPayloadSchema.parse(body)),
  },
];

export class RemoteAccessServer {
  private readonly auth: RemoteAuthStore;
  private readonly server: Server;
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<WebSocket, AuthenticatedRemoteSession>();
  private readonly clientLiveness = new Map<WebSocket, boolean>();
  /** Per-connection terminal ids the client opted into live `terminal-output` for. */
  private readonly terminalWatches = new Map<WebSocket, Set<string>>();
  private readonly rateLimitBuckets = new Map<string, RateLimitBucket>();
  private readonly eventBuffer: BufferedSupervisorEvent[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private info: RemoteAccessServerInfo | null = null;

  constructor(private readonly options: RemoteAccessServerOptions) {
    this.auth = options.authStore ?? new RemoteAuthStore();
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: options.maxWebSocketPayloadBytes ?? DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES,
    });
    this.server = createServer((req, res) => {
      void this.handleHttp(req, res);
    });
    this.server.on("upgrade", (req, socket, head) => {
      void this.handleUpgrade(req, socket, head);
    });
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
    const bindHost = this.options.host;
    const host =
      this.options.advertisedHost?.trim() ||
      (bindHost === "0.0.0.0" || bindHost === "::" ? "127.0.0.1" : bindHost);
    const httpBaseUrl = `http://${normalizeHostForUrl(host)}:${address.port}/`;
    const pairingCredential = this.auth.issuePairingCredential({
      label: "Startup pairing",
    });

    const pairingAppUrl = this.options.pairingAppUrl ?? this.options.devMobileAppUrl;
    this.info = {
      httpBaseUrl,
      wsBaseUrl: toWebSocketUrl(httpBaseUrl).toString(),
      pairingUrl: buildPairingUrl({
        httpBaseUrl,
        credential: pairingCredential.credential,
        ...(pairingAppUrl ? { pairingAppUrl } : {}),
      }),
    };
    this.startWebSocketHeartbeat();
    return this.info;
  }

  /**
   * Stops the server. Resolves once the HTTP server has actually closed so a
   * caller (e.g. the headless host) can safely tear down the database afterward
   * without crashing an in-flight request. Idle keep-alive sockets are dropped
   * immediately; active requests are given a short grace period to finish.
   */
  async dispose(): Promise<void> {
    this.stopWebSocketHeartbeat();
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
    for (const [client, watched] of this.terminalWatches) {
      if (!watched.has(id)) continue;
      if (client.readyState !== client.OPEN) continue;
      if (client.bufferedAmount > 1_500_000) continue;
      this.send(client, { type: "terminal-output", id, data });
    }
  }

  issuePairingUrl(label?: string): string {
    const info = this.requireInfo();
    const issued = this.auth.issuePairingCredential({
      ...(label ? { label } : {}),
    });
    const pairingAppUrl = this.options.pairingAppUrl ?? this.options.devMobileAppUrl;
    return buildPairingUrl({
      httpBaseUrl: info.httpBaseUrl,
      credential: issued.credential,
      ...(pairingAppUrl ? { pairingAppUrl } : {}),
    });
  }

  private descriptor(): RemoteEnvironmentDescriptor {
    const info = this.requireInfo();
    return remoteEnvironmentDescriptorSchema.parse({
      protocolVersion: LIGHTCODE_REMOTE_PROTOCOL_VERSION,
      desktopId: this.options.identity.desktopId,
      label: this.options.identity.label,
      appVersion: this.options.appVersion,
      auth: {
        policy: "remote-reachable",
        bootstrapMethods: ["one-time-token"],
        sessionMethods: ["bearer-access-token"],
        scopes: REMOTE_STANDARD_SCOPES,
      },
      endpoints: {
        httpBaseUrl: info.httpBaseUrl,
        wsBaseUrl: info.wsBaseUrl,
      },
    });
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const corsAllowed = this.applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(corsAllowed ? 204 : 403);
      res.end();
      return;
    }
    if (!corsAllowed) {
      this.writeError(
        res,
        new RemoteHttpError("origin_not_allowed", "Remote origin is not allowed.", 403),
      );
      return;
    }

    try {
      const url = new URL(req.url ?? "/", this.requireInfo().httpBaseUrl);
      if (req.method === "GET" && url.pathname === "/.well-known/lightcode/environment") {
        this.writeJson(res, 200, this.descriptor());
        return;
      }
      if (req.method === "GET" && (url.pathname === "/pair" || url.pathname === "/app")) {
        if (this.options.devMobileAppUrl) {
          const target = new URL(this.options.devMobileAppUrl);
          for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
          target.searchParams.set("host", this.requireInfo().httpBaseUrl);
          res.writeHead(302, { location: target.toString() });
          res.end();
          return;
        }
        if (tryServeBuiltMobileApp(url.pathname, res)) {
          return;
        }
        this.writeHtml(
          res,
          200,
          buildLocalPairingPageHtml({ httpBaseUrl: this.requireInfo().httpBaseUrl }),
        );
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
        if (tryServeBuiltMobileApp(url.pathname, res)) {
          return;
        }
      }
      if (req.method === "GET" && url.pathname === "/manifest.webmanifest") {
        this.writeText(res, 200, buildLocalPairingManifestJson(), "application/manifest+json");
        return;
      }
      if (req.method === "GET" && url.pathname === "/service-worker.js") {
        this.writeText(
          res,
          200,
          buildLocalPairingServiceWorkerJs(),
          "application/javascript; charset=utf-8",
        );
        return;
      }
      if (req.method === "GET" && url.pathname === "/app-icon.svg") {
        this.writeText(res, 200, buildLocalPairingIconSvg(), "image/svg+xml; charset=utf-8");
        return;
      }
      if (req.method === "POST" && url.pathname === "/oauth/token") {
        this.enforceRateLimit(
          req,
          "oauth-token",
          this.options.tokenExchangeRateLimit ?? DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT,
        );
        const payload = remoteTokenExchangePayloadSchema.parse(await readJsonBody(req));
        this.writeJson(
          res,
          200,
          this.auth.exchangePairingCredential({
            credential: payload.credential,
            ...(payload.scopes ? { scopes: payload.scopes } : {}),
            ...(payload.client ? { client: payload.client } : {}),
          }),
        );
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/auth/websocket-ticket") {
        const token = this.requireBearer(req, ["session:read"]);
        this.writeJson(res, 200, this.auth.issueWebSocketTicket({ accessToken: token }));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/snapshot") {
        this.requireBearer(req, ["session:read"]);
        this.writeJson(res, 200, this.buildShellSnapshot());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/agent-statuses") {
        this.requireBearer(req, ["session:read"]);
        this.writeJson(res, 200, await this.buildAgentStatuses());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/provider-usage") {
        this.requireBearer(req, ["session:read"]);
        this.writeJson(res, 200, await this.options.callSupervisor("getProviderUsage", {}));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/settings") {
        this.requireBearer(req, ["session:read"]);
        this.writeJson(res, 200, { settings: this.requireSettingsGateway().read() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/settings") {
        this.requireBearer(req, ["session:operate"]);
        const patch = remoteSettingsPatchSchema.parse(await readJsonBody(req));
        this.writeJson(res, 200, { settings: this.requireSettingsGateway().update(patch) });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/browser/state") {
        this.requireBearer(req, ["session:read"]);
        this.writeJson(res, 200, { state: this.requireBrowserGateway().state() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/browser/command") {
        this.requireBearer(req, ["session:operate"]);
        const command = remoteBrowserCommandSchema.parse(await readJsonBody(req));
        this.writeJson(res, 200, { state: await this.requireBrowserGateway().command(command) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/git/call") {
        this.writeJson(res, 200, { result: await this.runGitCall(req) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/projects/command") {
        this.requireBearer(req, ["projects:manage"]);
        const command = remoteProjectCommandSchema.parse(await readJsonBody(req));
        const result = await this.runProjectCommand(command);
        // Tell every connected client to refresh its shell snapshot.
        this.publishSupervisorEvent({
          type: "remote-projects-changed",
          projects: result.projects,
        });
        this.writeJson(res, 200, result);
        return;
      }
      const historyThreadId = threadIdFromPath(url.pathname, "/history");
      if (req.method === "GET" && historyThreadId) {
        this.requireBearer(req, ["session:read"]);
        this.writeJson(res, 200, await this.buildThreadSnapshot(historyThreadId));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/threads/start") {
        this.requireBearer(req, ["session:operate"]);
        const payload = startThreadPayloadSchema.parse(await readJsonBody(req));
        if (!payload.threadId) {
          throw new RemoteHttpError(
            "thread_id_required",
            "Remote thread start requires an existing thread id.",
            400,
          );
        }
        if (!dbGetThreads().some((thread) => thread.id === payload.threadId)) {
          throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
        }
        this.writeJson(res, 200, await this.options.callSupervisor("startThread", payload));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/terminal/start") {
        // Spawns a dev shell. The id is carried in the body (`shellId`), not the
        // path, since this isn't scoped to a thread.
        this.requireBearer(req, ["terminal:operate"]);
        const payload = startShellPayloadSchema.parse(await readJsonBody(req));
        await this.options.callSupervisor("startShell", payload);
        this.writeJson(res, 200, { ok: true });
        return;
      }
      const commandThreadId = threadIdFromPath(url.pathname, "/command");
      if (req.method === "POST" && commandThreadId) {
        this.requireBearer(req, ["session:operate"]);
        const body = await readJsonBody(req);
        const command = remoteThreadCommandSchema.parse({
          ...(typeof body === "object" && body !== null ? body : {}),
          threadId: commandThreadId,
        });
        const requiresRenderer = await this.applyRemoteThreadCommand(command);
        if (requiresRenderer && this.options.dispatchThreadCommand?.(command) !== true) {
          throw new RemoteHttpError(
            "desktop_unavailable",
            "The desktop app is not available to apply this change.",
            503,
          );
        }
        if (!requiresRenderer) {
          const rendererCommand =
            command.kind === "start" ? { ...command, launchRuntime: false } : command;
          this.options.dispatchThreadCommand?.(rendererCommand);
          this.publishThreadsChanged([command.threadId]);
        }
        this.writeJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST") {
        for (const route of THREAD_POST_ROUTES) {
          const threadId = threadIdFromPath(url.pathname, route.suffix);
          if (!threadId) continue;
          this.requireBearer(req, [route.scope]);
          const body = await readJsonBody(req);
          await route.dispatch(this.options.callSupervisor, {
            ...(typeof body === "object" && body !== null ? body : {}),
            threadId,
          });
          this.writeJson(res, 200, { ok: true });
          return;
        }
      }
      this.writeError(res, new RemoteHttpError("not_found", "Remote endpoint not found.", 404));
    } catch (error) {
      this.writeError(res, error);
    }
  }

  private async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", this.requireInfo().httpBaseUrl);
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }
      // Browser WebSockets are opened directly by renderer/PWA clients rather
      // than through the HTTP proxy path. Keep HTTP CORS as the ticket-minting
      // gate and treat the short-lived, one-use ticket as the WS capability.
      const ticket = url.searchParams.get("ticket") ?? "";
      const session = this.auth.consumeWebSocketTicket(ticket);
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.handleConnection(ws, req, session);
      });
    } catch (error) {
      if (error instanceof RemoteHttpError) {
        this.rejectUpgrade(
          socket,
          error.status,
          error.status === 401 ? "Unauthorized" : "Forbidden",
        );
        return;
      }
      socket.destroy();
    }
  }

  private handleConnection(
    ws: WebSocket,
    req: IncomingMessage,
    session: AuthenticatedRemoteSession,
  ): void {
    this.clients.set(ws, session);
    this.clientLiveness.set(ws, true);
    this.terminalWatches.set(ws, new Set());
    // Browser mirroring is per-connection opt-in (frames are heavy); the
    // gateway's screencast stops once the last watcher unsubscribes.
    let browserWatch: (() => void) | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSessionExpiry = () => {
      const delayMs = session.expiresAtMs - Date.now();
      if (delayMs <= 0) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1008, "Remote access session expired");
        } else {
          ws.terminate();
        }
        return;
      }
      expiryTimer = setTimeout(scheduleSessionExpiry, Math.min(delayMs, MAX_TIMEOUT_DELAY_MS));
      expiryTimer.unref?.();
    };
    ws.on("close", () => {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      browserWatch?.();
      browserWatch = null;
      this.terminalWatches.delete(ws);
      this.clients.delete(ws);
      this.clientLiveness.delete(ws);
    });
    ws.on("pong", () => {
      this.clientLiveness.set(ws, true);
    });
    ws.on("error", () => {
      ws.terminate();
    });
    ws.on("message", (data) => {
      try {
        const message = remoteWebSocketClientMessageSchema.parse(
          JSON.parse(data.toString()) as unknown,
        );
        if (message.type === "ping") {
          this.send(ws, {
            type: "pong",
            ...(message.id ? { id: message.id } : {}),
            ...(message.sentAt === undefined ? {} : { sentAt: message.sentAt }),
            receivedAt: Date.now(),
          });
        }
        if (message.type === "browser-watch") {
          const gateway = this.options.browser;
          if (!gateway || !session.scopes.includes("session:read")) {
            this.send(ws, {
              type: "browser-mirror-status",
              status: {
                status: "unavailable",
                tabId: null,
                reason: "Browser mirroring is not available on this desktop.",
              },
            });
            return;
          }
          if (browserWatch) {
            gateway.refresh();
            return;
          }
          browserWatch = gateway.watch({
            onFrame: (frame) => {
              // Drop frames when the socket is congested; the next frame
              // carries the complete picture anyway.
              if (ws.bufferedAmount > 1_500_000) return;
              this.send(ws, {
                type: "browser-frame",
                tabId: frame.tabId,
                data: frame.data,
                metadata: frame.metadata,
              });
            },
            onState: (state) => this.send(ws, { type: "browser-state", state }),
            onStatus: (status) => this.send(ws, { type: "browser-mirror-status", status }),
          });
        }
        if (message.type === "browser-unwatch") {
          browserWatch?.();
          browserWatch = null;
        }
        if (message.type === "browser-input") {
          if (!this.options.browser || !session.scopes.includes("session:operate")) return;
          void this.options.browser.dispatchInput(message.input).catch(() => {});
        }
        if (message.type === "terminal-watch") {
          if (!session.scopes.includes("terminal:read")) return;
          this.terminalWatches.get(ws)?.add(message.id);
        }
        if (message.type === "terminal-unwatch") {
          this.terminalWatches.get(ws)?.delete(message.id);
        }
      } catch {
        // Ignore invalid client messages; all state changes go through HTTP in this slice.
      }
    });
    scheduleSessionExpiry();

    const lastSeenSeq = this.parseLastSeenSeq(req);
    this.send(ws, { type: "ready", seq: this.seq });
    if (lastSeenSeq === null || lastSeenSeq === this.seq) {
      // No client cursor, or the client is already current — nothing to replay.
      return;
    }
    if (lastSeenSeq > this.seq) {
      // Seq regressed below the client's cursor: `this.seq` is in-memory and
      // resets to 0 on restart while bearer sessions persist, so a client
      // reconnecting with a higher lastSeenSeq to a restarted server would
      // otherwise silently keep stale state. Force a fresh snapshot.
      this.send(ws, {
        type: "resync-required",
        seq: this.seq,
        reason: "Server event stream reset; request a fresh snapshot.",
      });
      return;
    }

    const replay = this.eventBuffer.filter((entry) => entry.seq > lastSeenSeq);
    if (replay.length !== this.seq - lastSeenSeq) {
      this.send(ws, {
        type: "resync-required",
        seq: this.seq,
        reason: "Event replay window expired; request a fresh snapshot.",
      });
      return;
    }
    for (const entry of replay) {
      this.send(ws, {
        type: "event",
        seq: entry.seq,
        event: entry.event,
      });
    }
  }

  private buildShellSnapshot(): RemoteShellSnapshot {
    const threads = dbGetThreads();
    const runtimeSummariesByThread: RemoteShellSnapshot["runtimeSummariesByThread"] = {};
    const visibleThreads = threads.filter((thread) => !thread.archived);
    const runtimeSummaries = dbGetThreadRuntimeSummaries(visibleThreads.map((thread) => thread.id));
    for (const thread of visibleThreads) {
      const summary = runtimeSummaries[thread.id] ?? { itemCount: 0 };
      runtimeSummariesByThread[thread.id] = remoteRuntimeSummarySchema.parse({
        itemCount: summary.itemCount,
        ...(summary.latestItemId ? { latestItemId: summary.latestItemId } : {}),
        ...(summary.latestItemType ? { latestItemType: summary.latestItemType } : {}),
        ...(summary.latestItemState ? { latestItemState: summary.latestItemState } : {}),
        ...(summary.contextUsage ? { contextUsage: summary.contextUsage } : {}),
      });
    }
    return remoteShellSnapshotSchema.parse({
      snapshotSeq: this.seq,
      projects: dbGetProjects(),
      threads,
      runtimeSummariesByThread,
      gitSummariesByThread: this.options.gitSummaries?.() ?? {},
      updatedAt: new Date().toISOString(),
    });
  }

  private async buildAgentStatuses(): Promise<RemoteAgentStatuses> {
    const wslDistros = [
      ...new Set(
        dbGetProjects().flatMap((project) =>
          project.location.kind === "wsl" ? [project.location.distro] : [],
        ),
      ),
    ];
    const statuses = await this.options.callSupervisor("getAgentStatuses", { wslDistros });
    return remoteAgentStatusesSchema.parse({
      windows: statuses.windows,
      wsl: statuses.wsl,
      updatedAt: new Date().toISOString(),
    });
  }

  private async buildThreadSnapshot(threadId: string): Promise<RemoteThreadSnapshot> {
    const thread = dbGetThreads().find((entry) => entry.id === threadId);
    if (!thread) {
      throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
    }

    let terminalScrollback: string | undefined;
    let terminalSize: RemoteThreadSnapshot["terminalSize"] | undefined;
    try {
      const [scrollback, size] = await Promise.all([
        this.options.callSupervisor("readTerminalScrollback", { threadId }),
        this.options.callSupervisor("readTerminalSize", { threadId }),
      ]);
      terminalScrollback = scrollback;
      terminalSize = size ?? undefined;
    } catch {
      terminalScrollback = undefined;
      terminalSize = undefined;
    }

    return remoteThreadSnapshotSchema.parse({
      snapshotSeq: this.seq,
      thread,
      runtimeItems: dbGetThreadRuntimeItems(threadId),
      completedTurns: dbGetThreadCompletedTurns(threadId),
      contextUsage: dbGetThreadContextUsage(threadId),
      ...(terminalScrollback ? { terminalScrollback } : {}),
      ...(terminalSize ? { terminalSize } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Generic desktop-supervisor passthrough. The PWA reuses desktop-backed
   * surfaces which call bridge methods directly; rather than a REST route per
   * method, the client posts `{ procedure, payload }` here. Only allowlisted
   * procedures are accepted, each gated by its required scope and validated
   * against its own payload schema before reaching the supervisor.
   */
  private async runGitCall(req: IncomingMessage): Promise<unknown> {
    const { procedure, payload } = remoteGitCallPayloadSchema.parse(await readJsonBody(req));
    if (!isGitRemoteProcedure(procedure)) {
      throw new RemoteHttpError(
        "git_procedure_not_allowed",
        `Git procedure "${procedure}" is not available to remote clients.`,
        403,
      );
    }
    this.requireBearer(req, [GIT_REMOTE_PROCEDURE_SCOPES[procedure]]);
    const name = procedure as SupervisorProcedureName;
    const parsedPayload = ipcProcedureMap[name].payloadSchema.parse(payload) as IpcProcedurePayload<
      typeof name
    >;
    return this.options.callSupervisor(name, parsedPayload);
  }

  /**
   * Applies a remote project command. The DB is the source of truth: new
   * projects are written directly and clones are driven through the supervisor.
   * On the desktop the renderer learns about the change via the broadcast
   * `remote-projects-changed` event (and reloads from the DB on next launch);
   * headless servers have no renderer, so the DB write is the whole story.
   */
  private runProjectCommand(command: RemoteProjectCommand): Promise<RemoteProjectCommandResult> {
    return applyRemoteProjectCommand(command, {
      getProjects: () => dbGetProjects(),
      listProjectThreadIds: (projectId) =>
        dbGetThreads()
          .filter((thread) => thread.projectId === projectId)
          .map((thread) => thread.id),
      upsertProject: (project, sortOrder) => dbUpsertProject(project, sortOrder),
      deleteProject: (projectId) => dbDeleteProject(projectId),
      closeThread: (threadId) => this.closeThreadBestEffort(threadId),
      cloneRepo: (input) => this.options.callSupervisor("cloneRepo", input),
      makeDirectory: (path) => {
        mkdirSync(path);
      },
      platform: process.platform,
      now: () => new Date().toISOString(),
    });
  }

  /**
   * Applies thread commands to the durable DB path used by remote snapshots.
   * Returns true for commands whose behavior still requires renderer-owned side
   * effects beyond simple thread metadata persistence.
   */
  private async applyRemoteThreadCommand(command: RemoteThreadCommand): Promise<boolean> {
    switch (command.kind) {
      case "start":
        await this.startRemoteThread(command);
        return false;
      case "rename":
        this.updateRemoteThread(command.threadId, (thread) => ({
          ...thread,
          title: command.title,
          updatedAt: new Date().toISOString(),
        }));
        return false;
      case "set-done":
        if (command.done) {
          await this.closeThreadBestEffort(command.threadId);
          const now = new Date().toISOString();
          this.updateRemoteThread(command.threadId, (thread) => ({
            ...thread,
            done: true,
            doneAt: now,
            starred: false,
          }));
        } else {
          this.updateRemoteThread(command.threadId, (thread) => ({
            ...thread,
            done: false,
            doneAt: undefined,
          }));
        }
        return false;
      case "set-starred":
        this.updateRemoteThread(command.threadId, (thread) => ({
          ...thread,
          starred: command.starred,
        }));
        return false;
      case "set-worktree":
        this.updateRemoteThread(command.threadId, (thread) => ({
          ...thread,
          worktreePath: command.worktreePath,
          ...(command.worktreeBranch ? { worktreeBranch: command.worktreeBranch } : {}),
          updatedAt: new Date().toISOString(),
        }));
        return false;
      case "archive":
        await this.closeThreadBestEffort(command.threadId);
        this.updateRemoteThread(command.threadId, (thread) => ({
          ...thread,
          archived: true,
          updatedAt: new Date().toISOString(),
        }));
        return false;
      case "unarchive":
        this.updateRemoteThread(command.threadId, (thread) => ({
          ...thread,
          archived: false,
          updatedAt: new Date().toISOString(),
        }));
        return false;
      case "delete":
        await this.closeThreadBestEffort(command.threadId);
        dbDeleteThread(command.threadId);
        return false;
      case "delete-worktree-group":
        return true;
    }
  }

  private async startRemoteThread(
    command: Extract<RemoteThreadCommand, { kind: "start" }>,
  ): Promise<void> {
    const project = dbGetProjects().find((entry) => entry.id === command.projectId);
    if (!project) {
      throw new RemoteHttpError("project_not_found", "Project not found.", 404);
    }

    const threads = dbGetThreads();
    const existing = threads.some((thread) => thread.id === command.threadId);
    const now = new Date().toISOString();
    const presentationMode = command.presentationMode ?? "terminal";
    const titlePrompt = titlePromptFromSegments(command.prompt, command.segments);
    const thread: Thread = {
      id: command.threadId,
      projectId: command.projectId,
      title: makeThreadTitle(titlePrompt) || "New thread",
      agentKind: command.agentKind,
      ...(command.agentInstanceId ? { agentInstanceId: command.agentInstanceId } : {}),
      config: command.config,
      status: "launching",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode,
      ...(presentationMode !== "terminal" ? { threadStatusSource: "server" } : {}),
      ...(command.worktreePath ? { worktreePath: command.worktreePath } : {}),
      ...(command.worktreeBranch ? { worktreeBranch: command.worktreeBranch } : {}),
      createdAt: now,
      updatedAt: now,
      activeTurnStartedAt: now,
    };
    dbUpsertThread(thread, sortOrderForThread(threads, command.threadId));

    const projectLocation = command.worktreePath
      ? buildWorktreeLocation(project.location, command.worktreePath)
      : project.location;
    try {
      await this.options.callSupervisor("startThread", {
        threadId: command.threadId,
        projectLocation,
        agentKind: command.agentKind,
        ...(command.agentInstanceId ? { agentInstanceId: command.agentInstanceId } : {}),
        config: command.config,
        prompt: command.prompt,
        ...(command.segments ? { segments: command.segments } : {}),
        initialSize: DEFAULT_TERMINAL_SIZE,
        ...(command.presentationMode ? { presentationMode: command.presentationMode } : {}),
      });
    } catch (error) {
      if (!existing) dbDeleteThread(command.threadId);
      throw error;
    }
  }

  private updateRemoteThread(threadId: string, update: (thread: Thread) => Thread): void {
    const threads = dbGetThreads();
    const thread = threads.find((entry) => entry.id === threadId);
    if (!thread) {
      throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
    }
    dbUpsertThread(update(thread), sortOrderForThread(threads, threadId));
  }

  private async closeThreadBestEffort(threadId: string): Promise<void> {
    await this.options.callSupervisor("closeThread", { threadId }).catch(() => undefined);
  }

  private requireBrowserGateway(): RemoteBrowserGateway {
    if (!this.options.browser) {
      throw new RemoteHttpError(
        "browser_unavailable",
        "The desktop browser is not available.",
        503,
      );
    }
    return this.options.browser;
  }

  private requireSettingsGateway(): NonNullable<RemoteAccessServerOptions["settings"]> {
    if (!this.options.settings) {
      throw new RemoteHttpError("settings_unavailable", "Desktop settings are not available.", 503);
    }
    return this.options.settings;
  }

  private requireBearer(req: IncomingMessage, scopes: readonly RemoteAccessScope[]): string {
    const header = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const token = parseBearerAuthorizationHeader(header);
    if (!token) {
      throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
    }
    this.auth.authenticateBearerToken(token, scopes);
    return token;
  }

  private parseLastSeenSeq(req: IncomingMessage): number | null {
    try {
      const url = new URL(req.url ?? "/", this.requireInfo().httpBaseUrl);
      const raw = url.searchParams.get("lastSeenSeq");
      if (raw === null) return null;
      const seq = Number(raw);
      return Number.isSafeInteger(seq) && seq >= 0 ? seq : null;
    } catch {
      return null;
    }
  }

  private startWebSocketHeartbeat(): void {
    if (this.heartbeatTimer) return;
    const intervalMs =
      this.options.webSocketHeartbeatIntervalMs ?? DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS;
    if (intervalMs <= 0) return;
    this.heartbeatTimer = setInterval(() => this.sweepWebSocketLiveness(), intervalMs);
    this.heartbeatTimer.unref?.();
  }

  private stopWebSocketHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sweepWebSocketLiveness(): void {
    for (const client of this.clients.keys()) {
      if (client.readyState !== WebSocket.OPEN) {
        client.terminate();
        continue;
      }
      if (this.clientLiveness.get(client) === false) {
        client.terminate();
        continue;
      }
      this.clientLiveness.set(client, false);
      try {
        client.ping();
      } catch {
        client.terminate();
      }
    }
  }

  private applyCors(req: IncomingMessage, res: ServerResponse): boolean {
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    const origin = this.trustedRequestOrigin(req);
    if (origin === false) return false;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    return true;
  }

  private trustedRequestOrigin(req: IncomingMessage): string | null | false {
    const rawOrigin = Array.isArray(req.headers.origin)
      ? req.headers.origin[0]
      : req.headers.origin;
    if (!rawOrigin) return null;
    const origin = normalizeCorsOrigin(rawOrigin);
    if (!origin || !this.isTrustedCorsOrigin(origin)) return false;
    return origin;
  }

  private isTrustedCorsOrigin(origin: string): boolean {
    if (NATIVE_WEBVIEW_ORIGINS.has(origin)) return true;
    const allowed = new Set<string>();
    for (const value of [
      this.info?.httpBaseUrl,
      this.options.pairingAppUrl,
      this.options.devMobileAppUrl,
      ...(this.options.trustedCorsOrigins ?? []),
    ]) {
      if (!value) continue;
      const normalized = normalizeCorsOrigin(value);
      if (normalized) allowed.add(normalized);
    }
    return allowed.has(origin);
  }

  private enforceRateLimit(
    req: IncomingMessage,
    bucketName: string,
    config: { readonly maxAttempts: number; readonly windowMs: number },
  ): void {
    const now = Date.now();
    for (const [key, bucket] of this.rateLimitBuckets) {
      if (bucket.resetAtMs <= now) {
        this.rateLimitBuckets.delete(key);
      }
    }
    const client = resolveRateLimitClient(req);
    const key = `${bucketName}:${client}`;
    const bucket = this.rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAtMs <= now) {
      this.rateLimitBuckets.set(key, { count: 1, resetAtMs: now + config.windowMs });
      return;
    }
    if (bucket.count >= config.maxAttempts) {
      throw new RemoteHttpError(
        "rate_limited",
        "Too many remote access attempts. Try again shortly.",
        429,
      );
    }
    bucket.count += 1;
  }

  private writeJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(`${JSON.stringify(data)}\n`);
  }

  private writeHtml(res: ServerResponse, status: number, html: string): void {
    this.writeText(res, status, html, "text/html; charset=utf-8");
  }

  private writeText(res: ServerResponse, status: number, body: string, contentType: string): void {
    res.writeHead(status, { "content-type": contentType });
    res.end(body);
  }

  private writeError(res: ServerResponse, error: unknown): void {
    if (error instanceof RemoteHttpError) {
      this.writeJson(
        res,
        error.status,
        remoteHttpErrorSchema.parse({
          error: {
            code: error.code,
            message: error.message,
          },
        }),
      );
      return;
    }
    if (error instanceof SyntaxError) {
      this.writeJson(
        res,
        400,
        remoteHttpErrorSchema.parse({
          error: { code: "invalid_json", message: "Request body must be valid JSON." },
        }),
      );
      return;
    }
    if (error instanceof ZodError) {
      this.writeJson(
        res,
        400,
        remoteHttpErrorSchema.parse({
          error: { code: "invalid_request", message: "Request payload is invalid." },
        }),
      );
      return;
    }
    this.writeJson(
      res,
      500,
      remoteHttpErrorSchema.parse({
        error: { code: "internal_error", message: "Internal server error." },
      }),
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

  private rejectUpgrade(socket: Duplex, status: number, reason: string): void {
    try {
      socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
    } finally {
      socket.destroy();
    }
  }

  private requireInfo(): RemoteAccessServerInfo {
    if (!this.info) {
      throw new Error("Remote access server has not started.");
    }
    return this.info;
  }
}
