import {
  createServer as createHttpServer,
  request as httpRequestNode,
  type IncomingHttpHeaders,
  type Server as HttpServer,
} from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { RemoteAccessServer, RemoteAuthStore, RemotePortForwardGateway } from "@/main/remote";
import { PortProxy } from "@/main/remote/portForward/portProxy";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { RelayServer, type RelayServerInfo } from "./relayServer";
import { startRelayHost, type RelayHostHandle } from "./relayHost";

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
        protocolVersion: 1,
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

  it("rejects invalid public base URLs before listening", async () => {
    await expect(
      new RelayServer({
        host: "127.0.0.1",
        port: 0,
        publicBaseUrl: "relay.example.test",
      }).start(),
    ).rejects.toThrow(/absolute http\(s\) URL/);
    await expect(
      new RelayServer({
        host: "127.0.0.1",
        port: 0,
        publicBaseUrl: "ftp://relay.example.test",
      }).start(),
    ).rejects.toThrow(/absolute http\(s\) URL/);
  });

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

  async function startRelay(): Promise<RelayServerInfo> {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());
    return relayInfo;
  }

  /**
   * Starts a real `RemoteAccessServer` (optionally with a port-forward gateway
   * wired up, mirroring `RemoteAccessServer.test.ts`'s port-forward setup) and
   * bridges it to an already-running relay via `startRelayHost`. Multiple
   * hosts can register onto the same `relayInfo` for multi-tenant tests.
   */
  async function registerHost(
    relayInfo: RelayServerInfo,
    serverId: string,
    options: { readonly withPortForward?: boolean } = {},
  ) {
    const authStore = new RemoteAuthStore();
    const pairing = authStore.issuePairingCredential({});
    const portForward = options.withPortForward
      ? new RemotePortForwardGateway({ bindHost: "127.0.0.1" })
      : undefined;
    const portProxy = portForward ? new PortProxy({ gateway: portForward }) : undefined;
    const rac = new RemoteAccessServer({
      appVersion: "9.9.9",
      identity: { desktopId: serverId, label: "Relay Test Server" },
      authStore,
      host: "127.0.0.1",
      advertisedHost: "127.0.0.1",
      port: 0,
      callSupervisor: (async () => ({})) as never,
      ...(portForward && portProxy ? { portForward, portProxy } : {}),
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
        onRegistered: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
    cleanups.push(() => handle?.dispose());

    const base = `http://127.0.0.1:${relayInfo.port}/s/${encodeURIComponent(serverId)}`;
    return { base, racInfo, pairing, portForward, portProxy };
  }

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

  function startUpstreamHttpServer(): Promise<{ port: number; server: HttpServer }> {
    return new Promise((resolve, reject) => {
      const server = createHttpServer((req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ url: req.url, host: req.headers.host }));
      });
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        resolve({ port: (server.address() as AddressInfo).port, server });
      });
    });
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
        protocolVersion: 1,
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
      control.send(JSON.stringify({ t: "register", protocolVersion: 1, serverId, secret }));
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
        protocolVersion: 1,
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
   * Port forwarding (docs/MOBILE_DEV.md's dev-server pairing) reached *through*
   * the relay: `GET /forward/<id>/enter?fwt=<token>` mints the desktop's
   * `lc_forward` session cookie (src/main/remote/portForward/portProxy.ts) and
   * 302s to `/`; the relay must tunnel that redirect + cookie verbatim (not
   * follow it, not mangle it) and additionally mint its own `lc_relay` routing
   * cookie so subsequent *prefixless* requests/upgrades — a dev server's own
   * asset paths and HMR socket, which don't carry the `/s/<id>` prefix — still
   * reach the right host.
   */
  describe("port-forward routing over the relay", () => {
    function startUpstreamWsEchoServer(): Promise<{ port: number; wss: WebSocketServer }> {
      return new Promise((resolve) => {
        const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
        wss.on("connection", (ws) => {
          ws.on("message", (data) => ws.send(data.toString()));
        });
        wss.once("listening", () => {
          resolve({ port: (wss.address() as AddressInfo).port, wss });
        });
      });
    }

    /**
     * Drives a real `/api/ports/forward` → `GET /forward/<id>/enter` round
     * trip through the relay and returns the two cookie values a browser
     * would hold afterward.
     */
    async function openPortForwardSession(
      hostBase: string,
      credential: string,
      upstreamPort: number,
    ): Promise<{ forwardId: string; forwardCookie: string; relayCookie: string }> {
      const token = await issueAccessToken(hostBase, credential, ["ports:forward"]);
      const forwardResponse = await fetch(`${hostBase}/api/ports/forward`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ targetPort: upstreamPort }),
      });
      expect(forwardResponse.status).toBe(200);
      const forwardResult = (await forwardResponse.json()) as {
        forward: { id: string };
        enterPath: string;
      };

      const enterResponse = await rawGet(new URL(`${hostBase}${forwardResult.enterPath}`));
      expect(enterResponse.status).toBe(302);
      expect(enterResponse.headers.location).toBe("/");
      const setCookies = enterResponse.headers["set-cookie"] ?? [];
      const forwardSetCookie = setCookies.find((cookie) => cookie.startsWith("lc_forward="));
      const relaySetCookie = setCookies.find((cookie) => cookie.startsWith("lc_relay="));
      expect(forwardSetCookie).toBeTruthy();
      expect(relaySetCookie).toBeTruthy();

      return {
        forwardId: forwardResult.forward.id,
        forwardCookie: extractCookieValue(forwardSetCookie!, "lc_forward"),
        relayCookie: extractCookieValue(relaySetCookie!, "lc_relay"),
      };
    }

    it("tunnels the enter redirect verbatim and mints its own relay routing cookie alongside the forward session cookie", async () => {
      const relayInfo = await startRelay();
      const host = await registerHost(relayInfo, "srv-fwd-a", { withPortForward: true });
      const upstream = await startUpstreamHttpServer();
      cleanups.push(() => new Promise<void>((resolve) => upstream.server.close(() => resolve())));

      const token = await issueAccessToken(host.base, host.pairing.credential, ["ports:forward"]);
      const forwardResponse = await fetch(`${host.base}/api/ports/forward`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ targetPort: upstream.port }),
      });
      expect(forwardResponse.status).toBe(200);
      const forwardResult = (await forwardResponse.json()) as {
        forward: { id: string };
        enterPath: string;
      };

      const enterResponse = await rawGet(new URL(`${host.base}${forwardResult.enterPath}`));
      expect(enterResponse.status).toBe(302);
      expect(enterResponse.headers.location).toBe("/");
      const setCookies = enterResponse.headers["set-cookie"] ?? [];
      const forwardSetCookie = setCookies.find((cookie) => cookie.startsWith("lc_forward="));
      const relaySetCookie = setCookies.find((cookie) => cookie.startsWith("lc_relay="));
      expect(forwardSetCookie).toBeTruthy();
      expect(relaySetCookie).toBeTruthy();
      // No `Secure` attribute: the relay itself listens plain HTTP behind a
      // fronting TLS proxy, so `Secure` would make browsers drop the cookie.
      expect(relaySetCookie).toContain("HttpOnly");
      expect(relaySetCookie).toContain("SameSite=Lax");
      expect(relaySetCookie).not.toContain("Secure");
      expect(extractCookieValue(relaySetCookie!, "lc_relay")).toBe(encodeURIComponent("srv-fwd-a"));
    });

    it("routes prefixless HTTP requests (dev-server assets, nested path + query) to the forwarded server via the relay routing cookie", async () => {
      const relayInfo = await startRelay();
      const host = await registerHost(relayInfo, "srv-fwd-assets", { withPortForward: true });
      const upstream = await startUpstreamHttpServer();
      cleanups.push(() => new Promise<void>((resolve) => upstream.server.close(() => resolve())));

      const { forwardCookie, relayCookie } = await openPortForwardSession(
        host.base,
        host.pairing.credential,
        upstream.port,
      );
      const cookieHeader = `lc_forward=${forwardCookie}; lc_relay=${relayCookie}`;

      const rootResponse = await fetch(`http://127.0.0.1:${relayInfo.port}/`, {
        headers: { cookie: cookieHeader },
      });
      expect(rootResponse.status).toBe(200);
      await expect(rootResponse.json()).resolves.toEqual({
        url: "/",
        host: `localhost:${upstream.port}`,
      });

      // Nested path + query string, prefixless (no `/s/<id>`) — this is what a
      // dev server's own bundle/HMR asset requests look like, including under
      // `/assets/...`: that prefix is where the desktop's own bundled mobile
      // PWA otherwise lives, but an active forward session wins over it (see
      // `isReservedForwardProxyPath` and the `/assets/` branch in
      // `httpRouter`), so it routes to the forward here too, same as any
      // other prefixless path.
      const nestedResponse = await fetch(
        `http://127.0.0.1:${relayInfo.port}/assets/some/nested/dev/asset.js?v=1`,
        { headers: { cookie: cookieHeader } },
      );
      expect(nestedResponse.status).toBe(200);
      await expect(nestedResponse.json()).resolves.toEqual({
        url: "/assets/some/nested/dev/asset.js?v=1",
        host: `localhost:${upstream.port}`,
      });
    });

    it("routes prefixless WebSocket upgrades (e.g. Vite/webpack HMR) to the forwarded server via the relay routing cookie", async () => {
      const relayInfo = await startRelay();
      const host = await registerHost(relayInfo, "srv-fwd-ws", { withPortForward: true });
      const upstream = await startUpstreamWsEchoServer();
      cleanups.push(() => new Promise<void>((resolve) => upstream.wss.close(() => resolve())));

      const { forwardCookie, relayCookie } = await openPortForwardSession(
        host.base,
        host.pairing.credential,
        upstream.port,
      );

      const wsUrl = new URL(`http://127.0.0.1:${relayInfo.port}/anything`);
      wsUrl.protocol = "ws:";
      const client = new WebSocket(wsUrl, {
        headers: { cookie: `lc_forward=${forwardCookie}; lc_relay=${relayCookie}` },
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
    });

    it("keeps prefixless routing bound to the correct host when multiple hosts share the relay, and 404s an unknown relay routing cookie", async () => {
      const relayInfo = await startRelay();
      const hostA = await registerHost(relayInfo, "srv-tenant-a", { withPortForward: true });
      const hostB = await registerHost(relayInfo, "srv-tenant-b", { withPortForward: true });
      const upstreamA = await startUpstreamHttpServer();
      const upstreamB = await startUpstreamHttpServer();
      cleanups.push(() => new Promise<void>((resolve) => upstreamA.server.close(() => resolve())));
      cleanups.push(() => new Promise<void>((resolve) => upstreamB.server.close(() => resolve())));

      const sessionA = await openPortForwardSession(
        hostA.base,
        hostA.pairing.credential,
        upstreamA.port,
      );
      // Host B also has an open forward session, proving A's cookie isn't
      // just "the only live session" — B's own session must be ignored.
      await openPortForwardSession(hostB.base, hostB.pairing.credential, upstreamB.port);

      const cookieHeader = `lc_forward=${sessionA.forwardCookie}; lc_relay=${sessionA.relayCookie}`;
      const response = await fetch(`http://127.0.0.1:${relayInfo.port}/`, {
        headers: { cookie: cookieHeader },
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        url: "/",
        host: `localhost:${upstreamA.port}`,
      });

      // An `lc_relay` cookie naming a server id that was never registered
      // (typo'd, or the host was permanently retired) 404s rather than
      // silently falling through to some other live host.
      const unknownResponse = await fetch(`http://127.0.0.1:${relayInfo.port}/`, {
        headers: { cookie: "lc_relay=does-not-exist" },
      });
      expect(unknownResponse.status).toBe(404);

      // Absent any cookie at all, a prefixless request still 404s (unchanged
      // pre-existing behavior).
      const noCookieResponse = await fetch(`http://127.0.0.1:${relayInfo.port}/`);
      expect(noCookieResponse.status).toBe(404);
    });

    it("tunnels non-2xx responses from the host (e.g. an expired/invalid enter token) without following or losing them", async () => {
      const relayInfo = await startRelay();
      const host = await registerHost(relayInfo, "srv-fwd-bad-token", { withPortForward: true });

      const badTokenResponse = await rawGet(
        new URL(`${host.base}/forward/does-not-exist/enter?fwt=bogus`),
      );
      expect(badTokenResponse.status).toBe(400);
      expect(badTokenResponse.headers["set-cookie"]).toBeUndefined();
      expect(badTokenResponse.body).toContain("<html");
    });
  });
});
