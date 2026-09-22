import { afterEach, describe, expect, it, vi } from "vitest";
import { request as httpRequest, type ClientRequest, type IncomingHttpHeaders } from "node:http";
import { WebSocket } from "ws";
import { WebSocketHeartbeat } from "./server/wsHeartbeat";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";
import type { RemoteAccessServerHost } from "./remoteAccessServerTypes";
import { classifyIngressRequest } from "./remoteAccessServerIngress";

/**
 * B3 acceptance on the REAL server over real HTTP/WebSocket transports:
 * a single authenticated principal (session) cannot consume the shared
 * budgets; a second principal behind the same address (NAT) stays fully
 * usable; Stop/control keeps its reserved capacity under that principal's
 * bulk saturation; budgets survive token refresh; in-flight work cannot
 * escape its quota by disconnecting; a frozen peer is evicted (resync on
 * reconnect) without touching other principals; and the B4 read-class seam is
 * carried without changing read contracts.
 */

const servers: RemoteAccessServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

interface Deferred {
  resolve(): void;
  readonly promise: Promise<void>;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { resolve, promise };
}

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

async function exchangePairingCredential(
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

async function refreshSession(info: RemoteAccessServerInfo, session: Session): Promise<Session> {
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "refresh_token", refreshToken: session.refreshToken }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Session;
}

