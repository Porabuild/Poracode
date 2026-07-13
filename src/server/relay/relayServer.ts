import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { readBoundedNodeRequestBody } from "@/shared/http";
import {
  buildRelayRoutingCookieHeader,
  DEFAULT_RELAY_MAX_BODY_BYTES,
  parseCookieValue,
  parseRelayVisitorPath,
  RELAY_ROUTING_COOKIE_NAME,
  relayHostFrameSchema,
  relayPublicUrl,
  relayWebSocketPayloadLimit,
  safeJsonParse,
  stripCookieCrumb,
  type RelayServerFrame,
} from "@/shared/remote/relayProtocol";

/**
 * Self-hostable relay. A Poracode server dials `/host` and registers a server
 * id; devices reach it at `/s/<serverId>/…`. The relay forwards visitor HTTP +
 * WebSocket traffic to the registered host over a single framed control socket
 * (relayProtocol.ts). It is a dumb pipe: all auth stays end-to-end between the
 * device and the Poracode server, and the relay only binds a serverId to the
 * secret of its first live registrant to prevent hijacking.
 *
 * The account-scoped "cloud subscription" layer (mapping users → server ids,
 * billing, hosting) sits ON TOP of this and is out of repo scope.
 */
export interface RelayServerOptions {
  readonly host?: string;
  readonly port?: number;
  /** Public base URL advertised to hosts (so they can print a pairing link). */
  readonly publicBaseUrl?: string;
  /** Per-request proxy timeout. */
  readonly requestTimeoutMs?: number;
  /** Server-side ping interval for pruning half-open host and visitor sockets. */
  readonly webSocketHeartbeatIntervalMs?: number;
  /** Maximum inbound WebSocket payload accepted by relay host/visitor sockets. */
  readonly maxWebSocketPayloadBytes?: number;
  /**
   * Maximum bytes queued per outbound relay WebSocket before dropping that
   * socket. Defaults to one configured max HTTP body after relay frame encoding.
   */
  readonly maxWebSocketOutboundBufferBytes?: number;
  /** Deadline for `/host` sockets to send their first register frame. */
  readonly hostRegistrationTimeoutMs?: number;
  readonly maxBodyBytes?: number;
  /**
   * How long a serverId→secret binding survives with no live host before the id
   * can be reclaimed by a different secret. The binding is durable across host
   * blips/reconnects (it is NOT cleared when the control socket closes); this
   * TTL only governs eventual reclamation of an abandoned id. Defaults to 24h.
   * Set to 0 to keep bindings until relay shutdown (no reclamation).
   */
  readonly secretBindingTtlMs?: number;
}

export interface RelayServerInfo {
  readonly url: string;
  readonly port: number;
}

interface RegisteredHost {
  readonly control: WebSocket;
}

/**
 * Durable serverId→secret binding, independent of the live control socket. It
 * survives host disconnects/reconnects so an attacker who knows a public
 * serverId cannot claim it with a different secret while the legitimate host is
 * briefly offline. `lastSeenAt` seeds TTL-based reclamation of abandoned ids.
 */
interface SecretBinding {
  readonly secret: string;
  lastSeenAt: number;
}

interface PendingRequest {
  readonly serverId: string;
  readonly timer: ReturnType<typeof setTimeout>;
  resolve(result: {
    status: number;
    headers: Record<string, string>;
    body: Buffer;
    setCookies?: string[];
    bindVisitor?: boolean;
  }): void;
  reject(error: Error): void;
}

