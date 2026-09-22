import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import {
  ENVIRONMENT_INTERNAL_HEADER_PREFIX,
  ENVIRONMENT_PARENT_TICKET_PARAM,
} from "@/shared/environments";
import { isHopByHopHeader, type LoopbackProxyReplacement } from "../server/loopbackProxy";
import { isReservedDispatchHeader } from "../server/portForwardProxy";

/**
 * C1.2 parent proxy pure policy (E2 Cut D). State-free decisions about which
 * byte may cross the child boundary and under which bounds: parent-internal
 * header/ticket consumption, the canonical descriptor path, child response
 * header policy, and the child-bound request header set. The gateway keeps
 * the transport and orchestration; nothing here dials, buffers beyond the
 * explicit bounds, or reads gateway state, so the security policy is
 * inspectable without constructing a gateway and a real child.
 */

/** Child descriptor routes whose loopback endpoints must be rewritten to the
 * parent proxy prefix before any byte reaches a client. */
const ENVIRONMENT_DESCRIPTOR_PATHS: ReadonlySet<string> = new Set([
  "/.well-known/poracode/environment",
  "/.well-known/lightcode/environment",
]);

/**
 * Child redirect statuses. The environment data-plane contract (child
 * `/api/*`, `/oauth/*`, `/ws`, descriptor) emits no redirects, and relaying
 * one would either leak the child's loopback origin/port through `Location` or
 * resolve a relative `Location` against the PARENT origin, escaping the proxy
 * prefix. The parent therefore refuses the whole class with a bounded 502 and
 * never forwards a `Location` header on any status. This is the smallest
 * coherent policy: no unsupported redirect is ever followed, and a future
 * child API that genuinely needs one must define a pinned-origin rewrite.
 */
export const ENVIRONMENT_REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
]);

/** Default one-use parent WS ticket TTL (ADR §5). */
export const ENVIRONMENT_WS_TICKET_TTL_MS = 30_000;
/** Hard bound for the child descriptor JSON transform (bytes + deadline). */
export const ENVIRONMENT_DESCRIPTOR_MAX_BYTES = 512 * 1024;
export const ENVIRONMENT_DESCRIPTOR_TIMEOUT_MS = 2_000;

/** Header set the parent CONSUMES (never forwards): the parent credential
 * header plus the whole reserved internal namespaces. `lowerName` must
 * already be lowercased (Node inbound names are). */
export function isParentInternalHeader(lowerName: string): boolean {
  return (
    lowerName.startsWith(ENVIRONMENT_INTERNAL_HEADER_PREFIX) || isReservedDispatchHeader(lowerName)
  );
}