interface RawHttpResult {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

interface RawHttpRequest {
  readonly response: Promise<RawHttpResult>;
  destroy(): void;
}

/** `agent: false` guarantees a fresh TCP socket per call, so the per-socket
 * transport budget can never be mistaken for the principal budget. */
function rawJsonRequest(
  info: RemoteAccessServerInfo,
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): RawHttpRequest {
  const url = new URL(path, info.httpBaseUrl);
  let request!: ClientRequest;
  const response = new Promise<RawHttpResult>((resolve, reject) => {
    request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        agent: false,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
  return { response, destroy: () => request.destroy() };
}

function errorCode(body: string): string | null {
  try {
    return (JSON.parse(body) as { error?: { code?: string } }).error?.code ?? null;
  } catch {
    return null;
  }
}

async function issueWebSocketTicket(
  info: RemoteAccessServerInfo,
  accessToken: string,
): Promise<string> {
  const response = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { ticket: string }).ticket;
}

type WsOpenResult =
  | { readonly ok: true; readonly ws: WebSocket; readonly next: () => Promise<unknown> }
  | { readonly ok: false; readonly status: number; readonly retryAfter: string | undefined };

function createWsReader(ws: WebSocket): () => Promise<unknown> {
  const queue: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString()) as unknown;
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return () =>
    new Promise((resolve, reject) => {
      if (queue.length > 0) {
        resolve(queue.shift());
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for websocket message")),
        5_000,
      );
      waiters.push((value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
}

async function openWs(info: RemoteAccessServerInfo, accessToken: string): Promise<WsOpenResult> {
  const ticket = await issueWebSocketTicket(info, accessToken);
  const url = new URL("/ws", info.wsBaseUrl);
  url.searchParams.set("ticket", ticket);
  const ws = new WebSocket(url);
  // Server-side eviction can reset several sockets at once; keep any error
  // after the first from surfacing as an unhandled emitter error.
  ws.on("error", () => {});
  return await new Promise<WsOpenResult>((resolve, reject) => {
    ws.once("open", () => resolve({ ok: true, ws, next: createWsReader(ws) }));
    ws.once("unexpected-response", (_req, res) => {
      const status = res.statusCode ?? 0;
      const retryAfter = res.headers["retry-after"] as string | undefined;
      res.resume();
      resolve({ ok: false, status, retryAfter });
    });
    ws.once("error", reject);
  });
}

async function openReadyWs(
  info: RemoteAccessServerInfo,
  accessToken: string,
): Promise<{ ws: WebSocket; next: () => Promise<unknown> }> {
  const opened = await openWs(info, accessToken);
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error("unreachable");
  await opened.next(); // ready
  return { ws: opened.ws, next: opened.next };
}

/** Skips interleaved frames (e.g. baseline chunks) until one matches. */
async function nextMatching(
  next: () => Promise<unknown>,
  match: (message: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  for (;;) {
    const message = (await next()) as Record<string, unknown>;
    if (match(message)) return message;
  }
}

function serverSocketsFor(server: RemoteAccessServer, label: string): WebSocket[] {
  const host = server as unknown as RemoteAccessServerHost;
  const sockets: WebSocket[] = [];
  for (const [ws, session] of host.clients) {
    if (session.client?.label === label) sockets.push(ws);
  }
  return sockets;
}

function createServer(overrides: Partial<RemoteAccessServerOptions> = {}): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "principal-fairness", label: "Fairness" },
    host: "127.0.0.1",
    port: 0,
    webSocketHeartbeatIntervalMs: 0,
    ownsSupervisorPersistence: false,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never),
    ...overrides,
  });
  servers.push(server);
  return server;
}

const sendBody = { prompt: "bulk", config: { model: "test-model" } };

describe("principal fairness: HTTP work budgets", () => {
  it("keeps Stop capacity for the same principal and full capacity for a second principal behind one address", async () => {
    const hungSends: Deferred[] = [];
    let interrupts = 0;
    const server = createServer({
      // Transport admission stays out of the way: the principal budget is the
      // only gate under test. Every request uses its own TCP socket.
      maxConcurrentIngressWork: 64,
      maxConcurrentIngressWorkPerSource: 64,
      maxConcurrentIngressWorkPerAddress: 64,
      reservedIngressControlCapacity: 0,
      reservedIngressControlCapacityPerSource: 0,
      maxConcurrentPrincipalWork: 3,
      reservedPrincipalControlCapacity: 1,
      maxTotalPrincipalWork: 64,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
        if (name === "sendThreadInput") {
          const gate = createDeferred();
          hungSends.push(gate);
          await gate.promise;
          return {} as never;
        }
        if (name === "interruptThread") {
          interrupts += 1;
          return {} as never;
        }
        return {} as never;
      }),
    });
    const info = await server.start();
    const alice = await exchangePairingCredential(
      info,
      info.pairingUrl,
      ["session:operate"],
      "alice",
    );
    const bobPairing = server.issueIndependentPairingUrl("bob");
    const bob = await exchangePairingCredential(info, bobPairing, ["session:operate"], "bob");

    // Alice's bulk ceiling is 3 - 1 reserved = 2. Two hung sends saturate it
    // through two distinct TCP sockets.
    const aliceSends = [
      rawJsonRequest(info, "/api/threads/thread-1/send", alice.accessToken, sendBody),
      rawJsonRequest(info, "/api/threads/thread-1/send", alice.accessToken, sendBody),
    ];
    await waitFor(() => hungSends.length === 2);

    // A third request from a NEW TCP socket is still rejected: the budget is
    // the principal's, not the socket's.
    const shed = await rawJsonRequest(
      info,
      "/api/threads/thread-1/send",
      alice.accessToken,
      sendBody,
    ).response;
    expect(shed.status).toBe(429);
    expect(errorCode(shed.body)).toBe("principal_busy");
    expect(shed.headers["retry-after"]).toBe("1");
    expect(hungSends).toHaveLength(2);

    // Stop stays admissible through the principal's reserved control slice.
    const stop = await rawJsonRequest(info, "/api/threads/thread-1/interrupt", alice.accessToken, {
      reason: "user",
    }).response;
    expect(stop.status).toBe(200);
    expect(interrupts).toBe(1);

    // Bob is behind the same address (NAT) and has his own budget.
    const bobSend = rawJsonRequest(info, "/api/threads/thread-1/send", bob.accessToken, sendBody);
    await waitFor(() => hungSends.length === 3);

    for (const gate of hungSends) gate.resolve();
    const outcomes = await Promise.all([
      ...aliceSends.map((send) => send.response),
      bobSend.response,
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([200, 200, 200]);
  }, 20_000);

  it("does not release in-flight work when the client disconnects", async () => {
    const hungSends: Deferred[] = [];
    const server = createServer({
      maxConcurrentIngressWork: 64,
      maxConcurrentIngressWorkPerSource: 64,
      maxConcurrentIngressWorkPerAddress: 64,
      reservedIngressControlCapacity: 0,
      reservedIngressControlCapacityPerSource: 0,
      maxConcurrentPrincipalWork: 2,
      reservedPrincipalControlCapacity: 1,
      maxTotalPrincipalWork: 64,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
        if (name === "sendThreadInput") {
          const gate = createDeferred();
          hungSends.push(gate);
          await gate.promise;
          return {} as never;
        }
        return {} as never;
      }),
    });
    const info = await server.start();
    const alice = await exchangePairingCredential(
      info,
      info.pairingUrl,
      ["session:operate"],
      "alice",
    );

    const inFlight = rawJsonRequest(
      info,
      "/api/threads/thread-1/send",
      alice.accessToken,
      sendBody,
    );
    const inFlightOutcome = inFlight.response.catch(() => null);
    await waitFor(() => hungSends.length === 1);

    // The client goes away; the handler is still running, so the reservation
    // must stay held.
    inFlight.destroy();
    await waitFor(() => true, 0);
    const rejected = await rawJsonRequest(
      info,
      "/api/threads/thread-1/send",
      alice.accessToken,
      sendBody,
    ).response;
    expect(rejected.status).toBe(429);
    expect(errorCode(rejected.body)).toBe("principal_busy");
    expect(hungSends).toHaveLength(1);

    // Once the admitted work actually settles, the slot frees.
    hungSends[0]!.resolve();
    const admitted = rawJsonRequest(
      info,
      "/api/threads/thread-1/send",
      alice.accessToken,
      sendBody,
    );
    await waitFor(() => hungSends.length === 2);
    hungSends[1]!.resolve();
    expect((await admitted.response).status).toBe(200);
    await inFlightOutcome;
  }, 20_000);

