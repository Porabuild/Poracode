import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { decodeRelayBinaryFrame, encodeRelayBinaryFrame } from "@/shared/remote/relayBinaryFrame";
import {
  relayBinaryMessageLimit,
  RELAY_WS_PAYLOAD_TOO_LARGE_REASON,
} from "@/shared/remote/relayLimits";
import {
  deriveForwardOwner,
  ForwardOriginPolicy,
  isForwardOriginAuthority,
} from "@/main/remote/portForward/forwardOrigin";
import {
  DEFAULT_RELAY_MAX_BODY_BYTES,
  parseRelayVisitorPath,
  RELAY_ROUTING_COOKIE_NAME,
  relayHostFrameSchema,
  relayPublicUrl,
  relayWebSocketPayloadLimit,
  safeJsonParse,
  stripCookieCrumb,
  type RelayServerFrame,
  type RelayForwardContext,
} from "@/shared/remote/relayProtocol";

/**
 * Self-hostable relay. A Poracode server dials `/host` and registers a server
 * id; devices reach it at `/s/<serverId>/…`. The relay forwards visitor HTTP +
 * WebSocket traffic to the registered host over a single framed control socket
 * (relayProtocol.ts). Application authentication is enforced by the host;
 * the relay authenticates server registration against its serverId claim.
 * The relay can read forwarded credentials and payloads and must be trusted.
 *
 * The account-scoped "cloud subscription" layer (mapping users → server ids,
 * billing, hosting) sits ON TOP of this and is out of repo scope.
 */
export interface RelayServerOptions {
  readonly host?: string;
  readonly port?: number;
  /** Public base URL advertised to hosts (so they can print a pairing link). */
  readonly publicBaseUrl?: string;
  /** Configured external HTTPS origin whose child hostnames serve forwards. */
  readonly forwardBaseUrl?: string;
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
  readonly forwardOwnerId?: string;
  /**
   * P1-5: outbound bytes enqueued per visitor channel on the SHARED control
   * socket since the buffer last fully drained. Identifies the flood source
   * for channel-only eviction so congestion never has to kill the control
   * socket (and every other channel + request with it).
   */
  readonly channelBytes: Map<string, number>;
  /** Bytes consumed from the bounded reserve for terminal control notices. */
  forcedControlBytes: number;
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
  readonly clientId: string;
  timer: ReturnType<typeof setTimeout>;
  /**
   * Streaming state, present once the request was dispatched and the visitor
   * response object exists. Until `res-open` arrives (or a buffered `res`
   * resolves the request) only the timer/reject machinery is live; after it,
   * `res-chunk` frames write through `res` under the bounded-buffer policy
   * and the timer is an idle deadline rearmed by every chunk.
   */
  stream?: {
    res: ServerResponse;
    opened: boolean;
  };
  resolve(
    result:
      | {
          status: number;
          headers: Record<string, string>;
          body: Buffer;
          setCookies?: string[];
        }
      | { streamed: true },
  ): void;
  reject(error: Error): void;
}

interface VisitorChannel {
  readonly serverId: string;
  readonly socket: WebSocket;
  readonly clientId: string;
}

/**
 * Slow-consumer bound for a streaming response: the visitor socket's own
 * writable buffer (Node streams buffer internally when the peer stops
 * reading). Past this, the response is destroyed and the host work canceled —
 * one stalled visitor must never buffer unboundedly on the relay.
 */
const RELAY_STREAM_MAX_BUFFERED_BYTES = 1024 * 1024;

/**
 * P1-8: per-owner admission caps. One clientId (a stable socket-peer identity)
 * can hold at most 16 concurrent relayed HTTP requests and 32 open channels;
 * the whole relay bounds pending requests globally. Over-cap HTTP gets 429 and
 * an over-cap channel upgrade gets 1013, so one visitor cannot monopolize the
 * shared host link.
 */
const RELAY_MAX_PENDING_PER_CLIENT = 16;
const RELAY_MAX_PENDING_TOTAL = 256;
const RELAY_MAX_CHANNELS_PER_CLIENT = 32;

/** The only 502 bodies a visitor can ever see: the deliberate transport
 * verdicts. Anything else (internal exception text) becomes "relay error". */
