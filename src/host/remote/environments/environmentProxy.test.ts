import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import {
  ENVIRONMENT_AUTH_AUTHORITY_HEADER,
  ENVIRONMENT_AUTHORIZATION_HEADER,
} from "@/shared/environments";
import { REMOTE_PROJECT_COMMAND_RESULT_HEADER } from "@/shared/remote";
import {
  rawRequestWithAuthority,
  rawStreamRequestWithAuthority,
  type CleanupRegistry,
} from "../portForward/testFixtures";
import {
  exchangeToken,
  sessionIdOf,
  startChildHost,
  startParentHost,
  startUpstream,
  startWsUpstream,
  type ParentHostHandle,
} from "./environmentProxyTestFixtures";

const cleanup: CleanupRegistry = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function parentHeader(token: string): Record<string, string> {
  return { [ENVIRONMENT_AUTHORIZATION_HEADER]: `Bearer ${token}` };
}

function httpBaseOf(host: ParentHostHandle): string {
  return host.info.httpBaseUrl.replace(/\/$/, "");
}

function wsBaseOf(host: ParentHostHandle): string {
  return host.info.wsBaseUrl.replace(/\/$/, "");
}

function rawProxyRequest(
  host: ParentHostHandle,
  path: string,
  options: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly authority?: string;
  } = {},
) {
  return rawRequestWithAuthority({
    port: host.port,
    path,
    authority: `127.0.0.1:${host.port}`,
    ...options,
  });
}

function openProxyWebSocket(host: ParentHostHandle, url: string, headers?: Record<string, string>) {
  const socket = new WebSocket(url, headers ? { headers } : undefined);
  cleanup.push(async () => socket.terminate());
  return socket;
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function waitForRejection(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => reject(new Error("unexpected WebSocket open")));
    socket.once("error", () => resolve());
  });
}

function waitForClose(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

function waitForMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => socket.once("message", (data) => resolve(data.toString())));
}

