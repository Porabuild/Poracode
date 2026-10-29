import { once } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { ENVIRONMENT_PARENT_TICKET_PARAM } from "@/shared/environments";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import {
  sessionIdOf,
  startParentHost,
  startWsUpstream,
  type ParentHostHandle,
} from "./environments/environmentProxyTestFixtures";
import { deriveForwardOwner, ForwardOriginPolicy } from "./portForward/forwardOrigin";
import { createForwardOriginIdentity } from "./portForward/forwardOriginIdentity";
import { FORWARD_ORIGIN_EXCHANGE_PATH, PortProxy } from "./portForward/portProxy";
import { rawRequestWithAuthority, type CleanupRegistry } from "./portForward/testFixtures";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";
import type { RemoteAccessServerHost } from "./remoteAccessServerTypes";
import { RemotePortForwardGateway } from "./RemotePortForwardGateway";

/**
 * D4: a proxied WebSocket (environment data plane or forward child origin)
 * gives its transport ingress slot back once the 101 is relayed, while its
 * operation — principal leases, both raw legs, and shutdown ownership — runs
 * until the sockets close. Real `RemoteAccessServer` listeners, real upstream
 * WebSocket servers; the per-address bound is set below the number of
 * established sockets so a held slot would shed the next upgrade or request.
 */

const cleanup: CleanupRegistry = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const PER_ADDRESS = 2;
const SOCKETS = PER_ADDRESS + 1;

/** The live transport counters (the server's own host view). */
function ingressOf(server: RemoteAccessServer): RemoteAccessServerHost {
  return server as unknown as RemoteAccessServerHost;
}

/** Records every raw upgrade socket the listener receives. */
function upgradeSocketsOf(server: RemoteAccessServer): Duplex[] {
  const sockets: Duplex[] = [];
  (server as unknown as { server: Server }).server.on("upgrade", (_req, socket: Duplex) => {
    sockets.push(socket);
  });
  return sockets;
}

function expectNoIngressHeld(server: RemoteAccessServer, sockets: readonly Duplex[]): void {
  const host = ingressOf(server);
  expect(host.ingressWorkCount).toBe(0);
  expect(host.ingressWorkByAddress.size).toBe(0);
  for (const socket of sockets) expect(host.ingressWorkBySource.get(socket)).toBeUndefined();
}

