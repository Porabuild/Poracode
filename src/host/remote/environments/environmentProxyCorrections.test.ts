import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENVIRONMENT_AUTH_AUTHORITY_HEADER,
  ENVIRONMENT_AUTHORIZATION_HEADER,
} from "@/shared/environments";
import {
  rawRequestWithAuthority,
  rawStreamRequestWithAuthority,
  type CleanupRegistry,
} from "../portForward/testFixtures";
import {
  exchangeToken,
  sessionIdOf,
  startParentHost,
  startUpstream,
  type ParentHostHandle,
} from "./environmentProxyTestFixtures";

/**
 * Consolidated C1 proxy corrections (independent review F1–F6). These are
 * regression tests for the exact behaviors the review probes exposed; each
 * one fails on the pre-correction slice and passes after it. Nothing here is
 * imported from the reviewer's scratch probes.
 */

const cleanup: CleanupRegistry = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function parentHeader(token: string): Record<string, string> {
  return { [ENVIRONMENT_AUTHORIZATION_HEADER]: `Bearer ${token}` };
}

function rawProxyRequest(
  host: ParentHostHandle,
  path: string,
  options: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
  } = {},
) {
  return rawRequestWithAuthority({
    port: host.port,
    path,
    authority: `127.0.0.1:${host.port}`,
    ...options,
  });
}

function rawSocketExchange(port: number, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    const chunks: Buffer[] = [];
    socket.on("connect", () => socket.write(payload));
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("close", () => resolve(Buffer.concat(chunks).toString("latin1")));
    socket.on("error", reject);
    setTimeout(() => socket.destroy(), 5_000).unref();
  });
}

