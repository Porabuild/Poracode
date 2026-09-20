import { networkInterfaces } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { metricsResponseSchema } from "@/shared/remote/contract/routeSchemas";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";
import { detectLanIpv4Address } from "./config";

/**
 * Operability routes (V5 plan item 4.9 rider): `/healthz` answers a fixed
 * literal with no authentication and discloses nothing about the host, and
 * `/metrics` serves the minimal snapshot to loopback peers only.
 */

vi.mock("./db", () => ({
  dbGetThreadRuntimeItem: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetThreads: vi.fn<(...args: unknown[]) => unknown[]>(() => []),
  dbGetThread: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetProject: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetState: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbSetState: vi.fn<(...args: unknown[]) => void>(),
}));

const servers: RemoteAccessServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

function createServer(host = "127.0.0.1"): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-ops-test", label: "Ops Test Desktop" },
    host,
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    tls: null,
  });
  servers.push(server);
  return server;
}

describe("RemoteAccessServer operability routes (item 4.9 rider)", () => {
  it("answers /healthz without any credential and discloses nothing but ok", async () => {
    const server = createServer();
    const info = await server.start();

    const response = await fetch(new URL("/healthz", info.httpBaseUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true });

    // A degraded/authenticated request shape is identical: no version, no
    // desktopId, no bind exposure — the S8 version-disclosure problem stays
    // fixed on this endpoint.
    const withBearer = await fetch(new URL("/healthz", info.httpBaseUrl), {
      headers: { authorization: "Bearer lc_access_bogus" },
    });
    expect(await withBearer.json()).toEqual({ ok: true });
  });

  it("serves /metrics to a loopback peer without a credential", async () => {
    const server = createServer();
    const info = await server.start();

    const response = await fetch(new URL("/metrics", info.httpBaseUrl));
    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown;
    // The wire shape is the registry contract, not an ad-hoc snapshot.
    expect(metricsResponseSchema.parse(body)).toMatchObject({
      remote: { activeWebSocketClients: 0 },
    });
    expect(
      (body as { remote: { lastEventSeq: number } }).remote.lastEventSeq,
    ).toBeGreaterThanOrEqual(0);
  });

  it("refuses /metrics from a non-loopback peer", async () => {
    // Bind the listener to the machine's LAN interface, then dial it from this
    // same host: the kernel sources the connection from the LAN address, so
    // the handler's socket check sees a non-loopback peer.
    const lanAddress =
      detectLanIpv4Address(networkInterfaces()) ??
      Object.values(networkInterfaces())
        .flat()
        .find((entry) => entry && !entry.internal && entry.family === "IPv4")?.address;
    if (!lanAddress) {
      // No routable interface (hermetic CI): the loopback gate's refusal path
      // is covered by the handler contract test instead.
      return;
    }
    const server = createServer(lanAddress);
    const info = await server.start();

    const response = await fetch(new URL("/metrics", info.httpBaseUrl));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "metrics_loopback_only" } });

    // The same unauthenticated surface stays open where it must be: /healthz
    // answers regardless of peer address (load balancers are not loopback).
    const health = await fetch(new URL("/healthz", info.httpBaseUrl));
    expect(health.status).toBe(200);
  });

  it("refuses /metrics to a relay-proxied loopback dial (the hop marker)", async () => {
    const server = createServer();
    const info = await server.start();
    // A direct loopback fetch whose request carries the relay adapter's hop
    // marker — the shape relayHost's local dial produces for a REMOTE visitor.
    // The socket address alone would pass the old gate.
    const response = await fetch(new URL("/metrics", info.httpBaseUrl), {
      headers: { "x-poracode-relay-hop": "1" },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "metrics_loopback_only" } });
  });
});