  it("bounds pre-auth work per resolved client address while keeping control exempt", async () => {
    const hungSends: Deferred[] = [];
    const server = createServer({
      maxConcurrentIngressWork: 64,
      maxConcurrentIngressWorkPerSource: 64,
      maxConcurrentIngressWorkPerAddress: 2,
      reservedIngressControlCapacity: 0,
      reservedIngressControlCapacityPerSource: 0,
      maxConcurrentPrincipalWork: 64,
      maxTotalPrincipalWork: 64,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
        if (name === "sendThreadInput") {
          const gate = createDeferred();
          hungSends.push(gate);
          await gate.promise;
          return {} as never;
        }
        return {} as never;
      }),
    });
    const info = await server.start();
    const alice = await exchangePairingCredential(
      info,
      info.pairingUrl,
      ["session:operate"],
      "alice",
    );

    const first = rawJsonRequest(info, "/api/threads/thread-1/send", alice.accessToken, sendBody);
    const second = rawJsonRequest(info, "/api/threads/thread-1/send", alice.accessToken, sendBody);
    await waitFor(() => hungSends.length === 2);

    // A third distinct socket from the same address is shed pre-auth; the
    // per-socket allowance (64) is not what rejected it.
    const shed = await rawJsonRequest(
      info,
      "/api/threads/thread-1/send",
      alice.accessToken,
      sendBody,
    ).response;
    expect(shed.status).toBe(503);
    expect(errorCode(shed.body)).toBe("host_busy");
    expect(shed.headers["retry-after"]).toBe("1");

    // Control is exempt from the address bound, so Stop still lands.
    const stop = await rawJsonRequest(info, "/api/threads/thread-1/interrupt", alice.accessToken, {
      reason: "user",
    }).response;
    expect(stop.status).toBe(200);

    for (const gate of hungSends) gate.resolve();
    expect((await first.response).status).toBe(200);
    expect((await second.response).status).toBe(200);
  }, 20_000);
});