describe("F1: proxied control keeps the reserved control class", () => {
  it("admits a proxied Stop while the same principal's bulk is saturated and still sheds a proxied send", async () => {
    const host = await startParentHost(cleanup, {
      serverOptions: { maxConcurrentPrincipalWork: 2, reservedPrincipalControlCapacity: 1 },
    });
    const upstream = await startUpstream(cleanup, (req: IncomingMessage, res: ServerResponse) => {
      if ((req.url ?? "").includes("/interrupt")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("held");
    });
    host.targets.connect("env-1", upstream.port);
    const sessionId = sessionIdOf(host.authStore, host.parentAccessToken);
    const authority = `127.0.0.1:${host.port}`;

    const stalled = await rawStreamRequestWithAuthority({
      port: host.port,
      path: "/api/environments/env-1/proxy/api/stall",
      authority,
      headers: parentHeader(host.parentAccessToken),
    });
    expect(stalled.status).toBe(200);
    await stalled.read();
    await vi.waitFor(() => expect(host.admission.usage(sessionId).work.bulk).toBe(1));

    // The proxied Stop lands through the principal's reserved control slice
    // instead of being refused by the caller's own bulk stream.
    const stop = await rawProxyRequest(
      host,
      "/api/environments/env-1/proxy/api/threads/t1/interrupt",
      {
        method: "POST",
        headers: parentHeader(host.parentAccessToken),
      },
    );
    expect(stop.status).toBe(200);
    expect(upstream.requestCount()).toBe(2);
    await vi.waitFor(() => expect(host.admission.usage(sessionId).work.control).toBe(0));

    // A proxied non-control POST cannot borrow the control slice.
    const send = await rawProxyRequest(host, "/api/environments/env-1/proxy/api/threads/t1/send", {
      method: "POST",
      headers: parentHeader(host.parentAccessToken),
    });
    expect(send.status).toBe(429);
    expect((JSON.parse(await send.text()) as { error: { code: string } }).error.code).toBe(
      "principal_busy",
    );

    await stalled.cancel();
    await vi.waitFor(() => expect(host.admission.usage(sessionId).work.bulk).toBe(0));
  });
});

describe("F2: parentTicket never reaches the child", () => {
  it("strips plain, duplicate, and percent-encoded parentTicket spellings on the HTTP path", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);
    const ticket = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-1",
    });

    const mixed = await host.proxyFetch("env-1", "/api/snapshot", {
      query: `x=1&parentTicket=${encodeURIComponent(ticket.ticket)}&parentTicket=duplicate&%70arentTicket=encoded`,
    });
    expect(mixed.status).toBe(200);
    expect(upstream.lastRequest()?.url).toBe("/api/snapshot?x=1");

    const onlyTicket = await host.proxyFetch("env-1", "/api/snapshot", {
      query: `parentTicket=${encodeURIComponent(ticket.ticket)}`,
    });
    expect(onlyTicket.status).toBe(200);
    expect(upstream.lastRequest()?.url).toBe("/api/snapshot");
  });

  it("strips duplicate and percent-encoded parentTicket spellings from the child WS query", async () => {
    const host = await startParentHost(cleanup);
    let recordedPath = "";
    const rejecting = createServer();
    rejecting.on("upgrade", (req, socket) => {
      recordedPath = req.url ?? "";
      socket.write("HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
      socket.end();
    });
    await new Promise<void>((resolve) => rejecting.listen(0, "127.0.0.1", resolve));
    cleanup.push(async () => {
      rejecting.closeAllConnections();
      await new Promise<void>((resolve) => rejecting.close(() => resolve()));
    });
    host.targets.connect("env-1", (rejecting.address() as AddressInfo).port);
    const ticket = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-1",
    });

    const raw = await rawSocketExchange(
      host.port,
      [
        `GET /api/environments/env-1/proxy/ws?ticket=c&parentTicket=${encodeURIComponent(ticket.ticket)}&parentTicket=dup&%70arentTicket=enc HTTP/1.1`,
        `Host: 127.0.0.1:${host.port}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
        "",
        "",
      ].join("\r\n"),
    );
    expect(raw).toMatch(/HTTP\/1\.1 403/);
    expect(recordedPath).toBe("/ws?ticket=c");
  });
});

describe("F3: encoded control bytes are rejected before any dial", () => {
  it("fails percent-encoded NUL/CRLF/tab/DEL and double-encoded controls with a bounded 400", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);

    const paths = [
      "/api/environments/env-1/proxy/api/%00secret",
      "/api/environments/env-1/proxy/api/%0d%0aX-Injected",
      "/api/environments/env-1/proxy/api/%09tab",
      "/api/environments/env-1/proxy/api/%7fdel",
      "/api/environments/env-1/proxy/api/%2500double",
      "/api/environments/env-1/proxy/api/%250d%250a",
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
});

describe("F4: child redirects are refused, never relayed", () => {
  it("fails a 3xx with a bounded error, drops Location on every status, and passes 304 through", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup, (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? "";
      if (url.includes("absolute")) {
        res.writeHead(302, {
          location: "http://127.0.0.1:45678/login",
          "set-cookie": "child_session=1; Path=/",
        });
        res.end();
        return;
      }
      if (url.includes("relative")) {
        res.writeHead(307, { location: "/login" });
        res.end();
        return;
      }
      if (url.includes("created")) {
        res.writeHead(201, { location: "http://127.0.0.1:45678/new" });
        res.end("{}");
        return;
      }
      res.writeHead(304, { etag: '"v1"' });
      res.end();
    });
    host.targets.connect("env-1", upstream.port);

    const absolute = await host.proxyFetch("env-1", "/api/absolute");
    expect(absolute.status).toBe(502);
    expect(((await absolute.json()) as { error: { code: string } }).error.code).toBe(
      "environment_redirect_unsupported",
    );
    expect(absolute.headers.get("location")).toBeNull();

    const relative = await host.proxyFetch("env-1", "/api/relative");
    expect(relative.status).toBe(502);
    expect(relative.headers.get("location")).toBeNull();

    // A Location on a non-redirect status is still never relayed.
    const created = await host.proxyFetch("env-1", "/api/created");
    expect(created.status).toBe(201);
    expect(created.headers.get("location")).toBeNull();

    // 304 is not a redirect: it streams through untouched.
    const notModified = await host.proxyFetch("env-1", "/api/unchanged", {
      headers: { "if-none-match": '"v1"' },
    });
    expect(notModified.status).toBe(304);
    expect(notModified.headers.get("etag")).toBe('"v1"');
  });
});

describe("F5: the parent CORS decision is authoritative on WS rejections", () => {
  it("drops child access-control-* and cookies from a non-101 upgrade rejection", async () => {
    const host = await startParentHost(cleanup);
    const rejecting = createServer();
    rejecting.on("upgrade", (_req, socket) => {
      socket.write(
        "HTTP/1.1 403 Forbidden\r\n" +
          "access-control-allow-origin: *\r\n" +
          "set-cookie: child_ws=1\r\n" +
          "content-length: 0\r\n" +
          "connection: close\r\n\r\n",
      );
      socket.end();
    });
    await new Promise<void>((resolve) => rejecting.listen(0, "127.0.0.1", resolve));
    cleanup.push(async () => {
      rejecting.closeAllConnections();
      await new Promise<void>((resolve) => rejecting.close(() => resolve()));
    });
    host.targets.connect("env-1", (rejecting.address() as AddressInfo).port);
    const ticket = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-1",
    });

    const raw = await rawSocketExchange(
      host.port,
      [
        `GET /api/environments/env-1/proxy/ws?ticket=c&parentTicket=${encodeURIComponent(ticket.ticket)} HTTP/1.1`,
        `Host: 127.0.0.1:${host.port}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
        "",
        "",
      ].join("\r\n"),
    );
    expect(raw).toMatch(/HTTP\/1\.1 403/);
    expect(raw.toLowerCase()).not.toContain("access-control-");
    expect(raw.toLowerCase()).not.toContain("set-cookie");
  });
});

