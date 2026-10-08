import { createReadStream } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, open, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, normalize, sep } from "node:path";
import { finished } from "node:stream/promises";
import { parseByteRange, pipeOwnedFileResponse } from "./fileResponseStream";
import {
  bundledWebClientAssetPath,
  bundledWebClientCacheControl,
  bundledWebClientContentType,
  bundledWebClientDocumentPath,
  hasUnsafeWindowsPathSegment,
  isLegacyClientPath,
  resolveBundledWebClientDir,
} from "./bundledWebClient";
import { readLocalClientHtml, type LocalClientHtml } from "./localClientHtml";

export { isLegacyClientPath };

/**
 * `scripts/finalize-web-build.mjs` substitutes this token into the canonical
 * web build's service worker. The desktop/checkout renderer build ships the raw
 * template, which must never be served as a worker: its cache name would be
 * stable across upgrades and its notification icon path a literal token. Such a
 * build falls back to the runtime-generated pairing worker, exactly as before
 * the bundled client existed.
 */
const UNFINALIZED_WORKER_TOKEN = "__PORACODE_BUILD_VERSION__";

/** Bounded read window for the service-worker finalization scan. */
const WORKER_SCAN_CHUNK_BYTES = 64 * 1024;

export function builtClientHtmlFile(pathname: string): string | null {
  return bundledWebClientDocumentPath(pathname);
}

export function isBuiltClientAssetPath(pathname: string): boolean {
  return bundledWebClientAssetPath(pathname) !== null;
}

/**
 * Serves one explicitly allowed bundled web-client file (the app document or an
 * allowlisted asset). Resolves `false` when the path is not part of the client
 * surface or the file is absent, so the caller can fall back to a pairing
 * artifact or answer a 404. For a body transfer, resolves `true` only once the
 * owned reader has closed (its descriptor released) and the response has
 * finished or aborted — body delivered, or the client went away — so the
 * awaited request lifetime (and the ingress admission it holds) covers the
 * whole transfer, not just the file lookup. Header-only answers (HEAD, empty
 * files, unsatisfiable ranges) settle once the response has been ended. Every
 * filesystem step is asynchronous, so a stalled lookup cannot block unrelated
 * control work.
 * `root` is injectable for tests; production always uses the install-layout
 * `renderer/` directory.
 */
export async function tryServeBuiltClientApp(
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse,
  root: string = resolveBundledWebClientDir(),
): Promise<boolean> {
  const relativePath = builtClientHtmlFile(pathname) ?? bundledWebClientAssetPath(pathname);
  if (relativePath === null) return false;
  return streamFile(root, relativePath, req, res);
}

async function streamFile(
  root: string,
  relativePath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (hasUnsafeWindowsPathSegment(relativePath)) return false;
  const rootReal = await realDirectory(root);
  if (rootReal === null) return false;
  const candidate = normalize(join(root, relativePath));
  if (!isContained(root, candidate)) return false;
  let entry;
  try {
    entry = await lstat(candidate);
  } catch {
    return false;
  }
  // Symlinked entries are refused outright: the bundled client is a build
  // artifact, never a link farm, and following one could escape the root.
  if (!entry.isFile()) return false;
  let real;
  try {
    real = await realpath(candidate);
  } catch {
    return false;
  }
  if (!isContained(rootReal, real)) return false;
  let fileStat;
  try {
    fileStat = await stat(real);
  } catch {
    return false;
  }
  if (!fileStat.isFile()) return false;
  // The awaited lookup above can outlive its client (dropped connection,
  // shutdown socket teardown). A response nobody can receive is already
  // settled, so no fallback may write to it either.
  if (res.destroyed || res.writableEnded) return true;
  if (
    relativePath === "service-worker.js" &&
    !(await isFinalizedBundledWorker(real, fileStat.size))
  ) {
    return false;
  }
  if (res.destroyed || res.writableEnded) return true;
  const localHtml =
    relativePath === "index.html"
      ? await readLocalClientHtml(real, fileStat.size, () => res.destroyed || res.writableEnded)
      : null;
  if (res.destroyed || res.writableEnded) return true;
  await writeStaticFile(req, res, real, fileStat.size, relativePath, localHtml);
  return true;
}

