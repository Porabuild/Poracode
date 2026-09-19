import { createServer as createHttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { RemoteAuthStore } from "@/main/remote/auth";
import { RemoteAccessServer } from "@/main/remote/RemoteAccessServer";
import {
  deriveRelayChannelBindingKey,
  isRelayBoundCredential,
  makeRelayChannelBinding,
  RELAY_BOUND_TOKEN_PREFIX,
} from "./relayChannelBinding";
import { startRelayHost, type RelayHostHandle } from "./relayHost";
import { RelayServer, type RelayServerInfo } from "./relayServer";

describe("relay channel binding credentials", () => {
  it("derives a stable per-enrollment key that varies with the enrollment", () => {
    const first = deriveRelayChannelBindingKey("srv-1", "secret-a");
    expect(Buffer.from(deriveRelayChannelBindingKey("srv-1", "secret-a"))).toEqual(first);
    expect(deriveRelayChannelBindingKey("srv-2", "secret-a")).not.toEqual(first);
    expect(deriveRelayChannelBindingKey("srv-1", "secret-b")).not.toEqual(first);
    expect(first).toHaveLength(32);
  });

  it("round-trips a raw access token through bind/unbind", () => {
    const binding = makeRelayChannelBinding({ serverId: "srv-1", relaySecret: "secret-a" });
    const raw = "lc_access_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const bound = binding.bind(raw);
    expect(bound.startsWith(RELAY_BOUND_TOKEN_PREFIX)).toBe(true);
    expect(bound).not.toContain(raw);
    expect(binding.unbind(bound)).toBe(raw);
    // Randomized IV: two bindings of the same token differ but both unbind.
    expect(binding.bind(raw)).not.toBe(bound);
  });

  it("rejects foreign enrollments, tampering, and malformed payloads", () => {
    const binding = makeRelayChannelBinding({ serverId: "srv-1", relaySecret: "secret-a" });
    const other = makeRelayChannelBinding({ serverId: "srv-1", relaySecret: "secret-b" });
    const bound = binding.bind("lc_access_token");
    expect(other.unbind(bound)).toBeNull();

    const payload = bound.slice(RELAY_BOUND_TOKEN_PREFIX.length);
    const bytes = Buffer.from(payload, "base64url");
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff; // broken GCM tag
    expect(binding.unbind(`${RELAY_BOUND_TOKEN_PREFIX}${bytes.toString("base64url")}`)).toBeNull();

    expect(binding.unbind("lc_access_raw")).toBeNull();
    expect(binding.unbind(`${RELAY_BOUND_TOKEN_PREFIX}not-base64!!`)).toBeNull();
    expect(binding.unbind(RELAY_BOUND_TOKEN_PREFIX)).toBeNull();
    expect(isRelayBoundCredential(bound)).toBe(true);
    expect(isRelayBoundCredential("lc_access_raw")).toBe(false);
  });
});

/**
 * End-to-end channel binding over real localhost sockets: a RemoteAccessServer
 * on loopback, a RelayServer, and the relay host adapter bridging them. Proves
 * the acceptance property of plan item 4.8 — a bearer issued through the relay
 * is a bound credential the direct HTTP path rejects (off-relay replay fails),
 * while the same credential keeps working through its relay channel.
 */
describe("relay channel binding end-to-end", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  interface Stack {
    readonly relayBase: string;
    readonly directBase: string;
    readonly pairing: { readonly credential: string };
    readonly mintPairing: () => { readonly credential: string };
    readonly authStore: RemoteAuthStore;
  }

  async function startStack(serverId: string): Promise<Stack> {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo: RelayServerInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const authStore = new RemoteAuthStore();
    const pairing = authStore.issuePairingCredential({});
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "9.9.9",
      identity: { desktopId: serverId, label: "Binding Test Server" },
      authStore,
      host: "127.0.0.1",
      advertisedHost: "127.0.0.1",
      port: 0,
      callSupervisor: (async () => ({})) as never,
    });
    const serverInfo = await server.start();
    cleanups.push(() => server.dispose());
    let handle: RelayHostHandle | null = null;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("relay registration timed out")), 5_000);
      handle = startRelayHost({
        relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
        serverId,
        secret: `binding-${serverId}`,
        localHttpUrl: serverInfo.httpBaseUrl,
        onRegistered: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
    cleanups.push(() => handle?.dispose());
    return {
      relayBase: `http://127.0.0.1:${relayInfo.port}/s/${encodeURIComponent(serverId)}`,
      directBase: serverInfo.httpBaseUrl,
      pairing,
      mintPairing: () => authStore.issuePairingCredential({}),
      authStore,
    };
  }

  async function exchangeCredential(
    endpoint: string,
    credential: string,
  ): Promise<{ readonly accessToken: string }> {
    const response = await fetch(`${endpoint.replace(/\/+$/, "")}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential, scopes: ["session:read"] }),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { accessToken: string };
  }

  /** POST /api/auth/websocket-ticket: a bearer-authed route the stubbed
   * server serves fully, so it isolates exactly the credential question. */
  function ticketRequest(endpoint: string, bearer: string): Promise<Response> {
    return fetch(`${endpoint.replace(/\/+$/, "")}/api/auth/websocket-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}` },
    });
  }

  it("binds relay-issued tokens so the direct path rejects off-relay replay", async () => {
    const stack = await startStack("binding-e2e");

    // Exchange THROUGH the relay: the issued credential is bound, and the raw
    // token never crosses the relay link.
    const relayIssued = await exchangeCredential(stack.relayBase, stack.pairing.credential);
    expect(relayIssued.accessToken.startsWith(RELAY_BOUND_TOKEN_PREFIX)).toBe(true);

    // The server-side auth store (the direct path's own validator) rejects the
    // bound credential: it is not a stored token.
    expect(() =>
      stack.authStore.authenticateBearerToken(relayIssued.accessToken, ["session:read"]),
    ).toThrow(/Invalid access token/u);

    // Direct HTTP replay of the relay-issued bearer fails.
    const directReplay = await ticketRequest(stack.directBase, relayIssued.accessToken);
    expect(directReplay.status).toBe(401);

    // The same credential through its relay channel is accepted and the
    // server answers with its own short-lived WebSocket ticket.
    const throughRelay = await ticketRequest(stack.relayBase, relayIssued.accessToken);
    expect(throughRelay.status).toBe(200);
    const body = (await throughRelay.json()) as { ticket?: string };
    expect(body.ticket).toMatch(/^lc_ws_/);
  });

  it("keeps direct-paired raw tokens working on both paths", async () => {
    const stack = await startStack("binding-direct");

    // Exchange DIRECTLY at the server (no relay hop): the raw token is issued
    // and honored directly.
    const directIssued = await exchangeCredential(stack.directBase, stack.pairing.credential);
    expect(directIssued.accessToken.startsWith("lc_access_")).toBe(true);
    expect((await ticketRequest(stack.directBase, directIssued.accessToken)).status).toBe(200);

    // A directly-paired client can still present the raw token THROUGH the
    // relay (pass-through compatibility); it just never gets bound, because
    // binding happens only at relay-mediated issuance.
    expect((await ticketRequest(stack.relayBase, directIssued.accessToken)).status).toBe(200);
  });
});

/**
 * Focused adapter-level round trip against a bare local HTTP origin: the
 * bound credential is unwrapped on BOTH carrying forms (Authorization header
 * and the image-route `access_token` query parameter), and the exchange
 * response is rewritten to the bound form before it is framed to the relay.
 */
describe("relay channel binding adapter rewrite", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function startStack(): Promise<{
    readonly relayBase: string;
    readonly seen: () => Array<{ path: string; authorization: string | undefined }>;
  }> {
    const seen: Array<{ path: string; authorization: string | undefined }> = [];
    const local = createHttpServer((request, response) => {
      seen.push({
        path: request.url ?? "/",
        authorization: request.headers.authorization,
      });
      response.setHeader("content-type", "application/json");
      if (
        request.method === "POST" &&
        new URL(request.url ?? "/", "http://local").pathname === "/oauth/token"
      ) {
        response.end(
          JSON.stringify({
            accessToken: "lc_access_RAW-from-local-origin",
            tokenType: "Bearer",
            expiresAt: "2030-01-01T00:00:00.000Z",
            scopes: ["session:read"],
          }),
        );
        return;
      }
      response.end("{}");
    });
    await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => {
      local.close();
    });
    const localPort = (local.address() as AddressInfo).port;

    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    let handle: RelayHostHandle | null = null;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("relay registration timed out")), 5_000);
      handle = startRelayHost({
        relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
        serverId: "rewrite-e2e",
        secret: "rewrite-secret",
        localHttpUrl: `http://127.0.0.1:${localPort}`,
        onRegistered: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
    cleanups.push(() => handle?.dispose());
    return {
      relayBase: `http://127.0.0.1:${relayInfo.port}/s/rewrite-e2e`,
      seen: () => seen,
    };
  }

  it("unwraps bound credentials and binds the exchange response", async () => {
    const binding = makeRelayChannelBinding({
      serverId: "rewrite-e2e",
      relaySecret: "rewrite-secret",
    });
    const bound = binding.bind("lc_access_RAW-secret");
    const stack = await startStack();
    const base = stack.relayBase;

    const exchange = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential: "lc_pair_c" }),
    });
    expect(exchange.status).toBe(200);
    const issued = (await exchange.json()) as { accessToken: string };
    expect(issued.accessToken.startsWith(RELAY_BOUND_TOKEN_PREFIX)).toBe(true);
    expect(binding.unbind(issued.accessToken)).toBe("lc_access_RAW-from-local-origin");

    await fetch(`${base}/api/snapshot`, {
      headers: { authorization: `Bearer ${bound}` },
    });
    await fetch(
      `${base}/api/files/image?path=%2Ftmp%2Fx.png&access_token=${encodeURIComponent(bound)}`,
    );

    const requests = stack.seen();
    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatchObject({ path: "/oauth/token" });
    expect(requests[1]).toEqual({
      path: "/api/snapshot",
      authorization: "Bearer lc_access_RAW-secret",
    });
    expect(requests[2]!.path.startsWith("/api/files/image?path=%2Ftmp%2Fx.png&access_token=")).toBe(
      true,
    );
    expect(requests[2]!.path).not.toContain(RELAY_BOUND_TOKEN_PREFIX);
    const query = new URL(`http://local${requests[2]!.path}`).searchParams.get("access_token");
    expect(query).toBe("lc_access_RAW-secret");
    expect(
      requests.every((entry) => !entry.authorization?.includes(RELAY_BOUND_TOKEN_PREFIX)),
    ).toBe(true);
  });
});