describe("R1: parent auth-authority marker is trusted, child reserved headers are stripped", () => {
  function httpBase(host: ParentHostHandle): string {
    return host.info.httpBaseUrl.replace(/\/$/, "");
  }

  it("marks only the parent authentication step's own 401/403 pre-dial rejections", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup);
    host.targets.connect("env-1", upstream.port);
    const proxyUrl = `${httpBase(host)}/api/environments/env-1/proxy/api/snapshot`;

    const missing = await fetch(proxyUrl, { headers: { authorization: "Bearer child-token" } });
    expect(missing.status).toBe(401);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      "missing_environment_authorization",
    );
    expect(missing.headers.get(ENVIRONMENT_AUTH_AUTHORITY_HEADER)).toBe("parent");

    const invalid = await fetch(proxyUrl, { headers: parentHeader("not-a-token") });
    expect(invalid.status).toBe(401);
    expect(((await invalid.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_access_token",
    );
    expect(invalid.headers.get(ENVIRONMENT_AUTH_AUTHORITY_HEADER)).toBe("parent");

    const viewerToken = await exchangeToken(host.server, ["session:read"]);
    const viewer = await host.proxyFetch("env-1", "/api/snapshot", { parentToken: viewerToken });
    expect(viewer.status).toBe(403);
    expect(((await viewer.json()) as { error: { code: string } }).error.code).toBe("missing_scope");
    expect(viewer.headers.get(ENVIRONMENT_AUTH_AUTHORITY_HEADER)).toBe("parent");
    expect(upstream.requestCount()).toBe(0);

    // CORS and Host rejections precede authentication and are not
    // authorization decisions: neither carries the marker.
    const foreignOrigin = await host.proxyFetch("env-1", "/api/snapshot", {
      headers: { origin: "https://evil.example" },
    });
    expect(foreignOrigin.status).toBe(403);
    expect(foreignOrigin.headers.get(ENVIRONMENT_AUTH_AUTHORITY_HEADER)).toBeNull();

    const foreignHost = await rawRequestWithAuthority({
      port: host.port,
      path: "/api/environments/env-1/proxy/api/snapshot",
      authority: "evil.example",
      headers: parentHeader(host.parentAccessToken),
    });
    expect(foreignHost.status).toBe(403);
    expect(foreignHost.headers[ENVIRONMENT_AUTH_AUTHORITY_HEADER]).toBeUndefined();
  });

  it("never relays a child-set marker or any reserved namespace response header", async () => {
    const host = await startParentHost(cleanup);
    const spoofed401 = await startUpstream(
      cleanup,
      (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(401, {
          "content-type": "application/json",
          [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent",
          "x-poracode-environment-spoof": "1",
        });
        res.end("{}");
      },
    );
    host.targets.connect("env-1", spoofed401.port);
    const child401 = await host.proxyFetch("env-1", "/api/snapshot");
    expect(child401.status).toBe(401);
    expect(child401.headers.get(ENVIRONMENT_AUTH_AUTHORITY_HEADER)).toBeNull();
    expect(child401.headers.get("x-poracode-environment-spoof")).toBeNull();

    const spoofed200 = await startUpstream(
      cleanup,
      (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, {
          "content-type": "application/json",
          [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent",
          "x-poracode-environment-spoof": "1",
        });
        res.end("{}");
      },
    );
    host.targets.connect("env-2", spoofed200.port);
    const child200 = await host.proxyFetch("env-2", "/api/snapshot");
    expect(child200.status).toBe(200);
    expect(child200.headers.get(ENVIRONMENT_AUTH_AUTHORITY_HEADER)).toBeNull();
    expect(child200.headers.get("x-poracode-environment-spoof")).toBeNull();
  });

  it("strips the reserved namespace from child upgrade responses", async () => {
    const host = await startParentHost(cleanup);
    const rejecting = createServer();
    rejecting.on("upgrade", (_req, socket) => {
      socket.write(
        "HTTP/1.1 403 Forbidden\r\n" +
          `${ENVIRONMENT_AUTH_AUTHORITY_HEADER}: parent\r\n` +
          "x-poracode-environment-spoof: 1\r\n" +
          "content-length: 0\r\n" +
          "connection: close\r\n\r\n",
      );
      socket.end();
    });
    await new Promise<void>((resolve) => rejecting.listen(0, "127.0.0.1", resolve));
    cleanup.push(async () => {
      rejecting.closeAllConnections();
      await new Promise<void>((resolve) => rejecting.close(() => resolve()));
    });
    host.targets.connect("env-1", (rejecting.address() as AddressInfo).port);
    const ticket = host.gateway.mintWebSocketTicket({
      parentAccessToken: host.parentAccessToken,
      environmentId: "env-1",
    });

    const raw = await rawSocketExchange(
      host.port,
      [
        `GET /api/environments/env-1/proxy/ws?ticket=c&parentTicket=${encodeURIComponent(ticket.ticket)} HTTP/1.1`,
        `Host: 127.0.0.1:${host.port}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
        "",
        "",
      ].join("\r\n"),
    );
    expect(raw).toMatch(/HTTP\/1\.1 403/);
    expect(raw.toLowerCase()).not.toContain("x-poracode-environment-");
  });
});

describe("F6: descriptor path variants are truthful", () => {
  it("rewrites the descriptor through one trailing-slash alias instead of leaking raw endpoints", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup, (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          desktopId: "child-desktop",
          endpoints: {
            httpBaseUrl: `http://127.0.0.1:${rawPort}`,
            wsBaseUrl: `ws://127.0.0.1:${rawPort}`,
          },
        }),
      );
    });
    const rawPort = upstream.port;
    host.targets.connect("env-1", upstream.port);

    const trailing = await host.proxyFetch("env-1", "/.well-known/poracode/environment/");
    expect(trailing.status).toBe(200);
    const descriptor = (await trailing.json()) as {
      endpoints: { httpBaseUrl: string; wsBaseUrl: string };
    };
    expect(descriptor.endpoints.httpBaseUrl).toBe(
      `${host.info.httpBaseUrl.replace(/\/$/, "")}/api/environments/env-1/proxy/`,
    );
    expect(JSON.stringify(descriptor)).not.toContain(`127.0.0.1:${rawPort}`);

    const canonical = await host.proxyFetch("env-1", "/.well-known/poracode/environment");
    expect(canonical.status).toBe(200);
    expect(
      ((await canonical.json()) as { endpoints: { httpBaseUrl: string } }).endpoints.httpBaseUrl,
    ).toContain("/api/environments/env-1/proxy/");
  });

  it("answers HEAD on the canonical descriptor path with a bounded 405 before dialing", async () => {
    const host = await startParentHost(cleanup);
    const upstream = await startUpstream(cleanup, (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    host.targets.connect("env-1", upstream.port);

    for (const path of [
      "/api/environments/env-1/proxy/.well-known/poracode/environment",
      "/api/environments/env-1/proxy/.well-known/poracode/environment/",
    ]) {
      const head = await rawProxyRequest(host, path, {
        method: "HEAD",
        headers: parentHeader(host.parentAccessToken),
      });
      expect(head.status).toBe(405);
      expect(head.headers.allow).toBe("GET");
    }
    expect(upstream.requestCount()).toBe(0);
  });
});
