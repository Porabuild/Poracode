import { createHash, randomBytes } from "node:crypto";
import { createServer as createHttpServer, type Server } from "node:http";
import { connect, type Socket, type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { deriveForwardOwner, ForwardOriginPolicy } from "../portForward/forwardOrigin";
import { createForwardOriginIdentity } from "../portForward/forwardOriginIdentity";
import { FORWARD_ORIGIN_EXCHANGE_PATH, PortProxy } from "../portForward/portProxy";
import { rawRequestWithAuthority, type CleanupRegistry } from "../portForward/testFixtures";
import { RemotePortForwardGateway } from "../RemotePortForwardGateway";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "../RemoteAccessServer";
import {
  FORWARD_DISPATCH_ROUTE_HEADER,
  FORWARD_DISPATCH_ID_HEADER,
  FORWARD_DISPATCH_KEY_HEADER,
  FORWARD_DISPATCH_ORIGIN_HEADER,
} from "./forwardOriginDispatch";

const cleanup: CleanupRegistry = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

/** Known fixture origin secret (32 identical bytes) — never a real credential. */
const TEST_ORIGIN_SECRET = Buffer.alloc(32, 1).toString("base64url");
const TEST_SERVER_ID = "dispatch-test-host";
const TEST_BASE = "https://apps.example.test";
const TEST_OWNER = deriveForwardOwner(TEST_ORIGIN_SECRET, TEST_SERVER_ID);
const TEST_POLICY = new ForwardOriginPolicy(TEST_BASE);
const TEST_DISPATCH_KEY = Buffer.alloc(32, 2).toString("base64url");

interface UpstreamEcho {
  port: number;
  /** Last request's full header set, for upstream-observation assertions. */
  lastHeaders: () => Record<string, string | string[] | undefined>;
}

/** Echoes method-specific JSON (url, host, cookie, echo-of-reserved-header)
 * and optionally sets cookies: reserved Poracode names plus an ordinary one. */
async function startUpstreamEcho(): Promise<UpstreamEcho> {
  let lastHeaders: Record<string, string | string[] | undefined> = {};
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    lastHeaders = req.headers;
    if (req.url === "/set-cookies") {
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": [
          "__Host-poracode-forward=evil; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax",
          "lc_forward=legacy; Path=/",
          "lc_relay=routing; Path=/",
          "app_session=ok; Path=/",
        ],
      });
      res.end(JSON.stringify({ set: true }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        url: req.url,
        host: req.headers.host,
        cookie: req.headers.cookie ?? null,
        dispatchedKey: req.headers["x-poracode-forward-key"] ?? null,
        dispatchedAnything: Object.keys(req.headers).filter((name) =>
          name.startsWith("x-poracode-forward-"),
        ),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { port: (server.address() as AddressInfo).port, lastHeaders: () => lastHeaders };
}

function childOriginFor(forwardId: string): string {
  return TEST_POLICY.originFor(TEST_OWNER, forwardId);
}

function childAuthorityFor(forwardId: string): string {
  return new URL(childOriginFor(forwardId)).host;
}

async function startConfiguredHost(
  overrides: {
    readonly getRelayForwardOrigin?: RemoteAccessServerOptions["getRelayForwardOrigin"];
    readonly exchangeTtlMs?: number;
    readonly enterTokenTtlMs?: number;
  } = {},
) {
  const forwardOrigin = createForwardOriginIdentity({
    baseUrl: TEST_BASE,
    originSecret: TEST_ORIGIN_SECRET,
    serverId: TEST_SERVER_ID,
  })!;
  const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
  const portProxy = new PortProxy({
    gateway,
    forwardOrigin,
    ...(overrides.exchangeTtlMs !== undefined ? { exchangeTtlMs: overrides.exchangeTtlMs } : {}),
    ...(overrides.enterTokenTtlMs !== undefined
      ? { enterTokenTtlMs: overrides.enterTokenTtlMs }
      : {}),
  });
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: TEST_SERVER_ID, label: "Dispatch test" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    portForward: gateway,
    portProxy,
    forwardOrigin,
    forwardDispatchKey: TEST_DISPATCH_KEY,
    ...(overrides.getRelayForwardOrigin
      ? { getRelayForwardOrigin: overrides.getRelayForwardOrigin }
      : {}),
  });
  cleanup.push(async () => {
    gateway.dispose();
    portProxy.dispose();
    await server.dispose();
  });
  const info = await server.start();
  const port = new URL(info.httpBaseUrl).port;
  expect(port).toBeTruthy();

  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const exchangeResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "pairing-token", credential, scopes: ["ports:forward"] }),
  });
  expect(exchangeResponse.status).toBe(200);
  const { accessToken } = (await exchangeResponse.json()) as { accessToken: string };
  const bearer = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };

  /** Opens a forward through the bearer-gated API and runs the full two-hop
   * entry (API-origin enter → child exchange), returning the session cookie
   * bound to the child origin. */
  const forwardAndEnter = async (targetPort: number) => {
    const created = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ targetPort }),
    });
    expect(created.status).toBe(200);
    const result = (await created.json()) as { forward: { id: string }; enterPath: string };
    expect(result.enterPath).toMatch(new RegExp(`^/forward/${result.forward.id}/enter\\?fwt=.+`));
    const childOrigin = childOriginFor(result.forward.id);
    const childAuthority = childAuthorityFor(result.forward.id);

    const entry = await fetch(new URL(result.enterPath, info.httpBaseUrl), {
      redirect: "manual",
    });
    expect(entry.status).toBe(302);
    const location = entry.headers.get("location")!;
    expect(location).toBe(
      `${childOrigin}${FORWARD_ORIGIN_EXCHANGE_PATH}?fx=${new URL(location).searchParams.get("fx")}`,
    );

    const exchanged = await rawRequestWithAuthority({
      port: Number(port),
      path: new URL(location).pathname + new URL(location).search,
      authority: childAuthority,
      headers: { origin: childOrigin },
    });
    expect(exchanged.status).toBe(302);
    const setCookie = exchanged.headers["set-cookie"]?.[0]!;
    const cookieValue = /^__Host-poracode-forward=([^;]+)/.exec(setCookie)?.[1];
    expect(cookieValue).toBeTruthy();
    return {
      id: result.forward.id,
      childOrigin,
      childAuthority,
      cookie: `__Host-poracode-forward=${cookieValue}`,
    };
  };

  return {
    bearer,
    server,
    gateway,
    portProxy,
    port: Number(port),
    forwardAndEnter,
    /** Issues only the entry token (no exchange): `POST /api/ports/forward`. */
    createForward: async (targetPort: number) => {
      const created = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
        method: "POST",
        headers: bearer,
        body: JSON.stringify({ targetPort }),
      });
      expect(created.status).toBe(200);
      return (await created.json()) as { forward: { id: string }; enterPath: string };
    },
    /** Re-mints an entry token for an open forward (`POST /api/ports/enter`). */
    mintEnterPath: async (id: string) => {
      const response = await fetch(new URL("/api/ports/enter", info.httpBaseUrl), {
        method: "POST",
        headers: bearer,
        body: JSON.stringify({ id }),
      });
      expect(response.status).toBe(200);
      return ((await response.json()) as { enterPath: string }).enterPath;
    },
    stop: async (id: string) => {
      const response = await fetch(new URL("/api/ports/unforward", info.httpBaseUrl), {
        method: "POST",
        headers: bearer,
        body: JSON.stringify({ id }),
      });
      expect(response.status).toBe(200);
    },
  };
}