/** Reads one raw query parameter without re-encoding any other byte. */
export function readRawQueryParam(rawQuery: string, key: string): string | null {
  for (const part of rawQuery.split("&")) {
    const eq = part.indexOf("=");
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    if (rawKey !== key) continue;
    const rawValue = eq === -1 ? "" : part.slice(eq + 1);
    try {
      return decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Whether one raw query part's KEY names the parent WS ticket. The literal
 * spelling matches; a percent-encoded key that decodes to it matches too, so
 * a client (or a future redirect builder) cannot smuggle parent credential
 * material past the strip with an equivalent encoding. Only the KEY is
 * decoded — values and every other byte stay verbatim.
 */
export function isParentTicketQueryPart(part: string): boolean {
  const eq = part.indexOf("=");
  const rawKey = eq === -1 ? part : part.slice(0, eq);
  if (rawKey === ENVIRONMENT_PARENT_TICKET_PARAM) return true;
  try {
    return decodeURIComponent(rawKey.replace(/\+/g, " ")) === ENVIRONMENT_PARENT_TICKET_PARAM;
  } catch {
    return false;
  }
}

/** Removes every `parentTicket` part (duplicates and encoded-key spellings
 * included) from the raw child query while preserving every other parameter
 * byte-for-byte (never re-encodes a child ticket). */
export function stripParentTicket(rawQuery: string): string {
  return rawQuery
    .split("&")
    .filter((part) => !isParentTicketQueryPart(part))
    .join("&");
}

/**
 * The canonical child descriptor path, tolerating exactly one trailing slash
 * (a widely aliased spelling). Any other variant is not transformed, so an
 * accepted alias can never stream the raw `endpoints.*`; the canonical GET is
 * unaffected.
 */
export function canonicalDescriptorPath(rawChildPath: string): string | null {
  if (ENVIRONMENT_DESCRIPTOR_PATHS.has(rawChildPath)) return rawChildPath;
  if (rawChildPath.endsWith("/")) {
    const trimmed = rawChildPath.slice(0, -1);
    if (ENVIRONMENT_DESCRIPTOR_PATHS.has(trimmed)) return trimmed;
  }
  return null;
}

/** One bounded JSON failure body, used where the proxy must replace a child
 * response it will not relay (redirects, descriptor transform failures). */
export function boundedJsonFailure(code: string, message: string): LoopbackProxyReplacement {
  const body = Buffer.from(JSON.stringify({ error: { code, message } }), "utf8");
  return {
    status: 502,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(body.byteLength),
    },
    body,
  };
}

/** Child HTTP response headers the parent never relays: hop-by-hop headers,
 * the child's CORS decision (the parent origin's is authoritative), any
 * `location` (a child redirect is refused wholesale; a Location on another
 * status would still leak a child origin), and the whole reserved
 * `x-poracode-environment-*` namespace, so a child can never spoof the
 * parent's auth-authority marker. */
export function keepChildHttpResponseHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    !isHopByHopHeader(name) &&
    !lower.startsWith("access-control-") &&
    lower !== "location" &&
    !lower.startsWith(ENVIRONMENT_INTERNAL_HEADER_PREFIX)
  );
}

/** Child upgrade-response headers the parent never relays. Only the CORS
 * policy headers and the reserved `x-poracode-environment-*` namespace are
 * dropped: `sec-websocket-accept`, `upgrade`, and `connection` must ride
 * verbatim for the handshake to validate. */
export function keepChildUpgradeResponseHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    !lower.startsWith("access-control-") && !lower.startsWith(ENVIRONMENT_INTERNAL_HEADER_PREFIX)
  );
}

/** Bounded read of a small upstream response body (descriptor transform): a
 * hard byte cap plus a hard deadline, both of which destroy the upstream
 * stream and fail the transform closed. */
export function readBoundedIncomingBody(
  stream: IncomingMessage,
  maxBytes: number,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = (error: Error | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("error", onError);
      if (error) {
        stream.destroy();
        reject(error);
        return;
      }
      resolve(Buffer.concat(chunks));
    };
    const timer = setTimeout(() => finish(new Error("descriptor read timed out")), timeoutMs);
    timer.unref?.();
    const onAbort = (): void => finish(new Error("descriptor read aborted"));
    const onData = (chunk: Buffer): void => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        finish(new Error("descriptor body too large"));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = (): void => finish(null);
    const onError = (error: Error): void => finish(error);
    if (signal.aborted) {
      finish(new Error("descriptor read aborted"));
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Builds the child-bound header set. The child bearer stays in
 * `Authorization` verbatim; the parent credential header and every reserved
 * internal header are consumed at the parent and never dialed; browser
 * credentials (`Cookie`, `Origin`, `Referer`) are stripped so the child
 * never applies CORS or cookie policy to a foreign parent origin; `Host` is
 * rewritten to the child's own loopback form (admitted by its Host gate);
 * `Accept-Encoding` is forced to `identity` for the loopback hop, matching
 * the relay adapter.
 */
export function buildChildRequestHeaders(
  headers: IncomingHttpHeaders,
  remotePort: number,
  forUpgrade: boolean,
): Record<string, string | string[]> {
  const childHeaders: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = name.toLowerCase();
    if (
      lower === "host" ||
      lower === "cookie" ||
      lower === "origin" ||
      lower === "referer" ||
      lower === "accept-encoding" ||
      isParentInternalHeader(lower)
    ) {
      continue;
    }
    if (!forUpgrade && isHopByHopHeader(lower)) continue;
    childHeaders[name] = value;
  }
  childHeaders.host = `localhost:${remotePort}`;
  childHeaders["accept-encoding"] = "identity";
  return childHeaders;
}
