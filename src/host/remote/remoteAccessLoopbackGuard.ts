import type { Server as HttpServer } from "node:http";
import { createServer, type Server } from "node:net";

/**
 * Holds the loopback address of a wildcard-bound listener's port.
 *
 * Windows (and BSD-style stacks such as macOS) let another process bind
 * `127.0.0.1:P` beside an existing `0.0.0.0:P` listener, and the more specific
 * bind then receives every loopback connection. A second local host that picks
 * the same port would silently take this host's own renderer traffic: its
 * bearer is refused, its fresh credentials are refused, and the two hosts trip
 * one shared rate limit. Holding the loopback address makes that later bind
 * fail with `EADDRINUSE`, so the other host moves to its next port. Accepted
 * sockets are handed to the real server unchanged (plain HTTP and TLS alike),
 * so its connection tracking and shutdown still cover them.
 *
 * Best effort: where the stack already refuses the overlapping bind (Linux),
 * or something holds the address already, the server keeps running without a
 * guard.
 */
export async function reserveLoopbackPort(
  server: HttpServer,
  loopbackHost: string,
  port: number,
): Promise<Server | null> {
  const guard = createServer((socket) => {
    server.emit("connection", socket);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      guard.once("error", reject);
      guard.listen(port, loopbackHost, () => {
        guard.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    guard.close();
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EADDRINUSE" && code !== "EADDRNOTAVAIL") {
      console.warn(`[poracode] could not reserve ${loopbackHost}:${port} for this server:`, error);
    }
    return null;
  }
  return guard;
}

export function releaseLoopbackPort(guard: Server | null): Promise<void> {
  if (!guard) return Promise.resolve();
  return new Promise<void>((resolve) => guard.close(() => resolve()));
}