async function startUnconfiguredHost() {
  const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "unconfigured-host", label: "Unconfigured" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    portForward: gateway,
  });
  cleanup.push(async () => {
    gateway.dispose();
    await server.dispose();
  });
  const info = await server.start();
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const exchangeResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "pairing-token", credential, scopes: ["ports:forward"] }),
  });
  const { accessToken } = (await exchangeResponse.json()) as { accessToken: string };
  return {
    server,
    info,
    bearer: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  };
}

describe("isolated child-origin dispatch", () => {
  it("selects relay API entry origins only from authenticated internal route context", async () => {
    const relayIdentity = {
      baseUrl: "https://relay-api-apps.example.test",
      ownerId: "c".repeat(24),
    };
    let active: typeof relayIdentity | null = relayIdentity;
    const upstream = await startUpstreamEcho();
    const host = await startConfiguredHost({ getRelayForwardOrigin: () => active });
    const forward = await host.gateway.startForward(upstream.port);
    const url = `http://127.0.0.1:${host.port}`;
    const headers = {
      ...host.bearer,
      [FORWARD_DISPATCH_KEY_HEADER]: TEST_DISPATCH_KEY,
      [FORWARD_DISPATCH_ROUTE_HEADER]: "api",
    };
    const enter = async (extra: Record<string, string> = {}) =>
      fetch(`${url}/api/ports/enter`, {
        method: "POST",
        headers: { ...headers, ...extra },
        body: JSON.stringify({ id: forward.id }),
      });
    expect((await enter({ [FORWARD_DISPATCH_KEY_HEADER]: "forged" })).status).toBe(403);
    expect((await enter({ "x-poracode-forward-unknown": "value" })).status).toBe(403);
    expect((await enter({ [FORWARD_DISPATCH_ID_HEADER]: forward.id })).status).toBe(403);
    const entered = await enter();
    expect(entered.status).toBe(200);
    const { enterPath } = (await entered.json()) as { enterPath: string };
    const redirected = await fetch(`${url}${enterPath}`, { headers, redirect: "manual" });
    expect(redirected.status).toBe(302);
    expect(new URL(redirected.headers.get("location")!).origin).toBe(
      new ForwardOriginPolicy(relayIdentity.baseUrl).originFor(relayIdentity.ownerId, forward.id),
    );
    active = null;
    expect((await enter()).status).toBe(503);
    await host.forwardAndEnter(upstream.port);
  });

  it("accepts active relay child origins and revokes them when registration disappears", async () => {
    const relayIdentity = { baseUrl: "https://relay-apps.example.test", ownerId: "b".repeat(24) };
    let active: typeof relayIdentity | null = relayIdentity;
    const upstream = await startUpstreamEcho();
    const host = await startConfiguredHost({ getRelayForwardOrigin: () => active });
    const forward = await host.gateway.startForward(upstream.port);
    const token = host.portProxy.issueEnterToken(forward.id, relayIdentity);
    const exchange = host.portProxy.beginExchange(forward.id, token.token)!;
    const url = new URL(exchange.exchangeUrl);
    const request = { port: host.port, path: url.pathname + url.search, authority: url.host };
    const result = await rawRequestWithAuthority(request);
    expect(result.status).toBe(302);
    active = null;
    expect((await rawRequestWithAuthority({ ...request, path: "/api/ports" })).status).toBe(404);
    expect(
      (
        await rawRequestWithAuthority({
          port: host.port,
          path: "/",
          authority: "127.0.0.1",
          headers: {
            [FORWARD_DISPATCH_KEY_HEADER]: TEST_DISPATCH_KEY,
            [FORWARD_DISPATCH_ID_HEADER]: forward.id,
            [FORWARD_DISPATCH_ORIGIN_HEADER]: url.origin,
          },
        })
      ).status,
    ).toBe(403);
    await host.forwardAndEnter(upstream.port);
  });

  it("proxies a full two-hop entry and routes every child path — /api/* included — upstream", async () => {
    const upstream = await startUpstreamEcho();
    const host = await startConfiguredHost();
    const session = await host.forwardAndEnter(upstream.port);

    // `/` proxies upstream with the rewritten loopback Host.
    const root = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: session.childAuthority,
      headers: { cookie: session.cookie },
    });
    expect(root.status).toBe(200);
    await expect(root.text()).resolves.toContain('"url":"/"');

    // `/api/snapshot` is NOT Poracode's on a child origin — the forwarded app
    // owns `/api/*`, so it reaches the upstream, never the API router.
    const api = await rawRequestWithAuthority({
      port: host.port,
      path: "/api/snapshot",
      authority: session.childAuthority,
      headers: { cookie: session.cookie },
    });
    expect(api.status).toBe(200);
    await expect(api.text()).resolves.toContain('"url":"/api/snapshot"');

    // Nested path + query proxy verbatim.
    const nested = await rawRequestWithAuthority({
      port: host.port,
      path: "/some/nested/path?q=1",
      authority: session.childAuthority,
      headers: { cookie: session.cookie },
    });
    expect(nested.status).toBe(200);
    await expect(nested.text()).resolves.toContain('"url":"/some/nested/path?q=1"');
    await expect(nested.text()).resolves.toContain(`"host":"localhost:${upstream.port}"`);
  });

  it.each([
    ["a foreign-owner label", () => `f-${"a".repeat(24)}-${"b".repeat(32)}.apps.example.test`],
    ["a malformed label", () => "f-not-a-child.apps.example.test"],
    ["the bare base host", () => "apps.example.test"],
  ])(
    "bounded-errors %s under the configured base instead of serving the PWA",
    async (_name, authority) => {
      const upstream = await startUpstreamEcho();
      const host = await startConfiguredHost();
      await host.createForward(upstream.port);

      const response = await rawRequestWithAuthority({
        port: host.port,
        path: "/",
        authority: authority(),
      });
      expect(response.status).toBe(404);
      const body = await response.text();
      expect(body).toContain("forward_not_found");
      expect(body).not.toContain("<!doctype html>");
      expect(response.headers["cache-control"]).toBe("no-store");
    },
  );

  it("bounded-errors a wrong-port child authority (namespace recognition ignores port)", async () => {
    const upstream = await startUpstreamEcho();
    const host = await startConfiguredHost();
    const created = await host.createForward(upstream.port);

    const response = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: `${childAuthorityFor(created.forward.id)}:9999`,
      headers: { cookie: "x=1" },
    });
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("forward_not_found");
  });

  it("bounded-errors an unknown or revoked forward on a valid child origin", async () => {
    const upstream = await startUpstreamEcho();
    const host = await startConfiguredHost();
    const session = await host.forwardAndEnter(upstream.port);

    await host.stop(session.id);

    const afterStop = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: session.childAuthority,
      headers: { cookie: session.cookie },
    });
    expect(afterStop.status).toBe(404);
    const body = await afterStop.text();
    expect(body).toContain("forward_not_found");
    expect(body).not.toContain("<!doctype html>");

    // A never-existing forward id on an otherwise valid child origin.
    const bogus = `f-${TEST_OWNER}-${"0".repeat(32)}.apps.example.test`;
    const response = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: bogus,
      headers: { cookie: session.cookie },
    });
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("forward_not_found");
  });

  it("requires the origin-bound cookie session on every child operation", async () => {
    const upstreamA = await startUpstreamEcho();
    const upstreamB = await startUpstreamEcho();
    const host = await startConfiguredHost();
    const a = await host.forwardAndEnter(upstreamA.port);
    const b = await host.forwardAndEnter(upstreamB.port);

    // No cookie at all.
    const anonymous = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: a.childAuthority,
    });
    expect(anonymous.status).toBe(403);
    expect(await anonymous.text()).toContain("forward_session_required");

    // A's cookie cannot authenticate B's child origin, even copied verbatim.
    const copied = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: b.childAuthority,
      headers: { cookie: a.cookie },
    });
    expect(copied.status).toBe(403);
    expect(await copied.text()).toContain("forward_session_required");

    // Ambiguous duplicate reserved crumbs are rejected, never first-wins.
    const duplicated = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: a.childAuthority,
      headers: { cookie: `${a.cookie}; __Host-poracode-forward=${"z".repeat(43)}` },
    });
    expect(duplicated.status).toBe(403);
    expect(await duplicated.text()).toContain("forward_session_required");

    // The API/PWA origin is not proxied even WITH a valid child-origin cookie.
    const apiOrigin = await fetch(new URL("/", host.server.getInfo()!.httpBaseUrl), {
      headers: { cookie: a.cookie },
    });
    expect(apiOrigin.status).toBe(200);
    expect(await apiOrigin.text()).toContain("<!doctype html>");
  });

  it("enforces the exact child origin on browser HTTP requests and WebSocket upgrades", async () => {
    const { createServer } = await import("node:http");
    const upstreamWss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => upstreamWss.once("listening", resolve));
    upstreamWss.on("connection", (socket) => {
      socket.on("message", (data) => socket.send(data.toString()));
    });
    cleanup.push(async () => {
      for (const socket of upstreamWss.clients) socket.terminate();
      await new Promise<void>((resolve) => upstreamWss.close(() => resolve()));
    });
    void createServer;
    const upstream = { port: (upstreamWss.address() as AddressInfo).port };
    const host = await startConfiguredHost();
    const session = await host.forwardAndEnter(upstream.port);

    // HTTP with a foreign Origin is rejected…
    const foreignHttp = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: session.childAuthority,
      headers: { cookie: session.cookie, origin: "https://evil.example" },
    });
    expect(foreignHttp.status).toBe(403);
    expect(await foreignHttp.text()).toContain("forward_origin_mismatch");

    // …and a WS upgrade with a foreign Origin is dropped.
    const wsBase = `ws://127.0.0.1:${host.port}/hmr`;
    const foreignWs = new WebSocket(wsBase, {
      headers: { host: session.childAuthority, origin: "https://evil.example" },
    });
    cleanup.push(async () => foreignWs.terminate());
    await expect(
      new Promise<void>((resolve, reject) => {
        foreignWs.once("open", resolve);
        foreignWs.once("error", reject);
      }),
    ).rejects.toBeInstanceOf(Error);

    // A WS upgrade without any Origin is not a browser — rejected too.
    const originlessWs = new WebSocket(wsBase, {
      headers: { host: session.childAuthority, cookie: session.cookie },
    });
    cleanup.push(async () => originlessWs.terminate());
    await expect(
      new Promise<void>((resolve, reject) => {
        originlessWs.once("open", resolve);
        originlessWs.once("error", reject);
      }),
    ).rejects.toBeInstanceOf(Error);

    // The exact origin + session gets a working app socket (HMR shape, /ws
    // path included — on the child origin `/ws` belongs to the app).
    const client = new WebSocket(`ws://127.0.0.1:${host.port}/ws`, {
      headers: {
        host: session.childAuthority,
        origin: session.childOrigin,
        cookie: session.cookie,
      },
    });
    cleanup.push(async () => client.terminate());
    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });
    const echoed = new Promise<string>((resolve) => {
      client.once("message", (data) => resolve(data.toString()));
    });
    client.send("hmr-through-child-origin");
    expect(await echoed).toBe("hmr-through-child-origin");
  });

  it("makes the exchange one-use, origin-bound, forward-bound, and short-lived", async () => {
    const upstream = await startUpstreamEcho();
    const otherUpstream = await startUpstreamEcho();
    const host = await startConfiguredHost();
    const created = await host.createForward(upstream.port);
    const childOrigin = childOriginFor(created.forward.id);
    const childAuthority = childAuthorityFor(created.forward.id);
    const enterPath = await host.mintEnterPath(created.forward.id);

    const entry = await fetch(new URL(enterPath, host.server.getInfo()!.httpBaseUrl), {
      redirect: "manual",
    });
    const location = new URL(entry.headers.get("location")!);
    const exchangePath = location.pathname + location.search;

    const mint = async () =>
      rawRequestWithAuthority({
        port: host.port,
        path: exchangePath,
        authority: childAuthority,
        headers: { origin: childOrigin },
      });

    const first = await mint();
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe("/");
    const setCookie = first.headers["set-cookie"]?.[0]!;
    expect(setCookie).toContain("__Host-poracode-forward=");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("Domain=");
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(first.headers["referrer-policy"]).toBe("no-referrer");
    expect(first.headers["x-content-type-options"]).toBe("nosniff");

    // One use: the same capability is spent.
    const replay = await mint();
    expect(replay.status).toBe(403);
    expect(await replay.text()).toContain("forward_exchange_invalid");

    // A fresh capability minted for forward A cannot exchange on B's child
    // origin (forward/origin binding), and foreign Origin on the exchange is
    // rejected.
    const other = await host.createForward(otherUpstream.port);
    const otherAuthority = childAuthorityFor(other.forward.id);
    const secondEntry = await fetch(
      new URL(await host.mintEnterPath(other.forward.id), host.server.getInfo()!.httpBaseUrl),
      { redirect: "manual" },
    );
    const secondLocation = new URL(secondEntry.headers.get("location")!);
    const crossOrigin = await rawRequestWithAuthority({
      port: host.port,
      path: secondLocation.pathname + secondLocation.search,
      authority: childAuthority, // A's child host, B's capability
      headers: { origin: childOrigin },
    });
    expect(crossOrigin.status).toBe(403);
    expect(await crossOrigin.text()).toContain("forward_exchange_invalid");
    const foreignOriginExchange = await rawRequestWithAuthority({
      port: host.port,
      path: secondLocation.pathname + secondLocation.search,
      authority: otherAuthority,
      headers: { origin: `https://evil.${"x".repeat(10)}.test` },
    });
    expect(foreignOriginExchange.status).toBe(403);
    expect(await foreignOriginExchange.text()).toContain("forward_origin_mismatch");

    // Short TTL: an expired capability fails closed.
    const expiringHost = await startConfiguredHost({ exchangeTtlMs: 0 });
    const expiringCreated = await expiringHost.createForward(upstream.port);
    const expiringEntry = await fetch(
      new URL(
        await expiringHost.mintEnterPath(expiringCreated.forward.id),
        expiringHost.server.getInfo()!.httpBaseUrl,
      ),
      { redirect: "manual" },
    );
    const expiringLocation = new URL(expiringEntry.headers.get("location")!);
    const expiringOrigin = childOriginFor(expiringCreated.forward.id);
    const expired = await rawRequestWithAuthority({
      port: expiringHost.port,
      path: expiringLocation.pathname + expiringLocation.search,
      authority: childAuthorityFor(expiringCreated.forward.id),
      headers: { origin: expiringOrigin },
    });
    expect(expired.status).toBe(403);
    expect(await expired.text()).toContain("forward_exchange_invalid");
  });

  it("strips reserved Poracode cookies in both directions and never leaks dispatch headers upstream", async () => {
    const upstream = await startUpstreamEcho();
    const host = await startConfiguredHost();
    const session = await host.forwardAndEnter(upstream.port);

    // Upstream Set-Cookie: reserved names filtered, ordinary cookies pass.
    const withCookies = await rawRequestWithAuthority({
      port: host.port,
      path: "/set-cookies",
      authority: session.childAuthority,
      headers: { cookie: session.cookie },
    });
    expect(withCookies.status).toBe(200);
    const setCookies = withCookies.headers["set-cookie"] ?? [];
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("app_session=ok");

    // Request cookies + internal dispatch headers: reserved names stripped
    // before the upstream ever sees them.
    const probe = await rawRequestWithAuthority({
      port: host.port,
      path: "/headers",
      authority: session.childAuthority,
      headers: {
        cookie: `${session.cookie}; app_cookie=keep-me`,
        [FORWARD_DISPATCH_KEY_HEADER]: TEST_DISPATCH_KEY,
        [FORWARD_DISPATCH_ID_HEADER]: session.id,
        [FORWARD_DISPATCH_ORIGIN_HEADER]: session.childOrigin,
      },
    });
    expect(probe.status).toBe(200);
    const body = JSON.parse(await probe.text()) as {
      cookie: string | null;
      dispatchedKey: string | null;
      dispatchedAnything: string[];
    };
    expect(body.cookie).toBe("app_cookie=keep-me");
    expect(body.dispatchedKey).toBeNull();
    expect(body.dispatchedAnything).toEqual([]);
  });

  it("accepts trusted internal dispatch from loopback with the exact key and context", async () => {
    const upstream = await startUpstreamEcho();
    const host = await startConfiguredHost();
    const created = await host.createForward(upstream.port);
    const childOrigin = childOriginFor(created.forward.id);
    const entry = await fetch(
      new URL(await host.mintEnterPath(created.forward.id), host.server.getInfo()!.httpBaseUrl),
      { redirect: "manual" },
    );
    const location = new URL(entry.headers.get("location")!);
    const exchanged = await rawRequestWithAuthority({
      port: host.port,
      path: location.pathname + location.search,
      authority: childAuthorityFor(created.forward.id),
      headers: { origin: childOrigin },
    });
    const cookieValue = /^__Host-poracode-forward=([^;]+)/.exec(
      exchanged.headers["set-cookie"]?.[0]!,
    )?.[1]!;

    // The relay adapter shape: the visitor's Host is NOT the child origin —
    // the context arrives in the reserved headers instead.
    const dispatched = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: `127.0.0.1:${host.port}`,
      headers: {
        cookie: `__Host-poracode-forward=${cookieValue}`,
        [FORWARD_DISPATCH_KEY_HEADER]: TEST_DISPATCH_KEY,
        [FORWARD_DISPATCH_ID_HEADER]: created.forward.id,
        [FORWARD_DISPATCH_ORIGIN_HEADER]: childOrigin,
      },
    });
    expect(dispatched.status).toBe(200);
    await expect(dispatched.text()).resolves.toContain('"url":"/"');

    // Wrong key → rejected outright, never ordinary routing.
    const wrongKey = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: `127.0.0.1:${host.port}`,
      headers: {
        [FORWARD_DISPATCH_KEY_HEADER]: Buffer.alloc(32, 3).toString("base64url"),
        [FORWARD_DISPATCH_ID_HEADER]: created.forward.id,
        [FORWARD_DISPATCH_ORIGIN_HEADER]: childOrigin,
      },
    });
    expect(wrongKey.status).toBe(403);
    expect(await wrongKey.text()).toContain("forward_dispatch_rejected");

    // Origin inconsistent with (owner, forwardId) → rejected.
    const wrongOrigin = await rawRequestWithAuthority({
      port: host.port,
      path: "/",
      authority: `127.0.0.1:${host.port}`,
      headers: {
        [FORWARD_DISPATCH_KEY_HEADER]: TEST_DISPATCH_KEY,
        [FORWARD_DISPATCH_ID_HEADER]: created.forward.id,
        [FORWARD_DISPATCH_ORIGIN_HEADER]: "https://f-other.apps.example.test",
      },
    });
    expect(wrongOrigin.status).toBe(403);
    expect(await wrongOrigin.text()).toContain("forward_dispatch_rejected");
  });

  it("rejects any reserved dispatch header on an unconfigured host — never ordinary routing", async () => {
    const host = await startUnconfiguredHost();
    const port = Number(new URL(host.info.httpBaseUrl).port);

    const forged = await rawRequestWithAuthority({
      port,
      path: "/api/snapshot",
      authority: `127.0.0.1:${port}`,
      headers: { [FORWARD_DISPATCH_KEY_HEADER]: "anything" },
    });
    expect(forged.status).toBe(403);
    expect(await forged.text()).toContain("forward_dispatch_rejected");

    // Unknown/misspelled reserved names count too.
    const unknown = await rawRequestWithAuthority({
      port,
      path: "/",
      authority: `127.0.0.1:${port}`,
      headers: { "x-poracode-forward-foo": "1" },
    });
    expect(unknown.status).toBe(403);
    expect(await unknown.text()).toContain("forward_dispatch_rejected");

    // Without any reserved header, ordinary routing is intact.
    const ordinary = await fetch(new URL("/api/snapshot", host.info.httpBaseUrl));
    expect(ordinary.status).toBe(401);
  });

  it("fails browser entry explicitly when browser forwarding is unconfigured, raw forward still works", async () => {
    const upstream = await startUpstreamEcho();
    const host = await startUnconfiguredHost();

    const created = await fetch(new URL("/api/ports/forward", host.info.httpBaseUrl), {
      method: "POST",
      headers: host.bearer,
      body: JSON.stringify({ targetPort: upstream.port }),
    });
    expect(created.status).toBe(200);
    const result = (await created.json()) as { forward: { id: string }; enterPath?: string };
    expect(result.forward.id).toBeTruthy();
    expect(result.enterPath).toBeUndefined();

    const enter = await fetch(new URL("/forward/whatever/enter?fwt=x", host.info.httpBaseUrl), {
      redirect: "manual",
    });
    expect(enter.status).toBe(503);
    expect(await enter.json()).toMatchObject({ error: { code: "forward_browser_unavailable" } });

    const mint = await fetch(new URL("/api/ports/enter", host.info.httpBaseUrl), {
      method: "POST",
      headers: host.bearer,
      body: JSON.stringify({ id: result.forward.id }),
    });
    expect(mint.status).toBe(503);
    expect(await mint.json()).toMatchObject({ error: { code: "forward_browser_unavailable" } });

    expect(host.server.forwardOriginAvailability()).toEqual({
      available: false,
      baseUrl: null,
      ownerId: null,
    });
  });

  it("exposes browser-forward availability from the host hook", async () => {
    const host = await startConfiguredHost();
    expect(host.server.forwardOriginAvailability()).toEqual({
      available: true,
      baseUrl: TEST_BASE,
      ownerId: TEST_OWNER,
    });
    expect(host.portProxy.forwardOriginAvailability()).toEqual({
      available: true,
      baseUrl: TEST_BASE,
      ownerId: TEST_OWNER,
    });
  });

  it("rejects an invalid or expired entry token with a plain error page and no cookie", async () => {
    const upstream = await startUpstreamEcho();
    const host = await startConfiguredHost({ enterTokenTtlMs: 0 });

    const bogus = await fetch(
      new URL("/forward/nonexistent-id/enter?fwt=bogus", host.server.getInfo()!.httpBaseUrl),
      {
        redirect: "manual",
      },
    );
    expect(bogus.status).toBe(400);
    expect(bogus.headers.getSetCookie()).toEqual([]);
    expect(await bogus.text()).toContain("<html");

    const created = await host.createForward(upstream.port);
    const expired = await fetch(new URL(created.enterPath, host.server.getInfo()!.httpBaseUrl), {
      redirect: "manual",
    });
    expect(expired.status).toBe(400);
    expect(expired.headers.getSetCookie()).toEqual([]);
  });
});