function closed(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

/** Opens one WebSocket and resolves it once open, or the refusal status. */
function openSocket(
  url: string,
  headers?: Record<string, string>,
): Promise<{ readonly socket: WebSocket; readonly status: number }> {
  const socket = new WebSocket(url, headers ? { headers } : undefined);
  socket.on("error", () => {});
  cleanup.push(async () => socket.terminate());
  return new Promise((resolve) => {
    socket.once("open", () => resolve({ socket, status: 101 }));
    socket.once("unexpected-response", (_req, res: IncomingMessage) => {
      res.resume();
      resolve({ socket, status: res.statusCode ?? 0 });
    });
    socket.once("close", () => resolve({ socket, status: 0 }));
  });
}

async function expectEcho(socket: WebSocket, text: string): Promise<void> {
  const reply = once(socket, "message");
  socket.send(text);
  expect(String((await reply)[0])).toBe(text);
}

function environmentSocketUrl(host: ParentHostHandle, childPath = "/ws?ticket=child"): string {
  const parent = host.gateway.mintWebSocketTicket({
    parentAccessToken: host.parentAccessToken,
    environmentId: "env-1",
  });
  const separator = childPath.includes("?") ? "&" : "?";
  return `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy${childPath}${separator}${ENVIRONMENT_PARENT_TICKET_PARAM}=${encodeURIComponent(parent.ticket)}`;
}

async function startEnvironmentHost() {
  const host = await startParentHost(cleanup, {
    serverOptions: { maxConcurrentIngressWorkPerAddress: PER_ADDRESS },
  });
  return { host, upgradeSockets: upgradeSocketsOf(host.server) };
}

describe("environment proxy upgrades", () => {
  it("return the ingress slot at the 101 and keep their leases until revocation closes them", async () => {
    const { host, upgradeSockets } = await startEnvironmentHost();
    const upstream = await startWsUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);
    const sessionId = sessionIdOf(host.authStore, host.parentAccessToken);

    const sockets: WebSocket[] = [];
    for (let index = 0; index < SOCKETS; index += 1) {
      const opened = await openSocket(environmentSocketUrl(host));
      expect(opened.status).toBe(101);
      sockets.push(opened.socket);
    }
    expectNoIngressHeld(host.server, upgradeSockets);
    // The legs still hold their principal work and socket leases…
    expect(host.gateway.activeLegCount()).toBe(SOCKETS);
    expect(host.admission.usage(sessionId)).toMatchObject({
      work: { bulk: SOCKETS, control: 0 },
      sockets: SOCKETS,
    });
    // …frames still flow, and ordinary HTTP from the same address is admitted.
    for (const [index, socket] of sockets.entries()) await expectEcho(socket, `frame-${index}`);
    const ticket = await fetch(new URL("/api/auth/websocket-ticket", host.info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${host.parentAccessToken}` },
    });
    expect(ticket.status).toBe(200);

    // Revocation still closes every socket; each lease returns exactly once.
    host.server.revokeAccessSession(sessionId);
    await Promise.all(sockets.map((socket) => closed(socket)));
    await vi.waitFor(() => {
      expect(host.gateway.activeLegCount()).toBe(0);
      expect(host.admission.usage(sessionId)).toMatchObject({
        work: { bulk: 0, control: 0 },
        sockets: 0,
      });
    });
    expectNoIngressHeld(host.server, upgradeSockets);
  });

  it("release a refused, unreachable, abandoned, or invalid upgrade exactly once", async () => {
    const { host, upgradeSockets } = await startEnvironmentHost();
    const sessionId = sessionIdOf(host.authStore, host.parentAccessToken);
    const childSockets: Duplex[] = [];
    const child = createServer();
    child.on("upgrade", (req, socket: Duplex) => {
      childSockets.push(socket);
      if (req.url?.startsWith("/refuse")) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      }
      // Any other path stalls: the child accepted but never answers.
    });
    await new Promise<void>((resolve) => child.listen(0, "127.0.0.1", resolve));
    cleanup.push(async () => {
      for (const socket of childSockets) socket.destroy();
      await new Promise<void>((resolve) => child.close(() => resolve()));
    });
    /** Every lease and ingress slot is back; `phase` names a failure. */
    const settled = async (phase: string) => {
      await vi.waitFor(() => {
        const ingress = ingressOf(host.server);
        expect({
          phase,
          legs: host.gateway.activeLegCount(),
          usage: host.admission.usage(sessionId),
          ingress: ingress.ingressWorkCount,
          addresses: ingress.ingressWorkByAddress.size,
          sources: upgradeSockets.filter((socket) => ingress.ingressWorkBySource.has(socket))
            .length,
        }).toMatchObject({
          phase,
          legs: 0,
          usage: { work: { bulk: 0, control: 0 }, sockets: 0 },
          ingress: 0,
          addresses: 0,
          sources: 0,
        });
      });
    };

    host.targets.connect("env-1", (child.address() as AddressInfo).port);
    expect((await openSocket(environmentSocketUrl(host, "/refuse"))).status).toBe(403);
    await settled("refused");

    // A pending handshake keeps its slot; a client that gives up on it is torn
    // down and the slot returns exactly once.
    const abandoned = new WebSocket(environmentSocketUrl(host, "/stall"));
    abandoned.on("error", () => {});
    cleanup.push(async () => abandoned.terminate());
    await vi.waitFor(() => expect(childSockets).toHaveLength(2));
    expect(host.gateway.activeLegCount()).toBe(1);
    expect(ingressOf(host.server).ingressWorkCount).toBe(1);
    abandoned.terminate();
    await settled("abandoned");

    const unreachable = createServer();
    await new Promise<void>((resolve) => unreachable.listen(0, "127.0.0.1", resolve));
    const closedPort = (unreachable.address() as AddressInfo).port;
    await new Promise<void>((resolve) => unreachable.close(() => resolve()));
    host.targets.connect("env-1", closedPort);
    expect((await openSocket(environmentSocketUrl(host))).status).toBe(0);
    await settled("unreachable");

    const invalid = await openSocket(
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=child`,
    );
    expect(invalid.status).toBe(401);
    await settled("invalid");
  });

  it("are still closed and joined by host shutdown", async () => {
    const { host, upgradeSockets } = await startEnvironmentHost();
    const upstream = await startWsUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);
    const opened = await openSocket(environmentSocketUrl(host));
    expect(opened.status).toBe(101);
    expectNoIngressHeld(host.server, upgradeSockets);
    expect(host.gateway.activeLegCount()).toBe(1);

    await host.server.dispose();
    // Shutdown joined the still-running operation: its legs are gone.
    expect(host.gateway.activeLegCount()).toBe(0);
    await closed(opened.socket);
    await vi.waitFor(() => expect(upstream.clientCount()).toBe(0));
  });
});

