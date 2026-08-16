import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { remoteWebSocketServerMessageSchema } from "@/shared/remote";
import { dbGetThread, dbGetThreadTerminalScrollbackRecord } from "../db";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";

vi.mock("../db", () => {
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
    dbGetLatestThreadRuntimeAnchorItemId: vi.fn<() => null>(() => null),
    dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
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
  vi.mocked(dbGetThread).mockReset().mockReturnValue(null);
  vi.mocked(dbGetThreadTerminalScrollbackRecord).mockReset().mockReturnValue(null);
});

async function waitWsClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for websocket close")),
      5_000,
    );
    ws.once("close", (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
    ws.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/** Queued reader: back-to-back frames in one tick are not lost between
 * `once("message")` registrations. */
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

async function issueAccessToken(
  info: RemoteAccessServerInfo,
  scopes: readonly string[] = ["session:read"],
): Promise<string> {
  const pairing = new URL(info.pairingUrl);
  const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
  expect(credential).toBeTruthy();

  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes,
      client: { label: "Test mobile", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  const token = (await response.json()) as { accessToken: string };
  return token.accessToken;
}

async function issueWebSocketTicket(
  info: RemoteAccessServerInfo,
  accessToken: string,
): Promise<string> {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(ticketResponse.status).toBe(200);
  const ticket = (await ticketResponse.json()) as { ticket: string };
  return ticket.ticket;
}

async function openTerminalWatchSocket(
  info: RemoteAccessServerInfo,
  scopes: readonly string[] = ["terminal:read", "session:read"],
): Promise<{ ws: WebSocket; next: () => Promise<unknown> }> {
  const token = await issueAccessToken(info, scopes);
  const ticket = await issueWebSocketTicket(info, token);
  const url = new URL("/ws", info.wsBaseUrl);
  url.searchParams.set("ticket", ticket);
  const ws = new WebSocket(url);
  const next = createWsReader(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  await next(); // ready
  return { ws, next };
}

function createCursorSyncServer(
  overrides: Partial<RemoteAccessServerOptions> = {},
): RemoteAccessServer {
  const server = new RemoteAccessServer({
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-test", label: "Test Desktop" },
    host: "127.0.0.1",
    port: 0,
    ownsSupervisorPersistence: false,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    ...overrides,
  });
  servers.push(server);
  return server;
}

describe("RemoteAccessServer terminal cursor-sync", () => {
  it("serves terminal cursor-sync watch results and tags only reliable output", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") {
        return {
          generation: "gen-live",
          fromCursor: 0,
          toCursor: 5,
          data: "hello",
          processState: "running",
          terminalSize: { cols: 80, rows: 24 },
        } as never;
      }
      return "" as never;
    });
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      onEventInterestsChanged,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();

    // Environment advertises the capability boundary.
    const env = await (
      await fetch(new URL("/.well-known/poracode/environment", info.httpBaseUrl))
    ).json();
    expect(env).toMatchObject({
      capabilities: { terminalCursorSync: { versions: [1] } },
    });

    const token = await issueAccessToken(info, ["session:read", "terminal:read"]);
    const openSocket = async () => {
      const ticket = await issueWebSocketTicket(info, token);
      const url = new URL("/ws", info.wsBaseUrl);
      url.searchParams.set("ticket", ticket);
      const ws = new WebSocket(url);
      const next = createWsReader(ws);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });
      await next(); // ready
      return { ws, next };
    };

    const legacy = await openSocket();
    const reliable = await openSocket();

    legacy.ws.send(JSON.stringify({ type: "terminal-watch", id: "term-1" }));
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenCalledWith(
        expect.objectContaining({ terminalThreadIds: expect.arrayContaining(["term-1"]) }),
      ),
    );

    reliable.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-1",
        cursorSync: { version: 1, watchId: "watch-a" },
      }),
    );
    const result = await reliable.next();
    expect(result).toEqual({
      type: "terminal-watch-result",
      id: "term-1",
      cursorSync: {
        version: 1,
        watchId: "watch-a",
        result: {
          status: "ready",
          generation: "gen-live",
          fromCursor: 0,
          toCursor: 5,
          data: "hello",
          processState: "running",
          terminalSize: { cols: 80, rows: 24 },
        },
      },
    });
    expect(callSupervisor).toHaveBeenCalledWith("readTerminalSnapshot", { threadId: "term-1" });

    // Output during/after watch: legacy frame has no cursorSync; reliable is tagged.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-1",
      data: "more",
      outputLength: 9,
      terminalInstanceId: "gen-live",
    });

    await expect(legacy.next()).resolves.toEqual({
      type: "terminal-output",
      id: "term-1",
      data: "more",
    });
    await expect(reliable.next()).resolves.toEqual({
      type: "terminal-output",
      id: "term-1",
      data: "more",
      cursorSync: {
        version: 1,
        watchId: "watch-a",
        generation: "gen-live",
        fromCursor: 5,
        toCursor: 9,
      },
    });

    // Stale rewatch: first async result for old watchId must be ignored.
    let resolveSnapshot: ((value: unknown) => void) | undefined;
    callSupervisor.mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    reliable.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-1",
        cursorSync: { version: 1, watchId: "watch-stale" },
      }),
    );
    await vi.waitFor(() => expect(callSupervisor).toHaveBeenCalledTimes(2));

    // Install the replacement watch and let it start its snapshot call before
    // completing the stale one, so the stale reply is ignored server-side.
    callSupervisor.mockImplementation(async (name) => {
      if (name === "readTerminalSnapshot") {
        return {
          generation: "gen-live",
          fromCursor: 9,
          toCursor: 9,
          data: "",
          processState: "running",
          terminalSize: { cols: 80, rows: 24 },
        } as never;
      }
      return "" as never;
    });
    reliable.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-1",
        cursorSync: { version: 1, watchId: "watch-current" },
      }),
    );
    await vi.waitFor(() => expect(callSupervisor).toHaveBeenCalledTimes(3));
    resolveSnapshot?.({
      generation: "gen-live",
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "running",
      terminalSize: null,
    });
    const currentResult = await reliable.next();
    expect(currentResult).toMatchObject({
      type: "terminal-watch-result",
      cursorSync: { watchId: "watch-current", result: { status: "ready" } },
    });
    // No stale result should sneak in.
    reliable.ws.send(JSON.stringify({ type: "ping", id: "p1" }));
    await expect(reliable.next()).resolves.toMatchObject({ type: "pong", id: "p1" });

    legacy.ws.close();
    reliable.ws.close();
  });

  it("disconnects reliable terminal watchers on hard outbound congestion", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") {
        return {
          generation: "gen",
          fromCursor: 0,
          toCursor: 0,
          data: "",
          processState: "running",
          terminalSize: null,
        } as never;
      }
      return "" as never;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      maxWebSocketOutboundBufferBytes: 1_024,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-busy",
        cursorSync: { version: 1, watchId: "w1" },
      }),
    );
    await expect(next()).resolves.toMatchObject({ type: "terminal-watch-result" });

    const clients = (server as unknown as { clients: Map<WebSocket, unknown> }).clients;
    const serverSocket = [...clients.keys()][0]!;
    Object.defineProperty(serverSocket, "bufferedAmount", {
      configurable: true,
      get: () => 2_000,
    });

    const closed = waitWsClose(ws);
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-busy",
      data: "x".repeat(64),
      outputLength: 64,
      terminalInstanceId: "gen",
    });
    const close = await closed;
    expect(close.code).not.toBe(1000);
    expect(clients.has(serverSocket)).toBe(false);
  });

  it("keeps legacy terminal watchers on the lossy congestion path", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();
    ws.send(JSON.stringify({ type: "terminal-watch", id: "term-legacy" }));

    const clients = (server as unknown as { clients: Map<WebSocket, unknown> }).clients;
    const serverSocket = [...clients.keys()][0]!;
    Object.defineProperty(serverSocket, "bufferedAmount", {
      configurable: true,
      get: () => 2_000_000,
    });

    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-legacy",
      data: "skipped",
      outputLength: 7,
      terminalInstanceId: "gen",
    });
    // Legacy lossy skip: no disconnect and no frame.
    expect(clients.has(serverSocket)).toBe(true);
    ws.send(JSON.stringify({ type: "ping", id: "still-open" }));
    await expect(next()).resolves.toMatchObject({ type: "pong", id: "still-open" });
    ws.close();
  });

  it("reconciles live output published during reliable watch setup without loss", async () => {
    let resolveSnapshot: ((value: unknown) => void) | undefined;
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") {
        return await new Promise((resolve) => {
          resolveSnapshot = resolve;
        });
      }
      return "" as never;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-inflight",
        cursorSync: { version: 1, watchId: "watch-inflight" },
      }),
    );
    await vi.waitFor(() => expect(callSupervisor).toHaveBeenCalled());

    // Output arrives while snapshot is still suspended — clients buffer it and
    // reconcile by cursors once the baseline arrives (output may precede result).
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-inflight",
      data: "mid",
      outputLength: 8,
      terminalInstanceId: "gen-1",
    });

    resolveSnapshot?.({
      generation: "gen-1",
      fromCursor: 0,
      toCursor: 5,
      data: "hello",
      processState: "running",
      terminalSize: { cols: 80, rows: 24 },
    });

    const first = await next();
    const second = await next();
    const messages = [first, second];
    const result = messages.find((m) => (m as { type: string }).type === "terminal-watch-result");
    const output = messages.find((m) => (m as { type: string }).type === "terminal-output");
    expect(result).toMatchObject({
      type: "terminal-watch-result",
      cursorSync: {
        watchId: "watch-inflight",
        result: { status: "ready", generation: "gen-1", toCursor: 5, data: "hello" },
      },
    });
    // Live frame carries contiguous range from snapshot toCursor → outputLength.
    expect(output).toEqual({
      type: "terminal-output",
      id: "term-inflight",
      data: "mid",
      cursorSync: {
        version: 1,
        watchId: "watch-inflight",
        generation: "gen-1",
        fromCursor: 5,
        toCursor: 8,
      },
    });
    ws.close();
  });

  it("delays snapshot read until the event-interest barrier resolves", async () => {
    let resolveBarrier: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      resolveBarrier = resolve;
    });
    let snapshotCalls = 0;
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") {
        snapshotCalls += 1;
        return {
          generation: "gen",
          fromCursor: 0,
          toCursor: 0,
          data: "",
          processState: "running",
          terminalSize: null,
        } as never;
      }
      return "" as never;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      callSupervisor,
      onEventInterestsChanged: () => barrier,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-barrier",
        cursorSync: { version: 1, watchId: "w-barrier" },
      }),
    );
    // Interest callback is awaiting; snapshot must not have run yet.
    await vi.waitFor(() => expect(resolveBarrier).toBeDefined());
    expect(snapshotCalls).toBe(0);

    resolveBarrier?.();
    await expect(next()).resolves.toMatchObject({
      type: "terminal-watch-result",
      cursorSync: { watchId: "w-barrier", result: { status: "ready" } },
    });
    expect(snapshotCalls).toBe(1);
    ws.close();
  });

  it("does not cross-concatenate across generation changes mid-watch", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") {
        return {
          generation: "gen-a",
          fromCursor: 0,
          toCursor: 3,
          data: "abc",
          processState: "running",
          terminalSize: null,
        } as never;
      }
      return "" as never;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-gen",
        cursorSync: { version: 1, watchId: "w-gen" },
      }),
    );
    await expect(next()).resolves.toMatchObject({
      type: "terminal-watch-result",
      cursorSync: { result: { generation: "gen-a", toCursor: 3 } },
    });

    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-gen",
      data: "d",
      outputLength: 4,
      terminalInstanceId: "gen-a",
    });
    await expect(next()).resolves.toMatchObject({
      type: "terminal-output",
      cursorSync: { generation: "gen-a", fromCursor: 3, toCursor: 4 },
    });

    // New generation resets cursor space; frame must carry the new generation.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-gen",
      data: "xy",
      outputLength: 2,
      terminalInstanceId: "gen-b",
    });
    await expect(next()).resolves.toEqual({
      type: "terminal-output",
      id: "term-gen",
      data: "xy",
      cursorSync: {
        version: 1,
        watchId: "w-gen",
        generation: "gen-b",
        fromCursor: 0,
        toCursor: 2,
      },
    });
    ws.close();
  });

  it("falls back to persisted SQLite scrollback with exact non-negative cursor range", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") return null as never;
      return "" as never;
    });
    vi.mocked(dbGetThreadTerminalScrollbackRecord).mockReturnValue({
      transcript: "persisted\n",
      outputLength: 110,
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-persisted",
        cursorSync: { version: 1, watchId: "w-persisted" },
      }),
    );
    const result = await next();
    expect(result).toEqual({
      type: "terminal-watch-result",
      id: "term-persisted",
      cursorSync: {
        version: 1,
        watchId: "w-persisted",
        result: {
          status: "ready",
          generation: null,
          fromCursor: 100,
          toCursor: 110,
          data: "persisted\n",
          processState: "exited",
          terminalSize: null,
        },
      },
    });
    const ready = (
      result as {
        cursorSync: { result: { fromCursor: number; toCursor: number; data: string } };
      }
    ).cursorSync.result;
    expect(ready.fromCursor).toBeGreaterThanOrEqual(0);
    expect(ready.toCursor - ready.fromCursor).toBe(ready.data.length);
    ws.close();
  });

  it("rejects unsupported cursorSync versions without installing a reliable watch", async () => {
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => {
      throw new Error("snapshot must not run for unsupported version");
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      onEventInterestsChanged,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-unsupported",
        cursorSync: { version: 99, watchId: "w-unsupported" },
      }),
    );
    await expect(next()).resolves.toEqual({
      type: "terminal-watch-result",
      id: "term-unsupported",
      cursorSync: {
        version: 1,
        watchId: "w-unsupported",
        result: { status: "error", code: "unavailable", retryable: false },
      },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
    // No reliable interest left that would stream tagged output.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-unsupported",
      data: "x",
      outputLength: 1,
      terminalInstanceId: "gen",
    });
    ws.send(JSON.stringify({ type: "ping", id: "after-unsupported" }));
    await expect(next()).resolves.toMatchObject({ type: "pong", id: "after-unsupported" });
    ws.close();
  });

  it("clears failed reliable setup and ignores older same-id failure after rewatch", async () => {
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    let resolveFirst: ((value: unknown) => void) | undefined;
    let resolveSecond: ((value: unknown) => void) | undefined;
    let snapshotCalls = 0;
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name !== "readTerminalSnapshot") return "" as never;
      snapshotCalls += 1;
      if (snapshotCalls === 1) {
        return await new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return await new Promise((resolve) => {
        resolveSecond = resolve;
      });
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      onEventInterestsChanged,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    // First install with same watchId will fail (not found).
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-fail",
        cursorSync: { version: 1, watchId: "same-id" },
      }),
    );
    await vi.waitFor(() => expect(snapshotCalls).toBe(1));

    // Second install with the exact same watchId while first is suspended.
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-fail",
        cursorSync: { version: 1, watchId: "same-id" },
      }),
    );
    await vi.waitFor(() => expect(snapshotCalls).toBe(2));

    // Older failure resolves first — must not emit and must not clear the newer watch.
    resolveFirst?.(null);
    // Complete the newer watch successfully.
    resolveSecond?.({
      generation: "gen-new",
      fromCursor: 0,
      toCursor: 2,
      data: "ok",
      processState: "running",
      terminalSize: null,
    });

    const onlyResult = await next();
    expect(onlyResult).toMatchObject({
      type: "terminal-watch-result",
      cursorSync: {
        watchId: "same-id",
        result: { status: "ready", generation: "gen-new", data: "ok" },
      },
    });

    // Tagged live output proves the newer registration survived the older failure.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-fail",
      data: "!",
      outputLength: 3,
      terminalInstanceId: "gen-new",
    });
    await expect(next()).resolves.toMatchObject({
      type: "terminal-output",
      cursorSync: { watchId: "same-id", generation: "gen-new", fromCursor: 2, toCursor: 3 },
    });

    // Explicit not-found after a successful watch clears that registration.
    callSupervisor.mockImplementation(async (name) => {
      if (name === "readTerminalSnapshot") return null as never;
      return "" as never;
    });
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-gone",
        cursorSync: { version: 1, watchId: "w-gone" },
      }),
    );
    await expect(next()).resolves.toMatchObject({
      type: "terminal-watch-result",
      cursorSync: {
        watchId: "w-gone",
        result: { status: "error", code: "not-found", retryable: false },
      },
    });
    // Interest for the failed watch must be removed (no tagged stream).
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-gone",
      data: "x",
      outputLength: 1,
      terminalInstanceId: "g",
    });
    ws.send(JSON.stringify({ type: "ping", id: "after-not-found" }));
    await expect(next()).resolves.toMatchObject({ type: "pong", id: "after-not-found" });
    ws.close();
  });

  it("unwatch removes reliable state so reconnect must re-opt-in", async () => {
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") {
        return {
          generation: "gen",
          fromCursor: 0,
          toCursor: 0,
          data: "",
          processState: "running",
          terminalSize: null,
        } as never;
      }
      return "" as never;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      onEventInterestsChanged,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-unwatch",
        cursorSync: { version: 1, watchId: "w-u" },
      }),
    );
    await expect(next()).resolves.toMatchObject({ type: "terminal-watch-result" });
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenCalledWith(
        expect.objectContaining({ terminalThreadIds: expect.arrayContaining(["term-unwatch"]) }),
      ),
    );

    const callsBeforeUnwatch = onEventInterestsChanged.mock.calls.length;
    ws.send(JSON.stringify({ type: "terminal-unwatch", id: "term-unwatch" }));
    await vi.waitFor(() =>
      expect(onEventInterestsChanged.mock.calls.length).toBeGreaterThan(callsBeforeUnwatch),
    );
    expect(onEventInterestsChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ terminalThreadIds: [] }),
    );

    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-unwatch",
      data: "nope",
      outputLength: 4,
      terminalInstanceId: "gen",
    });
    ws.send(JSON.stringify({ type: "ping", id: "after-unwatch" }));
    await expect(next()).resolves.toMatchObject({ type: "pong", id: "after-unwatch" });
    ws.close();
  });

  it("falls back to persisted scrollback when supervisor reports no live terminal (GUI shadow case)", async () => {
    // GUI/structured sessions return null from readTerminalSnapshot so the
    // server must serve SQLite fallback (generation null, processState exited).
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") return null as never;
      return "" as never;
    });
    vi.mocked(dbGetThreadTerminalScrollbackRecord).mockReturnValue({
      transcript: "old-gui-scrollback",
      outputLength: 100 + "old-gui-scrollback".length,
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "gui-thread",
        cursorSync: { version: 1, watchId: "w-gui" },
      }),
    );
    const result = await next();
    expect(result).toMatchObject({
      type: "terminal-watch-result",
      id: "gui-thread",
      cursorSync: {
        watchId: "w-gui",
        result: {
          status: "ready",
          generation: null,
          data: "old-gui-scrollback",
          processState: "exited",
          terminalSize: null,
        },
      },
    });
    const ready = (
      result as {
        cursorSync: { result: { fromCursor: number; toCursor: number; data: string } };
      }
    ).cursorSync.result;
    expect(ready.toCursor - ready.fromCursor).toBe(ready.data.length);
    ws.close();
  });

  it("connection close during delayed snapshot clears registration and cannot poison a newer connection", async () => {
    let resolveSnapshot: ((value: unknown) => void) | undefined;
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") {
        return await new Promise((resolve) => {
          resolveSnapshot = resolve;
        });
      }
      return "" as never;
    });
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      onEventInterestsChanged,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);

    const openSocket = async () => {
      const ticket = await issueWebSocketTicket(info, token);
      const url = new URL("/ws", info.wsBaseUrl);
      url.searchParams.set("ticket", ticket);
      const ws = new WebSocket(url);
      const next = createWsReader(ws);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });
      await next(); // ready
      return { ws, next };
    };

    const first = await openSocket();
    first.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-close",
        cursorSync: { version: 1, watchId: "w-closing" },
      }),
    );
    await vi.waitFor(() => expect(resolveSnapshot).toBeDefined());
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenCalledWith(
        expect.objectContaining({ terminalThreadIds: expect.arrayContaining(["term-close"]) }),
      ),
    );

    const closed = waitWsClose(first.ws);
    first.ws.close();
    await closed;

    // Delayed snapshot resolves after close: no result frame, registration cleared.
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      resolveSnapshot?.({
        generation: "gen-late",
        fromCursor: 0,
        toCursor: 3,
        data: "zzz",
        processState: "running",
        terminalSize: null,
      });
      // Allow microtasks from the closed setup path to settle.
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    // Newer connection must be independent: no inherited interest / no tagged leak.
    const second = await openSocket();
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenCalledWith(
        expect.objectContaining({ terminalThreadIds: [] }),
      ),
    );

    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-close",
      data: "x",
      outputLength: 1,
      terminalInstanceId: "gen-new",
    });
    second.ws.send(JSON.stringify({ type: "ping", id: "second-alone" }));
    await expect(second.next()).resolves.toMatchObject({ type: "pong", id: "second-alone" });

    // Explicit opt-in on the new connection still works.
    callSupervisor.mockImplementation(async (name) => {
      if (name === "readTerminalSnapshot") {
        return {
          generation: "gen-new",
          fromCursor: 0,
          toCursor: 0,
          data: "",
          processState: "running",
          terminalSize: null,
        } as never;
      }
      return "" as never;
    });
    second.ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-close",
        cursorSync: { version: 1, watchId: "w-second" },
      }),
    );
    await expect(second.next()).resolves.toMatchObject({
      type: "terminal-watch-result",
      cursorSync: { watchId: "w-second", result: { status: "ready", generation: "gen-new" } },
    });
    second.ws.close();
  });

  it("one watch per (connection, id): legacy then reliable-failed setup does not leave a legacy stream", async () => {
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") return null as never;
      return "" as never;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      onEventInterestsChanged,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:read", "session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    // Legacy interest first.
    ws.send(JSON.stringify({ type: "terminal-watch", id: "term-replace" }));
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenCalledWith(
        expect.objectContaining({ terminalThreadIds: expect.arrayContaining(["term-replace"]) }),
      ),
    );
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-replace",
      data: "legacy",
      outputLength: 6,
      terminalInstanceId: "g",
    });
    await expect(next()).resolves.toEqual({
      type: "terminal-output",
      id: "term-replace",
      data: "legacy",
    });

    // Reliable rewatch for same id fails (not-found) — must clear interest, not keep legacy.
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-replace",
        cursorSync: { version: 1, watchId: "w-fail" },
      }),
    );
    await expect(next()).resolves.toMatchObject({
      type: "terminal-watch-result",
      cursorSync: {
        watchId: "w-fail",
        result: { status: "error", code: "not-found", retryable: false },
      },
    });
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenLastCalledWith(
        expect.objectContaining({ terminalThreadIds: [] }),
      ),
    );

    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-replace",
      data: "should-not-stream",
      outputLength: 17,
      terminalInstanceId: "g",
    });
    ws.send(JSON.stringify({ type: "ping", id: "after-replace-fail" }));
    await expect(next()).resolves.toMatchObject({ type: "pong", id: "after-replace-fail" });
    ws.close();
  });

  it("clears a prior reliable watch when replacing with unsupported cursorSyncVersion", async () => {
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") {
        return {
          generation: "gen-v1",
          fromCursor: 0,
          toCursor: 3,
          data: "abc",
          processState: "running",
          terminalSize: null,
        } as never;
      }
      return "" as never;
    });
    const server = createCursorSyncServer({ onEventInterestsChanged, callSupervisor });
    const info = await server.start();
    const { ws, next } = await openTerminalWatchSocket(info);

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-v1-to-v99",
        cursorSync: { version: 1, watchId: "w-v1" },
      }),
    );
    const ready = await next();
    expect(ready).toMatchObject({
      type: "terminal-watch-result",
      cursorSync: { watchId: "w-v1", result: { status: "ready", generation: "gen-v1" } },
    });
    expect(remoteWebSocketServerMessageSchema.parse(ready)).toEqual(ready);
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          terminalThreadIds: expect.arrayContaining(["term-v1-to-v99"]),
        }),
      ),
    );

    // Live tagged output proves the reliable stream is installed.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-v1-to-v99",
      data: "!",
      outputLength: 4,
      terminalInstanceId: "gen-v1",
    });
    const tagged = await next();
    expect(tagged).toMatchObject({
      type: "terminal-output",
      cursorSync: { watchId: "w-v1", generation: "gen-v1" },
    });
    expect(remoteWebSocketServerMessageSchema.parse(tagged)).toEqual(tagged);

    const snapshotCallsBefore = callSupervisor.mock.calls.length;
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-v1-to-v99",
        cursorSync: { version: 99, watchId: "w-v99" },
      }),
    );
    const rejected = await next();
    expect(rejected).toEqual({
      type: "terminal-watch-result",
      id: "term-v1-to-v99",
      cursorSync: {
        version: 1,
        watchId: "w-v99",
        result: { status: "error", code: "unavailable", retryable: false },
      },
    });
    expect(remoteWebSocketServerMessageSchema.parse(rejected)).toEqual(rejected);
    expect(callSupervisor.mock.calls.length).toBe(snapshotCallsBefore);

    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenLastCalledWith(
        expect.objectContaining({ terminalThreadIds: [] }),
      ),
    );

    // No further tagged or legacy output for this terminal.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-v1-to-v99",
      data: "should-not-stream",
      outputLength: 20,
      terminalInstanceId: "gen-v1",
    });
    ws.send(JSON.stringify({ type: "ping", id: "after-v1-to-v99" }));
    await expect(next()).resolves.toMatchObject({ type: "pong", id: "after-v1-to-v99" });
    ws.close();
  });

  it("clears a prior legacy watch when replacing with unsupported cursorSyncVersion", async () => {
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => {
      throw new Error("snapshot must not run for unsupported version");
    });
    const server = createCursorSyncServer({ onEventInterestsChanged, callSupervisor });
    const info = await server.start();
    const { ws, next } = await openTerminalWatchSocket(info);

    ws.send(JSON.stringify({ type: "terminal-watch", id: "term-legacy-to-v99" }));
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          terminalThreadIds: expect.arrayContaining(["term-legacy-to-v99"]),
        }),
      ),
    );
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-legacy-to-v99",
      data: "legacy",
      outputLength: 6,
      terminalInstanceId: "g",
    });
    await expect(next()).resolves.toEqual({
      type: "terminal-output",
      id: "term-legacy-to-v99",
      data: "legacy",
    });

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-legacy-to-v99",
        cursorSync: { version: 99, watchId: "w-legacy-v99" },
      }),
    );
    await expect(next()).resolves.toEqual({
      type: "terminal-watch-result",
      id: "term-legacy-to-v99",
      cursorSync: {
        version: 1,
        watchId: "w-legacy-v99",
        result: { status: "error", code: "unavailable", retryable: false },
      },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenLastCalledWith(
        expect.objectContaining({ terminalThreadIds: [] }),
      ),
    );

    // Must not leave a legacy stream (no silent downgrade).
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-legacy-to-v99",
      data: "nope",
      outputLength: 4,
      terminalInstanceId: "g",
    });
    ws.send(JSON.stringify({ type: "ping", id: "after-legacy-to-v99" }));
    await expect(next()).resolves.toMatchObject({ type: "pong", id: "after-legacy-to-v99" });
    ws.close();
  });

  it("dispose clearAll leaves no reliable registrations or terminal interests", async () => {
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "readTerminalSnapshot") {
        return {
          generation: "gen-close",
          fromCursor: 0,
          toCursor: 3,
          data: "abc",
          processState: "running",
          terminalSize: null,
        } as never;
      }
      return "" as never;
    });
    const server = createCursorSyncServer({ onEventInterestsChanged, callSupervisor });
    const info = await server.start();
    const { ws, next } = await openTerminalWatchSocket(info);

    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-close",
        cursorSync: { version: 1, watchId: "w-close" },
      }),
    );
    await expect(next()).resolves.toMatchObject({
      type: "terminal-watch-result",
      id: "term-close",
      cursorSync: { result: { status: "ready" } },
    });
    await vi.waitFor(() => {
      expect(onEventInterestsChanged).toHaveBeenCalledWith(
        expect.objectContaining({ terminalThreadIds: expect.arrayContaining(["term-close"]) }),
      );
    });

    const internals = server as unknown as {
      terminalCursorSync: {
        getReliable: (socket: WebSocket, id: string) => unknown;
        hasReliableWatcher: (socket: WebSocket, id: string) => boolean;
      };
      terminalWatches: Map<WebSocket, Set<string>>;
      clients: Map<WebSocket, unknown>;
    };
    // Registry keys are server-side sockets, not the client WebSocket handle.
    const serverWs = [...internals.clients.keys()][0];
    expect(serverWs).toBeDefined();
    expect(internals.terminalCursorSync.getReliable(serverWs!, "term-close")).toBeDefined();
    expect(internals.terminalWatches.get(serverWs!)?.has("term-close")).toBe(true);

    // Remove from the afterEach list so we dispose once here deterministically.
    const idx = servers.indexOf(server);
    if (idx >= 0) servers.splice(idx, 1);
    await server.dispose();

    expect(internals.clients.size).toBe(0);
    expect(internals.terminalWatches.size).toBe(0);
    expect(internals.terminalCursorSync.getReliable(serverWs!, "term-close")).toBeUndefined();
    expect(internals.terminalCursorSync.hasReliableWatcher(serverWs!, "term-close")).toBe(false);
    expect(onEventInterestsChanged).toHaveBeenLastCalledWith({
      terminalThreadIds: [],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    ws.close();
  });

  it("still returns non-retryable unavailable when onEventInterestsChanged throws sync on unsupported version", async () => {
    let throwOnNotify = false;
    const onEventInterestsChanged = vi.fn<
      NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>
    >(() => {
      if (throwOnNotify) throw new Error("sync interests failure");
    });
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => {
      throw new Error("snapshot must not run for unsupported version");
    });
    const server = createCursorSyncServer({ onEventInterestsChanged, callSupervisor });
    const info = await server.start();
    const { ws, next } = await openTerminalWatchSocket(info);

    // Only the unsupported-version notify path throws; connection setup stays healthy.
    throwOnNotify = true;
    const callsBefore = onEventInterestsChanged.mock.calls.length;
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-sync-throw",
        cursorSync: { version: 99, watchId: "w-sync-throw" },
      }),
    );
    await expect(next()).resolves.toEqual({
      type: "terminal-watch-result",
      id: "term-sync-throw",
      cursorSync: {
        version: 1,
        watchId: "w-sync-throw",
        result: { status: "error", code: "unavailable", retryable: false },
      },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(onEventInterestsChanged.mock.calls.length).toBeGreaterThan(callsBefore);

    const internals = server as unknown as {
      terminalCursorSync: { getReliable: (socket: WebSocket, id: string) => unknown };
      terminalWatches: Map<WebSocket, Set<string>>;
      clients: Map<WebSocket, unknown>;
    };
    const serverWs = [...internals.clients.keys()][0];
    expect(serverWs).toBeDefined();
    expect(internals.terminalCursorSync.getReliable(serverWs!, "term-sync-throw")).toBeUndefined();
    expect(internals.terminalWatches.get(serverWs!)?.has("term-sync-throw")).toBe(false);

    // Allow dispose/close notify without rethrowing into afterEach.
    throwOnNotify = false;
    ws.close();
  });

  it("still returns non-retryable unavailable when onEventInterestsChanged rejects async on unsupported version", async () => {
    // Promise rejection (not sync throw): unsupported path fire-and-forgets notify
    // via Promise.resolve(...).catch, so the client must still get the error frame.
    let rejectOnNotify = false;
    const onEventInterestsChanged = vi.fn<
      NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>
    >(async () => {
      if (rejectOnNotify) throw new Error("async interests failure on unsupported version");
    });
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => {
      throw new Error("snapshot must not run for unsupported version");
    });
    const server = createCursorSyncServer({ onEventInterestsChanged, callSupervisor });
    const info = await server.start();
    const { ws, next } = await openTerminalWatchSocket(info);

    // Install a prior reliable stream so we prove the unsupported reject clears it.
    rejectOnNotify = false;
    callSupervisor.mockImplementation(async (name) => {
      if (name === "readTerminalSnapshot") {
        return {
          generation: "gen-prior",
          fromCursor: 0,
          toCursor: 2,
          data: "ab",
          processState: "running",
          terminalSize: null,
        } as never;
      }
      return "" as never;
    });
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-async-reject-v99",
        cursorSync: { version: 1, watchId: "w-prior" },
      }),
    );
    await expect(next()).resolves.toMatchObject({
      type: "terminal-watch-result",
      cursorSync: { watchId: "w-prior", result: { status: "ready" } },
    });
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-async-reject-v99",
      data: "!",
      outputLength: 3,
      terminalInstanceId: "gen-prior",
    });
    await expect(next()).resolves.toMatchObject({
      type: "terminal-output",
      cursorSync: { watchId: "w-prior" },
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      rejectOnNotify = true;
      const snapshotCallsBefore = callSupervisor.mock.calls.length;
      ws.send(
        JSON.stringify({
          type: "terminal-watch",
          id: "term-async-reject-v99",
          cursorSync: { version: 99, watchId: "w-async-v99" },
        }),
      );
      await expect(next()).resolves.toEqual({
        type: "terminal-watch-result",
        id: "term-async-reject-v99",
        cursorSync: {
          version: 1,
          watchId: "w-async-v99",
          result: { status: "error", code: "unavailable", retryable: false },
        },
      });
      // No supervisor snapshot for unsupported positive version.
      expect(callSupervisor.mock.calls.length).toBe(snapshotCallsBefore);
      // Allow the fire-and-forget rejection to settle.
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    const internals = server as unknown as {
      terminalCursorSync: { getReliable: (socket: WebSocket, id: string) => unknown };
      terminalWatches: Map<WebSocket, Set<string>>;
      clients: Map<WebSocket, unknown>;
    };
    const serverWs = [...internals.clients.keys()][0];
    expect(serverWs).toBeDefined();
    expect(
      internals.terminalCursorSync.getReliable(serverWs!, "term-async-reject-v99"),
    ).toBeUndefined();
    expect(internals.terminalWatches.get(serverWs!)?.has("term-async-reject-v99")).toBe(false);

    // No reliable or legacy stream survives.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-async-reject-v99",
      data: "should-not-stream",
      outputLength: 20,
      terminalInstanceId: "gen-prior",
    });
    rejectOnNotify = false;
    ws.send(JSON.stringify({ type: "ping", id: "after-async-v99" }));
    await expect(next()).resolves.toMatchObject({ type: "pong", id: "after-async-v99" });
    ws.close();
  });

  it("emits retryable unavailable and clears registration when v1 setup barrier rejects async", async () => {
    // Promise rejection on the awaited interest barrier (not sync throw).
    let rejectBarrier = false;
    const onEventInterestsChanged = vi.fn<
      NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>
    >(async () => {
      if (rejectBarrier) throw new Error("async setup barrier failure");
    });
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => {
      throw new Error("snapshot must not run after barrier rejection");
    });
    const server = createCursorSyncServer({ onEventInterestsChanged, callSupervisor });
    const info = await server.start();
    const { ws, next } = await openTerminalWatchSocket(info);

    // Prior legacy interest on the same id — barrier failure must clear it too.
    rejectBarrier = false;
    ws.send(JSON.stringify({ type: "terminal-watch", id: "term-barrier-reject" }));
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          terminalThreadIds: expect.arrayContaining(["term-barrier-reject"]),
        }),
      ),
    );
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-barrier-reject",
      data: "legacy",
      outputLength: 6,
      terminalInstanceId: "g",
    });
    await expect(next()).resolves.toEqual({
      type: "terminal-output",
      id: "term-barrier-reject",
      data: "legacy",
    });

    rejectBarrier = true;
    const snapshotCallsBefore = callSupervisor.mock.calls.length;
    ws.send(
      JSON.stringify({
        type: "terminal-watch",
        id: "term-barrier-reject",
        cursorSync: { version: 1, watchId: "w-barrier-reject" },
      }),
    );
    await expect(next()).resolves.toEqual({
      type: "terminal-watch-result",
      id: "term-barrier-reject",
      cursorSync: {
        version: 1,
        watchId: "w-barrier-reject",
        result: { status: "error", code: "unavailable", retryable: true },
      },
    });
    // Setup aborts before snapshot on barrier rejection.
    expect(callSupervisor.mock.calls.length).toBe(snapshotCallsBefore);

    const internals = server as unknown as {
      terminalCursorSync: { getReliable: (socket: WebSocket, id: string) => unknown };
      terminalWatches: Map<WebSocket, Set<string>>;
      clients: Map<WebSocket, unknown>;
    };
    const serverWs = [...internals.clients.keys()][0];
    expect(serverWs).toBeDefined();
    expect(
      internals.terminalCursorSync.getReliable(serverWs!, "term-barrier-reject"),
    ).toBeUndefined();
    expect(internals.terminalWatches.get(serverWs!)?.has("term-barrier-reject")).toBe(false);
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenLastCalledWith(
        expect.objectContaining({ terminalThreadIds: [] }),
      ),
    );

    // No live stream (reliable or legacy) survives the failed setup.
    server.publishSupervisorEvent({
      type: "thread-output",
      threadId: "term-barrier-reject",
      data: "should-not-stream",
      outputLength: 17,
      terminalInstanceId: "g",
    });
    rejectBarrier = false;
    ws.send(JSON.stringify({ type: "ping", id: "after-barrier-reject" }));
    await expect(next()).resolves.toMatchObject({ type: "pong", id: "after-barrier-reject" });
    ws.close();
  });
});
