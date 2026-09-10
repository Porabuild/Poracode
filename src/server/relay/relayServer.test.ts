import { PORACODE_RELAY_PROTOCOL_VERSION } from "@/shared/remote/relayProtocol";
import {
  createServer as createHttpServer,
  request as httpRequestNode,
  type IncomingHttpHeaders,
  type Server as HttpServer,
} from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteAccessServer, RemoteAuthStore, RemotePortForwardGateway } from "@/main/remote";
import { deriveForwardOwner, ForwardOriginPolicy } from "@/main/remote/portForward/forwardOrigin";
import {
  FORWARD_ORIGIN_EXCHANGE_PATH,
  FORWARD_ORIGIN_SESSION_COOKIE_NAME,
  PortProxy,
} from "@/main/remote/portForward/portProxy";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { RelayServer, relayVisitorClientId, type RelayServerInfo } from "./relayServer";
import { startRelayHost, type RelayHostHandle } from "./relayHost";

/**
 * The configured browser-forward base origin shared by the relay and every
 * port-forward host fixture: child origins look like
 * `f-<owner>-<forward>.apps.example.test`. There is no DNS or TLS for it in
 * this suite — child-origin requests are driven against the relay's real
 * loopback listener with explicit `Host:` overrides (see the port-forward
 * describe's fixture-honesty note).
 */
const FORWARD_ORIGIN_BASE_URL = "https://apps.example.test";

/**
 * End-to-end relay round-trip over real localhost sockets: a RemoteAccessServer
 * bound to loopback, a RelayServer, and a relayHost bridging the two. Proves
 * that a device pointed at `<relay>/s/<id>/` reaches the server's HTTP control
 * plane (incl. the auth handshake) and its WebSocket event stream — with no
 * changes to RemoteAccessServer.
 */
