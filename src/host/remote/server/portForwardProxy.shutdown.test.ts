import { once } from "node:events";
import { Agent, createServer, request, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { setImmediate as nextTurn } from "node:timers/promises";
import { expect, it, vi } from "vitest";
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

/** `events.once` would reject on the hang-up `error` a torn-down handshake
 * emits before `close`. */
function closed(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

/** A proxy whose upgrade handler records each operation and its 101 signals. */
async function startSignalingProxy(targetPort: number, signal: AbortSignal, agent: Agent) {
  const operations: Promise<void>[] = [];
  let upgraded = 0;
  const proxy = createServer();
  proxy.on("upgrade", (req, socket, head) => {
    operations.push(
      proxyForwardedWebSocketUpgrade(
        req,
        socket,
        head,
        { forwardId: "synthetic-forward", targetPort, signal, agent },
        () => {
          upgraded += 1;
        },
      ),
    );
  });
  const port = await listen(proxy);
  return { proxy, port, operations, upgraded: () => upgraded };
}

it("signals the relayed 101 once while the WebSocket operation stays owned until close", async () => {
  const cancellation = new AbortController();
  const agent = new Agent();
  const upstream = createServer();
  const upstreamWss = new WebSocketServer({ server: upstream });
  upstreamWss.on("connection", (peer) => peer.on("message", (data) => peer.send(data.toString())));
  const proxy = await startSignalingProxy(await listen(upstream), cancellation.signal, agent);
  let completed = false;
  const client = new WebSocket(`ws://127.0.0.1:${proxy.port}`);
  client.on("error", () => {});
  try {
    await once(client, "open");
    const operation = proxy.operations[0]!.then(() => {
      completed = true;
    });
    expect(proxy.upgraded()).toBe(1);
    client.send("after-101");
    expect(String((await once(client, "message"))[0])).toBe("after-101");
    expect(completed).toBe(false);

    cancellation.abort();
    await operation;
    expect(completed).toBe(true);
    expect(proxy.upgraded()).toBe(1);
  } finally {
    cancellation.abort();
    client.terminate();
    agent.destroy();
    await Promise.allSettled(proxy.operations);
    for (const peer of upstreamWss.clients) peer.terminate();
    await new Promise<void>((resolve) => upstreamWss.close(() => resolve()));
    await Promise.all([close(proxy.proxy), close(upstream)]);
  }
});

it("never signals a rejected, unreachable, or abandoned WebSocket handshake", async () => {
  const cancellation = new AbortController();
  const agent = new Agent();
  const handshakes: Duplex[] = [];
  const upstream = createServer();
  upstream.on("upgrade", (req, socket) => {
    handshakes.push(socket);
    if (req.url === "/") {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    }
    // Any other path stalls: the child accepted the connection but never answers.
  });
  const upstreamPort = await listen(upstream);
  const closedTarget = createServer();
  const closedPort = await listen(closedTarget);
  await close(closedTarget);
  const rejecting = await startSignalingProxy(upstreamPort, cancellation.signal, agent);
  const unreachable = await startSignalingProxy(closedPort, cancellation.signal, agent);
  const stalledAbort = new AbortController();
  const stalling = await startSignalingProxy(upstreamPort, stalledAbort.signal, agent);
  const givenUp = await startSignalingProxy(upstreamPort, cancellation.signal, agent);
  try {
    const refused = new WebSocket(`ws://127.0.0.1:${rejecting.port}`);
    refused.on("error", () => {});
    const [, response] = (await once(refused, "unexpected-response")) as [unknown, IncomingMessage];
    expect(response.statusCode).toBe(403);
    response.resume();
    await rejecting.operations[0];

    const failed = new WebSocket(`ws://127.0.0.1:${unreachable.port}`);
    failed.on("error", () => {});
    await closed(failed);
    await unreachable.operations[0];

    // The port-forward path always dials the target root, so stall it via a
    // child that never answers: revocation abandons the pending handshake.
    upstream.removeAllListeners("upgrade");
    upstream.on("upgrade", (_req, socket) => handshakes.push(socket));
    const abandoned = new WebSocket(`ws://127.0.0.1:${stalling.port}`);
    abandoned.on("error", () => {});
    const abandonedClosed = closed(abandoned);
    await vi.waitFor(() => expect(handshakes.length).toBe(2));
    stalledAbort.abort();
    await stalling.operations[0];
    await abandonedClosed;

    // A client that gives up on the stalled child (a half-close the upgraded
    // socket would otherwise never surface) ends the operation without any
    // revocation.
    const gaveUp = new WebSocket(`ws://127.0.0.1:${givenUp.port}`);
    gaveUp.on("error", () => {});
    await vi.waitFor(() => expect(handshakes.length).toBe(3));
    gaveUp.terminate();
    await givenUp.operations[0];
    expect(cancellation.signal.aborted).toBe(false);

    for (const proxy of [rejecting, unreachable, stalling, givenUp]) {
      expect(proxy.operations).toHaveLength(1);
      expect(proxy.upgraded()).toBe(0);
    }
  } finally {
    cancellation.abort();
    stalledAbort.abort();
    agent.destroy();
    for (const socket of handshakes) socket.destroy();
    for (const proxy of [rejecting, unreachable, stalling, givenUp]) {
      await Promise.allSettled(proxy.operations);
    }
    await Promise.all([
      close(rejecting.proxy),
      close(unreachable.proxy),
      close(stalling.proxy),
      close(givenUp.proxy),
      close(upstream),
    ]);
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