/* ── WS handshake proxying: parsed-response cookie filtering ─────────────── */

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function acceptForKey(key: string): string {
  return createHash("sha1")
    .update(key + WS_GUID)
    .digest("base64");
}

/** Decodes one unfragmented client-to-server (masked) or server-to-client
 * (unmasked) text frame; test payloads stay under 126 bytes. */
function decodeTextFrame(data: Buffer): string | null {
  if (data.length < 2 || (data[0]! & 0x0f) !== 0x1) return null;
  const masked = (data[1]! & 0x80) !== 0;
  const payloadLength = data[1]! & 0x7f;
  if (payloadLength >= 126) return null;
  const mask = masked ? data.subarray(2, 6) : null;
  const payloadStart = masked ? 6 : 2;
  if (data.length < payloadStart + payloadLength) return null;
  const payload = Buffer.from(data.subarray(payloadStart, payloadStart + payloadLength));
  if (mask) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] = payload[index]! ^ mask[index % 4]!;
    }
  }
  return payload.toString("utf8");
}

function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  if (payload.length >= 126) throw new Error("test frames stay small");
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

interface HandshakeResult {
  readonly responseText: string;
  readonly socket: Socket;
  /** Reads the next server frame payload (unmasked) as text. */
  readFrameText(): Promise<string>;
  /** All bytes that arrived after the handshake headers, resolved on close —
   * the body of a non-101 rejection, for instance. */
  readonly bodyAfterHandshake: Promise<string>;
  sendText(text: string): void;
}