describe("principal fairness: WebSocket socket budgets", () => {
  it("caps sockets per principal, survives token refresh, and frees on close without touching another principal", async () => {
    const server = createServer({
      maxSocketsPerPrincipal: 2,
      maxTotalSockets: 4,
      maxConcurrentPrincipalWork: 64,
      maxTotalPrincipalWork: 64,
    });
    const info = await server.start();
    const alice = await exchangePairingCredential(info, info.pairingUrl, ["session:read"], "alice");
    const bob = await exchangePairingCredential(
      info,
      server.issueIndependentPairingUrl("bob"),
      ["session:read"],
      "bob",
    );

    const aliceFirst = await openReadyWs(info, alice.accessToken);
    const aliceSecond = await openReadyWs(info, alice.accessToken);
    expect(serverSocketsFor(server, "alice")).toHaveLength(2);

    // The third socket is rejected with a retry hint...
    const rejected = await openWs(info, alice.accessToken);
    expect(rejected).toMatchObject({ ok: false, status: 429 });
    if (rejected.ok) throw new Error("unreachable");
    expect(rejected.retryAfter).toBe("1");

    // ...while Bob, behind the same address, still gets his full budget.
    const bobFirst = await openReadyWs(info, bob.accessToken);
    const bobSecond = await openReadyWs(info, bob.accessToken);
    expect(serverSocketsFor(server, "bob")).toHaveLength(2);

    // A token refresh keeps the same session principal, so the budget is not
    // reset by the new bearer.
    const refreshed = await refreshSession(info, alice);
    const afterRefresh = await openWs(info, refreshed.accessToken);
    expect(afterRefresh).toMatchObject({ ok: false, status: 429 });

    // Closing one socket releases exactly one reservation.
    const closeWait = new Promise<void>((resolve) => aliceFirst.ws.once("close", () => resolve()));
    aliceFirst.ws.close();
    await closeWait;
    await waitFor(() => serverSocketsFor(server, "alice").length === 1);
    const reopened = await openWs(info, refreshed.accessToken);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) throw new Error("unreachable");

    aliceSecond.ws.close();
    bobFirst.ws.close();
    bobSecond.ws.close();
  }, 20_000);
});

