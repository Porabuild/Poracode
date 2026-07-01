import { WebSocket, type RawData } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { RemoteAccessServer, RemoteAuthStore } from "@/main/remote";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { RelayServer } from "./relayServer";
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

  async function setup() {
    const authStore = new RemoteAuthStore();
    const pairing = authStore.issuePairingCredential({});
    const rac = new RemoteAccessServer({
      appVersion: "9.9.9",
      identity: { desktopId: "srv-1", label: "Relay Test Server" },
      authStore,
      host: "127.0.0.1",
      advertisedHost: "127.0.0.1",
      port: 0,
      callSupervisor: (async () => ({})) as never,
    });
    const racInfo = await rac.start();
    cleanups.push(() => rac.dispose());

    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const relayInfo = await relay.start();
    cleanups.push(() => relay.dispose());

    const racPort = new URL(racInfo.httpBaseUrl).port;
    let handle: RelayHostHandle | null = null;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("relay registration timed out")), 5000);
      handle = startRelayHost({
        relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
        serverId: "srv-1",
        secret: "shhh",
        localHttpUrl: `http://127.0.0.1:${racPort}`,
        onRegistered: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
    cleanups.push(() => handle?.dispose());

    const base = `http://127.0.0.1:${relayInfo.port}/s/srv-1`;
    return { base, relayInfo, pairing };
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
});
