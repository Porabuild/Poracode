import { Agent, createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { createServer as createNetServer, type AddressInfo, type Socket } from "node:net";
import { describe, expect, it } from "vitest";
import {
  destroyIdleAgentSockets,
  isSafeRetryableHttpMethod,
  isStaleKeepAliveSocketError,
} from "@/shared/http";
import {
  createRemoteAccessHttpServer,
  REMOTE_ACCESS_HEADERS_TIMEOUT_MS,
  REMOTE_ACCESS_KEEP_ALIVE_TIMEOUT_MS,
} from "../remoteAccessServerListen";
import { proxyLoopbackHttpRequest } from "./loopbackProxy";

/**
 * Deterministic loopback child server that answers the first HTTP request on
 * each TCP connection with `Connection: keep-alive` and resets the socket as
 * soon as a second request arrives on that same reused connection.
 */
async function startDropOnReuseChildServer(): Promise<{
  readonly port: number;
  readonly stats: { connections: number; responses: number; reusedSocketDrops: number };
  close(): Promise<void>;
}> {
  const stats = { connections: 0, responses: 0, reusedSocketDrops: 0 };
  const sockets = new Set<Socket>();
  const server = createNetServer((socket) => {
    stats.connections += 1;
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => {});

    let servedFirstRequest = false;
    let buffered = "";
    socket.on("data", (chunk: Buffer) => {
      if (servedFirstRequest) {
        stats.reusedSocketDrops += 1;
        socket.destroy();
        return;
      }
      buffered += chunk.toString("latin1");
      if (!buffered.includes("\r\n\r\n")) return;
      servedFirstRequest = true;
      stats.responses += 1;
      const body = JSON.stringify({ hit: stats.responses });
      socket.write(
        `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: keep-alive\r\n\r\n${body}`,
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    stats,
    async close() {
      for (const socket of [...sockets]) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("stale keep-alive recovery", () => {
  it("classifies stale keep-alive errors without matching connect refusals or aborts", () => {
    const undiciClosed = new TypeError("fetch failed", {
      cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
    });
    const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    const hangUp = new Error("socket hang up");
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:4200"), {
      code: "ECONNREFUSED",
    });
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const mismatch = new Error("certificate_fingerprint_mismatch");

    expect(isStaleKeepAliveSocketError(undiciClosed)).toBe(true);
    expect(isStaleKeepAliveSocketError(reset)).toBe(true);
    expect(isStaleKeepAliveSocketError(hangUp)).toBe(true);
    expect(isStaleKeepAliveSocketError(refused)).toBe(false);
    expect(isStaleKeepAliveSocketError(abort)).toBe(false);
    expect(isStaleKeepAliveSocketError(mismatch)).toBe(false);
    expect(isSafeRetryableHttpMethod("GET")).toBe(true);
    expect(isSafeRetryableHttpMethod("HEAD")).toBe(true);
    expect(isSafeRetryableHttpMethod("OPTIONS")).toBe(true);
    expect(isSafeRetryableHttpMethod("POST")).toBe(false);
    expect(isSafeRetryableHttpMethod("DELETE")).toBe(false);
  });

  it("configures remote access HTTP server keepAliveTimeout above Node's 5s default", () => {
    const { server } = createRemoteAccessHttpServer(
      null,
      (_req, res) => res.end(),
      (_req, socket) => socket.destroy(),
    );
    expect(server.keepAliveTimeout).toBe(REMOTE_ACCESS_KEEP_ALIVE_TIMEOUT_MS);
    expect(server.keepAliveTimeout).toBeGreaterThanOrEqual(60_000);
    expect(server.headersTimeout).toBe(REMOTE_ACCESS_HEADERS_TIMEOUT_MS);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
    server.close();
  });

  it("retries safe GET once in loopbackProxy when a pooled upstream keep-alive socket resets", async () => {
    const child = await startDropOnReuseChildServer();
    const agent = new Agent({ keepAlive: true, scheduling: "lifo", timeout: 4_000, maxSockets: 4 });
    const proxy = createServer((req: IncomingMessage, res: ServerResponse) => {
      const controller = new AbortController();
      void proxyLoopbackHttpRequest(
        req,
        res,
        { targetPort: child.port, signal: controller.signal, agent },
        {
          headers: (incoming) => {
            const out: Record<string, string | string[]> = {};
            for (const [k, v] of Object.entries(incoming.headers)) {
              if (v !== undefined) out[k] = v;
            }
            out.host = `127.0.0.1:${child.port}`;
            return out;
          },
        },
      );
    });
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    const proxyPort = (proxy.address() as AddressInfo).port;

    try {
      const first = await fetch(`http://127.0.0.1:${proxyPort}/api/snapshot`);
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ hit: 1 });
      expect(child.stats.connections).toBe(1);

      const second = await fetch(`http://127.0.0.1:${proxyPort}/api/snapshot`);
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ hit: 2 });
      expect(child.stats.reusedSocketDrops).toBe(1);
      expect(child.stats.connections).toBe(2);
    } finally {
      destroyIdleAgentSockets(agent);
      agent.destroy();
      proxy.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => proxy.close(() => resolve())),
        child.close(),
      ]);
    }
  });

  it("does not retry POST in loopbackProxy when a pooled upstream keep-alive socket resets", async () => {
    const child = await startDropOnReuseChildServer();
    const agent = new Agent({ keepAlive: true, scheduling: "lifo", timeout: 4_000, maxSockets: 4 });
    const proxy = createServer((req: IncomingMessage, res: ServerResponse) => {
      const controller = new AbortController();
      void proxyLoopbackHttpRequest(
        req,
        res,
        { targetPort: child.port, signal: controller.signal, agent },
        {
          headers: (incoming) => {
            const out: Record<string, string | string[]> = {};
            for (const [k, v] of Object.entries(incoming.headers)) {
              if (v !== undefined) out[k] = v;
            }
            out.host = `127.0.0.1:${child.port}`;
            return out;
          },
        },
      );
    });
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    const proxyPort = (proxy.address() as AddressInfo).port;

    try {
      const warmup = await fetch(`http://127.0.0.1:${proxyPort}/api/snapshot`);
      expect(warmup.status).toBe(200);
      await warmup.text();
      expect(child.stats.connections).toBe(1);

      const post = await fetch(`http://127.0.0.1:${proxyPort}/api/threads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(post.status).toBe(502);
      expect(child.stats.reusedSocketDrops).toBe(1);
      expect(child.stats.connections).toBe(1);
    } finally {
      agent.destroy();
      proxy.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => proxy.close(() => resolve())),
        child.close(),
      ]);
    }
  });
});
