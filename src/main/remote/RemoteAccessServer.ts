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
  type RemoteSettings,
  type RemoteSettingsPatch,
  type RemoteShellSnapshot,
  type RemoteThreadSnapshot,
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
  dbDeleteThread,
  dbGetProjects,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
  dbGetThreadRuntimeItems,
  dbGetThreads,
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

const MAX_JSON_BODY_BYTES = 1024 * 1024;
const EVENT_BUFFER_LIMIT = 500;
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

interface BufferedSupervisorEvent {
  readonly seq: number;
  readonly event: SupervisorEvent | RemoteGitSummariesEvent;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

function normalizeHostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
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
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly clients = new Map<WebSocket, AuthenticatedRemoteSession>();
  /** Per-connection terminal ids the client opted into live `terminal-output` for. */
  private readonly terminalWatches = new Map<WebSocket, Set<string>>();
  private readonly rateLimitBuckets = new Map<string, RateLimitBucket>();
  private readonly eventBuffer: BufferedSupervisorEvent[] = [];
  private seq = 0;
  private info: RemoteAccessServerInfo | null = null;

  constructor(private readonly options: RemoteAccessServerOptions) {
    this.auth = options.authStore ?? new RemoteAuthStore();
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
    return this.info;
  }

  dispose(): void {
    for (const client of this.clients.keys()) {
      client.terminate();
    }
    this.clients.clear();
    this.wss.close();
    this.server.close();
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
  publishSupervisorEvent(event: SupervisorEvent | RemoteGitSummariesEvent): void {
    // Terminal output is high-volume and ephemeral: keep it off the replayable
    // event stream (replaying PTY bytes would garble the screen) and only send
    // it to clients that opted into that terminal via `terminal-watch`.
    if (event.type === "thread-output") {
      this.broadcastTerminalOutput(event.threadId, event.data);
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
      const historyThreadId = threadIdFromPath(url.pathname, "/history");
      if (req.method === "GET" && historyThreadId) {
        this.requireBearer(req, ["session:read"]);
        this.writeJson(res, 200, await this.buildThreadSnapshot(historyThreadId));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/threads/start") {
        this.requireBearer(req, ["session:operate"]);
        const payload = startThreadPayloadSchema.parse(await readJsonBody(req));
        this.writeJson(res, 200, await this.options.callSupervisor("startThread", payload));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/terminal/start") {
        // Spawns a dev shell. The id is carried in the body (`shellId`), not the
        // path, since this isn't scoped to a thread.
        this.requireBearer(req, ["terminal:operate"]);
        const payload = startShellPayloadSchema.parse(await readJsonBody(req));
        this.writeJson(res, 200, await this.options.callSupervisor("startShell", payload));
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
      const ticket = url.searchParams.get("ticket") ?? "";
      const session = this.auth.consumeWebSocketTicket(ticket);
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.handleConnection(ws, req, session);
      });
    } catch {
      socket.destroy();
    }
  }

  private handleConnection(
    ws: WebSocket,
    req: IncomingMessage,
    session: AuthenticatedRemoteSession,
  ): void {
    this.clients.set(ws, session);
    this.terminalWatches.set(ws, new Set());
    // Browser mirroring is per-connection opt-in (frames are heavy); the
    // gateway's screencast stops once the last watcher unsubscribes.
    let browserWatch: (() => void) | null = null;
    ws.on("close", () => {
      browserWatch?.();
      browserWatch = null;
      this.terminalWatches.delete(ws);
      this.clients.delete(ws);
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

    const lastSeenSeq = this.parseLastSeenSeq(req);
    this.send(ws, { type: "ready", seq: this.seq });
    if (lastSeenSeq === null || lastSeenSeq >= this.seq) {
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
    // Loading runtime items is the expensive part of this snapshot; archived
    // threads are hidden on remote clients, so skip their summaries.
    for (const thread of threads) {
      if (thread.archived) continue;
      const items = dbGetThreadRuntimeItems(thread.id);
      const latest = items.at(-1);
      const contextUsage = dbGetThreadContextUsage(thread.id);
      runtimeSummariesByThread[thread.id] = remoteRuntimeSummarySchema.parse({
        itemCount: items.length,
        ...(latest
          ? { latestItemId: latest.id, latestItemType: latest.type, latestItemState: latest.state }
          : {}),
        ...(contextUsage ? { contextUsage } : {}),
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

  private applyCors(req: IncomingMessage, res: ServerResponse): boolean {
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    const rawOrigin = Array.isArray(req.headers.origin)
      ? req.headers.origin[0]
      : req.headers.origin;
    if (!rawOrigin) return true;
    const origin = normalizeCorsOrigin(rawOrigin);
    if (!origin || !this.isTrustedCorsOrigin(origin)) return false;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    return true;
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
    const client = req.socket.remoteAddress ?? "unknown";
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
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  }

  private send(ws: WebSocket, message: RemoteWebSocketServerMessage): void {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(message));
  }

  private requireInfo(): RemoteAccessServerInfo {
    if (!this.info) {
      throw new Error("Remote access server has not started.");
    }
    return this.info;
  }
}
