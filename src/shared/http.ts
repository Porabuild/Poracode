import type { ServerResponse } from "node:http";

const LOCALHOST_ORIGIN_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

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
