import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { ForwardOriginPolicy, deriveForwardOwner } from "./portForward/forwardOrigin";
import { createForwardOriginIdentity } from "./portForward/forwardOriginIdentity";
import { PortProxy } from "./portForward/portProxy";
import {
  rawRequestWithAuthority,
  rawStreamRequestWithAuthority,
  startRawUpstream,
  startStreamUpstream,
  type CleanupRegistry,
} from "./portForward/testFixtures";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";
import { RemotePortForwardGateway } from "./RemotePortForwardGateway";

const cleanup: CleanupRegistry = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

/** Known fixture origin secret (32 identical bytes) — never a real credential. */
const TEST_ORIGIN_SECRET = Buffer.alloc(32, 1).toString("base64url");
const TEST_BASE = "https://apps.example.test";
const REVOCATION_POLICY = new ForwardOriginPolicy(TEST_BASE);
const REVOCATION_OWNER = deriveForwardOwner(TEST_ORIGIN_SECRET, "revocation-test");

/** The child origin for a forward id under the fixture base/owner. */
function forwardChildOrigin(forwardId: string): string {
  return REVOCATION_POLICY.originFor(REVOCATION_OWNER, forwardId);
}

async function startHost() {
  const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
  const forwardOrigin = createForwardOriginIdentity({
    baseUrl: TEST_BASE,
    originSecret: TEST_ORIGIN_SECRET,
    serverId: "revocation-test",
  })!;
  const proxy = new PortProxy({ gateway, forwardOrigin });
  const host = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "revocation-test", label: "Revocation test" },
    host: "127.0.0.1",
    port: 0,
    portForward: gateway,
    portProxy: proxy,
    forwardOrigin,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
  });
  cleanup.push(async () => {
    gateway.dispose();
    proxy.dispose();
    await host.dispose();
  });
  const info = await host.start();
  const serverPort = Number(new URL(info.httpBaseUrl).port);
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const exchange = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "pairing-token", credential, scopes: ["ports:forward"] }),
  });
  expect(exchange.status).toBe(200);
  const { accessToken } = (await exchange.json()) as { accessToken: string };
  const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };

  /** Runs the two-hop entry (API-origin enter → child exchange) for a fresh
   * forward and returns the child-bound session credentials. */
  const enterChild = async (forwardId: string, enterPath: string) => {
    const childOrigin = forwardChildOrigin(forwardId);
    const entry = await fetch(new URL(enterPath, info.httpBaseUrl), { redirect: "manual" });
    expect(entry.status).toBe(302);
    const location = new URL(entry.headers.get("location")!);
    expect(location.origin).toBe(childOrigin);
    const exchanged = await rawRequestWithAuthority({
      port: serverPort,
      path: location.pathname + location.search,
      authority: new URL(childOrigin).host,
      headers: { origin: childOrigin },
    });
    expect(exchanged.status).toBe(302);
    const cookie = exchanged.headers["set-cookie"]![0]!.split(";")[0]!;
    return {
      id: forwardId,
      cookie,
      childOrigin,
      childAuthority: new URL(childOrigin).host,
    };
  };

  return {
    gateway,
    serverPort,
    async forward(targetPort: number) {
      const created = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({ targetPort }),
      });
      expect(created.status).toBe(200);
      const result = (await created.json()) as { forward: { id: string }; enterPath: string };
      return enterChild(result.forward.id, result.enterPath);
    },
    async stop(id: string) {
      const result = await fetch(new URL("/api/ports/unforward", info.httpBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({ id }),
      });
      expect(result.status).toBe(200);
    },
  };
}

async function openStream(entry: {
  id: string;
  cookie: string;
  childAuthority: string;
  serverPort: number;
}) {
  const response = await rawStreamRequestWithAuthority({
    port: entry.serverPort,
    path: "/stream",
    authority: entry.childAuthority,
    headers: { cookie: entry.cookie },
  });
  expect(response.status).toBe(200);
  cleanup.push(async () => {
    await response.cancel().catch(() => {});
  });
  return { id: entry.id, response };
}