describe("principal fairness: aggregate queued output", () => {
  /** Frames large enough to accumulate quickly behind a paused reader. */
  const publishBulkFrame = (server: RemoteAccessServer) => {
    server.publishSupervisorEvent({
      type: "remote-threads-changed",
      threadIds: Array.from({ length: 2_000 }, (_, index) => `thread-${index}`),
    });
  };

  /** One frame worth more than half the 256 KiB global test budget, so a
   * second synchronous publish must cross it and one retained frame alone
   * blocks the remaining margin. Membership events are byte-bounded by design
   * (H3), so this uses the unbounded git-summaries producer for the pressure
   * frame. */
  const publishHalfBudgetFrame = (server: RemoteAccessServer) => {
    server.publishSupervisorEvent({
      type: "remote-git-summaries",
      summaries: {
        "thread-pressure": {
          isRepo: true,
          branch: "main",
          totalInsertions: 0,
          totalDeletions: 0,
          ahead: 0,
          behind: 0,
          pr: {
            number: 1,
            state: "open",
            title: "x".repeat(160_000),
            url: "https://example.invalid/pr/1",
            isDraft: false,
          },
        },
      },
    });
  };

  it("evicts a frozen principal on the crossing send itself, with no audit or heartbeat", async () => {
    const queuedBudget = 256 * 1024;
    const server = createServer({
      maxQueuedBytesPerPrincipal: queuedBudget,
      maxTotalQueuedBytes: 4 * 1024 * 1024,
      maxWebSocketOutboundBufferBytes: 4 * 1024 * 1024,
      maxSocketsPerPrincipal: 8,
      maxTotalSockets: 16,
    });
    const info = await server.start();
    const alice = await exchangePairingCredential(info, info.pairingUrl, ["session:read"], "alice");
    const bob = await exchangePairingCredential(
      info,
      server.issueIndependentPairingUrl("bob"),
      ["session:read"],
      "bob",
    );
    const aliceWs = await openReadyWs(info, alice.accessToken);
    const bobWs = await openReadyWs(info, bob.accessToken);

    // Alice stops reading; the server-side queue for her socket grows.
    const aliceClientSocket = (
      aliceWs.ws as unknown as { _socket: { pause(): void; resume(): void } }
    )._socket;
    aliceClientSocket.pause();

    // No manual audit and no heartbeat (`webSocketHeartbeatIntervalMs: 0` in
    // the test server): the budget must bind on the sends themselves.
    let peakAliceBuffered = 0;
    const deadline = Date.now() + 15_000;
    while (serverSocketsFor(server, "alice").length > 0 && Date.now() < deadline) {
      publishBulkFrame(server);
      peakAliceBuffered = Math.max(
        peakAliceBuffered,
        serverSocketsFor(server, "alice")[0]?.bufferedAmount ?? 0,
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Alice's socket was evicted by the crossing send, and the advertised
    // bound held at every observable point.
    expect(serverSocketsFor(server, "alice")).toHaveLength(0);
    expect(peakAliceBuffered).toBeLessThanOrEqual(queuedBudget);

    // Bob, a distinct principal, is untouched and still receives canonical
    // events after the eviction.
    expect(serverSocketsFor(server, "bob")).toHaveLength(1);
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["after-evict"] });
    await expect(bobWs.next()).resolves.toMatchObject({ type: "event" });

    // The evicted peer observes the close (its reconnect would replay or
    // resync); nothing was silently skipped.
    aliceClientSocket.resume();
    await new Promise<void>((resolve) => {
      if (aliceWs.ws.readyState === WebSocket.CLOSED) resolve();
      else aliceWs.ws.once("close", () => resolve());
    });
    bobWs.ws.close();
  }, 30_000);

  it("refuses admission while an evicted peer's bytes are still retained, then recovers after close", async () => {
    const globalBudget = 256 * 1024;
    const server = createServer({
      // Per-principal is generous; the global bound is what must bind.
      maxQueuedBytesPerPrincipal: 4 * 1024 * 1024,
      maxTotalQueuedBytes: globalBudget,
      maxWebSocketOutboundBufferBytes: 4 * 1024 * 1024,
      maxSocketsPerPrincipal: 8,
      maxTotalSockets: 16,
    });
    const info = await server.start();
    const alice = await exchangePairingCredential(info, info.pairingUrl, ["session:read"], "alice");
    const bob = await exchangePairingCredential(
      info,
      server.issueIndependentPairingUrl("bob"),
      ["session:read"],
      "bob",
    );
    // Both peers are connected before the pressure so the refusal is observed
    // synchronously, before any transport close can release bytes.
    const aliceWs = await openReadyWs(info, alice.accessToken);
    await openReadyWs(info, bob.accessToken);
    const host = server as unknown as RemoteAccessServerHost;
    const aliceServerSocket = serverSocketsFor(server, "alice")[0]!;
    const bobServerSocket = serverSocketsFor(server, "bob")[0]!;
    const aliceSessionId = host.clients.get(aliceServerSocket)!.sessionId;
    const bobSessionId = host.clients.get(bobServerSocket)!.sessionId;
    const aliceClientSocket = (
      aliceWs.ws as unknown as { _socket: { pause(): void; resume(): void } }
    )._socket;
    aliceClientSocket.pause();

    // One publish, no event-loop turn: Alice reserves the first half-budget
    // frame, then Bob's attempt crosses the global budget. Alice (the largest
    // contributor) is evicted; Bob's canonical frame is refused rather than
    // overdrawing the aggregate, which terminates him for replay.
    publishHalfBudgetFrame(server);

    expect(serverSocketsFor(server, "alice")).toHaveLength(0);
    expect(serverSocketsFor(server, "bob")).toHaveLength(0);
    expect(aliceServerSocket.readyState).toBe(WebSocket.CLOSING);
    expect(bobServerSocket.readyState).toBe(WebSocket.CLOSING);
    // Alice's evicted socket still retains its queued bytes in the transport,
    // and the accounting still reserves them: no false-freed budget.
    expect(aliceServerSocket.bufferedAmount).toBeGreaterThan(0);
    const retained = host.principalAdmission.outboundQueuedBytes(aliceSessionId);
    expect(retained).toBeGreaterThan(globalBudget / 2);
    expect(retained).toBeLessThanOrEqual(globalBudget);
    expect(
      retained + host.principalAdmission.outboundQueuedBytes(bobSessionId),
    ).toBeLessThanOrEqual(globalBudget);

    // Once the closes actually land, the budget is genuinely free again and a
    // fresh peer receives canonical events.
    await waitFor(() => host.principalAdmission.outboundQueuedBytes(aliceSessionId) === 0);
    await waitFor(() => host.principalAdmission.outboundQueuedBytes(bobSessionId) === 0);
    aliceClientSocket.resume();
    const bobAgain = await openReadyWs(info, bob.accessToken);
    server.publishSupervisorEvent({
      type: "remote-threads-changed",
      threadIds: ["after-release"],
    });
    await expect(bobAgain.next()).resolves.toMatchObject({ type: "event" });
    bobAgain.ws.close();
  }, 30_000);

  it("heartbeat sweep audits accounting drift and never evicts a healthy peer", async () => {
    const server = createServer({
      // Sweeps are the ground-truth safety net, not the enforcement path.
      webSocketHeartbeatIntervalMs: 100,
      maxQueuedBytesPerPrincipal: 4 * 1024 * 1024,
      maxTotalQueuedBytes: 4 * 1024 * 1024,
      maxWebSocketOutboundBufferBytes: 4 * 1024 * 1024,
    });
    const info = await server.start();
    const alice = await exchangePairingCredential(info, info.pairingUrl, ["session:read"], "alice");
    const bob = await exchangePairingCredential(
      info,
      server.issueIndependentPairingUrl("bob"),
      ["session:read"],
      "bob",
    );
    const aliceWs = await openReadyWs(info, alice.accessToken);
    const bobWs = await openReadyWs(info, bob.accessToken);

    // Simulate lost accounting: the real transport queue is far above what the
    // engine reserved. The sweep must evict the drifted socket...
    const aliceServerSocket = serverSocketsFor(server, "alice")[0]!;
    Object.defineProperty(aliceServerSocket, "bufferedAmount", {
      configurable: true,
      get: () => 8 * 1024 * 1024,
    });
    await waitFor(() => serverSocketsFor(server, "alice").length === 0);

    // ...while Bob's accounted queue matches his real queue and survives.
    expect(serverSocketsFor(server, "bob")).toHaveLength(1);
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["after-sweep"] });
    await expect(bobWs.next()).resolves.toMatchObject({ type: "event" });

    aliceWs.ws.terminate();
    bobWs.ws.close();
  }, 20_000);

  it("bounds many sockets of one session and keeps another principal's budget and Stop usable", async () => {
    const queuedBudget = 192 * 1024;
    let interrupts = 0;
    const server = createServer({
      maxQueuedBytesPerPrincipal: queuedBudget,
      maxTotalQueuedBytes: 4 * 1024 * 1024,
      maxWebSocketOutboundBufferBytes: 4 * 1024 * 1024,
      maxSocketsPerPrincipal: 4,
      maxTotalSockets: 16,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
        if (name === "interruptThread") {
          interrupts += 1;
          return {} as never;
        }
        return {} as never;
      }),
    });
    const info = await server.start();
    const alice = await exchangePairingCredential(
      info,
      info.pairingUrl,
      ["session:read", "session:operate"],
      "alice",
    );
    const bob = await exchangePairingCredential(
      info,
      server.issueIndependentPairingUrl("bob"),
      ["session:read", "session:operate"],
      "bob",
    );

    // Alice opens the maximum sockets for one session and freezes all of them;
    // every socket shares one principal budget, not four.
    const aliceClientSockets: Array<{ pause(): void; resume(): void }> = [];
    for (let index = 0; index < 4; index += 1) {
      const opened = await openReadyWs(info, alice.accessToken);
      const raw = (opened.ws as unknown as { _socket: { pause(): void; resume(): void } })._socket;
      raw.pause();
      aliceClientSockets.push(raw);
    }
    const bobWs = await openReadyWs(info, bob.accessToken);
    expect(serverSocketsFor(server, "alice")).toHaveLength(4);

    let peakPrincipalBytes = 0;
    const deadline = Date.now() + 15_000;
    while (serverSocketsFor(server, "alice").length > 0 && Date.now() < deadline) {
      publishBulkFrame(server);
      const total = serverSocketsFor(server, "alice").reduce(
        (sum, socket) => sum + socket.bufferedAmount,
        0,
      );
      peakPrincipalBytes = Math.max(peakPrincipalBytes, total);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Every frozen socket was evicted, and their sum never crossed the shared
    // principal budget.
    expect(serverSocketsFor(server, "alice")).toHaveLength(0);
    expect(peakPrincipalBytes).toBeLessThanOrEqual(queuedBudget);

    // Bob's distinct principal keeps its socket, receives canonical events,
    // and its Stop request still lands.
    expect(serverSocketsFor(server, "bob")).toHaveLength(1);
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["after-evict"] });
    await expect(bobWs.next()).resolves.toMatchObject({ type: "event" });
    const stop = await rawJsonRequest(info, "/api/threads/thread-1/interrupt", bob.accessToken, {
      reason: "user",
    }).response;
    expect(stop.status).toBe(200);
    expect(interrupts).toBe(1);

    for (const socket of aliceClientSockets) socket.resume();
    bobWs.ws.close();
  }, 30_000);

  it("runs the queued-output audit from the heartbeat sweep", async () => {
    const onSweep = vi.fn<() => void>();
    const heartbeat = new WebSocketHeartbeat({
      intervalMs: 10,
      clients: new Map(),
      clientLiveness: new Map(),
      sendPing: () => {},
      onSweep,
    });
    heartbeat.start();
    try {
      await waitFor(() => onSweep.mock.calls.length > 0, 2_000);
    } finally {
      heartbeat.stop();
    }
    expect(onSweep).toHaveBeenCalled();
  });
});

