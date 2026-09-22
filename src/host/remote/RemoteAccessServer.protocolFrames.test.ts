import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, type WebSocketServer } from "ws";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";
import type { RemoteAccessServerHost } from "./remoteAccessServerTypes";

/**
 * B3 protocol-frame admission on the REAL server.
 *
 * ws's default `autoPong` answers RFC 6455 pings from inside its receiver,
 * before the application `ping` event and outside every `sendRaw` guard, so a
 * valid peer that stops reading could grow the transport queue with pong
 * frames while sending zero application bytes (the 8 KiB reconcile value is a
 * heartbeat audit allowance, not an admission bound). The workspace server now
 * constructs its `WebSocketServer` with `autoPong: false` and answers pings in
 * `server/wsConnections.ts` through `sendControlFrame`, which charges the same
 * per-socket cap and aggregate principal/global reservation as data frames.
 *
 * These tests drive the production composition end to end: real
 * `RemoteAccessServer`, real loopback HTTP/WS, real sessions and budgets.
 */

const servers: RemoteAccessServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Condition not met in time.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

interface Session {
  readonly accessToken: string;
  readonly refreshToken: string;
}

async function pair(
  info: RemoteAccessServerInfo,
  pairingUrl: string,
  scopes: readonly string[],
  label: string,
): Promise<Session> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes,
      client: { label, deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Session;
}

interface WsReader {
  readonly ws: WebSocket;
  next(): Promise<Record<string, unknown>>;
}

async function openReadyWs(info: RemoteAccessServerInfo, accessToken: string): Promise<WsReader> {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(ticketResponse.status).toBe(200);
  const ticket = ((await ticketResponse.json()) as { ticket: string }).ticket;
  const url = new URL("/ws", info.wsBaseUrl);
  url.searchParams.set("ticket", ticket);
  const ws = new WebSocket(url);
  ws.on("error", () => {});
  const queue: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString()) as unknown;
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  const next = (): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const deliver = (value: unknown) => resolve(value as Record<string, unknown>);
      const queued = queue.shift();
      if (queued !== undefined) {
        deliver(queued);
        return;
      }
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for frame")), 5_000);
      waiters.push((value) => {
        clearTimeout(timeout);
        deliver(value);
      });
    });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  await next(); // ready
  return { ws, next };
}

function hostOf(server: RemoteAccessServer): RemoteAccessServerHost {
  return server as unknown as RemoteAccessServerHost;
}

function serverSocketsFor(server: RemoteAccessServer, label: string): WebSocket[] {
  const sockets: WebSocket[] = [];
  for (const [ws, session] of hostOf(server).clients) {
    if (session.client?.label === label) sockets.push(ws);
  }
  return sockets;
}

function createServer(overrides: Partial<RemoteAccessServerOptions> = {}): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "protocol-frames", label: "Protocol frames" },
    host: "127.0.0.1",
    port: 0,
    ownsSupervisorPersistence: false,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never),
    ...overrides,
  });
  servers.push(server);
  return server;
}

