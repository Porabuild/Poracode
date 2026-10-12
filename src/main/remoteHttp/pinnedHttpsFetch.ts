import { Agent, request } from "node:https";
import { connect, type ConnectionOptions } from "node:tls";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

/** A new TLS connection per pinned request. No HTTP byte is released until
 * its actual peer leaf matches; redirects are returned, never followed. */
export async function pinnedHttpsFetch(
  url: string,
  init: RequestInit,
  fingerprint: string,
): Promise<Response> {
  if (new URL(url).protocol !== "https:") {
    throw new Error("A certificate pin requires HTTPS.");
  }
  const agent = new Agent({ keepAlive: false });
  agent.createConnection = (options, callback) => {
    const socket = connect({
      ...options,
      rejectUnauthorized: false,
      ...(init.signal ? { signal: init.signal } : {}),
    } as ConnectionOptions);
    const failed = (error: Error) => callback?.(error, socket);
    socket.once("error", failed);
    socket.once("secureConnect", () => {
      const raw = socket.getPeerCertificate().raw;
      if (!raw || createHash("sha256").update(raw).digest("hex") !== fingerprint) {
        socket.destroy(new Error("certificate_fingerprint_mismatch"));
        return;
      }
      socket.removeListener("error", failed);
      callback?.(null, socket);
    });
    // Deliberately do not return the socket: Agent must wait for validation.
    return undefined;
  };
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        agent,
        method: init.method ?? "GET",
        headers: Object.fromEntries(new Headers(init.headers)),
        ...(init.signal ? { signal: init.signal } : {}),
      },
      (res) => {
        res.once("close", () => agent.destroy());
        const headers = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          headers.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
        }
        const status = res.statusCode ?? 502;
        const noBody = init.method === "HEAD" || [204, 205, 304].includes(status);
        if (noBody) res.resume();
        resolve(
          new Response(noBody ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), {
            status,
            statusText: res.statusMessage ?? "",
            headers,
          }),
        );
      },
    );
    req.once("error", (error) => {
      agent.destroy();
      reject(error);
    });
    req.end(init.body);
  });
}