describe("principal fairness: watch and baseline budgets", () => {
  const snapshot = {
    generation: "gen-1",
    fromCursor: 0,
    toCursor: 5,
    data: "hello",
    processState: "running",
    terminalSize: { cols: 80, rows: 24 },
  };

  function createWatchServer(
    overrides: Partial<RemoteAccessServerOptions> = {},
  ): RemoteAccessServer {
    return createServer({
      maxConcurrentPrincipalWork: 64,
      maxTotalPrincipalWork: 64,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
        if (name === "readTerminalSnapshot") return snapshot as never;
        return {} as never;
      }),
      ...overrides,
    });
  }

  it("returns typed retryable results for principal watch and baseline budgets", async () => {
    const server = createWatchServer({
      maxWatchesPerPrincipal: 4,
      maxTotalWatches: 8,
      // Alice retains one baseline stream; a second is over her budget. Bob,
      // with no retained stream, still fits his own allowance.
      maxBaselineStreamsPerPrincipal: 1,
      maxTotalBaselineStreams: 4,
    });
    const info = await server.start();
    const alice = await exchangePairingCredential(
      info,
      info.pairingUrl,
      ["session:read", "terminal:read"],
      "alice",
    );
    const bob = await exchangePairingCredential(
      info,
      server.issueIndependentPairingUrl("bob"),
      ["session:read", "terminal:read"],
      "bob",
    );
    const aliceWs = await openReadyWs(info, alice.accessToken);
    const bobWs = await openReadyWs(info, bob.accessToken);

    // Alice's first v2 baseline fits and is retained (chunks are the v2
    // delivery, so the first message is a chunk rather than a result frame).
    aliceWs.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "t1",
        cursorSync: { version: 2, watchId: "w1" },
      }),
    );
    await nextMatching(aliceWs.next, (message) => message.type === "terminal-watch-baseline-chunk");

    // A second retained baseline exceeds her stream budget: typed retryable
    // rejection, never a silent drop.
    aliceWs.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "t2",
        cursorSync: { version: 2, watchId: "w2" },
      }),
    );
    // Error results carry the canonical v1 envelope (existing behavior for
    // every pre-baseline rejection); only a ready result is version-tagged.
    await expect(
      nextMatching(aliceWs.next, (message) => message.type === "terminal-watch-result"),
    ).resolves.toEqual({
      type: "terminal-watch-result",
      id: "t2",
      cursorSync: {
        version: 1,
        watchId: "w2",
        result: {
          status: "error",
          code: "unavailable",
          retryable: true,
          reason: "principal-baseline-streams-capacity",
        },
      },
    });

    // The failed watch did not leak: Alice can still watch more terminals.
    aliceWs.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "t3",
        cursorSync: { version: 1, watchId: "w3" },
      }),
    );
    await expect(
      nextMatching(aliceWs.next, (message) => message.type === "terminal-watch-result"),
    ).resolves.toMatchObject({
      type: "terminal-watch-result",
      cursorSync: { watchId: "w3", result: { status: "ready" } },
    });

    // Bob's baseline budget is his own (same address).
    bobWs.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "t2",
        cursorSync: { version: 2, watchId: "b2" },
      }),
    );
    await expect(
      nextMatching(bobWs.next, (message) => message.type === "terminal-watch-baseline-chunk"),
    ).resolves.toMatchObject({ type: "terminal-watch-baseline-chunk" });

    aliceWs.ws.close();
    bobWs.ws.close();
  }, 20_000);

  it("caps watches per principal with a typed retryable result", async () => {
    const server = createWatchServer({ maxWatchesPerPrincipal: 1, maxTotalWatches: 4 });
    const info = await server.start();
    const alice = await exchangePairingCredential(
      info,
      info.pairingUrl,
      ["session:read", "terminal:read"],
      "alice",
    );
    const aliceWs = await openReadyWs(info, alice.accessToken);

    aliceWs.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "t1",
        cursorSync: { version: 1, watchId: "w1" },
      }),
    );
    await expect(aliceWs.next()).resolves.toMatchObject({
      type: "terminal-watch-result",
      cursorSync: { watchId: "w1", result: { status: "ready" } },
    });
    aliceWs.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "t2",
        cursorSync: { version: 1, watchId: "w2" },
      }),
    );
    await expect(aliceWs.next()).resolves.toEqual({
      type: "terminal-watch-result",
      id: "t2",
      cursorSync: {
        version: 1,
        watchId: "w2",
        result: {
          status: "error",
          code: "unavailable",
          retryable: true,
          reason: "principal-watches-capacity",
        },
      },
    });
    aliceWs.ws.close();
  }, 20_000);
});