/** Known fixture origin secret (32 identical bytes) — never a real credential. */
const TEST_ORIGIN_SECRET = Buffer.alloc(32, 1).toString("base64url");
const TEST_SERVER_ID = "ingress-upgrade-host";
const TEST_BASE = "https://apps.example.test";
const TEST_POLICY = new ForwardOriginPolicy(TEST_BASE);
const TEST_OWNER = deriveForwardOwner(TEST_ORIGIN_SECRET, TEST_SERVER_ID);

/** A forward-origin host with the per-address bound, plus the two-hop entry. */
async function startForwardHost(upstreamPort: number) {
  const forwardOrigin = createForwardOriginIdentity({
    baseUrl: TEST_BASE,
    originSecret: TEST_ORIGIN_SECRET,
    serverId: TEST_SERVER_ID,
  })!;
  const gateway = new RemotePortForwardGateway({
    bindHost: "127.0.0.1",
    forwardablePorts: [upstreamPort],
  });
  const portProxy = new PortProxy({ gateway, forwardOrigin });
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: TEST_SERVER_ID, label: "Ingress upgrade test" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    portForward: gateway,
    portProxy,
    forwardOrigin,
    maxConcurrentIngressWorkPerAddress: PER_ADDRESS,
  });
  cleanup.push(async () => {
    gateway.dispose();
    portProxy.dispose();
    await server.dispose();
  });
  const upgradeSockets = upgradeSocketsOf(server);
  const info = await server.start();
  const port = Number(new URL(info.httpBaseUrl).port);
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const exchanged = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "pairing-token", credential, scopes: ["ports:forward"] }),
  });
  const { accessToken } = (await exchanged.json()) as { accessToken: string };
  const bearer = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
  };
  const created = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
    method: "POST",
    headers: bearer,
    body: JSON.stringify({ targetPort: upstreamPort }),
  });
  expect(created.status).toBe(200);
  const { forward, enterPath } = (await created.json()) as {
    forward: { id: string };
    enterPath: string;
  };
  const entry = await fetch(new URL(enterPath, info.httpBaseUrl), { redirect: "manual" });
  const location = new URL(entry.headers.get("location")!);
  const childOrigin = TEST_POLICY.originFor(TEST_OWNER, forward.id);
  const childAuthority = new URL(childOrigin).host;
  expect(location.pathname).toBe(FORWARD_ORIGIN_EXCHANGE_PATH);
  const session = await rawRequestWithAuthority({
    port,
    path: location.pathname + location.search,
    authority: childAuthority,
    headers: { origin: childOrigin },
  });
  const cookie = /^(__Host-poracode-forward=[^;]+)/.exec(session.headers["set-cookie"]![0]!)![1]!;
  return {
    server,
    info,
    port,
    bearer,
    forwardId: forward.id,
    childOrigin,
    childAuthority,
    cookie,
    upgradeSockets,
  };
}

describe("forward child-origin upgrades", () => {
  it("return the ingress slot at the 101, keep frames flowing, and are joined by shutdown", async () => {
    const upstream = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await once(upstream, "listening");
    upstream.on("connection", (peer) => peer.on("message", (data) => peer.send(data.toString())));
    cleanup.push(async () => {
      for (const peer of upstream.clients) peer.terminate();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    });
    const host = await startForwardHost((upstream.address() as AddressInfo).port);

    const sockets: WebSocket[] = [];
    for (let index = 0; index < SOCKETS; index += 1) {
      const opened = await openSocket(`ws://127.0.0.1:${host.port}/hmr`, {
        host: host.childAuthority,
        origin: host.childOrigin,
        cookie: host.cookie,
      });
      expect(opened.status).toBe(101);
      sockets.push(opened.socket);
    }
    expectNoIngressHeld(host.server, host.upgradeSockets);
    for (const [index, socket] of sockets.entries()) await expectEcho(socket, `hmr-${index}`);
    // Ordinary API work from the same address is still admitted.
    const enter = await fetch(new URL("/api/ports/enter", host.info.httpBaseUrl), {
      method: "POST",
      headers: host.bearer,
      body: JSON.stringify({ id: host.forwardId }),
    });
    expect(enter.status).toBe(200);

    await host.server.dispose();
    await Promise.all(sockets.map((socket) => closed(socket)));
    await vi.waitFor(() => expect(upstream.clients.size).toBe(0));
    expectNoIngressHeld(host.server, host.upgradeSockets);
  });
});