describe("forwarded response lifetime", () => {
  it("closes a disconnected client's upstream without revoking the forward", async () => {
    const upstream = await startStreamUpstream(cleanup, "A");
    const host = await startHost();
    const entry = await host.forward(upstream.port);
    const first = await openStream({ ...entry, serverPort: host.serverPort });
    expect(new TextDecoder().decode((await first.response.read())!)).toBe("A");
    await first.response.cancel();
    await vi.waitFor(() => expect(upstream.isClosed()).toBe(true));
    const second = await openStream({ ...entry, serverPort: host.serverPort });
    expect(new TextDecoder().decode((await second.response.read())!)).toBe("A");
  });

  it("does not reuse a stopped forward's idle connection after the target port is replaced", async () => {
    const oldUpstream = await startRawUpstream(cleanup, "A");
    const host = await startHost();
    const a = await host.forward(oldUpstream.port);
    const first = await rawRequestWithAuthority({
      port: host.serverPort,
      path: "/",
      authority: a.childAuthority,
      headers: { cookie: a.cookie },
    });
    expect(await first.text()).toBe("A");
    await host.stop(a.id);
    oldUpstream.server.close();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await startRawUpstream(cleanup, "B", oldUpstream.port);
    const b = await host.forward(oldUpstream.port);
    const second = await rawRequestWithAuthority({
      port: host.serverPort,
      path: "/",
      authority: b.childAuthority,
      headers: { cookie: b.cookie },
    });
    expect(await second.text()).toBe("B");
  });

  it("revokes an established forwarded WebSocket when forwarding stops", async () => {
    const upstream = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => upstream.once("listening", resolve));
    upstream.on("connection", (socket) => {
      socket.on("message", (data) => socket.send(data.toString()));
    });
    cleanup.push(async () => {
      for (const socket of upstream.clients) socket.terminate();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    });
    const host = await startHost();
    const entry = await host.forward((upstream.address() as AddressInfo).port);
    const client = new WebSocket(`ws://127.0.0.1:${host.serverPort}/stream`, {
      headers: {
        host: entry.childAuthority,
        origin: entry.childOrigin,
        cookie: entry.cookie,
      },
    });
    cleanup.push(async () => {
      client.terminate();
    });
    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });
    const echoed = new Promise<string>((resolve) => {
      client.once("message", (data) => resolve(data.toString()));
    });
    client.send("live before stop");
    expect(await echoed).toBe("live before stop");
    let closed = false;
    client.once("close", () => {
      closed = true;
    });
    await host.stop(entry.id);
    await vi.waitFor(() => expect(closed).toBe(true), { timeout: 3000 });
  });

  it.each(["stop", "dispose"] as const)("revokes active HTTP streams on %s", async (action) => {
    const upstreamA = await startStreamUpstream(cleanup, "A");
    const upstreamB = await startStreamUpstream(cleanup, "B");
    const host = await startHost();
    const a = await openStream({
      ...(await host.forward(upstreamA.port)),
      serverPort: host.serverPort,
    });
    const b = await openStream({
      ...(await host.forward(upstreamB.port)),
      serverPort: host.serverPort,
    });
    const decoder = new TextDecoder();
    expect(decoder.decode((await a.response.read())!)).toBe("A");
    expect(decoder.decode((await b.response.read())!)).toBe("B");
    let aClosed = false;
    void a.response.closed
      .finally(() => {
        aClosed = true;
      })
      .catch(() => {});
    if (action === "stop") await host.stop(a.id);
    else host.gateway.dispose();
    await vi.waitFor(
      () => {
        expect(aClosed).toBe(true);
        expect(upstreamA.isClosed()).toBe(true);
      },
      { timeout: 3000 },
    );
    let remainingText: string | null = null;
    if (action === "stop") {
      upstreamB.write("still B");
      remainingText = decoder.decode((await b.response.read())!);
    }
    expect(remainingText).toBe(action === "stop" ? "still B" : null);
    await vi.waitFor(() => expect(upstreamB.isClosed()).toBe(action === "dispose"));
  });
});
