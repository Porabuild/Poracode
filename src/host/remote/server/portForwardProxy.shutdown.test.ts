import { once } from "node:events";
import { Agent, createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { setImmediate as nextTurn } from "node:timers/promises";
import { expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { proxyForwardedHttpRequest, proxyForwardedWebSocketUpgrade } from "./portForwardProxy";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

it("keeps a forwarded HTTP operation owned until both stream legs close", async () => {
  const cancellation = new AbortController();
  const agent = new Agent({ keepAlive: false });
  const admitted = Promise.withResolvers<void>();
  const upstream = createServer((_req, res) => {
    res.writeHead(200);
    res.write("held response");
    admitted.resolve();
  });
  const upstreamPort = await listen(upstream);
  let operation: Promise<void> | undefined;
  let completed = false;
  let responseClosed = false;
  const proxy = createServer((req, res) => {
    res.once("close", () => {
      responseClosed = true;
    });
    operation = Promise.resolve(
      proxyForwardedHttpRequest(req, res, {
        forwardId: "synthetic-forward",
        targetPort: upstreamPort,
        signal: cancellation.signal,
        agent,
      }),
    ).then(() => {
      completed = true;
    });
  });
  const proxyPort = await listen(proxy);
  const client = request(`http://127.0.0.1:${proxyPort}`, (response) => {
    response.on("error", () => {});
    response.resume();
  });
  client.on("error", () => {});
  try {
    client.end();
    await admitted.promise;
    await nextTurn();
    const upstreamSocket = Object.values(agent.sockets).flat()[0];
    expect(upstreamSocket).toBeDefined();
    expect(completed).toBe(false);
    cancellation.abort();
    await operation;
    expect(responseClosed).toBe(true);
    expect(upstreamSocket?.closed).toBe(true);
    expect(completed).toBe(true);
  } finally {
    cancellation.abort();
    client.destroy();
    agent.destroy();
    await operation;
    await Promise.all([close(proxy), close(upstream)]);
  }
});

it("joins a forwarded WebSocket operation through revocation and socket close", async () => {
  const cancellation = new AbortController();
  const agent = new Agent();
  const upstream = createServer();
  const upstreamWss = new WebSocketServer({ server: upstream });
  const upstreamPort = await listen(upstream);
  const connected = once(upstreamWss, "connection");
  let operation: Promise<void> | undefined;
  let completed = false;
  let visitor: Duplex | undefined;
  const proxy = createServer();
  proxy.on("upgrade", (req, socket, head) => {
    visitor = socket;
    operation = Promise.resolve(
      proxyForwardedWebSocketUpgrade(req, socket, head, {
        forwardId: "synthetic-forward",
        targetPort: upstreamPort,
        signal: cancellation.signal,
        agent,
      }),
    ).then(() => {
      completed = true;
    });
  });
  const proxyPort = await listen(proxy);
  const client = new WebSocket(`ws://127.0.0.1:${proxyPort}`);
  client.on("error", () => {});
  try {
    await once(client, "open");
    const [peer] = (await connected) as [WebSocket];
    const peerClosed = once(peer, "close");
    expect(completed).toBe(false);
    cancellation.abort();
    await operation;
    expect(visitor?.closed).toBe(true);
    expect(completed).toBe(true);
    await peerClosed;
  } finally {
    cancellation.abort();
    client.terminate();
    agent.destroy();
    for (const peer of upstreamWss.clients) peer.terminate();
    await operation;
    await new Promise<void>((resolve) => upstreamWss.close(() => resolve()));
    await Promise.all([close(proxy), close(upstream)]);
  }
});