describe("environment parent proxy HTTP", () => {
  it("proxies with the parent credential in its reserved header and the child bearer untouched", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);

    const response = await host.proxyFetch("env-1", "/api/snapshot", {
      query: "x=1",
      headers: {
        authorization: "Bearer child-token",
        cookie: "parent_session=secret",
        origin: httpBaseOf(host),
        referer: `${httpBaseOf(host)}/app`,
      },
    });
    expect(response.status).toBe(200);

    const dialed = upstream.lastHeaders();
    expect(dialed.authorization).toBe("Bearer child-token");
    expect(dialed.host).toBe(`localhost:${upstream.port}`);
    expect(dialed["accept-encoding"]).toBe("identity");
    expect(dialed.cookie).toBeUndefined();
    expect(dialed.origin).toBeUndefined();
    expect(dialed.referer).toBeUndefined();
    expect(dialed[ENVIRONMENT_AUTHORIZATION_HEADER]).toBeUndefined();
    expect(Object.keys(dialed).filter((name) => name.startsWith("x-poracode-"))).toEqual([]);

    const echoed = (await response.json()) as { url: string };
    expect(echoed.url).toBe("/api/snapshot?x=1");

    const posted = await host.proxyFetch("env-1", "/api/echo", {
      method: "POST",
      headers: {
        authorization: "Bearer child-token",
        "content-type": "application/json",
        "if-none-match": '"etag-1"',
        "x-poracode-command-id": "cmd-1",
      },
      body: JSON.stringify({ hello: "world" }),
    });
    expect(posted.status).toBe(200);
    const postedEcho = (await posted.json()) as { body: string };
    expect(postedEcho.body).toBe(JSON.stringify({ hello: "world" }));
    const postedHeaders = upstream.lastHeaders();
    expect(postedHeaders["content-type"]).toBe("application/json");
    expect(postedHeaders["if-none-match"]).toBe('"etag-1"');
    expect(postedHeaders["x-poracode-command-id"]).toBe("cmd-1");
  });

  it("requires parent use scopes, never falls back to bearer query auth, and keeps child auth independent", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);

    const viewerToken = await exchangeToken(host.server, ["session:read"]);
    const viewer = await host.proxyFetch("env-1", "/api/snapshot", {
      parentToken: viewerToken,
      headers: { authorization: "Bearer child-token" },
    });
    expect(viewer.status).toBe(403);
    expect(((await viewer.json()) as { error: { code: string } }).error.code).toBe("missing_scope");

    const withQueryToken = await host.proxyFetch("env-1", "/api/snapshot", {
      parentToken: host.parentAccessToken,
      query: "access_token=leaked",
      headers: { authorization: "Bearer child-token" },
    });
    expect(withQueryToken.status).toBe(200);

    const bearerAsParent = await fetch(
      `${httpBaseOf(host)}/api/environments/env-1/proxy/api/snapshot`,
      { headers: { [ENVIRONMENT_AUTHORIZATION_HEADER]: "Bearer child-token" } },
    );
    expect(bearerAsParent.status).toBe(401);
    expect(((await bearerAsParent.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_access_token",
    );

    const missingParent = await fetch(
      `${httpBaseOf(host)}/api/environments/env-1/proxy/api/snapshot`,
      { headers: { authorization: "Bearer child-token" } },
    );
    expect(missingParent.status).toBe(401);
    expect(((await missingParent.json()) as { error: { code: string } }).error.code).toBe(
      "missing_environment_authorization",
    );

    // The child bearer is optional on this hop: parent auth alone reaches the
    // child, which stays authoritative for its own auth decision.
    const noChild = await host.proxyFetch("env-1", "/api/snapshot");
    expect(noChild.status).toBe(200);
    expect(upstream.lastHeaders().authorization).toBeUndefined();
  });

  it("keeps the parent and child authorities independent against a real child", async () => {
    const host = await startParentHost(cleanup);
    const child = await startChildHost(cleanup);
    host.targets.connect("env-1", child.port, { childDesktopId: child.desktopId });

    const childTokenOnParent = await fetch(new URL("/api/snapshot", host.info.httpBaseUrl), {
      headers: { authorization: `Bearer ${child.accessToken}` },
    });
    expect(childTokenOnParent.status).toBe(401);

    const parentTokenOnChild = await host.proxyFetch("env-1", "/api/auth/websocket-ticket", {
      method: "POST",
      headers: { authorization: `Bearer ${host.parentAccessToken}` },
    });
    expect(parentTokenOnChild.status).toBe(401);

    const real = await host.proxyFetch("env-1", "/api/auth/websocket-ticket", {
      method: "POST",
      headers: { authorization: `Bearer ${child.accessToken}` },
    });
    expect(real.status).toBe(200);
  });

  it("resolves targets only from the verified registry (client URL/port are ignored)", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup);
    const decoy = await startUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);

    const response = await host.proxyFetch("env-1", "/api/snapshot", {
      query: `url=http://127.0.0.1:${decoy.port}&port=${decoy.port}`,
      headers: {
        authorization: "Bearer child-token",
        "x-poracode-environment-target": `http://127.0.0.1:${decoy.port}`,
        "x-poracode-environment-port": String(decoy.port),
      },
    });
    expect(response.status).toBe(200);
    expect(upstream.requestCount()).toBe(1);
    expect(decoy.requestCount()).toBe(0);
    expect(upstream.lastHeaders()["x-poracode-environment-target"]).toBeUndefined();
  });

  it("fences stale generations and refuses after invalidation, then serves the reconnected generation", async () => {
    const host = await startParentHost(cleanup);
    const first = await startUpstream(cleanup);
    const second = await startUpstream(cleanup);
    host.targets.connect("env-1", first.port);

    const served = await host.proxyFetch("env-1", "/api/snapshot");
    expect(served.status).toBe(200);

    host.targets.stale("env-1");
    const stale = await host.proxyFetch("env-1", "/api/snapshot");
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe(
      "environment_not_connected",
    );

    host.targets.connect("env-1", second.port);
    const reconnected = await host.proxyFetch("env-1", "/api/snapshot");
    expect(reconnected.status).toBe(200);
    expect(second.requestCount()).toBe(1);

    host.targets.invalidate("env-1");
    const invalidated = await host.proxyFetch("env-1", "/api/snapshot");
    expect(invalidated.status).toBe(409);

    host.targets.disconnect("env-1");
    const disconnected = await host.proxyFetch("env-1", "/api/snapshot");
    expect(disconnected.status).toBe(409);
  });

  it("closes a live stream on parent session revocation and rejects later requests", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup, (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("held");
    });
    host.targets.connect("env-1", upstream.port);
    const sessionId = sessionIdOf(host.authStore, host.parentAccessToken);

    const stream = await rawStreamRequestWithAuthority({
      port: host.port,
      path: "/api/environments/env-1/proxy/api/stream",
      authority: `127.0.0.1:${host.port}`,
      headers: { authorization: "Bearer child-token", ...parentHeader(host.parentAccessToken) },
    });
    expect(stream.status).toBe(200);
    expect(new TextDecoder().decode(await stream.read())).toBe("held");

    host.server.revokeAccessSession(sessionId);
    await stream.closed;

    const after = await host.proxyFetch("env-1", "/api/snapshot");
    expect(after.status).toBe(401);
    expect(() =>
      host.gateway.mintWebSocketTicket({
        parentAccessToken: host.parentAccessToken,
        environmentId: "env-1",
      }),
    ).toThrow("Invalid access token.");
    await vi.waitFor(() => expect(host.gateway.activeLegCount()).toBe(0));
  });

  it("cancels the child leg when the client disconnects mid-stream", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup, (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("first");
    });
    host.targets.connect("env-1", upstream.port);
    const sessionId = sessionIdOf(host.authStore, host.parentAccessToken);

    const stream = await rawStreamRequestWithAuthority({
      port: host.port,
      path: "/api/environments/env-1/proxy/api/stream",
      authority: `127.0.0.1:${host.port}`,
      headers: { authorization: "Bearer child-token", ...parentHeader(host.parentAccessToken) },
    });
    expect(new TextDecoder().decode(await stream.read())).toBe("first");
    await stream.cancel();

    await vi.waitFor(() => expect(upstream.lastResponse()?.destroyed).toBe(true));
    await vi.waitFor(() => expect(host.gateway.activeLegCount()).toBe(0));
    expect(host.admission.usage(sessionId)).toMatchObject({
      work: { bulk: 0, control: 0 },
      sockets: 0,
    });
  });

  it("holds principal admission for the real transport and releases it only after a stalled leg settles", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup, (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("open-then-stall");
    });
    host.targets.connect("env-1", upstream.port);
    const sessionId = sessionIdOf(host.authStore, host.parentAccessToken);

    const stream = await rawStreamRequestWithAuthority({
      port: host.port,
      path: "/api/environments/env-1/proxy/api/stalled",
      authority: `127.0.0.1:${host.port}`,
      headers: { authorization: "Bearer child-token", ...parentHeader(host.parentAccessToken) },
    });
    expect(stream.status).toBe(200);
    expect(new TextDecoder().decode(await stream.read())).toBe("open-then-stall");
    await vi.waitFor(() => expect(host.admission.usage(sessionId).sockets).toBe(1));
    expect(host.admission.usage(sessionId).work.bulk).toBeGreaterThan(0);

    host.targets.invalidate("env-1");
    await stream.closed;
    // The logical revoke call did not release the leases; real settlement did.
    await vi.waitFor(() =>
      expect(host.admission.usage(sessionId)).toMatchObject({
        work: { bulk: 0, control: 0 },
        sockets: 0,
      }),
    );
  });

  it("rejects traversal, encoded separators, and absolute forms before any dial", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);

    const paths = [
      "/api/environments/env-1/proxy/../secrets",
      "/api/environments/env-1/proxy/%2e%2e/secrets",
      "/api/environments/env-1/proxy/%2E%2E/secrets",
      "/api/environments/env-1/proxy/..%5csecrets",
      "/api/environments/env-1/proxy//evil.example/x",
      "/api/environments/env-1/proxy/%2f%2fevil.example/x",
      "/api/environments/env-1/proxy/a/%2f/b",
      "/api/environments/env%2e1/proxy/api/snapshot",
    ];
    for (const path of paths) {
      const response = await rawProxyRequest(host, path, {
        headers: parentHeader(host.parentAccessToken),
      });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("environment_proxy_path_invalid");
    }
    expect(upstream.requestCount()).toBe(0);
  });

  it("rejects reserved environment headers on non-proxy paths fail-closed", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);

    for (const name of [ENVIRONMENT_AUTHORIZATION_HEADER, "x-poracode-environment-unknown"]) {
      const response = await fetch(new URL("/api/snapshot", host.info.httpBaseUrl), {
        headers: {
          [name]: name === ENVIRONMENT_AUTHORIZATION_HEADER ? "Bearer parent-token" : "1",
        },
      });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        "environment_header_rejected",
      );
    }

    const ordinary = await fetch(new URL("/api/snapshot", host.info.httpBaseUrl));
    expect(ordinary.status).toBe(401);

    // A foreign Host is rejected by the existing Host allowlist before any
    // proxy dispatch.
    const foreignHost = await rawProxyRequest(host, "/api/environments/env-1/proxy/api/snapshot", {
      authority: "evil.example",
      headers: parentHeader(host.parentAccessToken),
    });
    expect(foreignHost.status).toBe(403);

    // Absolute-form request targets are never proxy-shaped: with the reserved
    // header they fail closed, without it they stay ordinary routing.
    const absoluteForm = await rawProxyRequest(
      host,
      "http://evil.example/api/environments/env-1/proxy/api/snapshot",
      { headers: parentHeader(host.parentAccessToken) },
    );
    expect(absoluteForm.status).toBe(403);
    const absoluteFormPlain = await rawProxyRequest(
      host,
      "http://evil.example/api/environments/env-1/proxy/api/snapshot",
    );
    expect(absoluteFormPlain.status).toBe(404);
    expect(upstream.requestCount()).toBe(0);
  });

  it("applies the parent CORS decision and keeps child CORS/set-cookie off the parent origin", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup, (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "x-child",
        "set-cookie": "child_session=1; Path=/",
      });
      res.end(JSON.stringify({ ok: true }));
    });
    host.targets.connect("env-1", upstream.port);
    const origin = httpBaseOf(host);
    const proxyUrl = `${origin}/api/environments/env-1/proxy/api/snapshot`;

    const preflight = await fetch(proxyUrl, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "GET",
        "access-control-request-headers": `authorization, ${ENVIRONMENT_AUTHORIZATION_HEADER}`,
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      ENVIRONMENT_AUTHORIZATION_HEADER,
    );
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    // R1: the parent's auth-authority marker is a response header the browser
    // client must be able to read off a failed proxied request.
    expect(preflight.headers.get("access-control-expose-headers")).toContain(
      ENVIRONMENT_AUTH_AUTHORITY_HEADER,
    );
    expect(upstream.requestCount()).toBe(0);

    const response = await host.proxyFetch("env-1", "/api/snapshot", {
      headers: { origin, authorization: "Bearer child-token" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-headers")).not.toBe("x-child");
    expect(response.headers.get("access-control-expose-headers")).toContain(
      ENVIRONMENT_AUTH_AUTHORITY_HEADER,
    );
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(upstream.lastHeaders().origin).toBeUndefined();

    const foreign = await host.proxyFetch("env-1", "/api/snapshot", {
      headers: { origin: "https://evil.example", authorization: "Bearer child-token" },
    });
    expect(foreign.status).toBe(403);
    expect(((await foreign.json()) as { error: { code: string } }).error.code).toBe(
      "origin_not_allowed",
    );
  });

  it("allows a parent-origin preflight to request the bounded project-command declaration", async () => {
    const host = await startParentHost(cleanup);
    const origin = httpBaseOf(host);
    const preflight = await fetch(`${origin}/api/environments/env-1/proxy/api/projects/command`, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": `authorization, ${ENVIRONMENT_AUTHORIZATION_HEADER}, ${REMOTE_PROJECT_COMMAND_RESULT_HEADER}, x-poracode-unlisted-probe`,
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    const allowed = (preflight.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    // The bounded project-command declaration is an ordinary request header on
    // the proxied lane: the browser never gets to send it unless this parent
    // preflight names it, and the fixed list reflects nothing extra.
    expect(allowed).toContain(ENVIRONMENT_AUTHORIZATION_HEADER);
    expect(allowed).toContain(REMOTE_PROJECT_COMMAND_RESULT_HEADER);
    expect(allowed).not.toContain("x-poracode-unlisted-probe");
  });
});

describe("environment child descriptor rewrite", () => {
  it("rewrites the real child descriptor endpoints to the parent proxy prefix", async () => {
    const host = await startParentHost(cleanup);
    const child = await startChildHost(cleanup);
    host.targets.connect("env-1", child.port, { childDesktopId: child.desktopId });

    const response = await host.proxyFetch("env-1", "/.well-known/poracode/environment", {
      headers: { authorization: `Bearer ${child.accessToken}` },
    });
    expect(response.status).toBe(200);
    const descriptor = (await response.json()) as {
      desktopId: string;
      endpoints: { httpBaseUrl: string; wsBaseUrl: string };
    };
    expect(descriptor.desktopId).toBe(child.desktopId);
    expect(descriptor.endpoints.httpBaseUrl).toBe(
      `${httpBaseOf(host)}/api/environments/env-1/proxy/`,
    );
    expect(descriptor.endpoints.wsBaseUrl).toBe(`${wsBaseOf(host)}/api/environments/env-1/proxy/`);
    const serialized = JSON.stringify(descriptor);
    expect(serialized).not.toContain(`:${child.port}`);
  });

  it("fails closed on a child identity change and keeps failing until a new generation", async () => {
    const host = await startParentHost(cleanup);
    const child = await startChildHost(cleanup);
    host.targets.connect("env-1", child.port, { childDesktopId: "impostor-desktop" });

    const response = await host.proxyFetch("env-1", "/.well-known/poracode/environment", {
      headers: { authorization: `Bearer ${child.accessToken}` },
    });
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "environment_identity_changed",
    );

    const again = await host.proxyFetch("env-1", "/api/snapshot", {
      headers: { authorization: `Bearer ${child.accessToken}` },
    });
    expect(again.status).toBe(502);

    host.targets.connect("env-1", child.port, { childDesktopId: child.desktopId });
    const recovered = await host.proxyFetch("env-1", "/.well-known/poracode/environment", {
      headers: { authorization: `Bearer ${child.accessToken}` },
    });
    expect(recovered.status).toBe(200);
  });

  it("bounds descriptor transforms by bytes and time, never leaking the raw descriptor", async () => {
    const tooLarge = await startParentHost(cleanup, { descriptorMaxBytes: 128 });
    const largeUpstream = await startUpstream(
      cleanup,
      (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            desktopId: "child-desktop",
            endpoints: { httpBaseUrl: "http://127.0.0.1:1", wsBaseUrl: "ws://127.0.0.1:1" },
            pad: "a".repeat(4096),
          }),
        );
      },
    );
    tooLarge.targets.connect("env-1", largeUpstream.port);
    const oversized = await tooLarge.proxyFetch("env-1", "/.well-known/poracode/environment");
    expect(oversized.status).toBe(502);
    expect(((await oversized.json()) as { error: { code: string } }).error.code).toBe(
      "environment_descriptor_invalid",
    );

    const stalled = await startParentHost(cleanup, { descriptorTimeoutMs: 50 });
    const stalledUpstream = await startUpstream(
      cleanup,
      (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.write('{"desktopId":"child-desktop","endpoints":');
      },
    );
    stalled.targets.connect("env-1", stalledUpstream.port);
    const timedOut = await stalled.proxyFetch("env-1", "/.well-known/poracode/environment");
    expect(timedOut.status).toBe(502);
    expect(((await timedOut.json()) as { error: { code: string } }).error.code).toBe(
      "environment_descriptor_invalid",
    );
  });
});

