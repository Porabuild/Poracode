import { WebSocket } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { remoteWebSocketServerMessageSchema } from "@/shared/remote/protocol";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";
import { isLoopbackRemoteAddress } from "./server/desktopInternalStream";
import { RELAY_LOOPBACK_HOP_HEADER } from "./server/security";
import { relayLoopbackHopSecret } from "./server/relayHopSecret";

vi.mock("@/host/db", () => {
  const appState = new Map<string, string>();
  let profileDataGeneration = 0;
  return {
    dbAppendThreadCompletedTurn: vi.fn<(...args: unknown[]) => void>(),
    dbApplyThreadRuntimeEvents: vi.fn<(...args: unknown[]) => void>(),
    dbClaimRemoteCommand: vi.fn<() => { state: "claimed" }>(() => ({ state: "claimed" })),
    dbCompleteRemoteCommand: vi.fn<(...args: unknown[]) => void>(),
    dbFailRemoteCommand: vi.fn<(...args: unknown[]) => void>(),
    dbDeleteThread: vi.fn<(threadId: string) => void>(),
    dbGetProject: vi.fn<(projectId: string) => unknown>(() => null),
    dbGetProjectNotes: vi.fn<(projectId: string) => unknown>(() => null),
    dbGetProjects: vi.fn<() => unknown[]>(() => []),
    dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
    dbGetThreadContextUsage: vi.fn<() => null>(() => null),
    dbGetLatestThreadGoalItem: vi.fn<() => null>(() => null),
    dbGetLatestThreadRuntimeAnchorItemId: vi.fn<() => null>(() => null),
    dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
    dbGetThreadRuntimeItem: vi.fn<(...args: unknown[]) => unknown>(() => undefined),
    dbGetThreadRuntimeItemsPage: vi.fn<() => { items: unknown[]; nextCursor: number | null }>(
      () => ({ items: [], nextCursor: null }),
    ),
    dbGetThreadRuntimeSummaries: vi.fn<() => Record<string, unknown>>(() => ({})),
    dbGetThreadTerminalScrollback: vi.fn<() => string>(() => ""),
    dbGetThreadTerminalScrollbackRecord: vi.fn<
      () => { transcript: string; outputLength: number } | null
    >(() => null),
    dbGetThread: vi.fn<(threadId: string) => unknown>(() => null),
    dbGetThreads: vi.fn<() => unknown[]>(() => []),
    dbReplaceThreadRuntimeSnapshot: vi.fn<(...args: unknown[]) => void>(),
    dbUpdateProject: vi.fn<(project: unknown) => void>(),
    dbUpsertProject: vi.fn<(project: unknown, sortOrder: number) => void>(),
    dbDeleteProject: vi.fn<(projectId: string) => void>(),
    dbUpsertThread: vi.fn<(thread: unknown, sortOrder: number) => void>(),
    dbGetState: vi.fn<(key: string) => string | null>((key) => appState.get(key) ?? null),
    dbSetState: vi.fn<(key: string, value: string) => void>((key, value) => {
      appState.set(key, value);
    }),
    dbSetProjectNotes: vi.fn<(notes: unknown) => void>(),
    dbTruncateThreadRuntimeAfter: vi.fn<(...args: unknown[]) => void>(),
    dbGetAllUsageEvents: vi.fn<() => unknown[]>(() => []),
    getProfileDataGeneration: vi.fn<() => number>(() => profileDataGeneration),
    bumpProfileDataGeneration: vi.fn<() => void>(() => {
      profileDataGeneration++;
    }),
  };
});

const servers: RemoteAccessServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  vi.clearAllMocks();
});

function buildServer(): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-test", label: "Test Desktop" },
    host: "127.0.0.1",
    port: 0,
    // The desktop backend host persists first; keeps the db mock out of the
    // event-publish path under test.
    ownsSupervisorPersistence: false,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
  });
  servers.push(server);
  return server;
}

