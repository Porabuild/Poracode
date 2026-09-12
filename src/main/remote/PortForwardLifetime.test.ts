import { getEventListeners } from "node:events";
import { Agent, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { deriveForwardOwner, ForwardOriginPolicy } from "./portForward/forwardOrigin";
import { createForwardOriginIdentity } from "./portForward/forwardOriginIdentity";
import { PortProxy } from "./portForward/portProxy";
import { startRawUpstream, startStreamUpstream } from "./portForward/testFixtures";
import { RemotePortForwardGateway, type ForwardLifetime } from "./RemotePortForwardGateway";
import {
  proxyForwardedHttpRequest,
  proxyForwardedWebSocketUpgrade,
} from "./server/portForwardProxy";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const decoder = new TextDecoder();

/** A WebSocket echo upstream (the Vite-HMR shape) on an ephemeral loopback port. */
async function startWebSocketUpstream() {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => wss.once("listening", resolve));
  wss.on("connection", (socket) => {
    socket.on("message", (data) => socket.send(data.toString()));
  });
  cleanup.push(async () => {
    for (const socket of wss.clients) socket.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
  return { port: (wss.address() as AddressInfo).port, clientCount: () => wss.clients.size };
}

/** A lifetime for a forward that is already gone (pre-aborted signal, private
 * agent of its own but nobody home) — the proxy must refuse it without
 * dialing `targetPort` or touching the agent. */
function deadLifetime(targetPort: number): ForwardLifetime {
  const agent = new Agent();
  cleanup.push(async () => agent.destroy());
  const controller = new AbortController();
  controller.abort();
  return { forwardId: "gone", targetPort, signal: controller.signal, agent };
}

interface LifetimeBox {
  lifetime: ForwardLifetime | null;
}

/** Stands in for the remote-access routing layer (`httpRouter`/`wsConnections`):
 * every request/upgrade is handed to the proxy with the boxed lifetime, which
 * each scenario fills with a real one (or a pre-aborted signal). */
async function startProxyEdge(box: LifetimeBox) {
  const server = createServer((req, res) => {
    proxyForwardedHttpRequest(req, res, box.lifetime!);
  });
  server.on("upgrade", (req, socket, head) => {
    proxyForwardedWebSocketUpgrade(req, socket, head, box.lifetime!);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    httpUrl: new URL(`http://127.0.0.1:${port}/stream`),
    wsUrl: new URL(`ws://127.0.0.1:${port}/hmr`),
  };
}

function makeGateway(): RemotePortForwardGateway {
  const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
  cleanup.push(async () => gateway.dispose());
  return gateway;
}

describe("RemotePortForwardGateway forward lifetimes", () => {
  it("exposes a live lifetime while open and aborts it synchronously on stopForward", async () => {
    const upstream = await startStreamUpstream(cleanup, "u");
    const gateway = makeGateway();
    const forward = await gateway.startForward(upstream.port);

    const lifetime = gateway.acquireForwardLifetime(forward.id);
    expect(lifetime).toMatchObject({ forwardId: forward.id, targetPort: upstream.port });
    expect(lifetime!.signal.aborted).toBe(false);

    const stopping = gateway.stopForward(forward.id);
    // Invalidated synchronously with the call, before the async listener
    // close resolves — the window a revocation fix must not leave open.
    expect(lifetime!.signal.aborted).toBe(true);
    await stopping;
    expect(gateway.acquireForwardLifetime(forward.id)).toBeNull();
  });

  it("stopping one forward leaves another forward's lifetime untouched", async () => {
    const upstreamA = await startStreamUpstream(cleanup, "A");
    const upstreamB = await startStreamUpstream(cleanup, "B");
    const gateway = makeGateway();
    const forwardA = await gateway.startForward(upstreamA.port);
    const forwardB = await gateway.startForward(upstreamB.port);
    const lifetimeA = gateway.acquireForwardLifetime(forwardA.id)!;

    await gateway.stopForward(forwardA.id);

    expect(lifetimeA.signal.aborted).toBe(true);
    expect(gateway.acquireForwardLifetime(forwardA.id)).toBeNull();
    const lifetimeB = gateway.acquireForwardLifetime(forwardB.id)!;
    expect(lifetimeB.targetPort).toBe(upstreamB.port);
    expect(lifetimeB.signal.aborted).toBe(false);
  });

  it("re-forwarding a stopped forward's port issues a fresh lifetime the old one can never reach", async () => {
    const upstream = await startStreamUpstream(cleanup, "u");
    const gateway = makeGateway();
    const first = await gateway.startForward(upstream.port);
    const firstLifetime = gateway.acquireForwardLifetime(first.id)!;
    await gateway.stopForward(first.id);

    const second = await gateway.startForward(upstream.port);
    const secondLifetime = gateway.acquireForwardLifetime(second.id)!;

    expect(second.id).not.toBe(first.id);
    expect(secondLifetime.signal).not.toBe(firstLifetime.signal);
    expect(secondLifetime.signal.aborted).toBe(false);
    expect(gateway.acquireForwardLifetime(first.id)).toBeNull();
  });

  it("dispose() aborts every forward's lifetime synchronously", async () => {
    const upstreamA = await startStreamUpstream(cleanup, "A");
    const upstreamB = await startStreamUpstream(cleanup, "B");
    const gateway = makeGateway();
    const forwardA = await gateway.startForward(upstreamA.port);
    const forwardB = await gateway.startForward(upstreamB.port);
    const lifetimeA = gateway.acquireForwardLifetime(forwardA.id)!;
    const lifetimeB = gateway.acquireForwardLifetime(forwardB.id)!;

    gateway.dispose();

    expect(lifetimeA.signal.aborted).toBe(true);
    expect(lifetimeB.signal.aborted).toBe(true);
    expect(gateway.acquireForwardLifetime(forwardA.id)).toBeNull();
    expect(gateway.acquireForwardLifetime(forwardB.id)).toBeNull();
  });
});

describe("PortProxy session resolution", () => {
  /** Canonical test-fixture origin secret (32 identical bytes) + configured base. */
  const TEST_ORIGIN_SECRET = Buffer.alloc(32, 1).toString("base64url");
  const TEST_SERVER_ID = "lifetime-test-host";

  function makeOriginPortProxy(gateway: RemotePortForwardGateway): PortProxy {
    const forwardOrigin = createForwardOriginIdentity({
      baseUrl: "https://apps.example.test",
      originSecret: TEST_ORIGIN_SECRET,
      serverId: TEST_SERVER_ID,
    })!;
    const portProxy = new PortProxy({ gateway, forwardOrigin });
    cleanup.push(async () => portProxy.dispose());
    return portProxy;
  }

  /** Drives the full mint chain down to a cookie value bound to (forward, origin). */
  function mintSessionCookie(
    portProxy: PortProxy,
    forwardId: string,
  ): { cookie: string; origin: string } {
    const policy = new ForwardOriginPolicy("https://apps.example.test");
    const origin = policy.originFor(
      deriveForwardOwner(TEST_ORIGIN_SECRET, TEST_SERVER_ID),
      forwardId,
    );
    const { token } = portProxy.issueEnterToken(forwardId);
    const exchange = portProxy.beginExchange(forwardId, token)!;
    expect(exchange.childOrigin).toBe(origin);
    const capability = new URL(exchange.exchangeUrl).searchParams.get("fx") ?? "";
    const consumed = portProxy.consumeExchangeCapability(forwardId, origin, capability)!;
    return { cookie: `__Host-poracode-forward=${consumed.sessionId}`, origin };
  }

  it("resolves a minted session to the forward's exact lifetime signal", async () => {
    const upstream = await startStreamUpstream(cleanup, "u");
    const gateway = makeGateway();
    const portProxy = makeOriginPortProxy(gateway);
    const forward = await gateway.startForward(upstream.port);

    const { cookie, origin } = mintSessionCookie(portProxy, forward.id);
    const lifetime = portProxy.resolveOriginSession(cookie, { forwardId: forward.id, origin });
    expect(lifetime).toMatchObject({ forwardId: forward.id, targetPort: upstream.port });
    // The per-forward signal itself, not a fresh per-request controller:
    // revoking the forward must hit this exact signal.
    expect(lifetime!.signal).toBe(gateway.acquireForwardLifetime(forward.id)!.signal);
  });

  it("a session dies with its forward and never attaches to a re-forwarded port", async () => {
    const upstream = await startStreamUpstream(cleanup, "u");
    const gateway = makeGateway();
    const portProxy = makeOriginPortProxy(gateway);
    const forward = await gateway.startForward(upstream.port);
    const { cookie, origin } = mintSessionCookie(portProxy, forward.id);
    expect(
      portProxy.resolveOriginSession(cookie, { forwardId: forward.id, origin }),
    ).not.toBeNull();

    await gateway.stopForward(forward.id);
    expect(portProxy.resolveOriginSession(cookie, { forwardId: forward.id, origin })).toBeNull();

    // The port is live again under a NEW forward — the stale session must
    // still not reach it.
    const second = await gateway.startForward(upstream.port);
    expect(portProxy.resolveOriginSession(cookie, { forwardId: forward.id, origin })).toBeNull();
    expect(gateway.acquireForwardLifetime(second.id)!.signal.aborted).toBe(false);
  });
});

describe("proxied operation revocation", () => {
  it("stopForward revokes an in-flight proxied HTTP stream on both legs", async () => {
    const upstream = await startStreamUpstream(cleanup, "A");
    const gateway = makeGateway();
    const box: LifetimeBox = { lifetime: null };
    const edge = await startProxyEdge(box);
    const forward = await gateway.startForward(upstream.port);
    box.lifetime = gateway.acquireForwardLifetime(forward.id);

    const response = await fetch(edge.httpUrl);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    cleanup.push(async () => {
      await reader.cancel().catch(() => {});
    });
    expect(decoder.decode((await reader.read()).value)).toBe("A");
    let closed = false;
    void reader.closed
      .finally(() => {
        closed = true;
      })
      .catch(() => {});

    await gateway.stopForward(forward.id);

    await vi.waitFor(
      () => {
        expect(closed).toBe(true);
        expect(upstream.isClosed()).toBe(true);
      },
      { timeout: 3000 },
    );
  });

  it("releases the lifetime's revocation registration once the response finishes", async () => {
    const upstream = await startStreamUpstream(cleanup, "A");
    const gateway = makeGateway();
    const box: LifetimeBox = { lifetime: null };
    const edge = await startProxyEdge(box);
    const forward = await gateway.startForward(upstream.port);
    const lifetime = gateway.acquireForwardLifetime(forward.id)!;
    box.lifetime = lifetime;

    const response = await fetch(edge.httpUrl);
    const reader = response.body!.getReader();
    cleanup.push(async () => {
      await reader.cancel().catch(() => {});
    });
    expect(decoder.decode((await reader.read()).value)).toBe("A");
    expect(getEventListeners(lifetime.signal, "abort")).toHaveLength(1);

    upstream.end();
    while (!(await reader.read()).done);
    await vi.waitFor(() => expect(getEventListeners(lifetime.signal, "abort")).toHaveLength(0));
  });

  it("an already-revoked lifetime never attaches to the target", async () => {
    const upstream = await startStreamUpstream(cleanup, "A");
    const box: LifetimeBox = { lifetime: null };
    const edge = await startProxyEdge(box);
    const controller = new AbortController();
    controller.abort();
    box.lifetime = deadLifetime(upstream.port);

    await expect(fetch(edge.httpUrl)).rejects.toThrow("fetch failed");
    // Give any illegal dial a grace tick; none may have happened.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(upstream.requestCount()).toBe(0);
  });

  it("stopForward revokes an established proxied WebSocket on both ends", async () => {
    const upstream = await startWebSocketUpstream();
    const gateway = makeGateway();
    const box: LifetimeBox = { lifetime: null };
    const edge = await startProxyEdge(box);
    const forward = await gateway.startForward(upstream.port);
    const lifetime = gateway.acquireForwardLifetime(forward.id)!;
    box.lifetime = lifetime;

    const client = new WebSocket(edge.wsUrl);
    cleanup.push(async () => client.terminate());
    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });
    const echoed = new Promise<string>((resolve) => {
      client.once("message", (data) => resolve(data.toString()));
    });
    client.send("through-the-proxy");
    expect(await echoed).toBe("through-the-proxy");
    // Exactly the proxy's registration rides the shared signal while live.
    expect(getEventListeners(lifetime.signal, "abort")).toHaveLength(1);
    let closed = false;
    client.once("close", () => {
      closed = true;
    });

    await gateway.stopForward(forward.id);

    await vi.waitFor(() => expect(closed).toBe(true), { timeout: 3000 });
    expect(getEventListeners(lifetime.signal, "abort")).toHaveLength(0);
    await vi.waitFor(() => expect(upstream.clientCount()).toBe(0));
  });

  it("an already-revoked lifetime never dials the target for an upgrade", async () => {
    const upstream = await startWebSocketUpstream();
    const box: LifetimeBox = { lifetime: null };
    const edge = await startProxyEdge(box);
    box.lifetime = deadLifetime(upstream.port);

    const client = new WebSocket(edge.wsUrl);
    cleanup.push(async () => client.terminate());
    await expect(
      new Promise<void>((resolve, reject) => {
        client.once("open", resolve);
        client.once("error", reject);
      }),
    ).rejects.toBeInstanceOf(Error);
    // Give any illegal dial a grace tick; none may have happened.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(upstream.clientCount()).toBe(0);
  });
});

describe("forward-owned keep-alive pool", () => {
  it("reuses one upstream connection across requests within a live forward", async () => {
    const upstream = await startRawUpstream(cleanup, "A");
    const gateway = makeGateway();
    const box: LifetimeBox = { lifetime: null };
    const edge = await startProxyEdge(box);
    const forward = await gateway.startForward(upstream.port);
    box.lifetime = gateway.acquireForwardLifetime(forward.id);

    expect(await (await fetch(edge.httpUrl)).text()).toBe("A");
    expect(await (await fetch(edge.httpUrl)).text()).toBe("A");

    // Two requests, one distinct upstream socket: the forward's private pool
    // keeps keep-alive alive for the forward's life (per-request
    // `agent: false` would dial a fresh connection per request).
    expect(upstream.connectionCount()).toBe(1);
  });

  it("keeps in-flight sockets in the in-use set and parks them once completed", async () => {
    const upstream = await startStreamUpstream(cleanup, "A");
    const gateway = makeGateway();
    const box: LifetimeBox = { lifetime: null };
    const edge = await startProxyEdge(box);
    const forward = await gateway.startForward(upstream.port);
    const lifetime = gateway.acquireForwardLifetime(forward.id)!;
    box.lifetime = lifetime;
    const key = lifetime.agent.getName({ host: "127.0.0.1", port: upstream.port });

    const response = await fetch(edge.httpUrl);
    const reader = response.body!.getReader();
    cleanup.push(async () => {
      await reader.cancel().catch(() => {});
    });
    expect(decoder.decode((await reader.read()).value)).toBe("A");

    // While the response is open its socket sits in the agent's in-use set —
    // where the agent's idle-timeout handling never destroys anything — so
    // the pool's idle timeout is a retention bound, not a response deadline.
    expect(lifetime.agent.sockets[key]).toHaveLength(1);
    expect(lifetime.agent.freeSockets[key] ?? []).toHaveLength(0);

    upstream.end();
    while (!(await reader.read()).done);
    await vi.waitFor(() => expect(lifetime.agent.freeSockets[key]).toHaveLength(1));
  });

  it("arms parked idle sockets with the shared pool's 5s retirement timer", async () => {
    // Raw upstream: sends no `Keep-Alive: timeout` hint, so the armed timer
    // is exactly the agent's own policy (an http.Server upstream would
    // advertise its own, which the client rightly prefers when shorter).
    const upstream = await startRawUpstream(cleanup, "A");
    const gateway = makeGateway();
    const box: LifetimeBox = { lifetime: null };
    const edge = await startProxyEdge(box);
    const forward = await gateway.startForward(upstream.port);
    const lifetime = gateway.acquireForwardLifetime(forward.id)!;
    box.lifetime = lifetime;

    expect(await (await fetch(edge.httpUrl)).text()).toBe("A");
    const key = lifetime.agent.getName({ host: "127.0.0.1", port: upstream.port });
    await vi.waitFor(() => expect(lifetime.agent.freeSockets[key]).toHaveLength(1));
    // Same retirement timer the shared global pool applied — idle sockets
    // retire after 5s instead of lingering for the forward's whole life.
    expect(lifetime.agent.freeSockets[key]![0]!.timeout).toBe(5000);
  });

  it.each(["stop", "dispose"] as const)(
    "destroys the forward's idle pooled sockets on %s",
    async (action) => {
      const upstream = await startRawUpstream(cleanup, "A");
      const gateway = makeGateway();
      const box: LifetimeBox = { lifetime: null };
      const edge = await startProxyEdge(box);
      const forward = await gateway.startForward(upstream.port);
      box.lifetime = gateway.acquireForwardLifetime(forward.id);

      expect((await fetch(edge.httpUrl)).status).toBe(200);
      await vi.waitFor(() => expect(upstream.openConnectionCount()).toBe(1));

      if (action === "stop") await gateway.stopForward(forward.id);
      else gateway.dispose();

      // The completed request's upstream socket was parked idle in the
      // forward's pool — invisible to the per-operation stream teardown, so the
      // pool itself must be destroyed with the forward.
      await vi.waitFor(() => expect(upstream.openConnectionCount()).toBe(0));
    },
  );

  it("stopping one forward leaves another forward's pool intact and reusable", async () => {
    const upstreamA = await startRawUpstream(cleanup, "A");
    const upstreamB = await startRawUpstream(cleanup, "B");
    const gateway = makeGateway();
    const box: LifetimeBox = { lifetime: null };
    const edge = await startProxyEdge(box);
    const forwardA = await gateway.startForward(upstreamA.port);
    const forwardB = await gateway.startForward(upstreamB.port);

    box.lifetime = gateway.acquireForwardLifetime(forwardA.id)!;
    expect(await (await fetch(edge.httpUrl)).text()).toBe("A");
    box.lifetime = gateway.acquireForwardLifetime(forwardB.id)!;
    expect(await (await fetch(edge.httpUrl)).text()).toBe("B");
    expect(await (await fetch(edge.httpUrl)).text()).toBe("B");
    await vi.waitFor(() => expect(upstreamA.openConnectionCount()).toBe(1));
    expect(upstreamB.connectionCount()).toBe(1);

    await gateway.stopForward(forwardA.id);
    await vi.waitFor(() => expect(upstreamA.openConnectionCount()).toBe(0));

    // A's teardown never touched B's pool: the next request still reuses B's
    // original connection and answers from B's upstream.
    box.lifetime = gateway.acquireForwardLifetime(forwardB.id)!;
    expect(await (await fetch(edge.httpUrl)).text()).toBe("B");
    expect(upstreamB.connectionCount()).toBe(1);
  });
});