describe("environment parent proxy WebSocket", () => {
  it("bridges the child WS with two independent tickets and strips the parent ticket", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startWsUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);
    const parentTicket = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-1",
    });

    let upgradeResponseHeaders: IncomingHttpHeaders | undefined;
    const socket = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=child-ticket&lastSeenSeq=5&parentTicket=${encodeURIComponent(parentTicket.ticket)}`,
      { authorization: "Bearer child-token", origin: httpBaseOf(host) },
    );
    socket.on("upgrade", (response) => {
      upgradeResponseHeaders = response.headers;
    });
    await waitForOpen(socket);
    socket.send("through-both-authorities");
    await expect(waitForMessage(socket)).resolves.toBe("through-both-authorities");

    await vi.waitFor(() => expect(upstream.upgradePaths()).toHaveLength(1));
    const dialed = new URL(upstream.upgradePaths()[0]!, "http://local");
    expect(dialed.pathname).toBe("/ws");
    expect(dialed.searchParams.get("ticket")).toBe("child-ticket");
    expect(dialed.searchParams.get("lastSeenSeq")).toBe("5");
    expect(dialed.searchParams.has("parentTicket")).toBe(false);
    const dialedHeaders = upstream.upgradeHeaders()[0]!;
    expect(dialedHeaders.authorization).toBe("Bearer child-token");
    expect(dialedHeaders[ENVIRONMENT_AUTHORIZATION_HEADER]).toBeUndefined();
    expect(dialedHeaders.origin).toBeUndefined();
    expect(dialedHeaders.host).toBe(`localhost:${upstream.port}`);
    // Child handshake cookies never land on the parent origin.
    expect(upgradeResponseHeaders?.["set-cookie"]).toBeUndefined();
  });

  it("enforces one-use, environment-bound, no-bearer-fallback parent tickets", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startWsUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);
    host.targets.connect("env-2", upstream.port);

    const ticket = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-1",
    });
    const first = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=c&parentTicket=${encodeURIComponent(ticket.ticket)}`,
    );
    await waitForOpen(first);

    const replay = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=c&parentTicket=${encodeURIComponent(ticket.ticket)}`,
    );
    await waitForRejection(replay);

    const bound = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-2",
    });
    const wrongEnvironment = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=c&parentTicket=${encodeURIComponent(bound.ticket)}`,
    );
    await waitForRejection(wrongEnvironment);

    const bearerFallback = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=c&parentTicket=${encodeURIComponent(host.parentAccessToken)}`,
    );
    await waitForRejection(bearerFallback);

    const missing = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=c`,
    );
    await waitForRejection(missing);

    const unknown = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=c&parentTicket=lc_envws_bogus`,
    );
    await waitForRejection(unknown);
    // Only the first legitimate leg ever reached the child.
    expect(upstream.upgradePaths()).toHaveLength(1);
  });

  it("expires parent tickets after their TTL", async () => {
    const host = await startParentHost(cleanup, { webSocketTicketTtlMs: 1 });
    const upstream = await startWsUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);
    const ticket = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const expired = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=c&parentTicket=${encodeURIComponent(ticket.ticket)}`,
    );
    await waitForRejection(expired);
    expect(upstream.upgradePaths()).toHaveLength(0);
  });

  it("closes a live WS leg on parent revocation and on target invalidation, then reconnects on a new generation", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startWsUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);
    // A second session survives the first session's revocation.
    const survivingToken = await exchangeToken(host.server);

    const openLeg = async (parentToken: string) => {
      const ticket = host.gateway.mintWebSocketTicket({
        parentAccessToken: parentToken,
        environmentId: "env-1",
      });
      const socket = openProxyWebSocket(
        host,
        `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=c&parentTicket=${encodeURIComponent(ticket.ticket)}`,
      );
      await waitForOpen(socket);
      return socket;
    };

    const revokedLeg = await openLeg(host.parentAccessToken);
    host.server.revokeAccessSession(sessionIdOf(host.authStore, host.parentAccessToken));
    await waitForClose(revokedLeg);

    host.targets.connect("env-1", upstream.port);
    const invalidatedLeg = await openLeg(survivingToken);
    host.targets.invalidate("env-1");
    await waitForClose(invalidatedLeg);

    host.targets.connect("env-1", upstream.port);
    const reconnectedLeg = await openLeg(survivingToken);
    reconnectedLeg.send("still-alive");
    await expect(waitForMessage(reconnectedLeg)).resolves.toBe("still-alive");
  });

  it("closes the client leg when the child session is revoked", async () => {
    const host = await startParentHost(cleanup);
    const child = await startChildHost(cleanup);
    host.targets.connect("env-1", child.port, { childDesktopId: child.desktopId });

    const minted = await host.proxyFetch("env-1", "/api/auth/websocket-ticket", {
      method: "POST",
      headers: { authorization: `Bearer ${child.accessToken}` },
    });
    const childTicket = ((await minted.json()) as { ticket: string }).ticket;
    const parentTicket = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-1",
    });
    const socket = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=${encodeURIComponent(childTicket)}&parentTicket=${encodeURIComponent(parentTicket.ticket)}`,
    );
    await waitForOpen(socket);

    child.server.revokeAccessSession(sessionIdOf(child.authStore, child.accessToken));
    await waitForClose(socket);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it("carries a real child session through a parent-ticketed upgrade", async () => {
    const host = await startParentHost(cleanup);
    const child = await startChildHost(cleanup);
    host.targets.connect("env-1", child.port, { childDesktopId: child.desktopId });

    const minted = await host.proxyFetch("env-1", "/api/auth/websocket-ticket", {
      method: "POST",
      headers: { authorization: `Bearer ${child.accessToken}` },
    });
    expect(minted.status).toBe(200);
    const childTicket = ((await minted.json()) as { ticket: string }).ticket;
    const parentTicket = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-1",
    });

    const socket = openProxyWebSocket(
      host,
      `ws://127.0.0.1:${host.port}/api/environments/env-1/proxy/ws?ticket=${encodeURIComponent(childTicket)}&parentTicket=${encodeURIComponent(parentTicket.ticket)}`,
    );
    await waitForOpen(socket);

    host.server.revokeAccessSession(sessionIdOf(host.authStore, host.parentAccessToken));
    await waitForClose(socket);
  });
});
