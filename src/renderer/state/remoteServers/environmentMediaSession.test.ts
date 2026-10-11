import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "@/shared/remote/client";
import {
  __resetEnvironmentSessionDependenciesForTest,
  __resetEnvironmentSessionsForTest,
  configureEnvironmentSessions,
  environmentProxyEndpoint,
  environmentSessionForServer,
} from "./environmentSessions";
import { __resetRefreshTokensForTest } from "./refreshTokens";
import type { RemoteServerRecord, RemoteServersState } from "./types";

// Exercise the default environment client over owned HTTP sockets, without Electron.
vi.mock("./mainProcessFetch", () => ({ mainProcessFetch: globalThis.fetch }));
const environmentId = "80608060-8060-4806-8806-806080608060";
const childTicket = `pc_media_${"c".repeat(43)}`;
const parentTicket = `pc_media_${"p".repeat(43)}`;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  __resetEnvironmentSessionsForTest();
  __resetEnvironmentSessionDependenciesForTest();
  __resetRefreshTokensForTest();
  for (const close of cleanups.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});

async function fixture() {
  const calls: string[] = [];
  let childExpiry = 0;
  let parentExpiry = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://fixture");
    const path = url.pathname;
    const child = path.includes("/proxy/") || path.startsWith("/api/files/");
    const environment = path.includes("/environments/");
    calls.push(`${req.method} ${path}`);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (path.endsWith("/media")) {
      if (childExpiry <= Date.now() || (environment && parentExpiry <= Date.now())) {
        json(401, { error: "Expired or released media.", code: "invalid_media_ticket" });
        return;
      }
      res.writeHead(206, { "content-range": "bytes 3-6/10", "content-length": "4" });
      res.end("3456");
      return;
    }
    if (
      req.headers.authorization !== `Bearer ${child ? "child-access" : "parent-access"}` ||
      (environment &&
        child &&
        req.headers["x-poracode-environment-authorization"] !== "Bearer parent-access")
    ) {
      json(401, { error: "Wrong issuer.", code: "invalid_access_token" });
      return;
    }
    if (path.endsWith("/media-release")) {
      if (child) childExpiry = 0;
      else parentExpiry = 0;
      json(200, { ok: true });
      return;
    }
    if (path.endsWith("/media-renew") && (child ? childExpiry : parentExpiry) <= Date.now()) {
      json(401, { error: "Expired or released media.", code: "invalid_media_ticket" });
      return;
    }
    if (child) childExpiry = Date.now() + 120_000;
    else parentExpiry = Math.min(Date.now() + 120_000, childExpiry);
    json(200, {
      ticket: child ? childTicket : parentTicket,
      expiresAt: new Date(child ? childExpiry : parentExpiry).toISOString(),
      ...(child && path.endsWith("/media-ticket")
        ? { sizeBytes: 10, modifiedAtMs: 1, contentType: "video/mp4" }
        : {}),
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const parent: RemoteServerRecord = {
    connectionId: "parent",
    desktopId: "parent-host",
    label: "Parent",
    endpoint,
    accessToken: "parent-access",
    scopes: ["session:read"],
    transport: { kind: "direct" },
  };
  const child: RemoteServerRecord = {
    connectionId: "child",
    desktopId: "child-host",
    label: "Child",
    // A legacy/raw record is normalized by ordinary reconnect. Only the canonical
    // parent endpoint + environment ID is ever used to construct the transport.
    endpoint: `${endpoint}api/environments/${environmentId}/proxy`,
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      parentConnectionId: "parent",
      environmentId,
      childDesktopId: "child-host",
    },
  };
  const state = { servers: [parent, child] } as unknown as RemoteServersState;
  configureEnvironmentSessions({
    getState: () => state,
    clientFactory: () => (url, token) => new RemoteDesktopClient(url, token),
    certPinForConnection: () => undefined,
    refreshTokenForSubject: () => undefined,
    rememberRefreshToken: () => {},
    writeRefreshTokenToVault: async () => true,
    deleteRefreshTokenFromVault: async () => {},
  });
  return { calls, endpoint, parent, child, state };
}
const file = {
  access: "project" as const,
  projectLocation: { kind: "posix" as const, path: "/fixture" },
  path: "clip.mp4",
};

describe("mounted media issuing-client lifetime", () => {
  it.each(["direct", "environment"] as const)(
    "keeps %s grants through reconnect normalization after renewal and beyond 147s/180s",
    async (kind) => {
      const f = await fixture();
      const now = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(now);
      const issuer =
        kind === "environment"
          ? environmentSessionForServer(f.child)!.client
          : new RemoteDesktopClient(f.endpoint, "child-access");
      const source = await issuer.createMediaSource(file);
      const originalUrl = source.url;
      clock.mockReturnValue(now + 90_000);
      await issuer.renewMediaSource(source.ticket);
      clock.mockReturnValue(now + 93_000);
      let normalizedIssuer = issuer;
      let staleSnapshotIssuer = issuer;
      if (kind === "environment") {
        const normalized = {
          ...f.child,
          endpoint: environmentProxyEndpoint(f.endpoint, environmentId),
        };
        f.state.servers = [f.parent, normalized];
        normalizedIssuer = environmentSessionForServer(normalized)!.client;
        // An older async reconnect/socket snapshot must not undo canonical identity.
        staleSnapshotIssuer = environmentSessionForServer(f.child)!.client;
      }
      expect(normalizedIssuer).toBe(issuer);
      expect(staleSnapshotIssuer).toBe(issuer);
      expect(f.calls.filter((call) => call.endsWith("/media-release"))).toEqual([]);
      for (const elapsed of [147_000, 180_000, 220_000]) {
        clock.mockReturnValue(now + elapsed);
        if (elapsed === 180_000) await issuer.renewMediaSource(source.ticket);
        const range = await fetch(originalUrl, { headers: { range: "bytes=3-6" } });
        expect(range.status).toBe(206);
        expect(await range.text()).toBe("3456");
        expect(source.url).toBe(originalUrl);
      }
      await issuer.releaseMediaSource(source.ticket);
      expect((await fetch(originalUrl)).status).toBe(401);
      await expect(issuer.renewMediaSource(source.ticket)).rejects.toMatchObject({
        status: kind === "environment" ? 499 : 401,
      });
    },
  );

  it.each(["environment", "child-bearer", "child-identity", "parent-ref"] as const)(
    "retires the issuer on a genuine %s change even if the stored endpoint hint is unchanged",
    async (change) => {
      const f = await fixture();
      const issuer = environmentSessionForServer(f.child)!.client;
      const source = await issuer.createMediaSource(file);
      const transport = f.child.transport!;
      if (transport.kind !== "environment") throw new Error("Expected environment fixture.");
      const replacement = {
        ...f.child,
        ...(change === "child-bearer" ? { accessToken: "repaired-child" } : {}),
        transport: {
          ...transport,
          ...(change === "environment"
            ? { environmentId: "80608060-8060-4806-8806-806080608061" }
            : {}),
          ...(change === "child-identity" ? { childDesktopId: "replacement-child" } : {}),
          ...(change === "parent-ref" ? { parentConnectionId: "replacement-parent" } : {}),
        },
      };
      f.state.servers = [
        f.parent,
        ...(change === "parent-ref" ? [{ ...f.parent, connectionId: "replacement-parent" }] : []),
        replacement,
      ];
      expect(environmentSessionForServer(replacement)!.client).not.toBe(issuer);
      await vi.waitFor(() =>
        expect(f.calls.filter((call) => call.endsWith("/media-release"))).toHaveLength(2),
      );
      await expect(issuer.renewMediaSource(source.ticket)).rejects.toMatchObject({
        status: 499,
        code: "cancelled",
      });
      expect((await fetch(source.url)).status).toBe(401);
    },
  );

  it("still releases both grants and refuses renewal when the real parent endpoint changes", async () => {
    const f = await fixture();
    const issuer = environmentSessionForServer(f.child)!.client;
    const source = await issuer.createMediaSource(file);
    f.state.servers = [{ ...f.parent, endpoint: `${f.endpoint}replacement/` }, f.child];
    expect(environmentSessionForServer(f.child)!.client).not.toBe(issuer);
    await vi.waitFor(() =>
      expect(f.calls.filter((call) => call.endsWith("/media-release"))).toHaveLength(2),
    );
    await expect(issuer.renewMediaSource(source.ticket)).rejects.toMatchObject({
      status: 499,
      code: "cancelled",
    });
    expect((await fetch(source.url)).status).toBe(401);
  });
});