const SAFE_RELAY_502_TEXTS = new Set([
  "Host disconnected.",
  "server offline",
  "Relay request timed out.",
  "Visitor disconnected.",
  "request too large for the relay link",
  "response too large for the relay link",
]);

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HOST_REGISTRATION_TIMEOUT_MS = 10_000;
const DEFAULT_SECRET_BINDING_TTL_MS = 24 * 60 * 60 * 1000;

/** A received ws message as bytes: ws delivers one Buffer per message for the
 * default `nodebuffer` binaryType, fragments for `binaryType: "fragments"`,
 * or an ArrayBuffer for `binaryType: "arraybuffer"`. Returns a view, not a
 * copy, on the hot path. */
function asBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

/** Derive a stable, opaque identity from the socket peer, never its headers.
 * Peers behind one proxy share a bucket; forwarded headers require a separate
 * trusted-proxy policy. Normalize mapped IPv4 so both address forms agree. */
export function relayVisitorClientId(salt: Buffer, remoteAddress: string | undefined): string {
  const raw = remoteAddress ?? "unknown";
  const normalized = raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
  return createHmac("sha256", salt).update(normalized).digest("hex").slice(0, 32);
}

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
  private readonly forwardOwners = new Map<string, string>();
  private readonly forwardPolicy: ForwardOriginPolicy | null;
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
  // Stable for this relay instance, unlinkable across instances; no identity map.
  private readonly visitorIdSalt = randomBytes(32);
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private info: RelayServerInfo | null = null;
  /** Hard outbound cap per control/visitor socket — congestion backpressure. */
  private readonly outboundBufferLimit: number;
  /** Bounded reserve for tiny close/cancel notices under bulk congestion. */
  private readonly forcedControlReserveBytes: number;
  /** Per-frame admission bound; custom peers must use compatible receive limits. */
  private readonly controlFrameLimit: number;
  private readonly binaryMessageLimit: number;

  constructor(
    private readonly options: RelayServerOptions = {},
    /** Injectable clock for TTL-based secret-binding reclamation (tests). */
    private readonly now: () => number = Date.now,
  ) {
    this.forwardPolicy = options.forwardBaseUrl
      ? new ForwardOriginPolicy(options.forwardBaseUrl)
      : null;
    if (
      options.publicBaseUrl &&
      this.isForwardHostname(new URL(normalizePublicBaseUrl(options.publicBaseUrl)).host)
    ) {
      throw new Error("Relay API origin must be outside the forward hostname namespace.");
    }
    this.outboundBufferLimit =
      options.maxWebSocketOutboundBufferBytes ??
      relayWebSocketPayloadLimit(options.maxBodyBytes ?? DEFAULT_RELAY_MAX_BODY_BYTES);
    this.forcedControlReserveBytes = Math.min(
      64 * 1024,
      Math.max(4 * 1024, this.outboundBufferLimit * 2),
    );
    const inboundLimit =
      options.maxWebSocketPayloadBytes ??
      relayWebSocketPayloadLimit(options.maxBodyBytes ?? DEFAULT_RELAY_MAX_BODY_BYTES);
    this.controlFrameLimit = Math.min(inboundLimit, this.outboundBufferLimit);
    this.binaryMessageLimit = relayBinaryMessageLimit(this.controlFrameLimit);
    this.wss = new WebSocketServer({ noServer: true, maxPayload: inboundLimit });
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
    this.forwardOwners.clear();
    this.secretBindings.clear();
    this.socketLiveness.clear();
    for (const [id, pending] of this.pending) {
      if (this.pending.delete(id)) {
        clearTimeout(pending.timer);
        if (pending.stream?.opened) pending.stream.res.destroy();
        pending.reject(new Error("Relay shutting down."));
      }
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

  /** Stable-per-visitor identity for the visitor behind this request socket. */
  private visitorClientId(req: IncomingMessage): string {
    return relayVisitorClientId(this.visitorIdSalt, req.socket.remoteAddress);
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://relay.local");
    if (url.pathname === "/healthz" && !this.isForwardHostname(req.headers.host ?? "")) {
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
    // Visitor cancellation. Only the RESPONSE stream's premature close counts
    // as a disconnect: `res` "close" fires both for normal completion and for
    // a dead socket, so it is guarded by `writableEnded`. `req` "close" is
    // deliberately ignored — it also fires after an ordinary completed upload,
    // which is not a disconnect.
    let visitorGone = false;
    let onVisitorGone: (() => void) | null = null;
    const onResClose = (): void => {
      if (res.writableEnded) return;
      visitorGone = true;
      onVisitorGone?.();
    };
    res.on("close", onResClose);
    let body: Buffer;
    try {
      body = await this.readBody(req);
    } catch {
      // A visitor that vanished mid-upload is not an oversized upload: there
      // is nothing to dispatch and no socket left to answer.
      if (visitorGone) return;
      res.writeHead(413, { "content-type": "text/plain" });
      res.end("request too large");
      return;
    }
    // Disconnected before the request was ever dispatched: no host work exists
    // to cancel and no `req-cancel` may go out.
    if (visitorGone) return;
    const id = randomUUID();
    const clientId = this.visitorClientId(req);
    // P1-8: per-owner admission before any host work is charged.
    let pendingForClient = 0;
    for (const pending of this.pending.values()) {
      if (pending.clientId === clientId) pendingForClient += 1;
    }
    if (
      pendingForClient >= RELAY_MAX_PENDING_PER_CLIENT ||
      this.pending.size >= RELAY_MAX_PENDING_TOTAL
    ) {
      res.writeHead(429, { "content-type": "text/plain" });
      res.end("relay admission limit");
      return;
    }
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
    // P1-7: build and pre-measure the exact frame the host will receive. The
    // body is already bounded by maxBodyBytes, but base64 expansion, JSON
    // escaping, and headers can push the frame past the host's receive limit —
    // which would kill the shared control socket for everyone. Fail THIS
    // request with 413 instead of dispatching it.
    const reqFrameText = JSON.stringify({
      t: "req",
      id,
      method: req.method ?? "GET",
      path,
      headers,
      clientId,
      ...(dispatch.forward ? { forward: dispatch.forward } : {}),
      ...(body.length > 0 ? { body: body.toString("base64") } : {}),
    });
    if (Buffer.byteLength(reqFrameText) > this.controlFrameLimit) {
      res.writeHead(413, { "content-type": "text/plain" });
      res.end("request too large for the relay link");
      return;
    }
    // True once a streaming res-open wrote the visitor's headers — from there
    // the response can only end via res-end or destruction, never a 502.
    let headed = false;
    try {
      const result = await new Promise<
        | {
            status: number;
            headers: Record<string, string>;
            body: Buffer;
            setCookies?: string[];
          }
        | { streamed: true }
      >((resolve, reject) => {
        // Settle the pending entry exactly once; when we are the first to give
        // up on it, also tell the host to stop its local work. A cancel never
        // reaches a replaced host control: any replacement drops the pending
        // entry first, so the captured host can only be sent to while it is
        // still the live one for this id.
        const abandon = (error: Error): boolean => {
          const pending = this.pending.get(id);
          if (!pending || pending.serverId !== serverId || !this.pending.delete(id)) {
            return false;
          }
          // Clear the live timer (idle re-arms replace the original handle).
          clearTimeout(pending.timer);
          if (pending.stream?.opened) pending.stream.res.destroy();
          pending.reject(error);
          return true;
        };
        const timer = setTimeout(() => {
          if (abandon(new Error("Relay request timed out."))) {
            this.sendFrameForced(host, { t: "req-cancel", id });
          }
        }, this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
        this.pending.set(id, {
          serverId,
          clientId,
          timer,
          stream: { res, opened: false },
          resolve: (value) => {
            clearTimeout(timer);
            if ("streamed" in value) headed = true;
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        // From here until the response resolves, a vanished visitor aborts the
        // host's local work instead of leaving a zombie until the deadline.
        onVisitorGone = () => {
          if (abandon(new Error("Visitor disconnected."))) {
            this.sendFrameForced(host, { t: "req-cancel", id });
          }
        };
        const sent = this.sendRaw(host.control, reqFrameText, false);
        if (!sent) {
          abandon(new Error("server offline"));
        }
      });
      if ("streamed" in result) {
        // The response headers were already written by the res-open handler
        // and the body streams via res-chunk/res-end frames; a mid-stream
        // failure already destroyed the response there is no status left to
        // report honestly.
        return;
      }
      // Strip hop-by-hop headers the relay shouldn't echo verbatim.
      const { "content-length": _cl, "transfer-encoding": _te, ...rest } = result.headers;
      const responseHeaders: Record<string, string | string[]> = { ...rest };
      if (result.setCookies && result.setCookies.length > 0) {
        responseHeaders["set-cookie"] = [...result.setCookies];
      }
      res.writeHead(result.status, responseHeaders);
      res.end(result.body);
    } catch (error) {
      // The visitor is gone: nothing is left to answer, and a canceled id's
      // late host response was already dropped by the missing pending entry.
      if (visitorGone) return;
      // Headers already streamed out: the response was destroyed by whoever
      // rejected (idle deadline, disconnect, host loss).
      if (headed) return;
      // Only the stable transport verdicts reach the visitor verbatim;
      // arbitrary internal error text collapses to a generic body.
      const text =
        error instanceof Error && SAFE_RELAY_502_TEXTS.has(error.message)
          ? error.message
          : "relay error";
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(text);
    } finally {
      // The exchange is over — neither a disconnect nor a cancel can change it.
      onVisitorGone = null;
      res.off("close", onResClose);
    }
  }

  /** Child hostnames select an authenticated owner and forward. All other
   * requests require the explicit API prefix; cookies never select a host. */
  private resolveVisitorDispatch(
    req: IncomingMessage,
    url: URL,
  ): {
    readonly serverId: string;
    readonly path: string;
    readonly forward?: RelayForwardContext;
  } | null {
    if (this.isForwardHostname(req.headers.host ?? "")) {
      const policy = this.forwardPolicy;
      const identity = policy?.resolveAuthority(req.headers.host ?? "");
      if (!identity || !policy) return null;
      const serverId = this.forwardOwners.get(identity.ownerId);
      if (!serverId || !this.liveHost(serverId)) return null;
      return {
        serverId,
        path: url.pathname,
        forward: {
          forwardId: identity.forwardId,
          origin: policy.originFor(identity.ownerId, identity.forwardId),
        },
      };
    }
    return parseRelayVisitorPath(url.pathname);
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? "/", "http://relay.local");
    if (url.pathname === "/host" && !this.isForwardHostname(req.headers.host ?? "")) {
      this.wss.handleUpgrade(req, socket, head, (ws) => this.handleHostControl(ws));
      return;
    }
    const dispatch = this.resolveVisitorDispatch(req, url);
    const host = dispatch ? this.liveHost(dispatch.serverId) : undefined;
    if (dispatch && host) {
      if (
        dispatch.forward &&
        req.headers.origin !== undefined &&
        req.headers.origin !== dispatch.forward.origin
      ) {
        socket.destroy();
        return;
      }
      // The relay's own routing cookie is never something a host should see;
      // everything else (incl. `lc_forward`) is forwarded so the host's local
      // WS connection can resolve a port-forward session exactly as a direct
      // LAN WS upgrade would.
      const cookie = stripCookieCrumb(req.headers.cookie, RELAY_ROUTING_COOKIE_NAME);
      this.wss.handleUpgrade(req, socket, head, (ws) =>
        this.handleVisitorWs(
          ws,
          host,
          dispatch.serverId,
          `${dispatch.path}${url.search}`,
          cookie,
          this.visitorClientId(req),
          dispatch.forward,
        ),
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
    control.on("message", (data: RawData, isBinary: boolean) => {
      // Registration belongs to this connection, not merely to the server id.
      // A replaced control's queued callbacks must not feed new visitors or
      // reclaim the host after its registration has been superseded.
      if (serverId !== null && this.hosts.get(serverId)?.control !== control) return;
      if (isBinary) {
        // Protocol 3: a binary control message carries one ws-data payload for
        // a visitor channel, framed by relayBinaryFrame. Text ws-data keeps
        // its JSON frame below; an undecodable envelope drops like any unknown
        // frame. Before registration the socket is closed exactly like one
        // that sent any other non-register frame first.
        if (!serverId) {
          clearTimeout(registrationTimer);
          control.close(1008, "host must register first");
          return;
        }
        const decoded = decodeRelayBinaryFrame(asBytes(data));
        if (!decoded) return;

        const visitor = this.visitors.get(decoded.id);
        if (
          visitor &&
          visitor.serverId === serverId &&
          !this.sendRaw(visitor.socket, decoded.data)
        ) {
          // P1-6: the visitor socket is gone mid-forward — tell the host so
          // its channel entry and local socket do not leak as zombies.
          this.visitors.delete(decoded.id);
          const registeredHost = this.hosts.get(serverId);
          if (registeredHost?.control === control) {
            this.sendFrameForced(registeredHost, { t: "ws-close", id: decoded.id });
          }
        }
        return;
      }
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
        const forwardOwnerId =
          this.forwardPolicy && frame.originSecret
            ? deriveForwardOwner(frame.originSecret, frame.serverId)
            : undefined;
        const ownerHost = forwardOwnerId ? this.forwardOwners.get(forwardOwnerId) : undefined;
        if (ownerHost && ownerHost !== frame.serverId) {
          control.close(1008, "forward origin already registered");
          return;
        }
        // Replace any prior live registration for this id (reconnect). The
        // durable binding above already confirmed the secret matches.
        const existing = this.liveHost(frame.serverId);
        if (
          existing &&
          (existing.control !== control || existing.forwardOwnerId !== forwardOwnerId)
        ) {
          this.dropHostTraffic(frame.serverId, "Host reconnected.");
          if (existing.control !== control) existing.control.close();
        }
        serverId = frame.serverId;
        this.removeHost(frame.serverId);
        this.hosts.set(frame.serverId, {
          control,
          channelBytes: new Map(),
          forcedControlBytes: 0,
          ...(forwardOwnerId ? { forwardOwnerId } : {}),
        });
        if (forwardOwnerId) this.forwardOwners.set(forwardOwnerId, frame.serverId);
        const registered = this.sendFrame(control, {
          t: "registered",
          serverId: frame.serverId,
          publicUrl: this.publicUrlFor(frame.serverId),
          // Additive v3 capability: this relay understands the streaming
          // response frames (res-open/res-chunk/res-end). Older hosts strip
          // the field and keep the buffered `res` path.
          httpStreaming: true,
          ...(forwardOwnerId && this.forwardPolicy
            ? {
                forwardOrigin: { baseUrl: this.forwardPolicy.baseUrl, ownerId: forwardOwnerId },
              }
            : {}),
        });
        if (!registered) {
          // Registration is the one reliable control frame that cannot be
          // retried on this socket: without the acknowledgement the host
          // cannot know it is live, while retaining it here would create a
          // registered-but-unusable control entry. Tear down this attempt so
          // the host reconnects and retries registration cleanly.
          this.removeHost(frame.serverId);
          control.close(1013, "relay link congestion");
        }
        return;
      }
      if (!serverId) {
        clearTimeout(registrationTimer);
        control.close(1008, "host must register first");
        return;
      }
      const registeredHost = this.hosts.get(serverId);
      if (!registeredHost || registeredHost.control !== control) return;
      if (frame.t === "res") {
        const pending = this.pending.get(frame.id);
        if (pending && pending.serverId === serverId && this.pending.delete(frame.id)) {
          pending.resolve({
            status: frame.status,
            headers: frame.headers,
            body: Buffer.from(frame.body, "base64"),
            ...(frame.setCookies ? { setCookies: frame.setCookies } : {}),
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
      if (frame.t === "res-open") {
        const pending = this.pending.get(frame.id);
        if (pending && pending.serverId === serverId && pending.stream && !pending.stream.opened) {
          // Strip hop-by-hop headers the relay shouldn't echo verbatim; the
          // body now arrives as res-chunk slices, so the origin's framing
          // (content-length/transfer-encoding) is stale by construction.
          const { "content-length": _cl, "transfer-encoding": _te, ...rest } = frame.headers;
          const responseHeaders: Record<string, string | string[]> = { ...rest };
          if (frame.setCookies && frame.setCookies.length > 0) {
            responseHeaders["set-cookie"] = [...frame.setCookies];
          }
          try {
            pending.stream.res.writeHead(frame.status, responseHeaders);
          } catch {
            // A hostile/buggy host sent a frame Node rejects: fail THIS
            // exchange (a 502 is still honest — nothing was written) and
            // never let a bad frame take down the shared relay process.
            this.pending.delete(frame.id);
            clearTimeout(pending.timer);
            pending.reject(new Error("relay error"));
            return;
          }
          pending.stream.opened = true;
          // Mid-stream visitor death: the request path's listener was detached
          // when this response became streaming-owned, so watch here — cancel
          // host work instead of leaving it running to its own deadline.
          pending.stream.res.on("close", () => {
            const current = this.pending.get(frame.id);
            if (current !== pending || current.stream?.opened !== true) return;
            if (current.stream.res.writableEnded) return;
            this.pending.delete(frame.id);
            clearTimeout(current.timer);
            this.sendFrameForced(registeredHost, { t: "req-cancel", id: frame.id });
          });
          // Resolves the request promise as streamed (which clears the
          // whole-request deadline), then arms the idle deadline.
          pending.resolve({ streamed: true });
          this.rearmStreamingIdle(frame.id, pending);
        }
        return;
      }
      if (frame.t === "res-chunk") {
        const pending = this.pending.get(frame.id);
        if (pending && pending.serverId === serverId && pending.stream?.opened) {
          this.rearmStreamingIdle(frame.id, pending);
          const stream = pending.stream.res;
          if (stream.destroyed) return;
          stream.write(Buffer.from(frame.body, "base64"));
          if (stream.writableLength > RELAY_STREAM_MAX_BUFFERED_BYTES) {
            // Slow-consumer isolation: the visitor stopped reading; destroy
            // this response and stop the host's upstream work instead of
            // buffering without bound.
            this.pending.delete(frame.id);
            clearTimeout(pending.timer);
            stream.destroy();
            this.sendFrameForced(registeredHost, { t: "req-cancel", id: frame.id });
          }
        }
        return;
      }
      if (frame.t === "res-end") {
        const pending = this.pending.get(frame.id);
        if (pending && pending.serverId === serverId && this.pending.delete(frame.id)) {
          clearTimeout(pending.timer);
          if (pending.stream?.opened) {
            // A mid-stream error arrives after headers went out — no status
            // code can honestly describe the failure, so the connection is
            // reset rather than answered.
            if (frame.error) pending.stream.res.destroy();
            else pending.stream.res.end();
          } else {
            // Protocol violation (an end without an open): settle the
            // exchange like a request error instead of leaving the visitor
            // hanging with every other unwind path disarmed.
            pending.reject(new Error("relay error"));
          }
        }
        return;
      }
      if (frame.t === "ws-data") {
        const visitor = this.visitors.get(frame.id);
        if (visitor && visitor.serverId === serverId && !this.sendRaw(visitor.socket, frame.data)) {
          // P1-6: same zombie-channel cleanup as the binary branch above.
          this.visitors.delete(frame.id);
          this.sendFrameForced(registeredHost, { t: "ws-close", id: frame.id });
        }
        return;
      }
      if (frame.t === "ws-close") {
        const visitor = this.visitors.get(frame.id);
        if (visitor && visitor.serverId === serverId && this.visitors.delete(frame.id)) {
          // A host-side oversize rejection travels as the reserved reason;
          // surface it to the visitor as the RFC 6455 "message too big" close.
          // Any other reason (or none) keeps the plain close.
          if (frame.reason === RELAY_WS_PAYLOAD_TOO_LARGE_REASON) {
            visitor.socket.close(1009, frame.reason);
          } else {
            visitor.socket.close();
          }
        }
        return;
      }
    });
    control.on("close", () => {
      clearTimeout(registrationTimer);
      if (serverId && this.hosts.get(serverId)?.control === control) {
        this.removeHost(serverId);
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
    clientId: string,
    forward: RelayForwardContext | undefined,
  ): void {
    this.trackWebSocket(visitor);
    // P1-8: bound concurrent channels per owner — one visitor cannot hold
    // unbounded local sockets on the host through the shared relay.
    let channelsForClient = 0;
    for (const channel of this.visitors.values()) {
      if (channel.clientId === clientId) channelsForClient += 1;
    }
    if (channelsForClient >= RELAY_MAX_CHANNELS_PER_CLIENT) {
      visitor.close(1013, "relay admission limit");
      return;
    }
    const id = randomUUID();
    this.visitors.set(id, { serverId, socket: visitor, clientId });
    if (
      !this.sendToHost(host, {
        t: "ws-open",
        id,
        path,
        clientId,
        ...(forward ? { forward } : {}),
        ...(cookie ? { cookie } : {}),
      })
    ) {
      this.visitors.delete(id);
      visitor.close(1012, "server offline");
      return;
    }
    visitor.on("message", (data: RawData, isBinary: boolean) => {
      // Text ws messages ride the JSON frame; binary ones ride the protocol-3
      // envelope so the payload reaches the host byte-identical (String(data)
      // would UTF-8-coerce invalid sequences). The channel id is this relay's
      // own randomUUID, so the envelope encode cannot throw.
      //
      // Admission is bounded by what one control frame can carry: oversize is
      // a per-channel 1009 rejection, never a send that terminates the
      // shared control connection and every other channel with it.
      if (isBinary) {
        const bytes = asBytes(data);
        if (bytes.byteLength > this.binaryMessageLimit) {
          this.rejectOversizeVisitor(host, id, visitor);
          return;
        }
        if (!this.forwardChannelFrame(host, serverId, id, encodeRelayBinaryFrame(id, bytes))) {
          // The frame was refused under congestion: the channel was evicted
          // (channel-only) to protect the shared control socket, or the host
          // is gone and dropHostTraffic already cleaned every channel up.
          visitor.close(1013, "relay link congestion");
        }
        return;
      }
      // Measure the exact framed bytes the host will receive (the same
      // JSON.stringify `sendFrame` performs): JSON escaping can expand a raw
      // message past the control budget even when the raw size is legal.
      const framed = JSON.stringify({ t: "ws-data", id, data: String(data) });
      if (Buffer.byteLength(framed) > this.controlFrameLimit) {
        this.rejectOversizeVisitor(host, id, visitor);
        return;
      }
      if (!this.forwardChannelFrame(host, serverId, id, framed)) {
        visitor.close(1013, "relay link congestion");
      }
    });
    visitor.on("close", () => {
      if (this.visitors.delete(id)) this.sendFrameForced(host, { t: "ws-close", id });
    });
    visitor.on("error", () => {
      if (this.visitors.delete(id)) {
        this.sendFrameForced(host, { t: "ws-close", id });
        visitor.terminate();
      }
    });
  }

  /** Reject one message that cannot be forwarded inside the control budget by
   * closing ITS channel with 1009 ("message too big") and the explicit reason,
   * telling the host to drop the channel too. The control connection, every
   * other channel, and in-flight requests are untouched. */
  private rejectOversizeVisitor(host: RegisteredHost, id: string, visitor: WebSocket): void {
    if (!this.visitors.delete(id)) return;
    this.sendFrameForced(host, { t: "ws-close", id, reason: RELAY_WS_PAYLOAD_TOO_LARGE_REASON });
    visitor.close(1009, RELAY_WS_PAYLOAD_TOO_LARGE_REASON);
  }

  /**
   * P1-5: forward one visitor-channel frame onto the SHARED host control
   * socket with per-channel byte accounting. When the control budget is
   * exhausted the worst contributor (usually the flooding channel itself) is
   * evicted — its visitor terminated and the host told to drop the channel —
   * instead of terminating the control socket, which would disconnect every
   * other channel and in-flight request of the host. `sendRaw`'s kill remains
   * only for closed/dead sockets; a host that never drains eventually loses
   * each flooding channel and nothing else.
   */
  private forwardChannelFrame(
    host: RegisteredHost,
    serverId: string,
    channelId: string,
    data: string | Uint8Array,
  ): boolean {
    const bytes = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
    const control = host.control;
    if (control.readyState !== WebSocket.OPEN) return false;
    if (control.bufferedAmount + bytes > this.outboundBufferLimit) {
      const worst = this.worstChannelId(host, channelId);
      this.evictChannel(host, serverId, worst);
      if (worst !== channelId) this.evictChannel(host, serverId, channelId);
      return false;
    }
    if (!this.sendRaw(control, data, false)) return false;
    if (control.bufferedAmount === 0) {
      host.channelBytes.clear(); // fully drained: start the accounting window fresh
    }
    host.channelBytes.set(channelId, (host.channelBytes.get(channelId) ?? 0) + bytes);
    return true;
  }

  private worstChannelId(host: RegisteredHost, fallback: string): string {
    let worst: string = fallback;
    let worstBytes = -1;
    for (const [id, bytes] of host.channelBytes) {
      if (bytes > worstBytes) {
        worst = id;
        worstBytes = bytes;
      }
    }
    return worst;
  }

  /** Channel-only eviction: stop forwarding, tell the host to drop the channel
   * (a tiny frame that is enqueued even while the buffer is over its soft
   * limit — the host reads it as soon as the flood drains), then cut the
   * visitor socket so its close cannot double-report. */
  private evictChannel(host: RegisteredHost, serverId: string, channelId: string): void {
    const visitor = this.visitors.get(channelId);
    if (!visitor || visitor.serverId !== serverId) {
      host.channelBytes.delete(channelId);
      return;
    }
    this.visitors.delete(channelId);
    host.channelBytes.delete(channelId);
    this.sendFrameForced(host, {
      t: "ws-close",
      id: channelId,
      reason: "relay link congestion",
    });
    visitor.socket.terminate();
  }

  /** Enqueue a tiny terminal notice through a bounded reserve. Never used for
   * bulk channel traffic; exhausting the reserve tears down this host so the
   * peer cannot retain a stale channel or request forever. */
  private sendFrameForced(host: RegisteredHost, frame: RelayServerFrame): boolean {
    const control = host.control;
    if (control.readyState !== WebSocket.OPEN) return false;
    const data = JSON.stringify(frame);
    const bytes = Buffer.byteLength(data);
    if (control.bufferedAmount === 0) host.forcedControlBytes = 0;
    if (
      host.forcedControlBytes + bytes > this.forcedControlReserveBytes ||
      control.bufferedAmount + bytes > this.outboundBufferLimit + this.forcedControlReserveBytes
    ) {
      this.socketLiveness.delete(control);
      try {
        control.terminate();
      } catch {
        // ignore
      }
      return false;
    }
    try {
      control.send(data);
      host.forcedControlBytes += bytes;
      return true;
    } catch {
      this.socketLiveness.delete(control);
      try {
        control.terminate();
      } catch {
        // ignore
      }
      return false;
    }
  }

  private dropHostTraffic(serverId: string, reason: string): void {
    for (const [id, pending] of this.pending) {
      if (pending.serverId === serverId && this.pending.delete(id)) {
        clearTimeout(pending.timer);
        if (pending.stream?.opened) pending.stream.res.destroy();
        pending.reject(new Error(reason));
      }
    }
    for (const [id, visitor] of this.visitors) {
      if (visitor.serverId === serverId && this.visitors.delete(id)) {
        visitor.socket.close(1012, reason);
      }
    }
  }

  /**
   * Streaming idle deadline: once `res-open` arrived, the whole-request
   * deadline becomes an inactivity budget — every `res-chunk` re-arms it, so
   * a slow-but-progressing response is never retired mid-stream while a
   * stalled one still unwinds within the same timeout.
   */
  private rearmStreamingIdle(id: string, pending: PendingRequest): void {
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      if (this.pending.get(id) !== pending) return;
      this.pending.delete(id);
      if (pending.stream?.opened) pending.stream.res.destroy();
      pending.reject(new Error("Relay request timed out."));
      const host = this.hosts.get(pending.serverId);
      if (host) this.sendFrameForced(host, { t: "req-cancel", id });
    }, this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  }

  private liveHost(serverId: string): RegisteredHost | undefined {
    const existing = this.hosts.get(serverId);
    if (!existing) return undefined;
    if (existing.control.readyState === WebSocket.OPEN) return existing;
    this.removeHost(serverId);
    this.dropHostTraffic(serverId, "Host disconnected.");
    return undefined;
  }

  private removeHost(serverId: string): void {
    const host = this.hosts.get(serverId);
    if (host?.forwardOwnerId) this.forwardOwners.delete(host.forwardOwnerId);
    this.hosts.delete(serverId);
  }

  private isForwardHostname(authority: string): boolean {
    return (
      isForwardOriginAuthority(authority) ||
      this.forwardPolicy?.containsHostname(authority) === true
    );
  }

  private sendToHost(host: RegisteredHost, frame: RelayServerFrame): boolean {
    return this.sendFrame(host.control, frame);
  }

  private sendFrame(control: WebSocket, frame: RelayServerFrame): boolean {
    return this.sendRaw(control, JSON.stringify(frame), false);
  }

  private sendRaw(socket: WebSocket, data: string | Uint8Array, closeOnOverflow = true): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    // Buffer.byteLength counts UTF-8 bytes for strings and .byteLength for views.
    if (socket.bufferedAmount + Buffer.byteLength(data) > this.outboundBufferLimit) {
      if (closeOnOverflow) {
        this.socketLiveness.delete(socket);
        try {
          socket.terminate();
        } catch {
          // ignore
        }
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