/**
 * Streams the worker through a bounded (chunk + token overlap) read window
 * instead of buffering the whole file, and stops at the first token match. A
 * read failure keeps the pre-existing conservative answer: treat the worker as
 * unfinalized and let the caller fall back to the pairing worker.
 */
async function isFinalizedBundledWorker(filePath: string, size: number): Promise<boolean> {
  let handle: FileHandle | null = null;
  try {
    handle = await open(filePath, "r");
    return !(await workerTemplateTokenPresent(handle, size));
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function workerTemplateTokenPresent(handle: FileHandle, size: number): Promise<boolean> {
  const token = Buffer.from(UNFINALIZED_WORKER_TOKEN, "utf8");
  const overlap = token.length - 1;
  const window = Buffer.allocUnsafe(WORKER_SCAN_CHUNK_BYTES + overlap);
  let carried = 0;
  let position = 0;
  while (position < size) {
    const length = Math.min(WORKER_SCAN_CHUNK_BYTES, size - position);
    const { bytesRead } = await handle.read(window, carried, length, position);
    if (bytesRead <= 0) return false;
    const scanned = window.subarray(0, carried + bytesRead);
    if (scanned.includes(token)) return true;
    // Keep the tail that a token could straddle into the next read window.
    carried = Math.min(overlap, scanned.length);
    scanned.copy(window, 0, scanned.length - carried);
    position += bytesRead;
  }
  return false;
}

async function writeStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  size: number,
  relativePath: string,
  localHtml: LocalClientHtml | null,
): Promise<void> {
  // Ranges and HEAD describe the same HTTP representation, including its
  // bounded rewritten head. The remainder remains an owned file stream.
  const sourceSize = size;
  if (localHtml) size += localHtml.prefix.length - localHtml.sourcePrefixBytes;
  const cacheControl = bundledWebClientCacheControl(relativePath);
  const range = req.method === "GET" ? parseByteRange(req.headers.range, size) : null;
  if (range === "unsatisfiable") {
    res.writeHead(416, {
      "cache-control": cacheControl,
      "content-length": "0",
      "content-range": `bytes */${size}`,
    });
    res.end();
    return;
  }
  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  res.writeHead(range ? 206 : 200, {
    "content-type": bundledWebClientContentType(relativePath),
    "cache-control": cacheControl,
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-length": String(size === 0 ? 0 : end - start + 1),
    ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
  });
  if (req.method === "HEAD" || size === 0) {
    res.end();
    return;
  }
  const prefix = localHtml?.prefix;
  const prefixBytes = prefix?.length ?? 0;
  const sourcePrefixBytes = localHtml?.sourcePrefixBytes ?? 0;
  const prefixPart = prefix?.subarray(start, Math.min(end + 1, prefixBytes));
  if (end < prefixBytes || sourceSize === sourcePrefixBytes) {
    res.end(prefixPart);
    await Promise.allSettled([finished(res, { readable: false, cleanup: true })]);
    return;
  }
  // The read stream owns its descriptor and releases it on end, error, or
  // destroy, so neither a dropped client nor a failed read can retain an fd.
  const stream = createReadStream(
    filePath,
    localHtml
      ? {
          start: sourcePrefixBytes + Math.max(0, start - prefixBytes),
          end: sourcePrefixBytes + end - prefixBytes,
        }
      : range
        ? { start, end }
        : {},
  );
  await pipeOwnedFileResponse(stream, res, prefixPart);
}

async function realDirectory(path: string): Promise<string | null> {
  try {
    const real = await realpath(path);
    return (await stat(real)).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

function isContained(root: string, candidate: string): boolean {
  const normalizedRoot = normalize(root);
  const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
  return candidate === normalizedRoot || candidate.startsWith(prefix);
}
