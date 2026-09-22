import { networkInterfaces } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostResourceAdmissionStatus } from "@/shared/hostResourceAdmission";
import { metricsResponseSchema } from "@/shared/remote/contract/routeSchemas";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";
import { detectLanIpv4Address } from "./config";
import { RELAY_LOOPBACK_HOP_HEADER } from "./server/security";
import { relayLoopbackHopSecret } from "./server/relayHopSecret";

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
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

function createServer(
  host = "127.0.0.1",
  overrides: Partial<RemoteAccessServerOptions> = {},
): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-ops-test", label: "Ops Test Desktop" },
    host,
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    tls: null,
    ...overrides,
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

  it("includes the on-demand admission snapshot when the supervisor answers", async () => {
    const status: HostResourceAdmissionStatus = {
      resolution: { kind: "configured" },
      policy: {
        maxActiveAgentSessions: 2,
        maxActiveTerminalShells: 0,
        maxActiveGenerationHelpers: 0,
        overloadRetryAfterMs: 1_000,
      },
      usage: {
        agentSessions: { active: 1, pending: 0, retiring: 0 },
        terminalShells: { active: 0, pending: 0, retiring: 0 },
        generationHelpers: { active: 0, pending: 0, retiring: 0 },
        total: 1,
        refusals: 3,
      },
    };
    const peek = vi.fn<NonNullable<RemoteAccessServerOptions["peekResourceAdmissionStatus"]>>(
      async () => ({ kind: "available", status }),
    );
    const server = createServer("127.0.0.1", { peekResourceAdmissionStatus: peek });
    const info = await server.start();

    const response = await fetch(new URL("/metrics", info.httpBaseUrl));
    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown;
    const parsed = metricsResponseSchema.parse(body);
    // The admission field is the supervisor's logical execution-slot snapshot
    // (with its resolution and effective policy), not an OS/RSS count.
    expect(parsed.hostResourceAdmission).toEqual(status);
    expect(peek).toHaveBeenCalledTimes(1);
  });

  it("omits the admission field for a cold or unknown supervisor instead of faking zeroes", async () => {
    // `supervisor-not-running` is the cold case; `supervisor-error` is what an
    // older supervisor that does not know the internal status procedure
    // produces (the peek degrades instead of inventing zeroes).
    for (const reason of ["supervisor-not-running", "supervisor-error"] as const) {
      const peek = vi.fn<NonNullable<RemoteAccessServerOptions["peekResourceAdmissionStatus"]>>(
        async () => ({ kind: "unavailable", reason }),
      );
      const server = createServer("127.0.0.1", { peekResourceAdmissionStatus: peek });
      const info = await server.start();

      const response = await fetch(new URL("/metrics", info.httpBaseUrl));
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).not.toHaveProperty("hostResourceAdmission");
      expect(metricsResponseSchema.parse(body).hostResourceAdmission).toBeUndefined();
      expect(peek).toHaveBeenCalledTimes(1);
    }
  });

  it("reports an unresolved fail-closed policy distinctly from zero usage", async () => {
    const status: HostResourceAdmissionStatus = {
      resolution: { kind: "unavailable", problem: "host-resource-admission-invalid" },
      policy: {
        maxActiveAgentSessions: 0,
        maxActiveTerminalShells: 0,
        maxActiveGenerationHelpers: 0,
        overloadRetryAfterMs: 1_000,
        refuseNewStarts: "host-resource-admission-invalid",
      },
      usage: {
        agentSessions: { active: 0, pending: 0, retiring: 0 },
        terminalShells: { active: 0, pending: 0, retiring: 0 },
        generationHelpers: { active: 0, pending: 0, retiring: 0 },
        total: 0,
        refusals: 1,
      },
    };
    const server = createServer("127.0.0.1", {
      peekResourceAdmissionStatus: async () => ({ kind: "available", status }),
    });
    const info = await server.start();

    const response = await fetch(new URL("/metrics", info.httpBaseUrl));
    const body = (await response.json()) as { hostResourceAdmission: HostResourceAdmissionStatus };
    expect(body.hostResourceAdmission.resolution).toEqual(status.resolution);
    expect(body.hostResourceAdmission.policy.refuseNewStarts).toBe(
      "host-resource-admission-invalid",
    );
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
    // A.4 refuses plaintext LAN binds unless acknowledged. This case is
    // about the /metrics loopback gate, not TLS, so ack the bind class.
    vi.stubEnv("PORACODE_ALLOW_PLAINTEXT_LAN", "1");
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
      headers: { [RELAY_LOOPBACK_HOP_HEADER]: relayLoopbackHopSecret() },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "metrics_loopback_only" } });
  });

  it("refuses /metrics to a loopback dial from a configured trusted proxy", async () => {
    // A paired REMOTE client behind the configured local reverse proxy also
    // arrives from 127.0.0.1: a socket matching `trustedProxies` is a proxied
    // dial, never a direct local peer (same classifier as the WS
    // desktop-internal gate and the experiment locality gate).
    const server = createServer("127.0.0.1", { trustedProxies: ["127.0.0.1"] });
    const info = await server.start();

    const response = await fetch(new URL("/metrics", info.httpBaseUrl));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "metrics_loopback_only" } });
  });

  it("refuses /metrics when the request carries proxy-forwarding headers", async () => {
    // Covers an UNCONFIGURED local reverse proxy/tunnel: any forwarding header
    // means the dial is proxied, and a genuine local client only downgrades
    // itself by sending one.
    const server = createServer();
    const info = await server.start();
    for (const header of ["x-forwarded-for", "forwarded", "x-real-ip"]) {
      const response = await fetch(new URL("/metrics", info.httpBaseUrl), {
        headers: { [header]: "203.0.113.9" },
      });
      expect(`${header} ${response.status}`).toBe(`${header} 403`);
      expect(await response.json()).toMatchObject({ error: { code: "metrics_loopback_only" } });
    }
  });

  it("still serves /metrics to a plain loopback dial when only other addresses are trusted", async () => {
    // Non-regression: threading trustedProxies into the classifier must not
    // over-refuse a local dial that matches no configured entry.
    const server = createServer("127.0.0.1", { trustedProxies: ["10.0.0.0/8"] });
    const info = await server.start();

    const response = await fetch(new URL("/metrics", info.httpBaseUrl));
    expect(response.status).toBe(200);
  });

  it("honors the environment-configured trusted proxies for the locality gate too", async () => {
    // The standalone server resolves `PORACODE_REMOTE_TRUSTED_PROXIES` into
    // options; the embedded server reads the same env as the fallback, so the
    // locality gates harden identically without an options change.
    vi.stubEnv("PORACODE_REMOTE_TRUSTED_PROXIES", "127.0.0.1");
    const server = createServer();
    const info = await server.start();

    const response = await fetch(new URL("/metrics", info.httpBaseUrl));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "metrics_loopback_only" } });
  });
});
