import type { ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import { finished } from "node:stream/promises";

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** Single-range only; a multi-range or malformed header is ignored (RFC 9110). */
export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (!match) return null;
  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  if (rawStart === "" && rawEnd === "") return null;
  // No byte of a zero-length representation can satisfy a range. In particular
  // a suffix request would otherwise compute `start 0, end -1` and answer a
  // malformed `bytes 0--1/0`; RFC 9110 requires 416 with `bytes */0`.
  if (size === 0) return "unsatisfiable";
  if (rawStart === "") {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(rawStart);
  if (!Number.isSafeInteger(start) || start >= size) return "unsatisfiable";
  const end = rawEnd === "" ? size - 1 : Number(rawEnd);
  if (!Number.isSafeInteger(end) || end < start) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

/** Join the reader and response; disconnects and grant retirement release the descriptor. */
export async function pipeOwnedFileResponse(
  stream: Readable,
  res: ServerResponse,
  prefix?: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  const onResponseClose = () => {
    if (!res.writableEnded) stream.destroy();
  };
  const onAbort = () => {
    stream.destroy();
    res.destroy();
  };
  const onStreamError = () => {
    if (res.headersSent) res.destroy();
    else {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
    }
  };
  res.on("close", onResponseClose);
  stream.on("error", onStreamError);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  if (res.destroyed && !res.writableEnded) stream.destroy();
  if (prefix?.length) res.write(prefix);
  stream.pipe(res);
  await Promise.allSettled([
    finished(stream, { error: false, cleanup: true }),
    finished(res, { readable: false, cleanup: true }),
  ]);
  res.off("close", onResponseClose);
  stream.off("error", onStreamError);
  signal?.removeEventListener("abort", onAbort);
}
