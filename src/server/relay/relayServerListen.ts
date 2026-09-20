import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { relayBinaryMessageLimit } from "@/shared/remote/relayLimits";
import {
  ForwardOriginPolicy,
  isForwardOriginAuthority,
} from "@/host/remote/portForward/forwardOrigin";
import {
  DEFAULT_RELAY_MAX_BODY_BYTES,
  parseRelayVisitorPath,
  RELAY_ROUTING_COOKIE_NAME,
  relayWebSocketPayloadLimit,
  stripCookieCrumb,
  type RelayForwardContext,
} from "@/shared/remote/relayProtocol";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  RELAY_MAX_PENDING_PER_CLIENT,
  RELAY_MAX_PENDING_TOTAL,
  SAFE_RELAY_502_TEXTS,
  isForwardHostname,
  normalizePublicBaseUrl,
  relayVisitorClientId,
  type RelayServerInfo,
  type RelayServerOptions,
  type RelayServerRuntime,
} from "./relayServerTypes";
import {
  sendFrameForced,
  sendRaw,
  startWebSocketHeartbeat,
  stopWebSocketHeartbeat,
} from "./relayServerSockets";
import { handleHostControl, liveHost } from "./relayServerHostControl";
import { handleVisitorWs } from "./relayServerVisitor";

export function createRelayServerRuntime(
  options: RelayServerOptions,
  now: () => number,
): RelayServerRuntime {
  const forwardPolicy = options.forwardBaseUrl
    ? new ForwardOriginPolicy(options.forwardBaseUrl)
    : null;
  if (options.publicBaseUrl) {
    const host = new URL(normalizePublicBaseUrl(options.publicBaseUrl)).host;
    if (isForwardOriginAuthority(host) || forwardPolicy?.containsHostname(host) === true) {
      throw new Error("Relay API origin must be outside the forward hostname namespace.");
    }
  }
  const outboundBufferLimit =
    options.maxWebSocketOutboundBufferBytes ??
    relayWebSocketPayloadLimit(options.maxBodyBytes ?? DEFAULT_RELAY_MAX_BODY_BYTES);
  const forcedControlReserveBytes = Math.min(
    64 * 1024,
    Math.max(4 * 1024, outboundBufferLimit * 2),
  );
  const inboundLimit =
    options.maxWebSocketPayloadBytes ??
    relayWebSocketPayloadLimit(options.maxBodyBytes ?? DEFAULT_RELAY_MAX_BODY_BYTES);
  const controlFrameLimit = Math.min(inboundLimit, outboundBufferLimit);
  const binaryMessageLimit = relayBinaryMessageLimit(controlFrameLimit);
  const wss = new WebSocketServer({ noServer: true, maxPayload: inboundLimit });
  let rt!: RelayServerRuntime;
  const server = createServer((req, res) => void handleRelayHttp(rt, req, res));
  server.on("upgrade", (req, socket, head) => handleRelayUpgrade(rt, req, socket, head));
  rt = {
    options,
    now,
    server,
    wss,
    hosts: new Map(),
    forwardOwners: new Map(),
    forwardPolicy,
    secretBindings: new Map(),
    pending: new Map(),
    visitors: new Map(),
    socketLiveness: new Map(),
    visitorIdSalt: randomBytes(32),
    heartbeatTimer: null,
    info: null,
    outboundBufferLimit,
    forcedControlReserveBytes,
    controlFrameLimit,
    binaryMessageLimit,
  };
  return rt;
}

export async function startRelayListen(rt: RelayServerRuntime): Promise<RelayServerInfo> {
  if (rt.info) return rt.info;
  const host = rt.options.host ?? "0.0.0.0";
  const configuredPublicBaseUrl = rt.options.publicBaseUrl
    ? normalizePublicBaseUrl(rt.options.publicBaseUrl)
    : null;
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      rt.server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      rt.server.off("error", onError);
      resolve();
    };
    rt.server.once("error", onError);
    rt.server.once("listening", onListening);
    rt.server.listen(rt.options.port ?? 0, host);
  });
  const address = rt.server.address() as AddressInfo;
  const base = configuredPublicBaseUrl ?? `http://127.0.0.1:${address.port}`;
  rt.info = { url: base, port: address.port };
  startWebSocketHeartbeat(rt);
  return rt.info;
}