describe("relay end-to-end", () => {
  const cleanups: Array<() => void | Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function openRawHost(relayPort: number, serverId: string): Promise<WebSocket> {
    const control = new WebSocket(`ws://127.0.0.1:${relayPort}/host`);
    cleanups.push(() => control.close());
    await new Promise<void>((resolve, reject) => {
      control.once("open", resolve);
      control.once("error", reject);
    });
    control.send(
      JSON.stringify({
        t: "register",
        protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
        serverId,
        secret: "raw-secret",
      }),
    );
    const registered = await readRawHostFrame(control);
    expect(registered).toMatchObject({ t: "registered", serverId });
    return control;
  }

  async function readRawHostFrame(control: WebSocket): Promise<unknown> {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for host frame")), 5000);
      control.once("message", (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(String(data)) as unknown);
      });
      control.once("error", reject);
    });
  }

  async function waitRelaySocketClose(
    socket: WebSocket,
  ): Promise<{ code: number; reason: string }> {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for close")), 5000);
      socket.once("close", (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  it.each(["relay.example.test", "ftp://relay.example.test"])(
    "rejects invalid public base URL %s before listening",
    (publicBaseUrl) => {
      expect(() => new RelayServer({ host: "127.0.0.1", port: 0, publicBaseUrl })).toThrow(
        /absolute http\(s\) URL/,
      );
    },
  );

  it("normalizes public base URLs used for registered server endpoints", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      publicBaseUrl: "https://relay.example.test/root/?ignored=1#fragment",
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());

    expect(relayInfo.url).toBe("https://relay.example.test/root");
    expect(relay.publicUrlFor("srv-1")).toBe("https://relay.example.test/root/s/srv-1/");
  });

  it("waits for the listener to close on dispose", async () => {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();

    await relay.dispose();

    const replacement = new RelayServer({ host: "127.0.0.1", port: relayInfo.port });
    const replacementInfo = await replacement.start();
    cleanups.push(() => replacement.dispose());
    expect(replacementInfo.port).toBe(relayInfo.port);
  });

  it("closes host control sockets that exceed the inbound websocket payload limit", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      maxWebSocketPayloadBytes: 128,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const control = await openRawHost(relayInfo.port, "s");

    control.send("x".repeat(512));

    await expect(waitRelaySocketClose(control)).resolves.toMatchObject({ code: 1009 });
  });

  /**
   * Registers a raw host that records every relay frame it receives and
   * auto-acks `req` frames with an empty 200, so visitor HTTP round-trips
   * complete without a timeout. The recorded frames let tests assert on what
   * the relay actually puts on the wire (e.g. the per-visitor `clientId`).
   */
  async function recordRawHost(
    relayPort: number,
    serverId: string,
  ): Promise<{
    control: WebSocket;
    frames: Array<Record<string, unknown>>;
  }> {
    const control = await openRawHost(relayPort, serverId);
    const frames: Array<Record<string, unknown>> = [];
    control.on("message", (data) => {
      const parsed = JSON.parse(String(data)) as Record<string, unknown>;
      frames.push(parsed);
      if (parsed.t === "req") {
        control.send(
          JSON.stringify({ t: "res", id: parsed.id, status: 200, headers: {}, body: "" }),
        );
      }
    });
    return { control, frames };
  }

  /** Dedicated 32-byte base64url namespace credential (43 chars), used for
   * both forward origin secrets and per-server dispatch keys — mirroring the
   * composition roots, and never the relay registration secret. */
  const randomOriginSecret = (): string => randomBytes(32).toString("base64url");

  async function startRelay(): Promise<RelayServerInfo> {
    // The forward base arms child-origin dispatch on the relay; plain
    // `/s/<id>` API traffic (everything else in this suite) is unaffected.
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      forwardBaseUrl: FORWARD_ORIGIN_BASE_URL,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    return relayInfo;
  }

  /**
   * Starts a real `RemoteAccessServer` (optionally with a port-forward gateway
   * wired up, mirroring the composition roots' isolated-origin setup) and
   * bridges it to an already-running relay via `startRelayHost`. Multiple
   * hosts can register onto the same `relayInfo` for multi-tenant tests.
   *
   * With `withPortForward`, the host gets a dedicated 32-byte base64url origin
   * secret and its own per-server dispatch key. `deriveForwardOwner(secret,
   * serverId)` + the base URL form the host's `ForwardOriginIdentity`, passed
   * to BOTH `PortProxy` and `RemoteAccessServer`, and the same secret/key go
   * to `startRelayHost` so the relay derives the identical owner on
   * registration. The direct namespace differs from the relay namespace; only
   * the adapter's authenticated API marker selects the relay entry origin.
   */
  async function registerHost(
    relayInfo: RelayServerInfo,
    serverId: string,
    options: { readonly withPortForward?: boolean; readonly withForwardOrigin?: boolean } = {},
  ) {
    const withForwardOrigin =
      options.withPortForward === true && options.withForwardOrigin !== false;
    const authStore = new RemoteAuthStore();
    const pairing = authStore.issuePairingCredential({});
    const portForward = options.withPortForward
      ? new RemotePortForwardGateway({ bindHost: "127.0.0.1" })
      : undefined;
    const forwardOriginSecret = withForwardOrigin ? randomOriginSecret() : undefined;
    const forwardDispatchKey = withForwardOrigin ? randomOriginSecret() : undefined;
    const forwardOrigin =
      forwardOriginSecret && forwardDispatchKey
        ? {
            baseUrl: FORWARD_ORIGIN_BASE_URL,
            ownerId: deriveForwardOwner(forwardOriginSecret, serverId),
          }
        : undefined;
    const directOrigin = forwardOrigin
      ? { ...forwardOrigin, baseUrl: "https://direct-apps.example.test" }
      : undefined;
    let registeredOrigin: typeof forwardOrigin | null = null;
    const portProxy = portForward
      ? new PortProxy({
          gateway: portForward,
          ...(directOrigin ? { forwardOrigin: directOrigin } : {}),
        })
      : undefined;
    const rac = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "9.9.9",
      identity: { desktopId: serverId, label: "Relay Test Server" },
      authStore,
      host: "127.0.0.1",
      advertisedHost: "127.0.0.1",
      port: 0,
      callSupervisor: (async () => ({})) as never,
      ...(portForward && portProxy ? { portForward, portProxy } : {}),
      ...(directOrigin ? { forwardOrigin: directOrigin } : {}),
      getRelayForwardOrigin: () => registeredOrigin ?? null,
      ...(forwardDispatchKey ? { forwardDispatchKey } : {}),
    });
    const racInfo = await rac.start();
    cleanups.push(() => rac.dispose());

    const racPort = new URL(racInfo.httpBaseUrl).port;
    let handle: RelayHostHandle | null = null;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("relay registration timed out")), 5000);
      handle = startRelayHost({
        relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
        serverId,
        secret: `shhh-${serverId}`,
        localHttpUrl: `http://127.0.0.1:${racPort}`,
        ...(forwardOriginSecret && forwardDispatchKey
          ? { forwardOriginSecret, forwardDispatchKey }
          : {}),
        onForwardOrigin: (origin) => {
          registeredOrigin = origin;
        },
        onRegistered: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
    cleanups.push(() => handle?.dispose());
    // The gateway and the proxy are owned by this fixture — neither the server
    // nor the relay adapter disposes them — so tear them down explicitly.
    // `cleanups` runs in reverse push order: raw TCP listeners and proxy state
    // close before the relay adapter and the server itself.
    if (portProxy) cleanups.push(() => portProxy.dispose());
    if (portForward) cleanups.push(() => portForward.dispose());

    const base = `http://127.0.0.1:${relayInfo.port}/s/${encodeURIComponent(serverId)}`;
    return {
      base,
      racInfo,
      pairing,
      // Pairing credentials are single-use (exchanged for one bearer token),
      // so tests that open several sessions on one host mint fresh ones.
      mintPairing: () => authStore.issuePairingCredential({}),
      portForward,
      portProxy,
      forwardOrigin,
    };
  }

  type RegisteredRelayHost = Awaited<ReturnType<typeof registerHost>>;

  async function setup() {
    const relayInfo = await startRelay();
    const host = await registerHost(relayInfo, "srv-1");
    return { base: host.base, relayInfo, pairing: host.pairing };
  }

  async function issueAccessToken(
    base: string,
    credential: string,
    scopes: readonly string[] = ["session:read"],
  ): Promise<string> {
    const response = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential, scopes }),
    });
    expect(response.status).toBe(200);
    const token = (await response.json()) as { accessToken: string };
    return token.accessToken;
  }

  /**
   * A raw (non-`fetch`) GET so the test can inspect a 3xx response's
   * `Location`/`Set-Cookie` headers directly — `fetch`'s `redirect: "manual"`
   * mode filters those out of an opaque-redirect response when the fetch
   * happens in a Window/Document context (not the case here, but the raw
   * client keeps the assertions unambiguous either way).
   */
  function rawGet(
    url: URL,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const req = httpRequestNode(url, { method: "GET", headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      });
      req.on("error", reject);
      req.end();
    });
  }

  /** Extracts a single cookie's value from a raw `Set-Cookie` header. */
  function extractCookieValue(setCookieHeader: string, name: string): string {
    const match = new RegExp(`^${name}=([^;]+)`).exec(setCookieHeader);
    if (!match?.[1]) throw new Error(`Expected a ${name} cookie, got: ${setCookieHeader}`);
    return match[1];
  }

  it("tunnels the HTTP control plane (environment + oauth + ticket)", async () => {
    const { base, pairing } = await setup();

    const client = new RemoteDesktopClient(base);
    const env = await client.environment();
    expect(env.desktopId).toBe("srv-1");
    expect(env.label).toBe("Relay Test Server");

    const token = await client.exchangePairingCredential({ credential: pairing.credential });
    expect(token.accessToken).toMatch(/^lc_access_/);

    const authedClient = new RemoteDesktopClient(base, token.accessToken);
    await expect(authedClient.websocketTicket()).resolves.toMatch(/^lc_ws_/);
  });

  it("returns 502 for an unknown server id", async () => {
    const { relayInfo } = await setup();
    const res = await fetch(`http://127.0.0.1:${relayInfo.port}/s/does-not-exist/x`);
    expect(res.status).toBe(502);
  });

  it("frames each visitor request with a stable, opaque clientId (not the per-request id)", async () => {
    const relayInfo = await startRelay();
    const { frames } = await recordRawHost(relayInfo.port, "srv-cid");

    await fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-cid/one`);
    await fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-cid/two`);

    const requests = frames.filter((frame) => frame.t === "req");
    expect(requests.length).toBe(2);
    // Per-request ids differ on purpose; the rate-limit identity must not —
    // keying it on `id` would hand every request a fresh bucket.
    expect(requests[0]!.id).not.toBe(requests[1]!.id);
    expect(requests[0]!.clientId).toMatch(/^[0-9a-f]{32}$/);
    expect(requests[1]!.clientId).toBe(requests[0]!.clientId);
  });

  it("derives the clientId from the socket address, so spoofed visitor headers cannot change it", async () => {
    const relayInfo = await startRelay();
    const { frames } = await recordRawHost(relayInfo.port, "srv-cid-spoof");
    const base = `http://127.0.0.1:${relayInfo.port}/s/srv-cid-spoof`;

    await fetch(`${base}/plain`);
    await fetch(`${base}/spoofed`, { headers: { "x-forwarded-for": "9.9.9.9" } });

    const requests = frames.filter((frame) => frame.t === "req");
    expect(requests.length).toBe(2);
    expect(requests[1]!.clientId).toBe(requests[0]!.clientId);
    // Opaque by construction: no raw visitor address on the wire to the host.
    expect(String(requests[0]!.clientId)).not.toContain("127.0.0.");
  });

  it("carries the same clientId on ws-open frames as on the visitor's HTTP requests", async () => {
    const relayInfo = await startRelay();
    const { frames } = await recordRawHost(relayInfo.port, "srv-cid-ws");

    await fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-cid-ws/`);
    const visitor = new WebSocket(`ws://127.0.0.1:${relayInfo.port}/s/srv-cid-ws/ws`);
    cleanups.push(() => visitor.close());
    await new Promise<void>((resolve, reject) => {
      visitor.once("open", resolve);
      visitor.once("error", reject);
    });
    // The visitor's `open` fires on the visitor socket while `ws-open` travels
    // on the host control socket — no ordering between them, so wait for it.
    await vi.waitFor(() => {
      expect(frames.some((frame) => frame.t === "ws-open")).toBe(true);
    });

    const req = frames.find((frame) => frame.t === "req");
    const wsOpen = frames.find((frame) => frame.t === "ws-open");
    expect(req).toBeDefined();
    expect(wsOpen!.clientId).toBe(req!.clientId);
  });

  it("rate-limits repeated pairing-token failures per visitor through the relay", async () => {
    const relayInfo = await startRelay();
    const { base } = await registerHost(relayInfo, "srv-rl");

    const exchange = (url: string, credential: string): Promise<Response> =>
      fetch(`${url}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grantType: "pairing-token",
          credential,
          scopes: ["session:read"],
        }),
      });

    // The default limiter allows 20 attempts per 5-minute window and counts
    // attempts (rate limiting runs before credential validation), so 20
    // individual 401 failures are followed by a 429 on the same visitor —
    // only because its identity is stable now; keyed on the per-request id
    // this loop never ran out of fresh buckets.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt += 1) {
      statuses.push((await exchange(base, `wrong-${attempt}`)).status);
    }
    expect(statuses.slice(0, 20)).toEqual(Array<number>(20).fill(401));
    expect(statuses[20]).toBe(429);
  });

  it("tunnels the WebSocket event stream (ready frame)", async () => {
    const { base, pairing } = await setup();
    const token = (await (
      await fetch(`${base}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantType: "pairing-token", credential: pairing.credential }),
      })
    ).json()) as { accessToken: string };
    const ticket = (await (
      await fetch(`${base}/api/auth/websocket-ticket`, {
        method: "POST",
        headers: { authorization: `Bearer ${token.accessToken}` },
      })
    ).json()) as { ticket: string };

    const wsUrl = `${base.replace(/^http/, "ws")}/ws?ticket=${encodeURIComponent(ticket.ticket)}`;
    const firstMessage = await new Promise<unknown>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("no ready frame over the relay"));
      }, 5000);
      socket.on("message", (data) => {
        clearTimeout(timer);
        socket.close();
        resolve(JSON.parse(String(data)));
      });
      socket.on("error", reject);
    });
    expect(firstMessage).toMatchObject({ type: "ready" });
  });

  it("tunnels visitor WebSocket messages sent immediately after visitor open", async () => {
    const { base, pairing } = await setup();
    const token = (await (
      await fetch(`${base}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantType: "pairing-token", credential: pairing.credential }),
      })
    ).json()) as { accessToken: string };
    const ticket = (await (
      await fetch(`${base}/api/auth/websocket-ticket`, {
        method: "POST",
        headers: { authorization: `Bearer ${token.accessToken}` },
      })
    ).json()) as { ticket: string };

    const wsUrl = `${base.replace(/^http/, "ws")}/ws?ticket=${encodeURIComponent(ticket.ticket)}`;
    const socket = new WebSocket(wsUrl);
    cleanups.push(() => socket.close());
    const messages: unknown[] = [];
    const waiters: Array<{
      readonly predicate: (message: unknown) => boolean;
      readonly resolve: (message: unknown) => void;
      readonly reject: (error: Error) => void;
      readonly timer: ReturnType<typeof setTimeout>;
    }> = [];
    socket.on("message", (data: RawData) => {
      const parsed = JSON.parse(String(data)) as unknown;
      messages.push(parsed);
      for (const waiter of [...waiters]) {
        if (!waiter.predicate(parsed)) continue;
        clearTimeout(waiter.timer);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(parsed);
      }
    });
    const waitForMessage = async (predicate: (message: unknown) => boolean): Promise<unknown> =>
      await new Promise((resolve, reject) => {
        const existing = messages.find(predicate);
        if (existing) {
          resolve(existing);
          return;
        }
        const timer = setTimeout(() => {
          const waiter = waiters.find((entry) => entry.timer === timer);
          if (waiter) waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error("timed out waiting for relay websocket message"));
        }, 5000);
        waiters.push({ predicate, resolve, reject, timer });
      });

    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    socket.send(JSON.stringify({ type: "ping", id: "early" }));

    await expect(
      waitForMessage((message) => (message as { type?: string }).type === "ready"),
    ).resolves.toMatchObject({ type: "ready" });
    await expect(
      waitForMessage((message) => (message as { id?: string }).id === "early"),
    ).resolves.toMatchObject({ type: "pong", id: "early" });
  });

  it("fails pending visitor HTTP requests immediately when the host disconnects", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      requestTimeoutMs: 60_000,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const control = await openRawHost(relayInfo.port, "srv-pending");

    const responsePromise = fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-pending/api/snapshot`);
    await expect(readRawHostFrame(control)).resolves.toMatchObject({
      t: "req",
      path: "/api/snapshot",
    });
    control.close();

    const response = await responsePromise;
    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toContain("Host disconnected.");
  });

  it("fails visitor HTTP requests immediately when sending to the host throws", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      requestTimeoutMs: 60_000,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    await openRawHost(relayInfo.port, "srv-send-fail");

    const state = relay as unknown as {
      hosts: Map<string, { control: WebSocket }>;
      pending: Map<string, unknown>;
    };
    const control = state.hosts.get("srv-send-fail")?.control;
    expect(control).toBeDefined();
    control!.send = (() => {
      throw new Error("send failed");
    }) as WebSocket["send"];

    const response = await fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-send-fail/api/snapshot`);

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toContain("server offline");
    expect(state.pending.size).toBe(0);
  });

  it("fails visitor HTTP requests immediately when the host control outbound queue is full", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      requestTimeoutMs: 60_000,
      maxWebSocketOutboundBufferBytes: 512,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    await openRawHost(relayInfo.port, "srv-slow-host");

    const state = relay as unknown as {
      hosts: Map<string, { control: WebSocket }>;
      pending: Map<string, unknown>;
    };
    const control = state.hosts.get("srv-slow-host")?.control;
    expect(control).toBeDefined();
    Object.defineProperty(control!, "bufferedAmount", {
      configurable: true,
      value: 1024,
    });

    const response = await fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-slow-host/api/snapshot`);

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toContain("server offline");
    expect(state.pending.size).toBe(0);
  });

  it("evicts only the flooding channel when the host control link is congested", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      requestTimeoutMs: 60_000,
      maxWebSocketPayloadBytes: 4096,
      maxWebSocketOutboundBufferBytes: 4096,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const control = await openRawHost(relayInfo.port, "srv-congested");

    const openVisitor = async (name: string): Promise<WebSocket> => {
      const visitor = new WebSocket(`ws://127.0.0.1:${relayInfo.port}/s/srv-congested/${name}`);
      cleanups.push(() => visitor.close());
      await new Promise<void>((resolve, reject) => {
        visitor.once("open", resolve);
        visitor.once("error", reject);
      });
      return visitor;
    };
    // Frames may land before a reader attaches (ws drops unlistened
    // messages), so collect them through a permanent queued listener.
    const hostFrames: Array<{ t: string; id?: string; reason?: string; data?: string }> = [];
    const frameWaiters: Array<{
      readonly predicate: (frame: { t: string; id?: string }) => boolean;
      readonly resolve: (frame: { t: string; id?: string; reason?: string; data?: string }) => void;
    }> = [];
    const onHostFrame = (data: RawData) => {
      const parsed = JSON.parse(String(data)) as {
        t: string;
        id?: string;
        reason?: string;
        data?: string;
      };
      hostFrames.push(parsed);
      for (const waiter of [...frameWaiters]) {
        if (!waiter.predicate(parsed)) continue;
        frameWaiters.splice(frameWaiters.indexOf(waiter), 1);
        waiter.resolve(parsed);
      }
    };
    control.on("message", onHostFrame);
    cleanups.push(() => {
      control.off("message", onHostFrame);
    });
    const nextHostFrame = async (
      predicate: (frame: { t: string; id?: string }) => boolean,
    ): Promise<{ t: string; id?: string; reason?: string; data?: string }> => {
      const existing = hostFrames.find(predicate);
      if (existing) return existing;
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out waiting for host frame")), 5000);
        frameWaiters.push({
          predicate,
          resolve: (frame) => {
            clearTimeout(timer);
            resolve(frame);
          },
        });
      });
    };

    const visitorA = await openVisitor("pipe-a");
    const visitorB = await openVisitor("pipe-b");
    const openA = (await nextHostFrame((frame) => frame.t === "ws-open")) as {
      t: string;
      id: string;
    };
    const openB = (await nextHostFrame(
      (frame) => frame.t === "ws-open" && frame.id !== openA.id,
    )) as { t: string; id: string };
    expect(openA.t).toBe("ws-open");
    expect(openB.t).toBe("ws-open");

    // Simulate a congested host control link (receiver not draining).
    const state = relay as unknown as {
      hosts: Map<string, { control: WebSocket; channelBytes: Map<string, number> }>;
      visitors: Map<string, unknown>;
    };
    const hostEntry = state.hosts.get("srv-congested")!;
    Object.defineProperty(hostEntry.control, "bufferedAmount", {
      configurable: true,
      value: 8192,
    });

    // Channel A sends into the congested link: it is evicted alone — the
    // control socket, channel B, and any in-flight requests are untouched.
    const closedA = waitRelaySocketClose(visitorA);
    visitorA.send("flood");
    const closeFrame = await nextHostFrame((frame) => frame.t === "ws-close");
    expect(closeFrame).toMatchObject({
      t: "ws-close",
      id: openA.id,
      reason: "relay link congestion",
    });
    expect(await closedA).toMatchObject({ code: 1006 });
    expect(hostEntry.control.readyState).toBe(WebSocket.OPEN);
    expect(state.visitors.has(openA.id)).toBe(false);

    // After the link drains, the healthy channel still delivers end to end.
    Object.defineProperty(hostEntry.control, "bufferedAmount", {
      configurable: true,
      value: 0,
    });
    visitorB.send("hello");
    const data = await nextHostFrame((frame) => frame.t === "ws-data" && frame.id === openB.id);
    expect(data).toMatchObject({ t: "ws-data", data: "hello" });
  });

  it("tells the host to drop a channel when the visitor socket dies mid-forward", async () => {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0, requestTimeoutMs: 60_000 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const control = await openRawHost(relayInfo.port, "srv-zombie");

    const visitor = new WebSocket(`ws://127.0.0.1:${relayInfo.port}/s/srv-zombie/pipe`);
    cleanups.push(() => visitor.close());
    await new Promise<void>((resolve, reject) => {
      visitor.once("open", resolve);
      visitor.once("error", reject);
    });
    // The frame may land before a reader attaches; poll the buffered frames.
    let opened: { t: string; id: string } | undefined;
    await expect
      .poll(() => {
        const state = relay as unknown as { visitors: Map<string, unknown> };
        if (state.visitors.size > 0 && !opened) {
          opened = { t: "ws-open", id: [...state.visitors.keys()][0]! };
        }
        return state.visitors.size;
      })
      .toBe(1);
    const channelId = opened!.id;
    expect(opened!.t).toBe("ws-open");

    // The visitor socket can no longer accept writes (vanished mid-forward).
    const state = relay as unknown as { visitors: Map<string, { socket: WebSocket }> };
    const entry = state.visitors.get(channelId);
    expect(entry).toBeDefined();
    entry!.socket.send = (() => {
      throw new Error("socket gone");
    }) as WebSocket["send"];

    control.send(JSON.stringify({ t: "ws-data", id: channelId, data: "payload" }));
    // The buffered ws-open frame may still be in flight ahead of the close.
    let closeFrame = (await readRawHostFrame(control)) as { t: string; id: string };
    while (closeFrame.t !== "ws-close") {
      closeFrame = (await readRawHostFrame(control)) as { t: string; id: string };
    }
    expect(closeFrame.id).toBe(channelId);
    expect(state.visitors.has(channelId)).toBe(false);
  });

  it("rejects a request whose relay frame would exceed the host receive limit with 413", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      requestTimeoutMs: 60_000,
      maxWebSocketPayloadBytes: 2048,
      maxWebSocketOutboundBufferBytes: 4096,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    await openRawHost(relayInfo.port, "srv-oversize");

    // The body alone is bounded, but base64 expansion plus headers plus JSON
    // escaping push this frame past the host's receive limit. It must fail
    // THIS request with 413, never kill the shared control socket.
    const response = await fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-oversize/api/snapshot`, {
      method: "POST",
      body: "x".repeat(4096),
    });
    expect(response.status).toBe(413);
    await expect(response.text()).resolves.toContain("request too large for the relay link");
    const state = relay as unknown as {
      hosts: Map<string, { control: WebSocket }>;
      pending: Map<string, unknown>;
    };
    expect(state.hosts.get("srv-oversize")!.control.readyState).toBe(WebSocket.OPEN);
    expect(state.pending.size).toBe(0);
  });

  it("admits at most 16 concurrent relayed requests per visitor and rejects the rest with 429", async () => {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0, requestTimeoutMs: 60_000 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    await openRawHost(relayInfo.port, "srv-capped");

    // The raw host never answers, so all 16 admitted requests stay pending.
    const unawaited: Array<Promise<Response>> = [];
    for (let index = 0; index < 16; index += 1) {
      unawaited.push(
        fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-capped/api/snapshot?i=${index}`).catch(
          () => undefined as unknown as Response,
        ),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    const overflow = await fetch(
      `http://127.0.0.1:${relayInfo.port}/s/srv-capped/api/snapshot?overflow`,
    );
    expect(overflow.status).toBe(429);
    await expect(overflow.text()).resolves.toContain("relay admission limit");
    const state = relay as unknown as { pending: Map<string, unknown> };
    expect(state.pending.size).toBe(16);
  });

  it("caps concurrent channels per visitor with a 1013 close (32 per client)", async () => {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0, requestTimeoutMs: 60_000 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    await openRawHost(relayInfo.port, "srv-chan-cap");

    const sockets: WebSocket[] = [];
    const openVisitor = (): Promise<WebSocket> => {
      const visitor = new WebSocket(
        `ws://127.0.0.1:${relayInfo.port}/s/srv-chan-cap/ch-${randomUUID()}`,
      );
      cleanups.push(() => visitor.close());
      return new Promise<WebSocket>((resolve, reject) => {
        visitor.once("open", () => resolve(visitor));
        visitor.once("error", reject);
      });
    };
    for (let index = 0; index < 32; index += 1) {
      sockets.push(await openVisitor());
    }
    // The 33rd channel from the same client (same loopback address, so the
    // same stable clientId) is refused with the RFC "try again later" code.
    const over = await openVisitor();
    const closed = waitRelaySocketClose(over);
    expect(await closed).toMatchObject({ code: 1013, reason: "relay admission limit" });
    for (const socket of sockets) {
      expect(socket.readyState).toBe(WebSocket.OPEN);
    }
  });

  it("ignores HTTP responses from a different registered host", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      requestTimeoutMs: 60_000,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const hostA = await openRawHost(relayInfo.port, "srv-a");
    const hostB = await openRawHost(relayInfo.port, "srv-b");

    const responsePromise = fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-a/api/snapshot`);
    const requestFrame = await readRawHostFrame(hostA);
    expect(requestFrame).toMatchObject({
      t: "req",
      path: "/api/snapshot",
    });
    const requestId = (requestFrame as { id: string }).id;
    let settled = false;
    void responsePromise.then(() => {
      settled = true;
    });

    hostB.send(
      JSON.stringify({
        t: "res",
        id: requestId,
        status: 200,
        headers: { "content-type": "text/plain" },
        body: Buffer.from("wrong host").toString("base64"),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);

    hostA.send(
      JSON.stringify({
        t: "res",
        id: requestId,
        status: 200,
        headers: { "content-type": "text/plain" },
        body: Buffer.from("right host").toString("base64"),
      }),
    );

    const response = await responsePromise;
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("right host");
  });

  it("closes visitor WebSockets when the registered host disconnects", async () => {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const control = await openRawHost(relayInfo.port, "srv-ws");

    const visitor = new WebSocket(`ws://127.0.0.1:${relayInfo.port}/s/srv-ws/ws?ticket=t`);
    cleanups.push(() => visitor.close());
    await new Promise<void>((resolve, reject) => {
      visitor.once("open", resolve);
      visitor.once("error", reject);
    });
    await expect(readRawHostFrame(control)).resolves.toMatchObject({
      t: "ws-open",
      path: "/ws?ticket=t",
    });

    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      visitor.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });
    control.close();

    await expect(closed).resolves.toEqual({
      code: 1012,
      reason: "Host disconnected.",
    });
  });

  it("drops slow visitor WebSockets before relay outbound buffers grow unbounded", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      maxWebSocketOutboundBufferBytes: 512,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const control = await openRawHost(relayInfo.port, "srv-slow-visitor");

    const visitor = new WebSocket(
      `ws://127.0.0.1:${relayInfo.port}/s/srv-slow-visitor/ws?ticket=t`,
    );
    cleanups.push(() => visitor.close());
    await new Promise<void>((resolve, reject) => {
      visitor.once("open", resolve);
      visitor.once("error", reject);
    });
    const openFrame = (await readRawHostFrame(control)) as { id: string };
    expect(openFrame).toMatchObject({ t: "ws-open", path: "/ws?ticket=t" });

    const state = relay as unknown as {
      visitors: Map<string, { socket: WebSocket }>;
    };
    const serverSideVisitor = state.visitors.get(openFrame.id)?.socket;
    expect(serverSideVisitor).toBeDefined();
    Object.defineProperty(serverSideVisitor!, "bufferedAmount", {
      configurable: true,
      value: 1024,
    });
    const closed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("slow visitor stayed open")), 1000);
      visitor.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      visitor.once("error", reject);
    });

    control.send(JSON.stringify({ t: "ws-data", id: openFrame.id, data: "hello" }));

    await expect(closed).resolves.toBeUndefined();
    expect(state.visitors.has(openFrame.id)).toBe(false);
  });

  it("terminates registered hosts that stop answering relay heartbeat pings", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      webSocketHeartbeatIntervalMs: 20,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());

    const control = new WebSocket(`ws://127.0.0.1:${relayInfo.port}/host`, { autoPong: false });
    cleanups.push(() => control.terminate());
    await new Promise<void>((resolve, reject) => {
      control.once("open", resolve);
      control.once("error", reject);
    });
    const closed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("stale host control stayed open")), 1000);
      control.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      control.once("error", reject);
    });

    control.send(
      JSON.stringify({
        t: "register",
        protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
        serverId: "srv-stale",
        secret: "stale-secret",
      }),
    );
    await expect(readRawHostFrame(control)).resolves.toMatchObject({
      t: "registered",
      serverId: "srv-stale",
    });

    await expect(closed).resolves.toBeUndefined();
    const response = await fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-stale/healthz`);
    expect(response.status).toBe(502);
  });

  it("closes host control sockets that do not register", async () => {
    const relay = new RelayServer({
      host: "127.0.0.1",
      port: 0,
      hostRegistrationTimeoutMs: 20,
    });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());

    const control = new WebSocket(`ws://127.0.0.1:${relayInfo.port}/host`);
    cleanups.push(() => control.terminate());
    await new Promise<void>((resolve, reject) => {
      control.once("open", resolve);
      control.once("error", reject);
    });

    const closed = new Promise<{ code: number; reason: string }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("unregistered host control stayed open")),
        1000,
      );
      control.once("close", (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
      control.once("error", reject);
    });

    await expect(closed).resolves.toEqual({
      code: 1008,
      reason: "host must register first",
    });
  });

  it("prevents hijacking an offline server id with a different secret", async () => {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());

    async function tryRegister(
      serverId: string,
      secret: string,
    ): Promise<{
      outcome: "registered" | "closed";
      reason?: string;
      control: WebSocket;
    }> {
      const control = new WebSocket(`ws://127.0.0.1:${relayInfo.port}/host`);
      cleanups.push(() => control.terminate());
      await new Promise<void>((resolve, reject) => {
        control.once("open", resolve);
        control.once("error", reject);
      });
      control.send(
        JSON.stringify({
          t: "register",
          protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
          serverId,
          secret,
        }),
      );
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no register outcome")), 3000);
        control.once("message", (data) => {
          clearTimeout(timer);
          const frame = JSON.parse(String(data)) as { t: string };
          resolve({
            outcome: frame.t === "registered" ? "registered" : "closed",
            control,
          });
        });
        control.once("close", (code, reason) => {
          clearTimeout(timer);
          resolve({ outcome: "closed", reason: reason.toString(), control });
        });
      });
    }

    // Legit host binds the id, then goes offline (control socket drops).
    const legit = await tryRegister("srv-victim", "legit-secret");
    expect(legit.outcome).toBe("registered");
    legit.control.close();
    await waitRelaySocketClose(legit.control);
    // Let the relay process the control 'close' (delete the live host, keep the
    // durable binding) before the attacker races in.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Attacker who knows the public serverId tries to claim it with a different
    // secret while the host is offline — must be rejected, not silently allowed.
    const attacker = await tryRegister("srv-victim", "attacker-secret");
    expect(attacker.outcome).toBe("closed");
    expect(attacker.reason).toBe("serverId already registered");

    // The legitimate host can still reconnect with its correct secret.
    const reconnect = await tryRegister("srv-victim", "legit-secret");
    expect(reconnect.outcome).toBe("registered");
  });

  it("rejects registering multiple server ids on one host control socket", async () => {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    const control = await openRawHost(relayInfo.port, "srv-first");

    const closed = new Promise<{ code: number; reason: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("host control stayed open")), 1000);
      control.once("close", (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
      control.once("error", reject);
    });
    control.send(
      JSON.stringify({
        t: "register",
        protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
        serverId: "srv-second",
        secret: "raw-secret",
      }),
    );

    await expect(closed).resolves.toEqual({
      code: 1008,
      reason: "host control already registered",
    });
    const response = await fetch(`http://127.0.0.1:${relayInfo.port}/s/srv-first/healthz`);
    expect(response.status).toBe(502);
  });

  /**
   * Port forwarding reached *through* the relay, on the isolated-origin flow:
   * a forwarded dev server is served on its own generated HTTPS child origin
   * (`f-<owner>-<forward>.<base>`, owner = `deriveForwardOwner(originSecret,
   * serverId)`) — never on the relay's API/PWA origin. The whole credential
   * chain is bound to the exact (forwardId, origin) pair: bearer-gated forward
   * creation issues a relative `enterPath`; the API-origin enter route 302s
   * (minting NO cookie) to a one-use exchange on the child origin; the
   * exchange mints the `__Host-poracode-forward` session there; and every
   * subsequent child request/upgrade rides relay-derived `forward` context the
   * visitor cannot forge. The legacy shared-origin `lc_forward`/`lc_relay`
   * cookies are gone and confer nothing.
   *
   * Fixture honesty: `*.apps.example.test` has no DNS or TLS here. Child-origin
   * requests are driven against the relay's real loopback listener with
   * explicit `Host:` (and, for upgrades, `Origin:`) overrides and cookies
   * replayed by hand — raw sockets, no assumed browser DNS. This proves the
   * relay's and the host's origin routing and origin-bound session enforcement
   * end to end over real sockets; it does NOT establish real-browser TLS,
   * cookie-jar, or storage isolation (the contract's private-public-suffix
   * deployment gate is separate production evidence).
   */
  describe("port-forward isolated-origin flow over the relay", () => {
    function startUpstreamWsEchoServer(): Promise<{
      port: number;
      wss: WebSocketServer;
      /** How many upgrades the upstream has actually accepted. */
      readonly connections: () => number;
    }> {
      return new Promise((resolve) => {
        const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
        let connections = 0;
        wss.on("connection", (ws) => {
          connections += 1;
          ws.on("message", (data) => ws.send(data.toString()));
        });
        wss.once("listening", () => {
          resolve({
            port: (wss.address() as AddressInfo).port,
            wss,
            connections: () => connections,
          });
        });
      });
    }

    /**
     * A real upstream dev-server stand-in. Echoes the request URL, the `Host`
     * it received (the child proxy rewrites it to `localhost:<targetPort>`),
     * and its raw `Cookie` header (reserved Poracode crumbs must never reach
     * it), and can forge `Set-Cookie` values (reserved names must be filtered
     * before the visitor sees them).
     */
    function startUpstreamHttpServer(
      options: { readonly setCookies?: readonly string[] } = {},
    ): Promise<{ port: number; server: HttpServer }> {
      return new Promise((resolve, reject) => {
        const server = createHttpServer((req, res) => {
          res.writeHead(200, {
            "content-type": "application/json",
            ...(options.setCookies && options.setCookies.length > 0
              ? { "set-cookie": [...options.setCookies] }
              : {}),
          });
          res.end(
            JSON.stringify({
              url: req.url,
              host: req.headers.host,
              cookie: req.headers.cookie ?? null,
            }),
          );
        });
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          resolve({ port: (server.address() as AddressInfo).port, server });
        });
      });
    }

    const cookieFor = (sessionCookie: string): string =>
      `${FORWARD_ORIGIN_SESSION_COOKIE_NAME}=${sessionCookie}`;

    /**
     * Visitor GET against the relay's real loopback listener with the child
     * origin's authority supplied as an explicit `Host:` override — the relay
     * routes on the authority, not on DNS, so no name resolution is needed.
     */
    function childGet(
      hostBase: string,
      childOrigin: string,
      pathWithSearch: string,
      cookie?: string,
    ): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
      return rawGet(new URL(`http://127.0.0.1:${new URL(hostBase).port}${pathWithSearch}`), {
        host: new URL(childOrigin).host,
        ...(cookie ? { cookie } : {}),
      });
    }

    interface ForwardCreation {
      readonly forwardId: string;
      /** The raw TCP listener port — raw forwarding stays available alongside
       * the browser-origin flow, on the same forward. */
      readonly listenPort: number;
      readonly enterPath: string;
      readonly bearerToken: string;
    }

    /** Bearer-gated `POST /api/ports/forward` through the relay. Pass a fresh
     * pairing credential when the host's first one is already exchanged. */
    async function createForward(
      host: RegisteredRelayHost,
      upstreamPort: number,
      credential: string = host.pairing.credential,
    ): Promise<ForwardCreation> {
      const bearerToken = await issueAccessToken(host.base, credential, ["ports:forward"]);
      const forwardResponse = await fetch(`${host.base}/api/ports/forward`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearerToken}`, "content-type": "application/json" },
        body: JSON.stringify({ targetPort: upstreamPort }),
      });
      expect(forwardResponse.status).toBe(200);
      const forwardResult = (await forwardResponse.json()) as {
        forward: { id: string; listenPort: number };
        enterPath?: string;
      };
      expect(forwardResult.enterPath).toEqual(expect.any(String));
      return {
        forwardId: forwardResult.forward.id,
        listenPort: forwardResult.forward.listenPort,
        enterPath: forwardResult.enterPath!,
        bearerToken,
      };
    }

    /**
     * Hop 2: the child-origin exchange GET. A real browser would follow the
     * enter redirect here over HTTPS; this fixture has no DNS/TLS for the
     * child authority, so the same request line is driven against the relay's
     * loopback listener with the authority as a `Host:` override.
     */
    function exchangeOnChild(
      hostBase: string,
      childOrigin: string,
      fx: string,
    ): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
      return rawGet(
        new URL(
          `http://127.0.0.1:${new URL(hostBase).port}${FORWARD_ORIGIN_EXCHANGE_PATH}?fx=${fx}`,
        ),
        { host: new URL(childOrigin).host },
      );
    }

    /** Asserts the child exchange minted exactly one `__Host-poracode-forward`
     * cookie with the browser-enforced attribute set (`__Host-` ⇒ Secure,
     * Path=/, no Domain; the host adds HttpOnly/SameSite=Lax) and returns the
     * session value. */
    function requireMintedSessionCookie(exchange: {
      readonly headers: IncomingHttpHeaders;
    }): string {
      const setCookies = exchange.headers["set-cookie"] ?? [];
      expect(setCookies).toHaveLength(1);
      const cookie = setCookies[0]!;
      expect(cookie.startsWith(`${FORWARD_ORIGIN_SESSION_COOKIE_NAME}=`)).toBe(true);
      expect(cookie).toContain("; Max-Age=");
      expect(cookie).toContain("; Path=/");
      expect(cookie).toContain("; Secure");
      expect(cookie).toContain("; HttpOnly");
      expect(cookie).toContain("; SameSite=Lax");
      expect(cookie).not.toContain("Domain");
      return extractCookieValue(cookie, FORWARD_ORIGIN_SESSION_COOKIE_NAME);
    }

    interface ChildSession {
      readonly forwardId: string;
      readonly childOrigin: string;
      readonly sessionCookie: string;
    }

    /** A port-forward host with the full isolated-origin wiring (dedicated
     * origin secret + dispatch key, mirrored in relay registration) on a
     * fresh relay. */
    async function registerHostRelayed(serverId: string): Promise<RegisteredRelayHost> {
      const relayInfo = await startRelay();
      return await registerHost(relayInfo, serverId, { withPortForward: true });
    }

    /**
     * Drives the full browser-equivalent entry through the relay: bearer
     * forward creation → API-origin enter redirect → child-origin exchange —
     * and returns the session a browser would hold on the child origin.
     */
    async function openChildSession(
      host: RegisteredRelayHost,
      upstreamPort: number,
      credential: string = host.pairing.credential,
    ): Promise<ChildSession> {
      const created = await createForward(host, upstreamPort, credential);
      const enter = await rawGet(new URL(`${host.base}${created.enterPath}`));
      expect(enter.status).toBe(302);
      const target = new URL(enter.headers.location!);
      const exchange = await exchangeOnChild(
        host.base,
        target.origin,
        target.searchParams.get("fx")!,
      );
      expect(exchange.status).toBe(302);
      expect(exchange.headers.location).toBe("/");
      return {
        forwardId: created.forwardId,
        childOrigin: target.origin,
        sessionCookie: requireMintedSessionCookie(exchange),
      };
    }

    it("sends the API-origin enter redirect to the exact isolated child exchange, minting no API-origin cookie", async () => {
      const host = await registerHostRelayed("srv-fwd-a");
      const upstream = await startUpstreamHttpServer();
      cleanups.push(() => new Promise<void>((resolve) => upstream.server.close(() => resolve())));

      const created = await createForward(host, upstream.port);
      expect(created.listenPort).toBeGreaterThan(0);

      // Hop 1, through the relay's `/s/<id>` prefix: tunneled verbatim (never
      // followed), it leaves the API origin for the child origin derived from
      // the SAME (originSecret, serverId) the host registered — one label per
      // forward, inside the host's own namespace.
      const enter = await rawGet(new URL(`${host.base}${created.enterPath}`));
      expect(enter.status).toBe(302);
      const location = enter.headers.location!;
      const target = new URL(location);
      const forwardOrigin = host.forwardOrigin;
      if (!forwardOrigin) throw new Error("port-forward hosts compose a forward origin");
      expect(`${target.protocol}//${target.host}`).toBe(
        new ForwardOriginPolicy(forwardOrigin.baseUrl).originFor(
          forwardOrigin.ownerId,
          created.forwardId,
        ),
      );
      expect(target.pathname).toBe(FORWARD_ORIGIN_EXCHANGE_PATH);
      expect(target.searchParams.get("fx")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // Only the one-use exchange capability rides the redirect — never a
      // bearer credential — and nothing is minted on the API origin.
      expect(location).not.toContain(created.bearerToken);
      expect(enter.headers["set-cookie"]).toBeUndefined();
      expect(enter.headers["cache-control"]).toBe("no-store");
      expect(enter.headers["referrer-policy"]).toBe("no-referrer");
      expect(enter.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("exchanges the one-use child-origin capability for a __Host-poracode-forward session cookie", async () => {
      const host = await registerHostRelayed("srv-fwd-exchange");
      const upstream = await startUpstreamHttpServer();
      cleanups.push(() => new Promise<void>((resolve) => upstream.server.close(() => resolve())));

      const created = await createForward(host, upstream.port);
      const enter = await rawGet(new URL(`${host.base}${created.enterPath}`));
      expect(enter.status).toBe(302);
      const target = new URL(enter.headers.location!);

      // Hop 2 on the child origin: consume the capability, get a no-store
      // redirect to `/` and exactly one `__Host-` session cookie.
      const exchange = await exchangeOnChild(
        host.base,
        target.origin,
        target.searchParams.get("fx")!,
      );
      expect(exchange.status).toBe(302);
      expect(exchange.headers.location).toBe("/");
      const sessionCookie = requireMintedSessionCookie(exchange);

      // One use: replaying the same capability is a bounded denial that mints
      // nothing (and is never cached).
      const replay = await exchangeOnChild(
        host.base,
        target.origin,
        target.searchParams.get("fx")!,
      );
      expect(replay.status).toBe(403);
      expect(JSON.parse(replay.body)).toMatchObject({
        error: { code: "forward_exchange_invalid" },
      });
      expect(replay.headers["set-cookie"]).toBeUndefined();
      expect(replay.headers["cache-control"]).toBe("no-store");

      // The minted session authorizes child-origin traffic on its origin.
      const root = await childGet(host.base, target.origin, "/", cookieFor(sessionCookie));
      expect(root.status).toBe(200);
      expect(JSON.parse(root.body)).toEqual({
        url: "/",
        host: `localhost:${upstream.port}`,
        cookie: null,
      });
    });

    it("routes child-origin HTTP (dev-server root, nested assets + query) by the origin-bound session cookie", async () => {
      const host = await registerHostRelayed("srv-fwd-assets");
      // The upstream forges Poracode's reserved cookie names: they must be
      // filtered from the proxied response — upstream cookies are payload,
      // never dispatch instructions.
      const upstream = await startUpstreamHttpServer({
        setCookies: [
          `${FORWARD_ORIGIN_SESSION_COOKIE_NAME}=forged; Path=/; Secure; HttpOnly`,
          "lc_forward=forged",
          "lc_relay=forged",
          "app_session=real",
        ],
      });
      cleanups.push(() => new Promise<void>((resolve) => upstream.server.close(() => resolve())));

      const session = await openChildSession(host, upstream.port);

      // Root path, an ordinary application cookie riding along: the reserved
      // session crumb is consumed by the host (never forwarded upstream) while
      // the app cookie passes through, and `Host` is rewritten to the dev
      // server exactly as a direct LAN browser hop would see.
      const root = await childGet(
        host.base,
        session.childOrigin,
        "/",
        `${cookieFor(session.sessionCookie)}; app_cookie=keep`,
      );
      expect(root.status).toBe(200);
      expect(JSON.parse(root.body)).toEqual({
        url: "/",
        host: `localhost:${upstream.port}`,
        cookie: "app_cookie=keep",
      });

      // Prefixless nested path + query — a dev server's own bundle/HMR asset
      // shape. The whole child origin (minus the one reserved exchange path)
      // belongs to the forwarded application.
      const nested = await childGet(
        host.base,
        session.childOrigin,
        "/assets/some/nested/dev/asset.js?v=1",
        cookieFor(session.sessionCookie),
      );
      expect(nested.status).toBe(200);
      expect(JSON.parse(nested.body)).toEqual({
        url: "/assets/some/nested/dev/asset.js?v=1",
        host: `localhost:${upstream.port}`,
        cookie: null,
      });

      // Reserved names are filtered from upstream Set-Cookie; ordinary app
      // cookies pass.
      expect(root.headers["set-cookie"]).toEqual(["app_session=real"]);

      // No session, no content: the bounded child-origin error — never the
      // PWA/API content that used to share this listener.
      const anonymous = await childGet(host.base, session.childOrigin, "/");
      expect(anonymous.status).toBe(403);
      expect(JSON.parse(anonymous.body)).toMatchObject({
        error: { code: "forward_session_required" },
      });
    });

    it("routes child-origin WebSocket upgrades (e.g. Vite HMR) by exact origin and session cookie", async () => {
      const host = await registerHostRelayed("srv-fwd-ws");
      const upstream = await startUpstreamWsEchoServer();
      cleanups.push(() => new Promise<void>((resolve) => upstream.wss.close(() => resolve())));
      const session = await openChildSession(host, upstream.port);
      const authority = new URL(session.childOrigin).host;
      const wsUrl = `ws://127.0.0.1:${new URL(host.base).port}/anything`;

      // A browser upgrade: exact child `Origin`, exact child authority, the
      // origin-bound cookie — echoed by the real upstream WS server.
      const client = new WebSocket(wsUrl, {
        headers: {
          host: authority,
          origin: session.childOrigin,
          cookie: cookieFor(session.sessionCookie),
        },
      });
      cleanups.push(() => client.close());
      await new Promise<void>((resolve, reject) => {
        client.once("open", resolve);
        client.once("error", reject);
      });
      const echoed = await new Promise<string>((resolve, reject) => {
        client.once("message", (data: RawData) => resolve(data.toString()));
        client.once("error", reject);
        client.send("ping-through-the-relay");
      });
      expect(echoed).toBe("ping-through-the-relay");

      // A browser always sends Origin on an upgrade, and it must equal the
      // child origin: a foreign origin is dropped before any host traffic.
      const foreign = new WebSocket(wsUrl, {
        headers: {
          host: authority,
          origin: "https://other.example.test",
          cookie: cookieFor(session.sessionCookie),
        },
      });
      cleanups.push(() => foreign.terminate());
      // The relay destroys the socket before any handshake: the client sees
      // the connection reset ("socket hang up"), never an upgrade.
      await expect(
        new Promise<void>((resolve, reject) => {
          foreign.once("open", resolve);
          foreign.once("error", reject);
        }),
      ).rejects.toThrow(/socket hang up/);

      // A well-formed upgrade without the origin-bound session: the relay (a
      // framing relay, not a response-recalling proxy) completes the visitor's
      // handshake, but the host refuses to dial the upstream, so the channel
      // closes carrying no application data — and the upstream never sees a
      // connection for it.
      const anonymous = new WebSocket(wsUrl, {
        headers: { host: authority, origin: session.childOrigin },
      });
      cleanups.push(() => anonymous.terminate());
      await expect(waitRelaySocketClose(anonymous)).resolves.toBeDefined();
      expect(upstream.connections()).toBe(1);
    });

    it("keeps sibling hosts' child sessions independent and rejects misdirected, unknown, and legacy credentials", async () => {
      const hostA = await registerHostRelayed("srv-tenant-a");
      const hostB = await registerHostRelayed("srv-tenant-b");
      const upstreamA = await startUpstreamHttpServer();
      const upstreamB = await startUpstreamHttpServer();
      cleanups.push(() => new Promise<void>((resolve) => upstreamA.server.close(() => resolve())));
      cleanups.push(() => new Promise<void>((resolve) => upstreamB.server.close(() => resolve())));
      const baseHost = new URL(FORWARD_ORIGIN_BASE_URL).hostname;

      const sessionA = await openChildSession(hostA, upstreamA.port);
      const sessionB = await openChildSession(hostB, upstreamB.port);

      // Each origin-bound session serves exactly its own host's child origin —
      // two hosts, two namespaces, no shared "only live session" fallback.
      const rootA = await childGet(
        hostA.base,
        sessionA.childOrigin,
        "/",
        cookieFor(sessionA.sessionCookie),
      );
      expect(rootA.status).toBe(200);
      expect(JSON.parse(rootA.body)).toEqual({
        url: "/",
        host: `localhost:${upstreamA.port}`,
        cookie: null,
      });
      const rootB = await childGet(
        hostB.base,
        sessionB.childOrigin,
        "/",
        cookieFor(sessionB.sessionCookie),
      );
      expect(rootB.status).toBe(200);
      expect(JSON.parse(rootB.body).host).toBe(`localhost:${upstreamB.port}`);

      // A cookie copied across hosts still routes by the authority's owner
      // (A), but the session is bound to B's (forwardId, origin) — bounded
      // denial, never A's content.
      const stolenOnA = await childGet(
        hostA.base,
        sessionA.childOrigin,
        "/",
        cookieFor(sessionB.sessionCookie),
      );
      expect(stolenOnA.status).toBe(403);
      expect(JSON.parse(stolenOnA.body)).toMatchObject({
        error: { code: "forward_session_required" },
      });
      const stolenOnB = await childGet(
        hostB.base,
        sessionB.childOrigin,
        "/",
        cookieFor(sessionA.sessionCookie),
      );
      expect(stolenOnB.status).toBe(403);

      // A well-formed child label under the shared base that NO host owns —
      // derived from an unregistered origin secret — 404s at the relay.
      const strangerOwner = deriveForwardOwner(randomOriginSecret(), "srv-tenant-a");
      const stranger = await childGet(
        hostA.base,
        `https://f-${strangerOwner}-${sessionA.forwardId.replaceAll("-", "")}.${baseHost}`,
        "/",
        cookieFor(sessionA.sessionCookie),
      );
      expect(stranger.status).toBe(404);

      // A label under A's OWN owner but naming a forward A never opened:
      // dispatch reaches A, and A — authoritative for its own forwards —
      // bounds it to 404 instead of serving anything.
      const ghost = await childGet(
        hostA.base,
        `https://f-${hostA.forwardOrigin!.ownerId}-${randomUUID().replaceAll("-", "")}.${baseHost}`,
        "/",
        cookieFor(sessionA.sessionCookie),
      );
      expect(ghost.status).toBe(404);
      expect(JSON.parse(ghost.body)).toMatchObject({ error: { code: "forward_not_found" } });

      // Namespace edges stay bounded even with a valid session attached: the
      // bare base and a wrong port are not child origins.
      expect(
        (
          await childGet(
            hostA.base,
            FORWARD_ORIGIN_BASE_URL,
            "/",
            cookieFor(sessionA.sessionCookie),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await childGet(
            hostA.base,
            `${sessionA.childOrigin}:8443`,
            "/",
            cookieFor(sessionA.sessionCookie),
          )
        ).status,
      ).toBe(404);

      // The legacy cookie names confer nothing anywhere: the prefixless
      // API-origin route they used to select is gone…
      const legacyApiOrigin = await rawGet(
        new URL(`http://127.0.0.1:${new URL(hostA.base).port}/`),
        {
          cookie: "lc_relay=srv-tenant-a; lc_forward=junk",
        },
      );
      expect(legacyApiOrigin.status).toBe(404);
      // …and on a child origin only the origin-bound `__Host-` session
      // authorizes — `lc_forward` is payload at best, never a credential.
      const legacyChild = await childGet(
        hostA.base,
        sessionA.childOrigin,
        "/",
        "lc_forward=junk; lc_relay=srv-tenant-a",
      );
      expect(legacyChild.status).toBe(403);
      expect(JSON.parse(legacyChild.body)).toMatchObject({
        error: { code: "forward_session_required" },
      });
    });

    it("binds each child session to its exact forward origin, so sibling forwards on one host cannot read each other", async () => {
      const host = await registerHostRelayed("srv-fwd-swap");
      const upstreamOne = await startUpstreamHttpServer();
      const upstreamTwo = await startUpstreamHttpServer();
      cleanups.push(
        () => new Promise<void>((resolve) => upstreamOne.server.close(() => resolve())),
      );
      cleanups.push(
        () => new Promise<void>((resolve) => upstreamTwo.server.close(() => resolve())),
      );

      const sessionOne = await openChildSession(host, upstreamOne.port);
      const sessionTwo = await openChildSession(
        host,
        upstreamTwo.port,
        host.mintPairing().credential,
      );

      const rootOne = await childGet(
        host.base,
        sessionOne.childOrigin,
        "/",
        cookieFor(sessionOne.sessionCookie),
      );
      expect(rootOne.status).toBe(200);
      expect(JSON.parse(rootOne.body).host).toBe(`localhost:${upstreamOne.port}`);
      const rootTwo = await childGet(
        host.base,
        sessionTwo.childOrigin,
        "/",
        cookieFor(sessionTwo.sessionCookie),
      );
      expect(rootTwo.status).toBe(200);
      expect(JSON.parse(rootTwo.body).host).toBe(`localhost:${upstreamTwo.port}`);

      // Same host, same owner, sibling child origins: one's cookie is exactly
      // nobody's credential on the other.
      const swapped = await childGet(
        host.base,
        sessionTwo.childOrigin,
        "/",
        cookieFor(sessionOne.sessionCookie),
      );
      expect(swapped.status).toBe(403);
      expect(JSON.parse(swapped.body)).toMatchObject({
        error: { code: "forward_session_required" },
      });
    });

    it("tunnels the host's bounded non-2xx entry failures verbatim (invalid token; unconfigured browser forwarding)", async () => {
      const host = await registerHostRelayed("srv-fwd-bad-token");

      // An invalid/expired enter token through the relay: the host's 400 HTML
      // page arrives unfollowed and mints nothing.
      const badToken = await rawGet(new URL(`${host.base}/forward/does-not-exist/enter?fwt=bogus`));
      expect(badToken.status).toBe(400);
      expect(badToken.headers["set-cookie"]).toBeUndefined();
      expect(badToken.body).toContain("<html");

      // Raw TCP forwarding without a configured forward origin: creation still
      // returns the raw forward but omits enterPath, and the browser entry
      // route fails with the explicit bounded error — never a shared-origin
      // fallback.
      const bare = await registerHost(await startRelay(), "srv-fwd-bare", {
        withPortForward: true,
        withForwardOrigin: false,
      });
      const upstream = await startUpstreamHttpServer();
      cleanups.push(() => new Promise<void>((resolve) => upstream.server.close(() => resolve())));
      const bareToken = await issueAccessToken(bare.base, bare.pairing.credential, [
        "ports:forward",
      ]);
      const bareForward = await fetch(`${bare.base}/api/ports/forward`, {
        method: "POST",
        headers: { authorization: `Bearer ${bareToken}`, "content-type": "application/json" },
        body: JSON.stringify({ targetPort: upstream.port }),
      });
      expect(bareForward.status).toBe(200);
      const bareResult = (await bareForward.json()) as {
        forward: { id: string; listenPort: number };
        enterPath?: string;
      };
      expect(bareResult.forward.listenPort).toBeGreaterThan(0);
      expect(bareResult.enterPath).toBeUndefined();
      const bareEnter = await rawGet(
        new URL(`${bare.base}/forward/${bareResult.forward.id}/enter?fwt=whatever`),
      );
      expect(bareEnter.status).toBe(503);
      expect(JSON.parse(bareEnter.body)).toMatchObject({
        error: { code: "forward_browser_unavailable" },
      });
    });
  });
});

/**
 * Direct coverage of the identity derivation (the e2e suite can only observe
 * same-source visitors, since every visitor in-process shares one loopback
 * address). Distinct-visitor differentiation, normalization, stability, and
 * opacity are asserted on the pure function.
 */
describe("relayVisitorClientId", () => {
  const salt = randomBytes(32);

  it("gives distinct source addresses distinct identities", () => {
    const ids = new Set([
      relayVisitorClientId(salt, "127.0.0.1"),
      relayVisitorClientId(salt, "127.0.0.2"),
      relayVisitorClientId(salt, "10.1.2.3"),
      relayVisitorClientId(salt, "2001:db8::1"),
    ]);
    expect(ids.size).toBe(4);
  });

  it("is stable per address and bounded/opaque on the wire", () => {
    const id = relayVisitorClientId(salt, "192.168.1.7");
    expect(relayVisitorClientId(salt, "192.168.1.7")).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain("192.168");
  });

  it("normalizes ::ffff:-mapped forms onto the plain IPv4 identity", () => {
    expect(relayVisitorClientId(salt, "::ffff:192.168.1.7")).toBe(
      relayVisitorClientId(salt, "192.168.1.7"),
    );
  });

  it("degrades a missing address to one bounded shared identity", () => {
    expect(relayVisitorClientId(salt, undefined)).toMatch(/^[0-9a-f]{32}$/);
    expect(relayVisitorClientId(salt, undefined)).toBe(relayVisitorClientId(salt, "unknown"));
  });

  it("is not linkable across relays (per-relay salts)", () => {
    expect(relayVisitorClientId(randomBytes(32), "127.0.0.1")).not.toBe(
      relayVisitorClientId(randomBytes(32), "127.0.0.1"),
    );
  });
});
