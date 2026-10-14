import { request, type Agent } from "node:http";
import { RemoteHttpError } from "../auth";

/** A bounded one-byte read through the child's existing authenticated file gate.
 * Only the verified target port is dialed; no client URL, redirects, or bearer is accepted.
 * The child checks its issuing session, registry, containment and descriptor identity before
 * returning its live expiry. Empty files use the same validated 416 response.
 */
export async function readChildMediaLease(input: {
  port: number;
  ticket: string;
  agent: Agent;
  signal: AbortSignal;
}): Promise<number> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener("abort", abort, { once: true });
  if (input.signal.aborted) abort();
  const timer = setTimeout(abort, 5_000);
  timer.unref();
  try {
    return await new Promise<number>((resolve, reject) => {
      const invalid = () =>
        new RemoteHttpError("invalid_media_ticket", "The child media preview is unavailable.", 401);
      const req = request(
        {
          hostname: "127.0.0.1",
          port: input.port,
          method: "GET",
          path: `/api/files/media?ticket=${encodeURIComponent(input.ticket)}`,
          headers: { range: "bytes=0-0" },
          agent: input.agent,
          signal: controller.signal,
        },
        (res) => {
          const expiry = Date.parse(String(res.headers["x-poracode-media-expires-at"] ?? ""));
          const empty = res.statusCode === 416 && res.headers["content-range"] === "bytes */0";
          if (
            (!empty && res.statusCode !== 206) ||
            !Number.isFinite(expiry) ||
            expiry <= Date.now()
          ) {
            res.destroy();
            reject(invalid());
            return;
          }
          let bytes = 0;
          res.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > (empty ? 0 : 1)) res.destroy(invalid());
          });
          res.on("error", () => reject(invalid()));
          res.on("end", () => (bytes === (empty ? 0 : 1) ? resolve(expiry) : reject(invalid())));
        },
      );
      req.on("error", () => reject(invalid()));
      req.end();
    });
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", abort);
  }
}
