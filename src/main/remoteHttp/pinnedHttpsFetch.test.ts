import { createServer } from "node:https";
import { createServer as createNetServer, type Socket } from "node:net";
import { createServer as createTlsServer, type TLSSocket } from "node:tls";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import { afterEach, describe, it, expect } from "vitest";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import { closePinnedHttpsAgents, pinnedHttpsFetch } from "./pinnedHttpsFetch";

/**
 * Deterministic TLS server that answers the first HTTP request on each TLS
 * socket with `Connection: keep-alive` and destroys the socket as soon as a
 * second request arrives on that same reused socket. This guarantees the
 * client exercises `req.reusedSocket === true` + stale-socket reset without
 * timing races.
 */
async function startDropOnReuseTlsServer(
  material: ReturnType<typeof generateSelfSignedTlsMaterial>,
): Promise<{
  readonly url: string;
  readonly stats: { handshakes: number; responses: number; reusedSocketDrops: number };
  close(): Promise<void>;
}> {
  const stats = { handshakes: 0, responses: 0, reusedSocketDrops: 0 };
  const sockets = new Set<TLSSocket>();
  const server = createTlsServer(material, (socket) => {
    stats.handshakes += 1;
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
      const body = `ok-${stats.responses}`;
      socket.write(
        `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: keep-alive\r\n\r\n${body}`,
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing address");
  return {
    url: `https://127.0.0.1:${address.port}/api/snapshot`,
    stats,
    async close() {
      for (const socket of [...sockets]) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("pinned HTTPS transport", () => {
  afterEach(() => {
    closePinnedHttpsAgents();
  });

  it("reuses a verified keep-alive TLS connection and refuses a swapped leaf before sending credentials", async () => {
    const material = generateSelfSignedTlsMaterial();
    const replacement = generateSelfSignedTlsMaterial();
    let requests = 0;
    let handshakes = 0;
    const server = createServer(material, (_req, res) => {
      requests += 1;
      res.end(`ok-${requests}`);
    });
    server.on("secureConnection", () => {
      handshakes += 1;
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing address");
    const url = `https://127.0.0.1:${address.port}/`;
    try {
      expect(
        await (
          await pinnedHttpsFetch(
            url,
            { headers: { authorization: "Bearer secret" } },
            material.fingerprint,
          )
        ).text(),
      ).toBe("ok-1");
      expect(
        await (
          await pinnedHttpsFetch(
            url,
            { headers: { authorization: "Bearer secret" } },
            material.fingerprint,
          )
        ).text(),
      ).toBe("ok-2");
      expect(handshakes).toBe(1);

      // Simulate a restarted peer serving a different leaf certificate without
      // manually clearing the client's agent pool: the stale keep-alive socket
      // resets, the safe GET retries on a fresh TLS handshake, and leaf pin
      // verification refuses the swapped cert before any credentials are sent.
      server.closeIdleConnections();
      server.setSecureContext(replacement);
      await expect(
        pinnedHttpsFetch(
          url,
          { headers: { authorization: "Bearer secret" } },
          material.fingerprint,
        ),
      ).rejects.toThrow("certificate_fingerprint_mismatch");
      expect(requests).toBe(2);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("retries safe GET once on a fresh verified TLS connection when a pooled keep-alive socket resets", async () => {
    const material = generateSelfSignedTlsMaterial();
    const server = await startDropOnReuseTlsServer(material);
    try {
      expect(
        await (await pinnedHttpsFetch(server.url, { method: "GET" }, material.fingerprint)).text(),
      ).toBe("ok-1");
      expect(server.stats.handshakes).toBe(1);

      expect(
        await (await pinnedHttpsFetch(server.url, { method: "GET" }, material.fingerprint)).text(),
      ).toBe("ok-2");
      expect(server.stats.reusedSocketDrops).toBe(1);
      expect(server.stats.handshakes).toBe(2);
    } finally {
      await server.close();
    }
  });

  it("does not retry non-idempotent POST when a pooled keep-alive socket resets", async () => {
    const material = generateSelfSignedTlsMaterial();
    const server = await startDropOnReuseTlsServer(material);
    try {
      expect(
        await (await pinnedHttpsFetch(server.url, { method: "GET" }, material.fingerprint)).text(),
      ).toBe("ok-1");
      expect(server.stats.handshakes).toBe(1);

      await expect(
        pinnedHttpsFetch(server.url, { method: "POST", body: "{}" }, material.fingerprint),
      ).rejects.toThrow(/socket hang up|ECONNRESET|closed/i);
      expect(server.stats.reusedSocketDrops).toBe(1);
      expect(server.stats.handshakes).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("rejects promptly when the peer closes cleanly before the TLS handshake completes", async () => {
    const sockets = new Set<Socket>();
    const server = createNetServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      socket.on("error", () => {});
      socket.resume();
      socket.end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing address");
    const url = `https://127.0.0.1:${address.port}/api/snapshot`;
    try {
      await expect(pinnedHttpsFetch(url, { method: "GET" }, "0".repeat(64))).rejects.toThrow(
        /disconnected|closed|ECONNRESET/i,
      );
    } finally {
      for (const socket of [...sockets]) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("negotiates and transparently decompresses gzip responses", async () => {
    const material = generateSelfSignedTlsMaterial();
    const payload = JSON.stringify({ data: "hello-compressed ".repeat(200) });
    let seenAcceptEncoding: string | undefined;
    const server = createServer(material, (req, res) => {
      seenAcceptEncoding =
        typeof req.headers["accept-encoding"] === "string"
          ? req.headers["accept-encoding"]
          : undefined;
      const compressed = gzipSync(Buffer.from(payload, "utf8"));
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(compressed.byteLength),
      });
      res.end(compressed);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing address");
    const url = `https://127.0.0.1:${address.port}/api/snapshot`;
    try {
      const response = await pinnedHttpsFetch(url, { method: "GET" }, material.fingerprint);
      expect(seenAcceptEncoding).toMatch(/\bgzip\b/i);
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("content-length")).toBeNull();
      expect(await response.text()).toBe(payload);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