export async function disposeRelayListen(rt: RelayServerRuntime): Promise<void> {
  stopWebSocketHeartbeat(rt);
  for (const visitor of rt.visitors.values()) visitor.socket.terminate();
  rt.visitors.clear();
  for (const host of rt.hosts.values()) host.control.terminate();
  rt.hosts.clear();
  rt.forwardOwners.clear();
  rt.secretBindings.clear();
  rt.socketLiveness.clear();
  for (const [id, pending] of rt.pending) {
    if (rt.pending.delete(id)) {
      clearTimeout(pending.timer);
      if (pending.stream?.opened) pending.stream.res.destroy();
      pending.reject(new Error("Relay shutting down."));
    }
  }
  rt.wss.close();
  rt.server.closeIdleConnections?.();
  await new Promise<void>((resolve) => {
    rt.server.close(() => resolve());
  });
  rt.info = null;
}

/** Stable-per-visitor identity for the visitor behind this request socket. */
function visitorClientId(rt: RelayServerRuntime, req: IncomingMessage): string {
  return relayVisitorClientId(rt.visitorIdSalt, req.socket.remoteAddress);
}

async function handleRelayHttp(
  rt: RelayServerRuntime,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://relay.local");
  if (url.pathname === "/healthz" && !isForwardHostname(rt, req.headers.host ?? "")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  const dispatch = resolveVisitorDispatch(rt, req, url);
  if (!dispatch) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  const { serverId, path: dispatchPath } = dispatch;
  const host = liveHost(rt, serverId);
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
    body = await readBody(rt, req);
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
  const clientId = visitorClientId(rt, req);
  // P1-8: per-owner admission before any host work is charged.
  let pendingForClient = 0;
  for (const pending of rt.pending.values()) {
    if (pending.clientId === clientId) pendingForClient += 1;
  }
  if (
    pendingForClient >= RELAY_MAX_PENDING_PER_CLIENT ||
    rt.pending.size >= RELAY_MAX_PENDING_TOTAL
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
  if (Buffer.byteLength(reqFrameText) > rt.controlFrameLimit) {
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
        const pending = rt.pending.get(id);
        if (!pending || pending.serverId !== serverId || !rt.pending.delete(id)) {
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
          sendFrameForced(rt, host, { t: "req-cancel", id });
        }
      }, rt.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
      rt.pending.set(id, {
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
          sendFrameForced(rt, host, { t: "req-cancel", id });
        }
      };
      const sent = sendRaw(rt, host.control, reqFrameText, false);
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
function resolveVisitorDispatch(
  rt: RelayServerRuntime,
  req: IncomingMessage,
  url: URL,
): {
  readonly serverId: string;
  readonly path: string;
  readonly forward?: RelayForwardContext;
} | null {
  if (isForwardHostname(rt, req.headers.host ?? "")) {
    const policy = rt.forwardPolicy;
    const identity = policy?.resolveAuthority(req.headers.host ?? "");
    if (!identity || !policy) return null;
    const serverId = rt.forwardOwners.get(identity.ownerId);
    if (!serverId || !liveHost(rt, serverId)) return null;
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

function handleRelayUpgrade(
  rt: RelayServerRuntime,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const url = new URL(req.url ?? "/", "http://relay.local");
  if (url.pathname === "/host" && !isForwardHostname(rt, req.headers.host ?? "")) {
    rt.wss.handleUpgrade(req, socket, head, (ws) => handleHostControl(rt, ws));
    return;
  }
  const dispatch = resolveVisitorDispatch(rt, req, url);
  const host = dispatch ? liveHost(rt, dispatch.serverId) : undefined;
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
    rt.wss.handleUpgrade(req, socket, head, (ws) =>
      handleVisitorWs(
        rt,
        ws,
        host,
        dispatch.serverId,
        `${dispatch.path}${url.search}`,
        cookie,
        visitorClientId(rt, req),
        dispatch.forward,
      ),
    );
    return;
  }
  socket.destroy();
}

async function readBody(rt: RelayServerRuntime, req: IncomingMessage): Promise<Buffer> {
  const max = rt.options.maxBodyBytes ?? DEFAULT_RELAY_MAX_BODY_BYTES;
  return await readBoundedNodeRequestBody(req, max, () => new Error("body too large"));
}