interface VisitorChannel {
  readonly serverId: string;
  readonly socket: WebSocket;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HOST_REGISTRATION_TIMEOUT_MS = 10_000;
const DEFAULT_SECRET_BINDING_TTL_MS = 24 * 60 * 60 * 1000;

function normalizePublicBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PORACODE_RELAY_PUBLIC_BASE_URL must be an absolute http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PORACODE_RELAY_PUBLIC_BASE_URL must be an absolute http(s) URL.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

export class RelayServer {
  private readonly server: Server;
  private readonly wss: WebSocketServer;
  private readonly hosts = new Map<string, RegisteredHost>();
  /**
   * serverId → durable secret binding. Kept independent of the live control
   * socket (NOT deleted on socket close) so a serverId cannot be hijacked with
   * a different secret while its legitimate host is briefly offline.
   */
  private readonly secretBindings = new Map<string, SecretBinding>();
  /** requestId → pending HTTP response. */
  private readonly pending = new Map<string, PendingRequest>();
  /** channelId → visitor WebSocket. */
  private readonly visitors = new Map<string, VisitorChannel>();
  private readonly socketLiveness = new Map<WebSocket, boolean>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private info: RelayServerInfo | null = null;

  constructor(
    private readonly options: RelayServerOptions = {},
    /** Injectable clock for TTL-based secret-binding reclamation (tests). */
    private readonly now: () => number = Date.now,
  ) {
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload:
        options.maxWebSocketPayloadBytes ??
        relayWebSocketPayloadLimit(options.maxBodyBytes ?? DEFAULT_RELAY_MAX_BODY_BYTES),
    });
    this.server = createServer((req, res) => void this.handleHttp(req, res));
    this.server.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket, head));
  }

  async start(): Promise<RelayServerInfo> {
    if (this.info) return this.info;
    const host = this.options.host ?? "0.0.0.0";
    const configuredPublicBaseUrl = this.options.publicBaseUrl
      ? normalizePublicBaseUrl(this.options.publicBaseUrl)
      : null;
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
      this.server.listen(this.options.port ?? 0, host);
    });
    const address = this.server.address() as AddressInfo;
    const base = configuredPublicBaseUrl ?? `http://127.0.0.1:${address.port}`;
    this.info = { url: base, port: address.port };
    this.startWebSocketHeartbeat();
    return this.info;
  }

  async dispose(): Promise<void> {
    this.stopWebSocketHeartbeat();
    for (const visitor of this.visitors.values()) visitor.socket.terminate();
    this.visitors.clear();
    for (const host of this.hosts.values()) host.control.terminate();
    this.hosts.clear();
    this.secretBindings.clear();
    this.socketLiveness.clear();
    for (const [id, pending] of this.pending) {
      if (this.pending.delete(id)) pending.reject(new Error("Relay shutting down."));
    }
    this.wss.close();
    this.server.closeIdleConnections?.();
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
    this.info = null;
  }

  /** Visitor-facing base URL for a server id (what a device points its client at). */
  publicUrlFor(serverId: string): string {
    const base =
      this.info?.url ??
      (this.options.publicBaseUrl
        ? normalizePublicBaseUrl(this.options.publicBaseUrl)
        : "http://127.0.0.1");
    return relayPublicUrl(base, serverId);
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://relay.local");
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    const dispatch = this.resolveVisitorDispatch(req, url);
    if (!dispatch) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    const { serverId, path: dispatchPath } = dispatch;
    const host = this.liveHost(serverId);
    if (!host) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("server offline");
      return;
    }
    let body: Buffer;
    try {
      body = await this.readBody(req);
    } catch {
      res.writeHead(413, { "content-type": "text/plain" });
      res.end("request too large");
      return;
    }
    const id = randomUUID();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers[key] = value;
      else if (Array.isArray(value)) headers[key] = value.join(", ");
    }
    // The relay's own routing cookie is never something a host should see.
    if (headers.cookie) {
      const stripped = stripCookieCrumb(headers.cookie, RELAY_ROUTING_COOKIE_NAME);
      if (stripped) headers.cookie = stripped;
      else delete headers.cookie;
    }
    const path = `${dispatchPath}${url.search}`;
    try {
      const result = await new Promise<{
        status: number;
        headers: Record<string, string>;
        body: Buffer;
        setCookies?: string[];
        bindVisitor?: boolean;
      }>((resolve, reject) => {
        const timer = setTimeout(() => {
          const pending = this.pending.get(id);
          if (pending && this.pending.delete(id)) {
            pending.reject(new Error("Relay request timed out."));
          }
        }, this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
        this.pending.set(id, {
          serverId,
          timer,
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        const sent = this.sendToHost(host, {
          t: "req",
          id,
          method: req.method ?? "GET",
          path,
          headers,
          ...(body.length > 0 ? { body: body.toString("base64") } : {}),
        });
        if (!sent) {
          const pending = this.pending.get(id);
          if (pending && this.pending.delete(id)) {
            pending.reject(new Error("server offline"));
          }
        }
      });
      // Strip hop-by-hop headers the relay shouldn't echo verbatim.
      const { "content-length": _cl, "transfer-encoding": _te, ...rest } = result.headers;
      const responseHeaders: Record<string, string | string[]> = { ...rest };
      if (result.setCookies && result.setCookies.length > 0) {
        // Bind this visitor to `serverId` for subsequent prefixless requests
        // (dev-server assets/HMR sockets that don't carry the `/s/<id>`
        // prefix) when the host signals it via `bindVisitor`. The relay stays a
        // dumb tunnel: it never inspects the tunneled cookies itself — the host
        // adapter owns all port-forward semantics (see relayHost.ts).
        responseHeaders["set-cookie"] =
          result.bindVisitor === true
            ? [...result.setCookies, buildRelayRoutingCookieHeader(serverId)]
            : [...result.setCookies];
      }
      res.writeHead(result.status, responseHeaders);
      res.end(result.body);
    } catch (error) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(error instanceof Error ? error.message : "relay error");
    }
  }

  /**
   * Resolves which live host a visitor HTTP/WS request dispatches to, and the
   * path to forward (relative to that host's server root). Prefers the
   * `/s/<serverId>/...` prefix; falls back to the `RELAY_ROUTING_COOKIE_NAME`
   * cookie for prefixless requests (dev-server assets/sockets that don't carry
   * the prefix) bound by a prior `/s/<id>/forward/.../enter` round-trip.
   * Returns `null` when neither resolves to a live, registered host.
   */
  private resolveVisitorDispatch(
    req: IncomingMessage,
    url: URL,
  ): { readonly serverId: string; readonly path: string } | null {
    const route = parseRelayVisitorPath(url.pathname);
    if (route) return route;
    const cookieServerId = parseCookieValue(req.headers.cookie, RELAY_ROUTING_COOKIE_NAME);
    if (!cookieServerId || !this.liveHost(cookieServerId)) return null;
    return { serverId: cookieServerId, path: url.pathname };
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? "/", "http://relay.local");
    if (url.pathname === "/host") {
      this.wss.handleUpgrade(req, socket, head, (ws) => this.handleHostControl(ws));
      return;
    }
    const dispatch = this.resolveVisitorDispatch(req, url);
    const host = dispatch ? this.liveHost(dispatch.serverId) : undefined;
    if (dispatch && host) {
      // The relay's own routing cookie is never something a host should see;
      // everything else (incl. `lc_forward`) is forwarded so the host's local
      // WS connection can resolve a port-forward session exactly as a direct
      // LAN WS upgrade would.
      const cookie = stripCookieCrumb(req.headers.cookie, RELAY_ROUTING_COOKIE_NAME);
      this.wss.handleUpgrade(req, socket, head, (ws) =>
        this.handleVisitorWs(ws, host, dispatch.serverId, `${dispatch.path}${url.search}`, cookie),
      );
      return;
    }
    socket.destroy();
  }

  private handleHostControl(control: WebSocket): void {
    this.trackWebSocket(control);
    let serverId: string | null = null;
    const registrationTimer = setTimeout(() => {
      if (!serverId && control.readyState === WebSocket.OPEN) {
        control.close(1008, "host must register first");
      }
    }, this.options.hostRegistrationTimeoutMs ?? DEFAULT_HOST_REGISTRATION_TIMEOUT_MS);
    registrationTimer.unref?.();
    control.on("message", (data) => {
      const parsed = relayHostFrameSchema.safeParse(safeJsonParse(String(data)));
      if (!parsed.success) return;
      const frame = parsed.data;
      if (frame.t === "register") {
        clearTimeout(registrationTimer);
        if (serverId && frame.serverId !== serverId) {
          control.close(1008, "host control already registered");
          return;
        }
        // Validate against the DURABLE binding — even with no live host — so an
        // attacker cannot claim an offline server's id with a different secret.
        if (!this.claimSecretBinding(frame.serverId, frame.secret)) {
          control.close(1008, "serverId already registered");
          return;
        }
        // Replace any prior live registration for this id (reconnect). The
        // durable binding above already confirmed the secret matches.
        const existing = this.liveHost(frame.serverId);
        if (existing && existing.control !== control) {
          this.dropHostTraffic(frame.serverId, "Host reconnected.");
          existing.control.close();
        }
        serverId = frame.serverId;
        this.hosts.set(frame.serverId, { control });
        this.sendFrame(control, {
          t: "registered",
          serverId: frame.serverId,
          publicUrl: this.publicUrlFor(frame.serverId),
        });
        return;
      }
      if (!serverId) {
        clearTimeout(registrationTimer);
        control.close(1008, "host must register first");
        return;
      }
      if (frame.t === "res") {
        const pending = this.pending.get(frame.id);
        if (pending && pending.serverId === serverId && this.pending.delete(frame.id)) {
          pending.resolve({
            status: frame.status,
            headers: frame.headers,
            body: Buffer.from(frame.body, "base64"),
            ...(frame.setCookies ? { setCookies: frame.setCookies } : {}),
            ...(frame.bindVisitor === true ? { bindVisitor: true } : {}),
          });
        }
        return;
      }
      if (frame.t === "req-error") {
        const pending = this.pending.get(frame.id);
        if (pending && pending.serverId === serverId && this.pending.delete(frame.id)) {
          pending.reject(new Error(frame.message));
        }
        return;
      }
      if (frame.t === "ws-data") {
        const visitor = this.visitors.get(frame.id);
        if (visitor && visitor.serverId === serverId && !this.sendRaw(visitor.socket, frame.data)) {
          this.visitors.delete(frame.id);
        }
        return;
      }
      if (frame.t === "ws-close") {
        const visitor = this.visitors.get(frame.id);
        if (visitor && visitor.serverId === serverId && this.visitors.delete(frame.id)) {
          visitor.socket.close();
        }
        return;
      }
    });
    control.on("close", () => {
      clearTimeout(registrationTimer);
      if (serverId && this.hosts.get(serverId)?.control === control) {
        this.hosts.delete(serverId);
        this.dropHostTraffic(serverId, "Host disconnected.");
        // Start the reclamation clock; the secret binding itself persists so the
        // id cannot be re-claimed with a different secret until the TTL lapses.
        this.touchSecretBinding(serverId);
      }
    });
  }

  /**
   * Validate `secret` against the durable serverId binding and (re)claim the id.
   * Returns false if the id is bound to a DIFFERENT secret and still within its
   * reclamation TTL. A never-bound id, a matching secret, or an expired binding
   * all succeed and (re)bind the id to `secret`.
   */
  private claimSecretBinding(serverId: string, secret: string): boolean {
    const now = this.now();
    const existing = this.secretBindings.get(serverId);
    if (existing && existing.secret !== secret) {
      const ttlMs = this.options.secretBindingTtlMs ?? DEFAULT_SECRET_BINDING_TTL_MS;
      const live = this.hosts.get(serverId)?.control.readyState === WebSocket.OPEN;
      // A live host with the wrong secret, or an idle-but-unexpired binding,
      // blocks reclamation. ttlMs <= 0 means "never reclaim".
      if (live || ttlMs <= 0 || now - existing.lastSeenAt < ttlMs) return false;
    }
    this.secretBindings.set(serverId, { secret, lastSeenAt: now });
    return true;
  }

  /** Refresh a binding's reclamation clock (called when its host goes offline). */
  private touchSecretBinding(serverId: string): void {
    const existing = this.secretBindings.get(serverId);
    if (existing) existing.lastSeenAt = this.now();
  }

  private handleVisitorWs(
    visitor: WebSocket,
    host: RegisteredHost,
    serverId: string,
    path: string,
    cookie: string | undefined,
  ): void {
    this.trackWebSocket(visitor);
    const id = randomUUID();
    this.visitors.set(id, { serverId, socket: visitor });
    if (!this.sendToHost(host, { t: "ws-open", id, path, ...(cookie ? { cookie } : {}) })) {
      this.visitors.delete(id);
      visitor.close(1012, "server offline");
      return;
    }
    visitor.on("message", (data) => {
      if (!this.sendToHost(host, { t: "ws-data", id, data: String(data) })) {
        if (this.visitors.delete(id)) visitor.close(1012, "server offline");
      }
    });
    visitor.on("close", () => {
      if (this.visitors.delete(id)) this.sendToHost(host, { t: "ws-close", id });
    });
    visitor.on("error", () => {
      if (this.visitors.delete(id)) {
        this.sendToHost(host, { t: "ws-close", id });
        visitor.terminate();
      }
    });
  }

  private dropHostTraffic(serverId: string, reason: string): void {
    for (const [id, pending] of this.pending) {
      if (pending.serverId === serverId && this.pending.delete(id)) {
        pending.reject(new Error(reason));
      }
    }
    for (const [id, visitor] of this.visitors) {
      if (visitor.serverId === serverId && this.visitors.delete(id)) {
        visitor.socket.close(1012, reason);
      }
    }
  }

  private liveHost(serverId: string): RegisteredHost | undefined {
    const existing = this.hosts.get(serverId);
    if (!existing) return undefined;
    if (existing.control.readyState === WebSocket.OPEN) return existing;
    this.hosts.delete(serverId);
    this.dropHostTraffic(serverId, "Host disconnected.");
    return undefined;
  }

  private sendToHost(host: RegisteredHost, frame: RelayServerFrame): boolean {
    return this.sendFrame(host.control, frame);
  }

  private sendFrame(control: WebSocket, frame: RelayServerFrame): boolean {
    return this.sendRaw(control, JSON.stringify(frame));
  }

  private sendRaw(socket: WebSocket, data: string): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    const maxBuffered =
      this.options.maxWebSocketOutboundBufferBytes ??
      relayWebSocketPayloadLimit(this.options.maxBodyBytes ?? DEFAULT_RELAY_MAX_BODY_BYTES);
    if (socket.bufferedAmount + Buffer.byteLength(data, "utf8") > maxBuffered) {
      this.socketLiveness.delete(socket);
      try {
        socket.terminate();
      } catch {
        // ignore
      }
      return false;
    }
    try {
      socket.send(data);
      return true;
    } catch {
      try {
        socket.terminate();
      } catch {
        // ignore
      }
      return false;
    }
  }

  private trackWebSocket(socket: WebSocket): void {
    this.socketLiveness.set(socket, true);
    socket.on("pong", () => {
      this.socketLiveness.set(socket, true);
    });
    socket.on("close", () => {
      this.socketLiveness.delete(socket);
    });
    socket.on("error", () => {
      socket.terminate();
    });
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
    for (const socket of this.socketLiveness.keys()) {
      if (socket.readyState !== WebSocket.OPEN) {
        socket.terminate();
        continue;
      }
      if (this.socketLiveness.get(socket) === false) {
        socket.terminate();
        continue;
      }
      this.socketLiveness.set(socket, false);
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }

  private async readBody(req: IncomingMessage): Promise<Buffer> {
    const max = this.options.maxBodyBytes ?? DEFAULT_RELAY_MAX_BODY_BYTES;
    return await readBoundedNodeRequestBody(req, max, () => new Error("body too large"));
  }
}
