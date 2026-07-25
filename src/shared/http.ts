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

export async function readBoundedResponseBody(
  response: Response,
  maxBodyBytes: number,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBodyBytes) {
      throw new Error("response body too large");
    }
  }

  if (!response.body) {
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > maxBodyBytes) throw new Error("response body too large");
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("response body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Reads a Node request body, aborting once the accumulated size exceeds
 * `maxBytes`. The caller supplies `onOverflow` so each site keeps its own
 * error type/message.
 */
export async function readBoundedNodeRequestBody(
  req: AsyncIterable<Buffer | Uint8Array | string>,
  maxBytes: number,
  onOverflow: () => Error,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw onOverflow();
    }
    chunks.push(buffer);
  }
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