describe("B4 read-class seam", () => {
  const host = { options: {} } as unknown as RemoteAccessServerHost;
  const classify = (method: string, url: string) =>
    classifyIngressRequest(host, { method, url, headers: {} } as never, "203.0.113.7");

  it("carries legacy-bulk vs normal reads without changing contracts", () => {
    expect(classify("GET", "/api/snapshot")).toEqual({
      workClass: "bulk",
      readClass: "legacy-bulk",
      clientAddress: "203.0.113.7",
    });
    expect(classify("GET", "/api/threads/t1/history").readClass).toBe("legacy-bulk");
    expect(classify("GET", "/api/threads").readClass).toBe("normal");
    expect(classify("POST", "/api/threads/t1/interrupt").workClass).toBe("control");
    expect(classify("POST", "/api/threads/t1/send").workClass).toBe("bulk");
  });

  it("keeps every absent-reads legacy route request legacy-bulk, dummy bounds included", () => {
    // `threadLimit` bounds only the thread list and `runtimePage=1` still
    // materializes every completed turn plus scrollback, so neither may opt a
    // request out of legacy admission or the stored-byte reservation.
    expect(classify("GET", "/api/snapshot?threadLimit=1").readClass).toBe("legacy-bulk");
    expect(classify("GET", "/api/snapshot?threadLimit=100").readClass).toBe("legacy-bulk");
    expect(classify("GET", "/api/snapshot?projectLimit=1").readClass).toBe("legacy-bulk");
    expect(classify("GET", "/api/threads/t1/history?runtimePage=1").readClass).toBe("legacy-bulk");
    expect(
      classify("GET", "/api/threads/t1/history?runtimePage=1&omitScrollback=1").readClass,
    ).toBe("legacy-bulk");
    expect(classify("GET", "/api/threads/t1/history?targetTimelineEntryCount=20").readClass).toBe(
      "legacy-bulk",
    );
  });

  it("classifies every declared or bounded read normal, even without limits", () => {
    // A declared request is never legacy-bulk: the bounded path has a default
    // limit, and an unknown `reads` value is a protocol error the handler
    // rejects before any read, so neither may consume a bulk slot.
    expect(classify("GET", "/api/snapshot?reads=bounded-v1").readClass).toBe("normal");
    expect(classify("GET", "/api/snapshot?reads=bounded-v1&order=updated").readClass).toBe(
      "normal",
    );
    expect(classify("GET", "/api/snapshot?reads=bounded-v2").readClass).toBe("normal");
    // An unknown value on the legacy route still reaches the handler's 400
    // instead of being mistaken for an undeclared legacy read.
    expect(classify("GET", "/api/snapshot?reads=bogus&threadLimit=1").readClass).toBe("normal");
    expect(classify("GET", "/api/threads/t1/history?reads=bounded-v1").readClass).toBe("normal");
    expect(
      classify("GET", "/api/threads/t1/history?reads=bounded-v1&completedTurnsLimit=5").readClass,
    ).toBe("normal");
    expect(classify("GET", "/api/threads/t1/history?reads=bogus&runtimePage=1").readClass).toBe(
      "normal",
    );
    expect(classify("GET", "/api/threads/t1/history/items").readClass).toBe("normal");
    expect(classify("GET", "/api/threads/t1/turns?reads=bounded-v1").readClass).toBe("normal");
    expect(classify("GET", "/api/projects?reads=bounded-v1").readClass).toBe("normal");
    expect(classify("GET", "/api/threads?reads=bounded-v1").readClass).toBe("normal");
  });
});
