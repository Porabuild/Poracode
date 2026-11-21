import type { ServerResponse } from "node:http";

const LOCALHOST_ORIGIN_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SAFE_RETRYABLE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const STALE_KEEP_ALIVE_ERROR_CODES = new Set([
  "ECONNRESET",
  "EPIPE",
  "ECONNABORTED",
  "ERR_SOCKET_CLOSED",
  "UND_ERR_SOCKET",
]);
const STALE_KEEP_ALIVE_MESSAGE_RE = /socket hang up|other side closed/i;
const STALE_KEEP_ALIVE_CAUSE_DEPTH_LIMIT = 4;

/** Collect a fetch `Headers` object into a plain record. */
export function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

export { readBoundedResponseBody } from "./remote/responseBody";

/**
 * Reads a Node request body, aborting once the accumulated size exceeds
 * `maxBytes`. The caller supplies `onOverflow` so each site keeps its own
 * error type/message. After an overflow the rest of the request is still
 * drained (without being retained): responding while the client is mid-upload
 * leaves unread bytes in the socket, so the subsequent close RSTs the
 * connection and the client sees `ECONNRESET` instead of the caller's 413 —
 * the same contract as HookIngress's drain-then-reject readBody. The drain is
 * bounded by the request itself: the loop ends at this request's final chunk.
 */
export async function readBoundedNodeRequestBody(
  req: AsyncIterable<Buffer | Uint8Array | string>,
  maxBytes: number,
  onOverflow: () => Error,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  let overflow: Error | undefined;
  for await (const chunk of req) {
    if (overflow) continue;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      overflow = onOverflow();
      continue;
    }
    chunks.push(buffer);
  }
  if (overflow) throw overflow;
  return Buffer.concat(chunks);
}

/** Writes a JSON response body with a UTF-8 `content-type`. */
export function writeJsonResponse(
  res: ServerResponse,
  status: number,
  data: unknown,
  options?: { readonly cacheControl?: string; readonly trailingNewline?: boolean },
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (options?.cacheControl) {
    res.setHeader("Cache-Control", options.cacheControl);
  }
  const json = JSON.stringify(data);
  res.end(options?.trailingNewline ? `${json}\n` : json);
}

/**
 * True for RFC 9110 safe/idempotent HTTP methods that may be retried once on a
 * fresh socket when a pooled keep-alive connection resets before response
 * headers arrive.
 */
export function isSafeRetryableHttpMethod(method: string | undefined): boolean {
  return SAFE_RETRYABLE_HTTP_METHODS.has((method ?? "GET").toUpperCase());
}

/**
 * True when an error (or its `cause` chain) indicates that a peer or
 * intermediary closed a pooled keep-alive socket before delivering response
 * headers (`ECONNRESET`, `EPIPE`, `ECONNABORTED`, `ERR_SOCKET_CLOSED`,
 * undici's `UND_ERR_SOCKET`, `socket hang up`, `other side closed`). Never
 * matches cancellations, certificate mismatches, DNS/connect refusals, or
 * timeouts.
 */
export function isStaleKeepAliveSocketError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth <= STALE_KEEP_ALIVE_CAUSE_DEPTH_LIMIT && current; depth += 1) {
    if (typeof current !== "object") return false;
    const record = current as {
      readonly name?: unknown;
      readonly code?: unknown;
      readonly message?: unknown;
      readonly cause?: unknown;
    };
    if (
      record.name === "AbortError" ||
      record.code === "ABORT_ERR" ||
      record.message === "certificate_fingerprint_mismatch"
    ) {
      return false;
    }
    if (typeof record.code === "string" && STALE_KEEP_ALIVE_ERROR_CODES.has(record.code)) {
      return true;
    }
    if (typeof record.message === "string" && STALE_KEEP_ALIVE_MESSAGE_RE.test(record.message)) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

/**
 * Destroys every idle socket sitting in a Node HTTP/HTTPS `Agent`'s
 * `freeSockets` pool without disturbing active in-flight requests. Used before
 * retrying after a stale keep-alive reset so the retry opens a fresh socket
 * even if the peer closed multiple pooled connections at once.
 */
export function destroyIdleAgentSockets(agent: {
  readonly freeSockets?: Readonly<Record<string, readonly { destroy(): unknown }[] | undefined>>;
}): void {
  const buckets = agent.freeSockets;
  if (!buckets) return;
  for (const sockets of Object.values(buckets)) {
    if (!sockets) continue;
    for (const socket of [...sockets]) {
      try {
        socket.destroy();
      } catch {
        // Best-effort cleanup of stale idle sockets.
      }
    }
  }
}

/**
 * A loopback hostname as `URL.hostname` reports it — note the bracketed `[::1]`
 * form, and the `*.localhost` subdomains browsers also resolve to loopback.
 */
export function isLoopbackHostname(hostname: string): boolean {
  return LOCALHOST_ORIGIN_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    return LOCALHOST_ORIGIN_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}
