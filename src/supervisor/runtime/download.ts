/**
 * Shared download + sha256-verify primitives used by both the WSL Node
 * runtime resolver and the native Node runtime resolver. Pure I/O — no
 * platform-specific code lives here, so the same primitives work for any
 * pinned binary we'd ever ship.
 */

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface DownloadProgressEvent {
  bytesReceived: number;
  bytesTotal: number;
}

export type DownloadProgressListener = (event: DownloadProgressEvent) => void;

export interface DownloadToFileOptions {
  onProgress?: DownloadProgressListener;
  /**
   * AbortSignal honored on `fetch` and the stream pipeline. Callers wire
   * this to teardown so a long-running runtime install doesn't outlive
   * the supervisor.
   */
  signal?: AbortSignal;
}

/**
 * Stream `url` to `destPath`, emitting progress every ~256 KiB (and a final
 * tick on completion). Throws on non-2xx, empty body, or pipeline error.
 * Caller is responsible for cleaning up `destPath` on throw.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  options?: DownloadToFileOptions,
): Promise<void> {
  const response = await fetch(url, options?.signal ? { signal: options.signal } : undefined);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  if (!response.body) {
    throw new Error(`empty response body for ${url}`);
  }

  const totalHeader = response.headers.get("content-length");
  const bytesTotal = totalHeader ? Number.parseInt(totalHeader, 10) : 0;
  let bytesReceived = 0;
  let lastReport = 0;
  const progressChunkBytes = 262_144;

  mkdirSync(dirname(destPath), { recursive: true });
  const out = createWriteStream(destPath);

  const nodeStream = Readable.fromWeb(
    response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
  );
  nodeStream.on("data", (chunk: Buffer | string) => {
    const len = typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
    bytesReceived += len;
    if (bytesReceived - lastReport >= progressChunkBytes) {
      options?.onProgress?.({ bytesReceived, bytesTotal });
      lastReport = bytesReceived;
    }
  });
  await pipeline(nodeStream, out, options?.signal ? { signal: options.signal } : {});
  options?.onProgress?.({
    bytesReceived,
    bytesTotal: bytesTotal || bytesReceived,
  });
}

/**
 * Hash `filePath` with SHA-256 and throw when the digest doesn't match
 * `expected` (case-insensitive hex). Streams the file so we don't pull a
 * ~30 MB tarball into memory.
 */
export async function verifySha256(
  filePath: string,
  expected: string,
  signal?: AbortSignal,
): Promise<void> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash, signal ? { signal } : {});
  const actual = hash.digest("hex");
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`SHA256 mismatch for ${filePath}: expected ${expected}, got ${actual}`);
  }
}