/** Queued frame reader: back-to-back frames in one tick are not lost. */
function createWsReader(ws: WebSocket): () => Promise<Record<string, unknown>> {
  const queue: Record<string, unknown>[] = [];
  const waiters: Array<(value: Record<string, unknown>) => void> = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return () =>
    new Promise((resolve, reject) => {
      const queued = queue.shift();
      if (queued) {
        resolve(queued);
        return;
      }
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for frame")), 5_000);
      waiters.push((value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
}

async function issueAccessToken(
  server: RemoteAccessServer,
  info: RemoteAccessServerInfo,
  scopes: readonly string[],
): Promise<string> {
  const pairing = new URL(server.issueIndependentPairingUrl("Desktop internal test"));
  const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes,
      client: { label: "Loopback desktop", deviceType: "desktop" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function issueWsTicket(info: RemoteAccessServerInfo, accessToken: string): Promise<string> {
  const response = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { ticket: string }).ticket;
}

interface OpenOptions {
  readonly desktopInternal?: boolean;
  /** Simulates the relay adapter's local dial: loopback socket + hop marker. */
  readonly relayHop?: boolean;
  readonly lastDesktopSeq?: number;
  readonly scopes?: readonly string[];
}

async function openSocket(
  server: RemoteAccessServer,
  info: RemoteAccessServerInfo,
  options: OpenOptions = {},
): Promise<{ readonly ws: WebSocket; readonly next: () => Promise<Record<string, unknown>> }> {
  const token = await issueAccessToken(server, info, options.scopes ?? ["session:read"]);
  const ticket = await issueWsTicket(info, token);
  const wsUrl = new URL("/ws", info.wsBaseUrl);
  wsUrl.searchParams.set("ticket", ticket);
  if (options.desktopInternal) wsUrl.searchParams.set("desktopInternal", "1");
  if (options.lastDesktopSeq !== undefined) {
    wsUrl.searchParams.set("lastDesktopSeq", String(options.lastDesktopSeq));
  }
  const ws = new WebSocket(wsUrl, {
    ...(options.relayHop
      ? { headers: { [RELAY_LOOPBACK_HOP_HEADER]: relayLoopbackHopSecret() } }
      : {}),
  });
  const next = createWsReader(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { ws, next };
}

describe("RemoteAccessServer desktop-internal sessions (V5 plan 2.5)", () => {
  it("delivers the desktop-only event set to a loopback desktop session and never to an external client", async () => {
    const server = buildServer();
    const info = await server.start();

    const external = await openSocket(server, info);
    await expect(external.next()).resolves.toMatchObject({ type: "ready" });
    const desktop = await openSocket(server, info, { desktopInternal: true });
    await expect(desktop.next()).resolves.toMatchObject({ type: "ready" });

    // Two desktop-only families, then one shared event as the deterministic
    // "nothing else was delivered" fence on both sockets.
    server.publishSupervisorEvent({ type: "git-changed", projectId: "p1" });
    server.publishSupervisorEvent({
      type: "thread-osc-notification",
      threadId: "t1",
      title: "Done",
      body: "Turn finished",
    });
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["t1"] });

    // The desktop session receives both desktop-only families on the
    // desktop-event stream with a contiguous sequence of its own.
    const first = await desktop.next();
    expect(first.type).toBe("desktop-event");
    const second = await desktop.next();
    expect(second.type).toBe("desktop-event");
    expect(remoteWebSocketServerMessageSchema.safeParse(first).success).toBe(true);
    expect(remoteWebSocketServerMessageSchema.safeParse(second).success).toBe(true);
    expect([first.seq, second.seq]).toEqual([1, 2]);
    expect((first.event as { type: string }).type).toBe("git-changed");
    expect((second.event as { type: string }).type).toBe("thread-osc-notification");

    // The external client's FIRST frame after the same publishes is the shared
    // event: FIFO over one socket, so a leaked desktop-event frame could not
    // hide behind it.
    const externalFrame = await external.next();
    expect(externalFrame.type).toBe("event");
    expect((externalFrame.event as { type: string }).type).toBe("remote-threads-changed");

    // And the desktop session's next frame is the shared event too — the
    // desktop-only events were not duplicated onto the shared stream.
    const desktopShared = await desktop.next();
    expect(desktopShared.type).toBe("event");
    expect((desktopShared.event as { type: string }).type).toBe("remote-threads-changed");
    expect(desktopShared.seq).toBe(1);

    desktop.ws.close();
    external.ws.close();
  });

  it("replays the desktop stream from lastDesktopSeq and resyncs a regressed cursor", async () => {
    const server = buildServer();
    const info = await server.start();

    const first = await openSocket(server, info, { desktopInternal: true });
    await expect(first.next()).resolves.toMatchObject({ type: "ready" });
    server.publishSupervisorEvent({ type: "git-changed", projectId: "p1" });
    server.publishSupervisorEvent({ type: "git-changed", projectId: "p2" });
    const seen1 = await first.next();
    const seen2 = await first.next();
    expect([seen1.seq, seen2.seq]).toEqual([1, 2]);
    first.ws.terminate();
    await new Promise((resolve) => setImmediate(resolve));

    server.publishSupervisorEvent({ type: "git-changed", projectId: "p3" });

    // Resume from the last applied desktop seq: exactly the missing range.
    const resumed = await openSocket(server, info, {
      desktopInternal: true,
      lastDesktopSeq: 2,
    });
    await expect(resumed.next()).resolves.toMatchObject({ type: "ready" });
    const replayed = await resumed.next();
    expect(replayed.type).toBe("desktop-event");
    expect(replayed.seq).toBe(3);
    expect((replayed.event as { projectId?: string }).projectId).toBe("p3");

    // A cursor ahead of the server's (server restart resets the in-memory
    // sequence) earns a resync-required instead of stale state.
    const regressed = await openSocket(server, info, {
      desktopInternal: true,
      lastDesktopSeq: 99,
    });
    await expect(regressed.next()).resolves.toMatchObject({ type: "ready" });
    await expect(regressed.next()).resolves.toMatchObject({
      type: "resync-required",
      reason: "Desktop event stream reset; request a fresh snapshot.",
    });

    resumed.ws.close();
    regressed.ws.close();
  });

  it("classifies loopback addresses only, so the opt-in cannot be honored off-loopback", () => {
    expect(isLoopbackRemoteAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("127.8.8.8")).toBe(true);
    expect(isLoopbackRemoteAddress("::1")).toBe(true);
    expect(isLoopbackRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    // Unix-socket peers report no remote address; they are local by construction.
    expect(isLoopbackRemoteAddress("")).toBe(true);
    expect(isLoopbackRemoteAddress(undefined)).toBe(false);
    expect(isLoopbackRemoteAddress("192.168.1.20")).toBe(false);
    expect(isLoopbackRemoteAddress("10.0.0.5")).toBe(false);
    expect(isLoopbackRemoteAddress("::ffff:10.0.0.5")).toBe(false);
    expect(isLoopbackRemoteAddress("fe80::1")).toBe(false);
  });

  it("streams terminal output to a desktop-internal session only through terminal-watch", async () => {
    const server = buildServer();
    const info = await server.start();

    const desktop = await openSocket(server, info, {
      desktopInternal: true,
      scopes: ["session:read", "terminal:read"],
    });
    await expect(desktop.next()).resolves.toMatchObject({ type: "ready" });
    desktop.ws.send(JSON.stringify({ type: "terminal-watch", id: "t1" }));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "t1",
      data: "hello\u001b[0m",
      outputLength: 10,
      terminalInstanceId: "inst-1",
    });
    const frame = await desktop.next();
    // Legacy-watch frame: the exact PTY bytes, no cursor metadata.
    expect(frame).toEqual({ type: "terminal-output", id: "t1", data: "hello\u001b[0m" });

    desktop.ws.close();
  });

  it("keeps thread-output off both replayable streams for desktop-internal sessions", async () => {
    const server = buildServer();
    const info = await server.start();

    const desktop = await openSocket(server, info, {
      desktopInternal: true,
      scopes: ["session:read"],
    });
    await expect(desktop.next()).resolves.toMatchObject({ type: "ready" });

    // No terminal-watch installed: the PTY bytes reach nobody, and neither
    // stream carries them. A shared event proves the sockets still flow.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "t1",
      data: "pty-bytes",
      outputLength: 9,
      terminalInstanceId: "inst-1",
    });
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["t1"] });

    const frame = await desktop.next();
    expect(frame.type).toBe("event");
    expect((frame.event as { type: string }).type).toBe("remote-threads-changed");

    desktop.ws.close();
  });

  it("denies desktop-internal admission to a relay-proxied dial even from loopback", async () => {
    // Deep-review fix: the relay adapter dials /ws from loopback forwarding a
    // REMOTE visitor's query params verbatim, so a paired client asking for
    // desktopInternal=1 through the relay would otherwise receive the
    // desktop-only event stream. The hop marker must demote it to an ordinary
    // session.
    const server = buildServer();
    const info = await server.start();
    const proxied = await openSocket(server, info, {
      desktopInternal: true,
      relayHop: true,
      scopes: ["session:read"],
    });
    server.publishSupervisorEvent({ type: "git-changed", projectId: "p1" });
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["t1"] });
    // The ready handshake arrives first; the desktop-only family must NOT
    // follow (it would precede the shared event on an admitted desktop
    // session), while the shared stream still does.
    const ready = await proxied.next();
    expect(ready.type).toBe("ready");
    const shared = await proxied.next();
    expect(shared.type).toBe("event");
    expect((shared.event as { type: string }).type).toBe("remote-threads-changed");
    await new Promise((resolve) => setTimeout(resolve, 50));
    proxied.ws.close();
  });
});
