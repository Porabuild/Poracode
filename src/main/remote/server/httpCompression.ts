import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gzip } from "node:zlib";

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
 * - Compression is async (`zlib.gzip`, not `gzipSync`). This code runs on the
 *   Electron **main** process, where a synchronous multi-megabyte deflate would
 *   block the IPC/event loop that every window and the supervisor bridge share.
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

export function acceptsGzip(req: IncomingMessage): boolean {
  const header = req.headers["accept-encoding"];
  const value = Array.isArray(header) ? header.join(",") : (header ?? "");
  return /\bgzip\b/i.test(value);
}

export function computeEtag(body: string): string {
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

async function gzipAsync(body: string): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    gzip(body, GZIP_OPTIONS, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
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
  // Caches keyed only on URL would otherwise be able to hand a gzip body to a
  // client that cannot decode it.
  res.setHeader("Vary", "Accept-Encoding");

  if (status === 200 && etagMatches(req, etag)) {
    res.statusCode = 304;
    res.end();
    return;
  }

  const rawBytes = Buffer.byteLength(body, "utf8");
  if (!acceptsGzip(req) || rawBytes < MIN_COMPRESS_BYTES) {
    res.statusCode = status;
    res.setHeader("Content-Length", String(rawBytes));
    res.end(body);
    return;
  }

  let compressed: Buffer;
  try {
    compressed = await gzipAsync(body);
  } catch {
    // Never fail a response because compression failed.
    res.statusCode = status;
    res.setHeader("Content-Length", String(rawBytes));
    res.end(body);
    return;
  }
  // A compressed body that grew (already-entropic payloads: base64 images) is
  // pointless overhead on both ends.
  if (compressed.byteLength >= rawBytes) {
    res.statusCode = status;
    res.setHeader("Content-Length", String(rawBytes));
    res.end(body);
    return;
  }
  res.statusCode = status;
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Content-Length", String(compressed.byteLength));
  res.end(compressed);
}