/** Raw (non-library) WS handshake against the host, presenting an explicit
 * Host authority + Origin + Cookie, so the handshake RESPONSE headers are
 * directly inspectable. */
function rawUpgrade(input: {
  readonly port: number;
  readonly authority: string;
  readonly origin: string;
  readonly cookie?: string;
  readonly path?: string;
}): Promise<HandshakeResult> {
  const key = randomBytes(16).toString("base64");
  const lines = [
    `GET ${input.path ?? "/ws"} HTTP/1.1`,
    `Host: ${input.authority}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    `Origin: ${input.origin}`,
  ];
  if (input.cookie) lines.push(`Cookie: ${input.cookie}`);
  lines.push("\r\n");

  return new Promise((resolve, reject) => {
    const socket = connect(input.port, "127.0.0.1", () => {
      socket.write(lines.join("\r\n"));
    });
    let buffered = Buffer.alloc(0);
    let handshakeDone = false;
    let responseText = "";
    let waiter: { resolve: (value: string) => void } | null = null;
    const postChunks: Buffer[] = [];
    const bodyAfterHandshake = new Promise<string>((resolveBody) => {
      socket.on("close", () => resolveBody(Buffer.concat(postChunks).toString("latin1")));
    });
    socket.on("data", (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (!handshakeDone) {
        const end = buffered.indexOf("\r\n\r\n");
        if (end === -1) return;
        responseText = buffered.subarray(0, end).toString("latin1");
        buffered = buffered.subarray(end + 4);
        if (buffered.length > 0) postChunks.push(Buffer.from(buffered));
        handshakeDone = true;
        resolve({
          responseText,
          socket,
          readFrameText: () =>
            new Promise<string>((resolveFrame) => {
              const frame = decodeTextFrame(buffered);
              if (frame !== null) {
                buffered = Buffer.alloc(0);
                resolveFrame(frame);
                return;
              }
              waiter = {
                resolve: (value) => {
                  buffered = Buffer.alloc(0);
                  resolveFrame(value);
                },
              };
            }),
          sendText: (text) => {
            const payload = Buffer.from(text, "utf8");
            const mask = randomBytes(4);
            const masked = Buffer.from(payload);
            for (let index = 0; index < masked.length; index += 1) {
              masked[index] = masked[index]! ^ mask[index % 4]!;
            }
            socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]));
          },
          bodyAfterHandshake,
        });
        return;
      }
      postChunks.push(chunk);
      const frame = decodeTextFrame(buffered);
      if (frame !== null) waiter?.resolve(frame);
    });
    socket.once("error", reject);
  });
}

/** A raw upstream that completes the WS handshake with forged `Set-Cookie`
 * headers (reserved Poracode names + an ordinary one) and echoes one text
 * frame; `rejectWith` answers the upgrade with a non-101 instead. */
async function startHandshakeUpstream(options: { readonly rejectWith?: number } = {}) {
  let handshakeCookie: string | null = null;
  const upgradeSockets = new Set<Duplex>();
  const server = createHttpServer((_req, res) => {
    res.writeHead(500).end("not an upgrade");
  });
  server.on("upgrade", (req, socket) => {
    upgradeSockets.add(socket);
    socket.once("close", () => upgradeSockets.delete(socket));
    // The proxy releases its side with a normal FIN; a well-behaved peer
    // answers the half-close by ending its own half (`http.Server` sockets
    // default to `allowHalfOpen`, so the write half would otherwise idle).
    socket.on("end", () => socket.end());
    handshakeCookie = req.headers.cookie ?? null;
    if (options.rejectWith) {
      socket.end(
        `HTTP/1.1 ${options.rejectWith} Forbidden\r\n` +
          "Connection: close\r\n" +
          "Set-Cookie: __Host-poracode-forward=evil; Path=/; Secure\r\n" +
          "Set-Cookie: app_session=ok; Path=/\r\n" +
          "Content-Length: 5\r\n" +
          "\r\nnope!",
      );
      return;
    }
    const key = req.headers["sec-websocket-key"];
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptForKey(key ?? "")}\r\n` +
        "Set-Cookie: __Host-poracode-forward=evil; Path=/; Secure\r\n" +
        "Set-Cookie: lc_forward=legacy; Path=/\r\n" +
        "Set-Cookie: app_session=ok; Path=/\r\n" +
        "\r\n",
    );
    socket.on("data", (chunk: Buffer) => {
      const text = decodeTextFrame(chunk);
      if (text !== null) socket.write(encodeTextFrame(`echo:${text}`));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    for (const socket of upgradeSockets) socket.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    port: (server.address() as AddressInfo).port,
    server: server as Server,
    handshakeCookie: () => handshakeCookie,
    openUpgradeSockets: () => upgradeSockets.size,
  };
}

it("reserves previously minted child authorities once ingress config is removed — never the PWA", async () => {
  const host = await startUnconfiguredHost();
  const port = Number(new URL(host.info.httpBaseUrl).port);

  // A child origin minted while a (since-removed) base was configured.
  const staleAuthority = `f-${TEST_OWNER}-${"1".repeat(32)}.old-wildcard.example`;
  const staleRoot = await rawRequestWithAuthority({
    port,
    path: "/",
    authority: staleAuthority,
  });
  expect(staleRoot.status).toBe(404);
  expect(await staleRoot.text()).toContain("forward_not_found");
  expect(await staleRoot.text()).not.toContain("<!doctype html>");
  const staleApi = await rawRequestWithAuthority({
    port,
    path: "/api/snapshot",
    authority: staleAuthority,
  });
  expect(staleApi.status).toBe(404);

  // The host's own API/PWA origin is untouched by the guard.
  const ownRoot = await fetch(new URL("/", host.info.httpBaseUrl));
  expect(ownRoot.status).toBe(200);
  await expect(ownRoot.text()).resolves.toContain("<!doctype html>");
  const ownApi = await fetch(new URL("/api/snapshot", host.info.httpBaseUrl));
  expect(ownApi.status).toBe(401);
});

it("reserves authorities minted under a previous base while a new base is configured", async () => {
  const upstream = await startUpstreamEcho();
  const host = await startConfiguredHost();
  const created = await host.createForward(upstream.port);
  const staleBaseAuthority = `f-${TEST_OWNER}-${created.forward.id.replaceAll("-", "")}.old.example`;

  const stale = await rawRequestWithAuthority({
    port: host.port,
    path: "/",
    authority: staleBaseAuthority,
  });
  expect(stale.status).toBe(404);
  expect(await stale.text()).toContain("forward_not_found");
  expect(await stale.text()).not.toContain("<!doctype html>");

  // The live base still dispatches the same forward as a child.
  const exchanged = await (async () => {
    const entry = await fetch(
      new URL(await host.mintEnterPath(created.forward.id), host.server.getInfo()!.httpBaseUrl),
      { redirect: "manual" },
    );
    const location = new URL(entry.headers.get("location")!);
    return rawRequestWithAuthority({
      port: host.port,
      path: location.pathname + location.search,
      authority: childAuthorityFor(created.forward.id),
      headers: { origin: childOriginFor(created.forward.id) },
    });
  })();
  expect(exchanged.status).toBe(302);
});

describe("WS handshake proxying", () => {
  it("filters reserved cookies from the upstream 101 handshake and keeps frames byte-transparent", async () => {
    const upstream = await startHandshakeUpstream();
    const host = await startConfiguredHost();
    const session = await host.forwardAndEnter(upstream.port);

    const handshake = await rawUpgrade({
      port: host.port,
      authority: session.childAuthority,
      origin: session.childOrigin,
      cookie: session.cookie,
    });
    expect(handshake.responseText).toContain("101 Switching Protocols");
    // The handshake stays verifiable (accept header intact)…
    expect(handshake.responseText).toMatch(/sec-websocket-accept: .{28}/i);
    // …reserved Poracode cookies are stripped from the upstream handshake…
    expect(handshake.responseText).not.toContain("__Host-poracode-forward=");
    expect(handshake.responseText).not.toContain("lc_forward=");
    // …ordinary application cookies ride verbatim.
    expect(handshake.responseText).toContain("app_session=ok");
    // And the upstream never saw the proxy session cookie on the request.
    expect(upstream.handshakeCookie()).toBeNull();

    // Frames flow transparently after the rewritten handshake.
    handshake.sendText("hmr-frame-through-child");
    await expect(handshake.readFrameText()).resolves.toBe("echo:hmr-frame-through-child");

    // The visitor leg going away releases the proxy's upstream leg with a
    // normal FIN; the fixture answers the half-close by ending its own half,
    // so the connection closes fully and nothing lingers.
    handshake.socket.destroy();
    await vi.waitFor(() => expect(upstream.openUpgradeSockets()).toBe(0), { timeout: 3000 });
  });

  it("filters reserved cookies from a non-101 upgrade rejection and ends the socket", async () => {
    const upstream = await startHandshakeUpstream({ rejectWith: 403 });
    const host = await startConfiguredHost();
    const session = await host.forwardAndEnter(upstream.port);

    const handshake = await rawUpgrade({
      port: host.port,
      authority: session.childAuthority,
      origin: session.childOrigin,
      cookie: session.cookie,
    });
    expect(handshake.responseText).toContain("403");
    expect(handshake.responseText).not.toContain("__Host-poracode-forward=");
    expect(handshake.responseText).toContain("app_session=ok");

    const body = await handshake.bodyAfterHandshake;
    expect(body).toContain("nope!");
  });
});
