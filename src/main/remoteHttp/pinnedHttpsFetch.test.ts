import { createServer } from "node:https";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import { afterEach, describe, it, expect } from "vitest";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import { closePinnedHttpsAgents, pinnedHttpsFetch } from "./pinnedHttpsFetch";

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

      // Simulate a restarted peer serving a different leaf certificate.
      server.closeIdleConnections();
      server.setSecureContext(replacement);
      closePinnedHttpsAgents();
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
