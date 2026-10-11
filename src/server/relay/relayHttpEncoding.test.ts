import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterEach, expect, it, vi } from "vitest";
import { RelayServer } from "./relayServer";
import { startRelayHost } from "./relayHost";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

it("requests identity on the real loopback hop and still decodes precompressed responses", async () => {
  const body = Buffer.from(Uint8Array.from({ length: 256 }, (_, index) => index));
  const requests: Array<{ path: string; encoding: string | undefined }> = [];
  const origin = createServer((req, res) => {
    requests.push({ path: req.url!, encoding: req.headers["accept-encoding"] });
    const compressed =
      req.url === "/precompressed" || req.headers["accept-encoding"]?.includes("gzip");
    const data = compressed ? gzipSync(body) : body;
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": data.byteLength,
      ...(compressed ? { "content-encoding": "gzip" } : {}),
    });
    res.end(data);
  });
  await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => origin.close(() => resolve())));
  const originPort = (origin.address() as AddressInfo).port;
  const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
  const { port } = await relay.start();
  cleanups.push(() => relay.dispose());
  let registered = false;
  const host = startRelayHost({
    relayUrl: `ws://127.0.0.1:${port}/host`,
    localHttpUrl: `http://127.0.0.1:${originPort}`,
    serverId: "http-encoding",
    secret: "test-secret",
    onRegistered: () => {
      registered = true;
    },
  });
  cleanups.push(() => host.dispose());
  await vi.waitFor(() => expect(registered).toBe(true));

  for (const path of ["/negotiated", "/precompressed"]) {
    const response = await fetch(`http://127.0.0.1:${port}/s/http-encoding${path}`, {
      headers: { "accept-encoding": "gzip, br" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
  }
  expect(requests).toEqual([
    { path: "/negotiated", encoding: "identity" },
    { path: "/precompressed", encoding: "identity" },
  ]);
});
