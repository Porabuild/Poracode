import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { startRelayHost } from "./relayHost";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function controlServer(autoPong: boolean) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0, autoPong });
  await once(server, "listening");
  cleanup.push(async () => {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return server;
}

it("reconnects independently when the established relay stops acknowledging pings", async () => {
  const server = await controlServer(false);
  let registrations = 0;
  server.on("connection", (socket) =>
    socket.on("message", () => {
      registrations += 1;
    }),
  );
  const host = startRelayHost({
    relayUrl: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    serverId: "liveness",
    secret: "fixture",
    localHttpUrl: "http://127.0.0.1:1",
    webSocketHeartbeatIntervalMs: 100,
    minReconnectMs: 10,
    maxReconnectMs: 10,
  });
  cleanup.push(() => host.dispose());
  await vi.waitFor(() => expect(registrations).toBeGreaterThanOrEqual(2), { timeout: 5000 });
});

it("keeps a healthy relay connected through repeated heartbeat exchanges", async () => {
  const server = await controlServer(true);
  let connections = 0;
  let pings = 0;
  server.on("connection", (socket) => {
    connections += 1;
    socket.on("ping", () => {
      pings += 1;
    });
  });
  const host = startRelayHost({
    relayUrl: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    serverId: "healthy",
    secret: "fixture",
    localHttpUrl: "http://127.0.0.1:1",
    webSocketHeartbeatIntervalMs: 100,
  });
  cleanup.push(() => host.dispose());
  await vi.waitFor(() => expect(pings).toBeGreaterThanOrEqual(3), { timeout: 5000 });
  expect(connections).toBe(1);
});