describe("B3 protocol frames: admission and liveness", () => {
  it("bounds a quiet non-reading peer's ping flood by admission alone and keeps another principal healthy", async () => {
    const perPrincipalBudget = 8 * 1024;
    let interrupts = 0;
    const server = createServer({
      // No heartbeat sweep: the crossing reservation itself must terminate.
      webSocketHeartbeatIntervalMs: 0,
      maxQueuedBytesPerPrincipal: perPrincipalBudget,
      maxTotalQueuedBytes: 64 * 1024,
      maxWebSocketOutboundBufferBytes: 4 * 1024 * 1024,
      maxConcurrentPrincipalWork: 64,
      maxTotalPrincipalWork: 64,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
        if (name === "interruptThread") interrupts += 1;
        return {} as never;
      }),
    });
    const info = await server.start();
    const alice = await pair(info, info.pairingUrl, ["session:read", "session:operate"], "alice");
    const bob = await pair(
      info,
      server.issueIndependentPairingUrl("bob"),
      ["session:read", "session:operate"],
      "bob",
    );
    const aliceWs = await openReadyWs(info, alice.accessToken);
    const bobWs = await openReadyWs(info, bob.accessToken);

    const aliceServerSocket = serverSocketsFor(server, "alice")[0]!;
    const sessionId = hostOf(server).clients.get(aliceServerSocket)!.sessionId;
    // The peer stops reading; only protocol pings travel from it afterwards.
    (aliceWs.ws as unknown as { _socket: { pause(): void } })._socket.pause();

    const payload = Buffer.alloc(125, 7);
    let peakBuffered = 0;
    let peakAccounted = 0;
    let groundTruthViolated = false;
    const batches = 60;
    for (
      let batch = 0;
      batch < batches && serverSocketsFor(server, "alice").length > 0;
      batch += 1
    ) {
      for (let index = 0; index < 2_000; index += 1) {
        if (aliceServerSocket.readyState !== WebSocket.OPEN) break;
        aliceWs.ws.ping(payload);
      }
      await new Promise((resolve) => setImmediate(resolve));
      const accounted = hostOf(server).principalAdmission.outboundQueuedBytes(sessionId);
      const buffered = aliceServerSocket.bufferedAmount;
      peakAccounted = Math.max(peakAccounted, accounted);
      peakBuffered = Math.max(peakBuffered, buffered);
      // Ground truth: the transport queue can never exceed what the engine
      // reserved, beyond the finite close-frame residue (none before close).
      if (buffered > accounted + 512) groundTruthViolated = true;
    }

    expect(groundTruthViolated).toBe(false);
    expect(peakAccounted).toBeLessThanOrEqual(perPrincipalBudget);
    // No application frame was ever sent by the flooding peer, yet admission
    // terminated its socket instead of letting pong output grow unaccounted.
    expect(serverSocketsFor(server, "alice")).toHaveLength(0);
    await waitFor(() => hostOf(server).principalAdmission.outboundQueuedBytes(sessionId) === 0);

    // A distinct principal is untouched, keeps receiving canonical events, and
    // its control-class request still lands.
    expect(serverSocketsFor(server, "bob")).toHaveLength(1);
    server.publishSupervisorEvent({
      type: "remote-threads-changed",
      threadIds: ["after-ping-flood"],
    });
    await expect(bobWs.next()).resolves.toMatchObject({ type: "event" });
    const stop = await fetch(new URL("/api/threads/thread-1/interrupt", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${bob.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ reason: "user" }),
    });
    expect(stop.status).toBe(200);
    await stop.arrayBuffer();
    expect(interrupts).toBe(1);

    aliceWs.ws.terminate();
    bobWs.ws.close();
  }, 30_000);

  it("answers a protocol ping with a same-payload pong and survives heartbeat sweeps", async () => {
    const server = createServer({
      webSocketHeartbeatIntervalMs: 50,
      maxQueuedBytesPerPrincipal: 64 * 1024,
      maxTotalQueuedBytes: 256 * 1024,
      maxWebSocketOutboundBufferBytes: 4 * 1024 * 1024,
    });
    const info = await server.start();
    const alice = await pair(info, info.pairingUrl, ["session:read"], "alice");
    const aliceWs = await openReadyWs(info, alice.accessToken);

    // RFC 6455: the pong carries the ping payload (our handler, not autoPong).
    const pongPayload = new Promise<Buffer>((resolve) => {
      aliceWs.ws.once("pong", (data: Buffer) => resolve(data));
    });
    aliceWs.ws.ping(Buffer.from("probe"));
    await expect(pongPayload).resolves.toEqual(Buffer.from("probe"));

    // Heartbeats keep pinging (the sweep clears liveness, the client auto-pongs
    // and `ws.on("pong")` restores it). Seeing at least two sweeps proves the
    // first ping was answered — an unanswered one terminates on the next sweep.
    let heartbeatsSeen = 0;
    aliceWs.ws.on("ping", () => {
      heartbeatsSeen += 1;
    });
    await waitFor(() => heartbeatsSeen >= 2, 5_000);
    expect(serverSocketsFor(server, "alice")).toHaveLength(1);
    const sessionId = hostOf(server).clients.get(serverSocketsFor(server, "alice")[0]!)!.sessionId;
    await waitFor(() => hostOf(server).principalAdmission.outboundQueuedBytes(sessionId) === 0);

    aliceWs.ws.close();
  }, 20_000);

  it("lets ws reject an oversized protocol control frame without a pong or a crash", async () => {
    const server = createServer();
    const info = await server.start();
    const alice = await pair(info, info.pairingUrl, ["session:read"], "alice");
    const aliceWs = await openReadyWs(info, alice.accessToken);

    const close = new Promise<number>((resolve) => {
      aliceWs.ws.once("close", (code: number) => resolve(code));
    });
    // FIN + ping opcode, masked, 7-bit length 126: illegal for a control frame
    // (RFC 6455 §5.5), so the receiver rejects it with 1002 before any `ping`
    // event — ws owns protocol-error handling, the pong path is never reached.
    (aliceWs.ws as unknown as { _socket: { write(frame: Buffer): void } })._socket.write(
      Buffer.from([0x89, 0xfe, 0x00, 0x7e, 0x00, 0x00, 0x00, 0x00]),
    );
    await expect(close).resolves.toBe(1002);
    await waitFor(() => serverSocketsFor(server, "alice").length === 0);

    // The server and its admission state stay intact for the next client.
    const bob = await pair(info, server.issueIndependentPairingUrl("bob"), ["session:read"], "bob");
    const bobWs = await openReadyWs(info, bob.accessToken);
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["after-1002"] });
    await expect(bobWs.next()).resolves.toMatchObject({ type: "event" });
    bobWs.ws.close();
  }, 20_000);

  it("keeps exactly one ping listener per connection across floods and reconnects", async () => {
    const server = createServer({ webSocketHeartbeatIntervalMs: 0 });
    const info = await server.start();
    const alice = await pair(info, info.pairingUrl, ["session:read"], "alice");

    const first = await openReadyWs(info, alice.accessToken);
    const firstServerSocket = serverSocketsFor(server, "alice")[0]!;
    expect(firstServerSocket.listenerCount("ping")).toBe(1);

    const payload = Buffer.from("no-leak");
    for (let index = 0; index < 200; index += 1) first.ws.ping(payload);
    await waitFor(
      () =>
        hostOf(server).principalAdmission.outboundQueuedBytes(
          hostOf(server).clients.get(firstServerSocket)!.sessionId,
        ) === 0,
    );
    expect(firstServerSocket.listenerCount("ping")).toBe(1);

    first.ws.close();
    await waitFor(() => serverSocketsFor(server, "alice").length === 0);

    const second = await openReadyWs(info, alice.accessToken);
    const secondServerSocket = serverSocketsFor(server, "alice")[0]!;
    expect(secondServerSocket.listenerCount("ping")).toBe(1);
    // No server-level listener was installed: the handler is per connection.
    expect((server as unknown as { wss: WebSocketServer }).wss.listenerCount("ping")).toBe(0);
    second.ws.close();
  }, 20_000);
});

describe("B3 protocol frames: wire separation", () => {
  it("does not treat a JSON ping message as an RFC ping", async () => {
    const server = createServer({ webSocketHeartbeatIntervalMs: 0 });
    const info = await server.start();
    const alice = await pair(info, info.pairingUrl, ["session:read"], "alice");
    const aliceWs = await openReadyWs(info, alice.accessToken);

    // The application-level JSON ping still gets its JSON pong...
    aliceWs.ws.send(JSON.stringify({ type: "ping", id: "app-1", sentAt: 7 }));
    await expect(
      (async () => {
        for (;;) {
          const message = await aliceWs.next();
          if (message.type === "pong") return message;
        }
      })(),
    ).resolves.toMatchObject({ type: "pong", id: "app-1", sentAt: 7 });

    // ...and the wire-level ping went through the protocol path (payload
    // preserved, no JSON frame emitted for it).
    const pongPayload = new Promise<Buffer>((resolve) => {
      aliceWs.ws.once("pong", (data: Buffer) => resolve(data));
    });
    aliceWs.ws.ping(Buffer.from("wire"));
    await expect(pongPayload).resolves.toEqual(Buffer.from("wire"));
    aliceWs.ws.close();
  }, 20_000);
});
