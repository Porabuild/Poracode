import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";

/**
 * Content encoding + conditional GET for the remote JSON API.
 *
 * Remote snapshot/history responses are the largest thing this server sends over
 * HTTP and were previously written as raw `JSON.stringify` with no `ETag`, so a
 * phone re-fetched the entire shell snapshot on every status-affecting event
 * even when nothing in it had changed.
 *
 * Two deliberate design points:
 *
 * - Compression is async (`zlib.gzip`, not `gzipSync`). This code runs in the
 *   extracted backend-host process, where a synchronous multi-megabyte deflate
 *   would block the event loop that the PWA remote server, the desktop renderer
 *   stream, SQLite, and the supervisor bridge share.
 *
 * - The `ETag` is a content hash prefixed with a per-process boot id, never the
 *   snapshot's `snapshotSeq`. `snapshotSeq` is in-memory and restarts at 0 while
 *   bearer sessions persist across restarts, so a client holding `"500"` from a
 *   previous boot could be handed a false `304` once the new stream's sequence
 *   climbed back to 500 with different content. A hash also gets a higher hit
 *   rate, because the sequence bumps on every broadcast event whether or not the
 *   shell snapshot's own content moved.
 */

/** Below this, framing overhead and CPU outweigh the saving. */
const MIN_COMPRESS_BYTES = 1024;

/** Distinguishes ETags minted by different runs of this process. */
const BOOT_ID = randomUUID().slice(0, 8);

const GZIP_OPTIONS = { level: 6 } as const;
const BROTLI_OPTIONS = {
  params: {
    [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
  },
} as const;

function parseAcceptedEncoding(req: IncomingMessage): "br" | "gzip" | null {
  const header = req.headers["accept-encoding"];
  const value = Array.isArray(header) ? header.join(",") : (header ?? "");
  if (/\bbr\b/i.test(value)) return "br";
  if (/\bgzip\b/i.test(value)) return "gzip";
  return null;
}

export function acceptsGzip(req: IncomingMessage): boolean {
  return parseAcceptedEncoding(req) === "gzip";
}

export function computeEtag(body: string | Uint8Array): string {
  const hash = createHash("sha1").update(body).digest("base64url").slice(0, 22);
  return `"${BOOT_ID}-${hash}"`;
}

/** RFC-compliant enough for our own client: exact match, or `*`. */
export function etagMatches(req: IncomingMessage, etag: string): boolean {
  const header = req.headers["if-none-match"];
  if (!header) return false;
  const value = Array.isArray(header) ? header.join(",") : header;
  if (value.trim() === "*") return true;
  return value
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === etag || candidate === `W/${etag}`);
}

async function compressAsync(body: string, encoding: "br" | "gzip"): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const cb = (error: Error | null, result: Buffer) => {
      if (error) reject(error);
      else resolve(result);
    };
    if (encoding === "br") {
      brotliCompress(
        body,
        {
          ...BROTLI_OPTIONS,
          params: {
            ...BROTLI_OPTIONS.params,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(body, "utf8"),
          },
        },
        cb,
      );
    } else {
      gzip(body, GZIP_OPTIONS, cb);
    }
  });
}

async function writeMaybeGzippedBody(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: string,
): Promise<void> {
  if (res.destroyed || res.writableEnded) return;
  const rawBytes = Buffer.byteLength(body, "utf8");
  const encoding = parseAcceptedEncoding(req);
  if (!encoding || rawBytes < MIN_COMPRESS_BYTES) {
    res.statusCode = status;
    res.setHeader("Content-Length", String(rawBytes));
    res.end(body);
    return;
  }

  let compressed: Buffer;
  try {
    compressed = await compressAsync(body, encoding);
  } catch {
    if (res.destroyed || res.writableEnded) return;
    // Never fail a response because compression failed.
    res.statusCode = status;
    res.setHeader("Content-Length", String(rawBytes));
    res.end(body);
    return;
  }
  if (res.destroyed || res.writableEnded) return;
  // A compressed body that grew (already-entropic payloads: base64 images) is
  // pointless overhead on both ends.
  if (compressed.byteLength >= rawBytes) {
    res.statusCode = status;
    res.setHeader("Content-Length", String(rawBytes));
    res.end(body);
    return;
  }
  res.statusCode = status;
  res.setHeader("Content-Encoding", encoding);
  res.setHeader("Content-Length", String(compressed.byteLength));
  res.end(compressed);
}

/**
 * Writes a JSON body with negotiated async gzip above `MIN_COMPRESS_BYTES`
 * (without ETag/304 semantics, suitable for POST RPC responses such as
 * `/api/git/call` diffs, file reads, tree listings, and PR batches).
 */
export async function writeCompressedJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: string,
): Promise<void> {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.appendHeader("Vary", "Accept-Encoding");
  await writeMaybeGzippedBody(req, res, status, body);
}

/**
 * Writes a JSON body with `ETag`, negotiated gzip, and a `304` short-circuit.
 *
 * Callers pass the already-serialized body so the ETag is computed over exactly
 * the bytes that would be sent.
 */
export async function writeNegotiatedJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: string,
): Promise<void> {
  const etag = computeEtag(body);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Responses are per-session private and must be revalidated, never reused
  // blind: `no-cache` still permits the conditional request that yields the 304.
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("ETag", etag);
  // Cached bodies belong to the negotiated encoding and bearer credential.
  res.appendHeader("Vary", "Accept-Encoding, Authorization");

  if (status === 200 && etagMatches(req, etag)) {
    res.statusCode = 304;
    res.end();
    return;
  }

  await writeMaybeGzippedBody(req, res, status, body);
}
