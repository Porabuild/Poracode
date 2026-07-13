import { randomBytes } from "node:crypto";
import {
  createServer as createHttpServer,
  request as httpRequestNode,
  type IncomingHttpHeaders,
  type Server as HttpServer,
} from "node:http";
import { connect, createServer as createNetServer, type AddressInfo, type Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, ScheduledTask, ScheduledTaskInput, Thread } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { pickRemoteSettings, type RemoteSettings } from "@/shared/remote";
import { defaultSharedSettings } from "@/shared/settings";
import type { BrowserPanelManager } from "../browser";
import {
  dbDeleteProject,
  dbDeleteThread,
  dbGetThreadCompletedTurns,
  dbGetProjects,
  dbGetThread,
  dbGetThreadContextUsage,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeSummaries,
  dbGetThreads,
  dbReplaceThreadRuntimeItems,
  dbReplaceThreadRuntimeSnapshot,
  dbUpsertProject,
  dbUpsertThread,
} from "../db";
import { RemoteAuthStore } from "./auth";
import { PortProxy } from "./portForward/portProxy";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";
import { RemoteBrowserGateway } from "./RemoteBrowserGateway";
import { RemotePortForwardGateway } from "./RemotePortForwardGateway";

vi.mock("../db", () => {
  // Backs dbGetState/dbSetState with a real in-memory map so the profile
  // module's identity round-trip (write then read back) behaves like SQLite.
  const appState = new Map<string, string>();
  // The profile module memoizes core/token stats by this generation counter;
  // it must actually advance on bumpProfileDataGeneration() (as it does with
  // real SQLite) or an identity write would never invalidate the cached read.
  let profileDataGeneration = 0;
  return {
    dbDeleteThread: vi.fn<(threadId: string) => void>(),
    dbGetProjects: vi.fn<() => unknown[]>(() => []),
    dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
    dbGetThreadContextUsage: vi.fn<() => null>(() => null),
    dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
    dbGetThreadRuntimeSummaries: vi.fn<() => Record<string, unknown>>(() => ({})),
    dbGetThread: vi.fn<(threadId: string) => unknown>(() => null),
    dbGetThreads: vi.fn<() => unknown[]>(() => []),
    dbReplaceThreadRuntimeItems: vi.fn<(...args: unknown[]) => void>(),
    dbReplaceThreadRuntimeSnapshot: vi.fn<(...args: unknown[]) => void>(),
    dbUpsertProject: vi.fn<(project: unknown, sortOrder: number) => void>(),
    dbDeleteProject: vi.fn<(projectId: string) => void>(),
    dbUpsertThread: vi.fn<(thread: unknown, sortOrder: number) => void>(),
    dbGetState: vi.fn<(key: string) => string | null>((key) => appState.get(key) ?? null),
    dbSetState: vi.fn<(key: string, value: string) => void>((key, value) => {
      appState.set(key, value);
    }),
    dbGetAllUsageEvents: vi.fn<() => unknown[]>(() => []),
    getProfileDataGeneration: vi.fn<() => number>(() => profileDataGeneration),
    bumpProfileDataGeneration: vi.fn<() => void>(() => {
      profileDataGeneration++;
    }),
  };
});

const servers: RemoteAccessServer[] = [];

/** Reserves an ephemeral loopback port so a test can advertise a different
 * origin while still reaching the real listener at a known address. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  vi.mocked(dbDeleteProject).mockReset();
  vi.mocked(dbDeleteThread).mockReset();
  vi.mocked(dbGetThreadCompletedTurns).mockReset().mockReturnValue([]);
  vi.mocked(dbGetProjects).mockReset().mockReturnValue([]);
  vi.mocked(dbGetThreadContextUsage).mockReset().mockReturnValue(null);
  vi.mocked(dbGetThreadRuntimeItems).mockReset().mockReturnValue([]);
  vi.mocked(dbGetThreadRuntimeSummaries).mockReset().mockReturnValue({});
  vi.mocked(dbGetThread).mockReset().mockReturnValue(null);
  vi.mocked(dbGetThreads).mockReset().mockReturnValue([]);
  vi.mocked(dbReplaceThreadRuntimeItems).mockReset();
  vi.mocked(dbReplaceThreadRuntimeSnapshot).mockReset();
  vi.mocked(dbUpsertProject).mockReset();
  vi.mocked(dbUpsertThread).mockReset();
});

function createTestProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Repo",
    location: { kind: "posix", path: "/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createTestThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "terminal",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockThreadDb(initialThreads: Thread[] = []): { readonly threads: () => Thread[] } {
  let threads = [...initialThreads];
  vi.mocked(dbGetThreads).mockImplementation(() => threads);
  vi.mocked(dbGetThread).mockImplementation(
    (threadId) => threads.find((entry) => entry.id === threadId) ?? null,
  );
  vi.mocked(dbUpsertThread).mockImplementation((thread) => {
    const parsed = thread as Thread;
    const index = threads.findIndex((entry) => entry.id === parsed.id);
    threads =
      index === -1
        ? [parsed, ...threads]
        : threads.map((entry) => (entry.id === parsed.id ? parsed : entry));
  });
  vi.mocked(dbDeleteThread).mockImplementation((threadId) => {
    threads = threads.filter((thread) => thread.id !== threadId);
  });
  return { threads: () => threads };
}

async function readWsMessage(ws: WebSocket): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for websocket message")),
      5_000,
    );
    ws.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as unknown);
    });
    ws.once("error", reject);
  });
}

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

async function openPairedSocket(info: RemoteAccessServerInfo): Promise<{
  readonly ws: WebSocket;
  readonly ready: unknown;
}> {
  const pairing = new URL(info.pairingUrl);
  const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
  expect(credential).toBeTruthy();

  const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read"],
      client: { label: "Test mobile", deviceType: "mobile" },
    }),
  });
  expect(tokenResponse.status).toBe(200);
  const token = (await tokenResponse.json()) as { accessToken: string };

  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token.accessToken}` },
  });
  expect(ticketResponse.status).toBe(200);
  const ticket = (await ticketResponse.json()) as { ticket: string };

  const wsUrl = new URL("/ws", info.wsBaseUrl);
  wsUrl.searchParams.set("ticket", ticket.ticket);
  const ws = new WebSocket(wsUrl);
  const readyPromise = readWsMessage(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { ws, ready: await readyPromise };
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

async function openRawWebSocket(info: RemoteAccessServerInfo, ticket: string): Promise<Socket> {
  const httpUrl = new URL(info.httpBaseUrl);
  const wsUrl = new URL("/ws", info.wsBaseUrl);
  wsUrl.searchParams.set("ticket", ticket);
  const socket = connect(Number(httpUrl.port), httpUrl.hostname);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  const key = randomBytes(16).toString("base64");
  socket.write(
    [
      `GET ${wsUrl.pathname}${wsUrl.search} HTTP/1.1`,
      `Host: ${httpUrl.host}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${key}`,
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n"),
  );

  let header = "";
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for upgrade")), 5_000);
    socket.on("data", function onData(data) {
      header += data.toString("latin1");
      if (!header.includes("\r\n\r\n")) return;
      socket.off("data", onData);
      clearTimeout(timeout);
      if (!header.startsWith("HTTP/1.1 101")) {
        reject(new Error(`Unexpected websocket upgrade response: ${header.split("\r\n")[0]}`));
        return;
      }
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  return socket;
}

/** A tiny "dev server" stand-in for the forward-proxy tests: echoes back the
 * request path+query and the `Host` header it received, so tests can assert
 * the proxy rewrote `Host` to `localhost:<port>` and forwarded the path/query
 * verbatim (including a nested path with a query string). Bound to `host`
 * (default `127.0.0.1`; pass `::1` to simulate a dev server that bound
 * IPv6-only, e.g. `vite --port …` on a system where the bare hostname
 * `localhost` resolves to IPv6 first). */
function startUpstreamHttpServer(
  host = "127.0.0.1",
): Promise<{ port: number; server: HttpServer }> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ url: req.url, host: req.headers.host }));
    });
    server.once("error", reject);
    server.listen(0, host, () => {
      resolve({ port: (server.address() as AddressInfo).port, server });
    });
  });
}

/** Whether this machine can bind an IPv6 loopback listener at all — some CI
 * hosts disable IPv6 entirely, in which case the `::1`-only tests below must
 * skip rather than fail. */
function detectIpv6LoopbackSupport(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once("error", () => resolve(false));
    probe.listen(0, "::1", () => {
      probe.close(() => resolve(true));
    });
  });
}

const ipv6Supported = await detectIpv6LoopbackSupport();

/**
 * A raw (non-`fetch`) GET so the test can inspect a 3xx response's `Location`
 * and `Set-Cookie` headers directly — `fetch`'s `redirect: "manual"` mode
 * returns an opaque-redirect filtered response (status 0, no headers) per the
 * Fetch spec, which would hide exactly what these tests need to assert.
 */
function rawGet(url: URL): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequestNode(url, { method: "GET" }, (res) => {
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

/** Extracts the `lc_forward` cookie value from a raw `Set-Cookie` header. */
function extractForwardCookieValue(setCookieHeader: string): string {
  const match = /^lc_forward=([^;]+)/.exec(setCookieHeader);
  if (!match?.[1]) throw new Error(`Expected an lc_forward cookie, got: ${setCookieHeader}`);
  return match[1];
}

describe("RemoteAccessServer", () => {
  it("persists remotely broadcast thread-state transitions", () => {
    const initialStartedAt = "2026-01-01T00:00:00.000Z";
    const db = mockThreadDb([
      createTestThread({
        id: "thread-remote",
        status: "launching",
        attention: "none",
        canResumeWithConfig: false,
        presentationMode: "gui",
        threadStatusSource: "server",
        activeTurnStartedAt: initialStartedAt,
      }),
    ]);
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });

    server.publishSupervisorEvent({
      type: "thread-state",
      threadId: "thread-remote",
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      threadStatusSource: "server",
    });

    expect(db.threads()[0]).toMatchObject({
      id: "thread-remote",
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: initialStartedAt,
    });
    expect(db.threads()[0]?.lastTurnEndedAt).toBeTruthy();
  });

  it("persists thread-state even when the stored row carries no status source", () => {
    // Rows written before the thread_status_source column existed (or by code
    // paths that never set it) read back with threadStatusSource undefined; a
    // source-tagged event must still persist or the row freezes at its
    // creation status and snapshots re-serve "launching"/"working" forever.
    const db = mockThreadDb([
      createTestThread({ id: "thread-legacy", status: "launching", presentationMode: "gui" }),
    ]);
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });

    server.publishSupervisorEvent({
      type: "thread-state",
      threadId: "thread-legacy",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      threadStatusSource: "server",
    });

    expect(db.threads()[0]).toMatchObject({
      id: "thread-legacy",
      status: "idle",
      threadStatusSource: "server",
    });
  });

  it("persists thread-state across a status source change", () => {
    const db = mockThreadDb([
      createTestThread({
        id: "thread-terminal",
        status: "working",
        presentationMode: "terminal",
        threadStatusSource: "terminal_parse",
      }),
    ]);
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });

    server.publishSupervisorEvent({
      type: "thread-state",
      threadId: "thread-terminal",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      threadStatusSource: "cli_hook",
    });

    expect(db.threads()[0]).toMatchObject({
      id: "thread-terminal",
      status: "idle",
      threadStatusSource: "cli_hook",
    });
  });

  it("flushes runtime items before a settling thread-state can be snapshotted", () => {
    mockThreadDb([
      createTestThread({
        id: "thread-runtime",
        status: "working",
        attention: "working",
        presentationMode: "gui",
        activeTurnStartedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });

    server.publishSupervisorEvent({
      type: "thread-runtime-events",
      threadId: "thread-runtime",
      events: [
        {
          type: "item.started",
          threadId: "thread-runtime",
          itemId: "assistant-1",
          itemType: "assistant_message",
        },
        {
          type: "content.delta",
          threadId: "thread-runtime",
          itemId: "assistant-1",
          stream: "assistant_text",
          delta: "hello",
        },
        { type: "item.completed", threadId: "thread-runtime", itemId: "assistant-1" },
      ],
    });
    expect(dbReplaceThreadRuntimeItems).not.toHaveBeenCalled();

    server.publishSupervisorEvent({
      type: "thread-state",
      threadId: "thread-runtime",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });

    expect(dbReplaceThreadRuntimeItems).toHaveBeenCalledWith("thread-runtime", [
      expect.objectContaining({
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "hello" },
      }),
    ]);
  });

  it("serves descriptor, snapshot, and websocket supervisor events", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => "" as never,
    );
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const pairingUrl = new URL(info.pairingUrl);
    expect(pairingUrl.origin).toBe(new URL(info.httpBaseUrl).origin);
    expect(pairingUrl.pathname).toBe("/pair");

    const descriptorResponse = await fetch(
      new URL("/.well-known/poracode/environment", info.httpBaseUrl),
    );
    expect(descriptorResponse.status).toBe(200);
    await expect(descriptorResponse.json()).resolves.toMatchObject({
      desktopId: "desktop-test",
      label: "Test Desktop",
      appVersion: "1.0.0",
      platform:
        process.platform === "win32" ||
        process.platform === "darwin" ||
        process.platform === "linux"
          ? process.platform
          : undefined,
    });

    const legacyDescriptorResponse = await fetch(
      new URL("/.well-known/lightcode/environment", info.httpBaseUrl),
    );
    expect(legacyDescriptorResponse.status).toBe(200);
    await expect(legacyDescriptorResponse.json()).resolves.toMatchObject({
      desktopId: "desktop-test",
    });

    const pairingPageResponse = await fetch(info.pairingUrl);
    expect(pairingPageResponse.status).toBe(200);
    const pairingHtml = await pairingPageResponse.text();
    expect(pairingHtml).toContain("Poracode");
    expect(pairingHtml).toContain('rel="manifest"');

    const appResponse = await fetch(new URL("/app", info.httpBaseUrl));
    expect(appResponse.status).toBe(200);
    await expect(appResponse.text()).resolves.toContain("Poracode");

    const manifestResponse = await fetch(new URL("/manifest.webmanifest", info.httpBaseUrl));
    expect(manifestResponse.status).toBe(200);
    await expect(manifestResponse.json()).resolves.toMatchObject({
      name: "Poracode",
      start_url: "/app",
      display: "standalone",
    });

    const serviceWorkerResponse = await fetch(new URL("/service-worker.js", info.httpBaseUrl));
    expect(serviceWorkerResponse.status).toBe(200);
    const serviceWorker = await serviceWorkerResponse.text();
    expect(serviceWorker).toContain("poracode-remote-local");
    expect(serviceWorker).toContain("caches.delete(LEGACY_CACHE_NAME)");

    const { ws, ready } = await openPairedSocket(info);
    expect(ready).toMatchObject({ type: "ready", seq: 0 });

    const event = {
      type: "thread-state",
      threadId: "thread-1",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    } satisfies SupervisorEvent;
    server.publishSupervisorEvent(event);

    expect(await readWsMessage(ws)).toMatchObject({
      type: "event",
      seq: 1,
      event,
    });
    ws.close();
  });

  it("builds shell snapshots from aggregated runtime summaries", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      createTestProject({
        mcpServers: [
          {
            id: "secret-server",
            name: "private",
            description: "",
            enabled: true,
            timeoutMs: 30_000,
            transport: {
              type: "http",
              url: "https://example.com/mcp",
              headers: { Authorization: "Bearer top-secret" },
            },
          },
        ],
      }),
    ]);
    const visibleThread = createTestThread({ id: "thread-visible", title: "Visible" });
    const archivedThread = createTestThread({
      id: "thread-archived",
      title: "Archived",
      archived: true,
    });
    vi.mocked(dbGetThreads).mockReturnValue([visibleThread, archivedThread]);
    vi.mocked(dbGetThreadRuntimeSummaries).mockReturnValue({
      "thread-visible": {
        itemCount: 3,
        latestItemId: "item-3",
        latestItemType: "assistant_message",
        latestItemState: "completed",
        contextUsage: { usedTokens: 128, maxTokens: 1000 },
      },
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read"]);

    const response = await fetch(new URL("/api/snapshot", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const snapshot = await response.json();
    expect(snapshot).toMatchObject({
      runtimeSummariesByThread: {
        "thread-visible": {
          itemCount: 3,
          latestItemId: "item-3",
          latestItemType: "assistant_message",
          latestItemState: "completed",
          contextUsage: { usedTokens: 128, maxTokens: 1000 },
        },
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain("top-secret");
    expect((snapshot as { projects: Project[] }).projects[0]).not.toHaveProperty("mcpServers");
    expect(dbGetThreadRuntimeSummaries).toHaveBeenCalledWith(["thread-visible"]);
    expect(dbGetThreadRuntimeItems).not.toHaveBeenCalled();
    expect(dbGetThreadContextUsage).not.toHaveBeenCalled();
  });

  it("drops websocket clients when outbound sends fail", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const { ws, ready } = await openPairedSocket(info);
    expect(ready).toMatchObject({ type: "ready", seq: 0 });

    const clients = (server as unknown as { clients: Map<WebSocket, unknown> }).clients;
    const serverSocket = [...clients.keys()][0];
    expect(serverSocket).toBeDefined();
    const closed = new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
    });
    serverSocket!.send = (() => {
      throw new Error("send failed");
    }) as WebSocket["send"];
    const terminate = vi.spyOn(serverSocket!, "terminate");

    expect(() =>
      server.publishSupervisorEvent({
        type: "thread-state",
        threadId: "thread-1",
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
      }),
    ).not.toThrow();
    expect(terminate).toHaveBeenCalled();
    expect(clients.has(serverSocket!)).toBe(false);
    await closed;
  });

  it("drops websocket clients before outbound buffers grow without bound", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      maxWebSocketOutboundBufferBytes: 64,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const { ws, ready } = await openPairedSocket(info);
    expect(ready).toMatchObject({ type: "ready", seq: 0 });

    const clients = (server as unknown as { clients: Map<WebSocket, unknown> }).clients;
    const serverSocket = [...clients.keys()][0];
    expect(serverSocket).toBeDefined();
    const terminate = vi.spyOn(serverSocket!, "terminate");
    const closed = new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
    });

    server.publishSupervisorEvent({
      type: "thread-state",
      threadId: "thread-with-a-long-id-that-makes-the-event-frame-exceed-the-test-limit",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });

    expect(terminate).toHaveBeenCalled();
    expect(clients.has(serverSocket!)).toBe(false);
    await closed;
  });

  it("closes clients that exceed the inbound websocket payload limit", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      maxWebSocketPayloadBytes: 64,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const { ws, ready } = await openPairedSocket(info);
    expect(ready).toMatchObject({ type: "ready", seq: 0 });

    ws.send(JSON.stringify({ type: "ping", id: "x".repeat(128) }));

    await expect(waitWsClose(ws)).resolves.toMatchObject({ code: 1009 });
  });

  it("closes websocket clients when their access session expires", async () => {
    const authStore = new RemoteAuthStore();
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      authStore,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const pairing = authStore.issuePairingCredential({ scopes: ["session:read"] });
    const token = authStore.exchangePairingCredential({
      credential: pairing.credential,
      ttlMs: 250,
    });
    const ticket = authStore.issueWebSocketTicket({
      accessToken: token.accessToken,
      ttlMs: 5_000,
    });

    const wsUrl = new URL("/ws", info.wsBaseUrl);
    wsUrl.searchParams.set("ticket", ticket.ticket);
    const ws = new WebSocket(wsUrl);
    const readyPromise = readWsMessage(ws);
    const closePromise = waitWsClose(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    await expect(readyPromise).resolves.toMatchObject({ type: "ready", seq: 0 });
    await expect(closePromise).resolves.toEqual({
      code: 1008,
      reason: "Remote access session expired",
    });
  });

  it("returns valid JSON after starting a remote terminal shell", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => undefined as never,
    );
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["terminal:operate"]);
    const payload = {
      shellId: "shell:test",
      projectLocation: { kind: "posix", path: "/repo" },
      initialSize: { cols: 80, rows: 24 },
    };

    const response = await fetch(new URL("/api/terminal/start", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(callSupervisor).toHaveBeenCalledWith("startShell", payload);
  });

  it("terminates half-open websocket clients that do not pong", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      webSocketHeartbeatIntervalMs: 20,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const socket = await openRawWebSocket(info, ticket);

    const closed = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Socket stayed open")), 1_000);
      socket.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    await expect(closed).resolves.toBeUndefined();
  });

  it("limits CORS to trusted origins", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      pairingAppUrl: "https://mobile.poracode.test/app",
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const descriptorUrl = new URL("/.well-known/poracode/environment", info.httpBaseUrl);

    const hostedResponse = await fetch(descriptorUrl, {
      headers: { origin: "https://mobile.poracode.test" },
    });
    expect(hostedResponse.status).toBe(200);
    expect(hostedResponse.headers.get("access-control-allow-origin")).toBe(
      "https://mobile.poracode.test",
    );

    const nativeResponse = await fetch(descriptorUrl, {
      headers: { origin: "capacitor://localhost" },
    });
    expect(nativeResponse.status).toBe(200);
    expect(nativeResponse.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");

    const blockedResponse = await fetch(descriptorUrl, {
      headers: { origin: "https://evil.example" },
    });
    expect(blockedResponse.status).toBe(403);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      error: { code: "origin_not_allowed" },
    });
  });

  it("trusts loopback web origins only in dev", async () => {
    // Dev: the Vite-served mobile PWA (localhost:3100) pairs without an explicit
    // pairingAppUrl/trustedCorsOrigins entry.
    const devServer = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-dev", label: "Dev Desktop" },
      isDev: true,
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(devServer);
    const devInfo = await devServer.start();
    const devDescriptorUrl = new URL("/.well-known/poracode/environment", devInfo.httpBaseUrl);
    const devResponse = await fetch(devDescriptorUrl, {
      headers: { origin: "http://localhost:3100" },
    });
    expect(devResponse.status).toBe(200);
    expect(devResponse.headers.get("access-control-allow-origin")).toBe("http://localhost:3100");

    // Production (isDev unset) never trusts an arbitrary loopback dev origin.
    const prodServer = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-prod", label: "Prod Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(prodServer);
    const prodInfo = await prodServer.start();
    const prodResponse = await fetch(
      new URL("/.well-known/poracode/environment", prodInfo.httpBaseUrl),
      { headers: { origin: "http://localhost:3100" } },
    );
    expect(prodResponse.status).toBe(403);
  });

  it("advertises a full advertisedBaseUrl over host/port (https → wss)", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "0.0.0.0",
      port: 0,
      advertisedHost: "192.168.1.5",
      advertisedBaseUrl: "https://my-machine.tailnet-1234.ts.net",
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    expect(info.httpBaseUrl).toBe("https://my-machine.tailnet-1234.ts.net/");
    expect(info.wsBaseUrl).toBe("wss://my-machine.tailnet-1234.ts.net/");
    const pairingUrl = new URL(info.pairingUrl);
    expect(pairingUrl.origin).toBe("https://my-machine.tailnet-1234.ts.net");
    expect(pairingUrl.pathname).toBe("/pair");
  });

  it("trusts the advertisedBaseUrl origin for CORS", async () => {
    const port = await getFreePort();
    const advertised = "https://tunnel.example.com";
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port,
      advertisedBaseUrl: advertised,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    await server.start();
    const localUrl = new URL("/.well-known/poracode/environment", `http://127.0.0.1:${port}/`);

    const allowed = await fetch(localUrl, { headers: { origin: advertised } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(advertised);

    const blocked = await fetch(localUrl, { headers: { origin: "https://evil.example" } });
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({ error: { code: "origin_not_allowed" } });
  });

  it("accepts websocket upgrades from arbitrary origins with one-use tickets", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      pairingAppUrl: "https://mobile.poracode.test/app",
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const wsUrl = new URL("/ws", info.wsBaseUrl);
    wsUrl.searchParams.set("ticket", ticket);

    const socket = new WebSocket(wsUrl, { headers: { Origin: "https://evil.example" } });
    const ready = readWsMessage(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    await expect(ready).resolves.toMatchObject({ type: "ready" });
    socket.close();

    const replayStatus = await new Promise<number>((resolve, reject) => {
      const replaySocket = new WebSocket(wsUrl, { headers: { Origin: "https://evil.example" } });
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for websocket replay rejection")),
        5_000,
      );
      replaySocket.once("unexpected-response", (_request, response) => {
        clearTimeout(timeout);
        resolve(response.statusCode ?? 0);
        replaySocket.close();
      });
      replaySocket.once("open", () => {
        clearTimeout(timeout);
        reject(new Error("Reused websocket ticket connected"));
      });
      replaySocket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    expect(replayStatus).toBe(401);
  });

  it("points dev pairing links at the mobile dev app origin", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      devMobileAppUrl: "http://192.168.1.20:3100/mobile.html",
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    const startupPairing = new URL(info.pairingUrl);
    expect(startupPairing.origin).toBe("http://192.168.1.20:3100");
    expect(startupPairing.pathname).toBe("/pair");
    expect(startupPairing.searchParams.get("host")).toBe(info.httpBaseUrl);
    expect(new URLSearchParams(startupPairing.hash.slice(1)).get("token")).toMatch(/^lc_pair_/);

    const settingsPairing = new URL(server.issuePairingUrl("Settings QR"));
    expect(settingsPairing.origin).toBe(startupPairing.origin);
    expect(settingsPairing.pathname).toBe("/pair");
    expect(settingsPairing.searchParams.get("host")).toBe(info.httpBaseUrl);
  });

  it("rejects an unauthenticated /api/git/call before parsing or the procedure allowlist", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => {
      throw new Error("supervisor must not be reached for an unauthenticated call");
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();

    // A known-but-unauthenticated procedure and an unknown one must BOTH return
    // 401 — if the allowlist were checked before auth, the unknown one would
    // return 403, leaking which procedures exist to an unauthenticated caller.
    const unknown = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ procedure: "definitelyNotAProcedure", payload: {} }),
    });
    const known = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ procedure: "readProjectFile", payload: {} }),
    });

    expect(unknown.status).toBe(401);
    expect(known.status).toBe(401);
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("allows paired clients to search, list, read, write, and mutate project files through the remote bridge", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "searchProjectFiles") {
        return {
          entries: [{ path: "src/app.ts", name: "app.ts", type: "file" }],
          totalIndexed: 1,
        } as never;
      }
      if (name === "readAbsoluteFile") {
        return { status: "ready", modifiedAtMs: 1230, content: "export {};\n" } as never;
      }
      if (name === "writeProjectFile") {
        return { modifiedAtMs: 1234 } as never;
      }
      if (
        name === "createProjectEntry" ||
        name === "renameProjectEntry" ||
        name === "deleteProjectEntry"
      ) {
        return undefined as never;
      }
      return {
        directoryPath: "",
        entries: [{ path: "src", name: "src", type: "directory", hasChildren: true }],
      } as never;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    // `readAbsoluteFile` reaches paths outside any project root, so it is gated
    // behind `projects:manage` (like `browseHostDirectory`); the other bridge
    // procedures here only need read/operate. `projects:manage` is part of the
    // standard scope set granted at pairing.
    const token = await issueAccessToken(info, [
      "session:read",
      "session:operate",
      "projects:manage",
    ]);

    const searchResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "searchProjectFiles",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
          query: "app",
          limit: 20,
        },
      }),
    });

    expect(searchResponse.status).toBe(200);
    await expect(searchResponse.json()).resolves.toEqual({
      result: {
        entries: [{ path: "src/app.ts", name: "app.ts", type: "file" }],
        totalIndexed: 1,
      },
    });
    expect(callSupervisor).toHaveBeenCalledWith("searchProjectFiles", {
      projectLocation: { kind: "posix", path: "/tmp/example" },
      query: "app",
      limit: 20,
    });

    const listResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "listProjectTree",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
          directoryPath: "",
        },
      }),
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      result: {
        directoryPath: "",
        entries: [{ path: "src", name: "src", type: "directory", hasChildren: true }],
      },
    });
    expect(callSupervisor).toHaveBeenCalledWith("listProjectTree", {
      projectLocation: { kind: "posix", path: "/tmp/example" },
      directoryPath: "",
    });

    const readResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "readAbsoluteFile",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
          absolutePath: "src/generated.ts",
        },
      }),
    });

    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toEqual({
      result: { status: "ready", modifiedAtMs: 1230, content: "export {};\n" },
    });
    expect(callSupervisor).toHaveBeenCalledWith("readAbsoluteFile", {
      projectLocation: { kind: "posix", path: "/tmp/example" },
      absolutePath: "src/generated.ts",
    });

    const writeResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "writeProjectFile",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
          path: "src/app.ts",
          content: "export {};\n",
          baseModifiedAtMs: 1000,
        },
      }),
    });

    expect(writeResponse.status).toBe(200);
    await expect(writeResponse.json()).resolves.toEqual({
      result: { modifiedAtMs: 1234 },
    });
    expect(callSupervisor).toHaveBeenCalledWith("writeProjectFile", {
      projectLocation: { kind: "posix", path: "/tmp/example" },
      path: "src/app.ts",
      content: "export {};\n",
      baseModifiedAtMs: 1000,
    });

    const createResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "createProjectEntry",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
          path: "src/new.ts",
          type: "file",
        },
      }),
    });

    expect(createResponse.status).toBe(200);
    await expect(createResponse.json()).resolves.toEqual({});
    expect(callSupervisor).toHaveBeenCalledWith("createProjectEntry", {
      projectLocation: { kind: "posix", path: "/tmp/example" },
      path: "src/new.ts",
      type: "file",
    });

    const renameResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "renameProjectEntry",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
          path: "src/new.ts",
          nextName: "renamed.ts",
        },
      }),
    });

    expect(renameResponse.status).toBe(200);
    await expect(renameResponse.json()).resolves.toEqual({});
    expect(callSupervisor).toHaveBeenCalledWith("renameProjectEntry", {
      projectLocation: { kind: "posix", path: "/tmp/example" },
      path: "src/new.ts",
      nextName: "renamed.ts",
    });

    const deleteResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "deleteProjectEntry",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
          path: "src/renamed.ts",
        },
      }),
    });

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({});
    expect(callSupervisor).toHaveBeenCalledWith("deleteProjectEntry", {
      projectLocation: { kind: "posix", path: "/tmp/example" },
      path: "src/renamed.ts",
    });
  });

  it("rejects readAbsoluteFile for tokens without projects:manage (arbitrary host file read)", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => {
      throw new Error("supervisor should not be reached without projects:manage");
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    // A broad-but-not-management token: enough for project-relative reads, not
    // enough to read arbitrary absolute paths on the host.
    const token = await issueAccessToken(info, ["session:read", "session:operate"]);

    const response = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "readAbsoluteFile",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
          absolutePath: "/home/user/.ssh/id_rsa",
        },
      }),
    });

    expect(response.status).toBe(403);
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("allows paired clients to subscribe to subagent overlay streams through the remote bridge", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "subagentSubscribe") return { history: [] } as never;
      if (name === "subagentUnsubscribe") return undefined as never;
      throw new Error(`unexpected supervisor call: ${name}`);
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read"]);

    const subscribeResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "subagentSubscribe",
        payload: { threadId: "thread-1", parentItemId: "agent-1" },
      }),
    });

    expect(subscribeResponse.status).toBe(200);
    await expect(subscribeResponse.json()).resolves.toEqual({ result: { history: [] } });
    expect(callSupervisor).toHaveBeenCalledWith("subagentSubscribe", {
      threadId: "thread-1",
      parentItemId: "agent-1",
    });

    const unsubscribeResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "subagentUnsubscribe",
        payload: { threadId: "thread-1", parentItemId: "agent-1" },
      }),
    });

    expect(unsubscribeResponse.status).toBe(200);
    await expect(unsubscribeResponse.json()).resolves.toEqual({});
    expect(callSupervisor).toHaveBeenCalledWith("subagentUnsubscribe", {
      threadId: "thread-1",
      parentItemId: "agent-1",
    });
  });

  it("allows paired clients to poll workflow manifests through the remote bridge", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "workflowGetRun") return { run: null } as never;
      throw new Error(`unexpected supervisor call: ${name}`);
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read"]);

    const response = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "workflowGetRun",
        payload: {
          manifestPath: "/tmp/poracode/workflows/wf_1.json",
          transcriptDir: "/tmp/poracode/subagents/workflows/wf_1",
          includeAgentChats: true,
          location: { kind: "posix", path: "/tmp/example" },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: { run: null } });
    expect(callSupervisor).toHaveBeenCalledWith("workflowGetRun", {
      manifestPath: "/tmp/poracode/workflows/wf_1.json",
      transcriptDir: "/tmp/poracode/subagents/workflows/wf_1",
      includeAgentChats: true,
      location: { kind: "posix", path: "/tmp/example" },
    });
  });

  it("allows paired clients to bulk-fetch pull requests through the remote bridge", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "ghListPrs") return { prs: {} } as never;
      throw new Error(`unexpected supervisor call: ${name}`);
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read"]);

    const response = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        procedure: "ghListPrs",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: { prs: {} } });
    expect(callSupervisor).toHaveBeenCalledWith("ghListPrs", {
      projectLocation: { kind: "posix", path: "/tmp/example" },
    });
  });

  it("rate limits pairing token exchange attempts", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      tokenExchangeRateLimit: { maxAttempts: 1, windowMs: 60_000 },
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const tokenUrl = new URL("/oauth/token", info.httpBaseUrl);
    const body = JSON.stringify({ grantType: "pairing-token", credential: "bad-token" });

    const firstResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(firstResponse.status).toBe(401);

    const secondResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(secondResponse.status).toBe(429);
    await expect(secondResponse.json()).resolves.toMatchObject({
      error: { code: "rate_limited" },
    });
  });

  it("keys the pairing rate limit per forwarded client behind a loopback relay hop", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      tokenExchangeRateLimit: { maxAttempts: 1, windowMs: 60_000 },
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const tokenUrl = new URL("/oauth/token", info.httpBaseUrl);
    const body = JSON.stringify({ grantType: "pairing-token", credential: "bad-token" });

    // Both requests arrive from loopback (as they would behind the relay), but
    // carry distinct x-forwarded-for hops, so each gets its own bucket and
    // neither is throttled despite maxAttempts: 1.
    const deviceA = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body,
    });
    const deviceB = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20" },
      body,
    });
    expect(deviceA.status).toBe(401);
    expect(deviceB.status).toBe(401);

    // A second attempt from device A (same forwarded hop) is throttled.
    const deviceARetry = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body,
    });
    expect(deviceARetry.status).toBe(429);
  });

  it("only buffers and broadcasts remotely-consumed supervisor events", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const { ws, ready } = await openPairedSocket(info);
    expect(ready).toMatchObject({ type: "ready", seq: 0 });

    // Chatty events no remote client consumes must not advance the seq or reach
    // the socket; the next consumed event should arrive at seq 1.
    server.publishSupervisorEvent({ type: "git-changed", projectId: "project-1" });
    server.publishSupervisorEvent({ type: "project-tree-changed", projectId: "project-1" });
    server.publishSupervisorEvent({ type: "lsp-message", sessionId: "lsp-1", message: {} });

    const consumed = {
      type: "thread-state",
      threadId: "thread-1",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    } satisfies SupervisorEvent;
    server.publishSupervisorEvent(consumed);

    expect(await readWsMessage(ws)).toMatchObject({ type: "event", seq: 1, event: consumed });
    ws.close();
  });

  it("forces a resync when a reconnecting client's cursor exceeds a reset stream", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info);
    const ticket = await issueWebSocketTicket(info, token);

    // Fresh server is at seq 0; a client reconnecting with a higher cursor (its
    // desktop restarted, resetting seq) must be told to resync, not silently
    // left with stale state.
    const wsUrl = new URL("/ws", info.wsBaseUrl);
    wsUrl.searchParams.set("ticket", ticket);
    wsUrl.searchParams.set("lastSeenSeq", "42");
    const ws = new WebSocket(wsUrl);
    // `ready` and `resync-required` are sent back-to-back on connect, so collect
    // messages with a persistent listener rather than racing per-message reads.
    const messages: unknown[] = [];
    const gotResync = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for resync")), 5_000);
      ws.on("message", (data: Buffer) => {
        messages.push(JSON.parse(data.toString()));
        if (messages.some((m) => (m as { type?: string }).type === "resync-required")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      ws.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    await gotResync;
    expect(messages).toEqual([
      expect.objectContaining({ type: "ready", seq: 0 }),
      expect.objectContaining({ type: "resync-required", seq: 0 }),
    ]);
    ws.close();
  });

  it("lists access sessions and closes active sockets when revoked", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const { ws } = await openPairedSocket(info);
    const [session] = server.listAccessSessions();
    expect(session).toMatchObject({
      client: { label: "Test mobile", deviceType: "mobile" },
      scopes: ["session:read"],
    });

    const close = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });
    expect(server.revokeAccessSession(session!.id)).toBe(true);
    await expect(close).resolves.toMatchObject({
      code: 1008,
      reason: "Remote access session revoked",
    });
    expect(server.listAccessSessions()).toEqual([]);
    expect(server.revokeAccessSession(session!.id)).toBe(false);
  });

  it("starts remote threads durably before notifying the renderer", async () => {
    const project = createTestProject();
    const mcpSnapshot: ReturnType<
      NonNullable<RemoteAccessServerOptions["resolveMcpLaunchSnapshot"]>
    > = {
      mcpServers: [
        {
          id: "workspace-memory",
          name: "workspace-memory",
          description: "",
          enabled: true,
          timeoutMs: 30_000,
          transport: { type: "stdio", command: "memory-server", args: [], env: {} },
        },
      ],
      disabledBuiltInMcpServerIds: ["browser"],
    };
    vi.mocked(dbGetProjects).mockReturnValue([project]);
    const db = mockThreadDb();
    const dispatched: unknown[] = [];
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => ({ threadId: "thread-remote" }) as never,
    );
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
      resolveMcpLaunchSnapshot: () => mcpSnapshot,
      dispatchThreadCommand: (command) => {
        dispatched.push(command);
        return true;
      },
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read", "session:operate"]);

    const response = await fetch(new URL("/api/threads/thread-remote/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "start",
        projectId: "project-1",
        agentKind: "codex",
        config: { model: "gpt-5" },
        prompt: "",
        presentationMode: "terminal",
      }),
    });

    expect(response.status).toBe(200);
    expect(db.threads()).toHaveLength(1);
    expect(db.threads()[0]).toMatchObject({
      id: "thread-remote",
      projectId: "project-1",
      title: "New thread",
      status: "launching",
      presentationMode: "terminal",
    });
    expect(callSupervisor).toHaveBeenCalledWith(
      "startThread",
      expect.objectContaining({
        threadId: "thread-remote",
        projectLocation: project.location,
        agentKind: "codex",
        config: { model: "gpt-5" },
        prompt: "",
        initialSize: { cols: 120, rows: 30 },
        presentationMode: "terminal",
        ...mcpSnapshot,
      }),
    );
    expect(dispatched).toEqual([
      expect.objectContaining({
        kind: "start",
        threadId: "thread-remote",
        projectId: "project-1",
        launchRuntime: false,
      }),
    ]);
  });

  it("only restarts existing remote threads through the legacy start endpoint", async () => {
    mockThreadDb([createTestThread()]);
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => ({ threadId: "thread-1" }) as never,
    );
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:operate"]);
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const payload = {
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "codex",
      config: { model: "gpt-5" },
      prompt: "",
      initialSize: { cols: 120, rows: 30 },
      presentationMode: "terminal",
    };

    const missingThreadResponse = await fetch(new URL("/api/threads/start", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    expect(missingThreadResponse.status).toBe(400);
    await expect(missingThreadResponse.json()).resolves.toMatchObject({
      error: { code: "thread_id_required" },
    });

    const unknownThreadResponse = await fetch(new URL("/api/threads/start", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, threadId: "missing-thread" }),
    });
    expect(unknownThreadResponse.status).toBe(404);
    await expect(unknownThreadResponse.json()).resolves.toMatchObject({
      error: { code: "thread_not_found" },
    });

    const response = await fetch(new URL("/api/threads/start", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...payload,
        threadId: "thread-1",
        mcpServers: [
          {
            id: "client-injected",
            name: "client-injected",
            transport: { type: "stdio", command: "untrusted-command" },
          },
        ],
        disabledBuiltInMcpServerIds: ["chrome"],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ threadId: "thread-1" });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(callSupervisor).toHaveBeenCalledWith("startThread", {
      ...payload,
      disabledBuiltInMcpServerIds: [],
      disabledBuiltInMcpTools: {},
      mcpServers: [],
      threadId: "thread-1",
    });
  });

  it("persists simple thread commands and mirrors them to the renderer", async () => {
    const db = mockThreadDb([createTestThread()]);
    const dispatched: unknown[] = [];
    let rendererAvailable = true;
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => undefined as never,
    );
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
      dispatchThreadCommand: (command) => {
        if (!rendererAvailable) return false;
        dispatched.push(command);
        return true;
      },
    });
    servers.push(server);
    const info = await server.start();

    const token = await issueAccessToken(info, ["session:read", "session:operate"]);
    const ticket = await issueWebSocketTicket(info, token);
    const wsUrl = new URL("/ws", info.wsBaseUrl);
    wsUrl.searchParams.set("ticket", ticket);
    const ws = new WebSocket(wsUrl);
    const readWs = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await expect(readWs()).resolves.toMatchObject({ type: "ready" });

    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };

    const renameResponse = await fetch(new URL("/api/threads/thread-1/command", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "rename", title: "New title" }),
    });
    expect(renameResponse.status).toBe(200);
    expect(dispatched).toEqual([{ kind: "rename", threadId: "thread-1", title: "New title" }]);
    expect(db.threads()[0]?.title).toBe("New title");
    await expect(readWs()).resolves.toMatchObject({
      type: "event",
      event: { type: "remote-threads-changed", threadIds: ["thread-1"] },
    });

    const doneResponse = await fetch(new URL("/api/threads/thread-1/command", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "set-done", done: true }),
    });
    expect(doneResponse.status).toBe(200);
    expect(dispatched[1]).toEqual({ kind: "set-done", threadId: "thread-1", done: true });
    expect(db.threads()[0]).toMatchObject({ done: true, starred: false });
    expect(callSupervisor).toHaveBeenCalledWith("closeThread", { threadId: "thread-1" });
    await expect(readWs()).resolves.toMatchObject({
      type: "event",
      event: { type: "remote-threads-changed", threadIds: ["thread-1"] },
    });

    rendererAvailable = false;
    const archiveResponse = await fetch(
      new URL("/api/threads/thread-1/command", info.httpBaseUrl),
      { method: "POST", headers, body: JSON.stringify({ kind: "archive" }) },
    );
    expect(archiveResponse.status).toBe(200);
    expect(db.threads()[0]?.archived).toBe(true);
    await expect(readWs()).resolves.toMatchObject({
      type: "event",
      event: { type: "remote-threads-changed", threadIds: ["thread-1"] },
    });

    rendererAvailable = true;

    const deleteWorktreeResponse = await fetch(
      new URL("/api/threads/thread-1/command", info.httpBaseUrl),
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind: "delete-worktree-group",
          projectId: "project-1",
          worktreePath: "/repo/wt",
          threadIds: ["thread-1", "thread-2"],
        }),
      },
    );
    expect(deleteWorktreeResponse.status).toBe(200);
    expect(dispatched[2]).toEqual({
      kind: "delete-worktree-group",
      threadId: "thread-1",
      projectId: "project-1",
      worktreePath: "/repo/wt",
      threadIds: ["thread-1", "thread-2"],
    });

    rendererAvailable = false;
    const unavailableResponse = await fetch(
      new URL("/api/threads/thread-1/command", info.httpBaseUrl),
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind: "delete-worktree-group",
          projectId: "project-1",
          worktreePath: "/repo/wt",
          threadIds: ["thread-1"],
        }),
      },
    );
    expect(unavailableResponse.status).toBe(503);
    await expect(unavailableResponse.json()).resolves.toMatchObject({
      error: { code: "desktop_unavailable" },
    });
    ws.close();
  });

  it("forwards thread close through the session route and keeps terminal close as an alias", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => undefined as never,
    );
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();

    async function pair(scopes: readonly string[]): Promise<string> {
      const pairing = new URL(server.issuePairingUrl());
      const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
      const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantType: "pairing-token", credential, scopes }),
      });
      expect(response.status).toBe(200);
      const token = (await response.json()) as { accessToken: string };
      return token.accessToken;
    }

    const sessionToken = await pair(["session:read", "session:operate"]);
    const closeResponse = await fetch(new URL("/api/threads/thread-1/close", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(closeResponse.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith("closeThread", { threadId: "thread-1" });

    const readOnlyToken = await pair(["session:read"]);
    const forbiddenResponse = await fetch(
      new URL("/api/threads/thread-2/close", info.httpBaseUrl),
      {
        method: "POST",
        headers: { authorization: `Bearer ${readOnlyToken}` },
      },
    );
    expect(forbiddenResponse.status).toBe(403);
    expect(callSupervisor).not.toHaveBeenCalledWith("closeThread", { threadId: "thread-2" });

    const terminalToken = await pair(["terminal:operate"]);
    const terminalCloseResponse = await fetch(
      new URL("/api/threads/shell%3Aone/terminal/close", info.httpBaseUrl),
      {
        method: "POST",
        headers: { authorization: `Bearer ${terminalToken}` },
      },
    );
    expect(terminalCloseResponse.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith("closeThread", { threadId: "shell:one" });
  });

  it("applies project commands only for projects:manage tokens and broadcasts changes", async () => {
    let projects: Project[] = [];
    vi.mocked(dbGetProjects).mockImplementation(() => projects);
    vi.mocked(dbUpsertProject).mockImplementation((project) => {
      const parsed = project as Project;
      projects = [parsed, ...projects.filter((entry) => entry.id !== parsed.id)];
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    async function pair(scopes: readonly string[]): Promise<string> {
      const pairing = new URL(server.issuePairingUrl());
      const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
      const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantType: "pairing-token", credential, scopes }),
      });
      expect(response.status).toBe(200);
      const token = (await response.json()) as { accessToken: string };
      return token.accessToken;
    }

    const readOnlyToken = await pair(["session:read"]);
    const forbiddenResponse = await fetch(new URL("/api/projects/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${readOnlyToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "add-existing", path: "/repo/new-app" }),
    });
    expect(forbiddenResponse.status).toBe(403);
    expect(dbUpsertProject).not.toHaveBeenCalled();

    const manageToken = await pair(["session:read", "projects:manage"]);
    const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${manageToken}` },
    });
    expect(ticketResponse.status).toBe(200);
    const ticket = (await ticketResponse.json()) as { ticket: string };
    const wsUrl = new URL("/ws", info.wsBaseUrl);
    wsUrl.searchParams.set("ticket", ticket.ticket);
    const ws = new WebSocket(wsUrl);
    const read = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    expect(await read()).toMatchObject({ type: "ready" });

    const commandResponse = await fetch(new URL("/api/projects/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${manageToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "add-existing", path: "/repo/new-app" }),
    });
    expect(commandResponse.status).toBe(200);
    // The server derives the location kind from the host platform.
    const locationKind = process.platform === "win32" ? "windows" : "posix";
    await expect(commandResponse.json()).resolves.toMatchObject({
      project: {
        name: "new-app",
        location: { kind: locationKind, path: "/repo/new-app" },
      },
      projects: [
        {
          name: "new-app",
          location: { kind: locationKind, path: "/repo/new-app" },
        },
      ],
    });
    expect(dbUpsertProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: "new-app" }),
      expect.any(Number),
    );
    expect(await read()).toMatchObject({
      type: "event",
      event: {
        type: "remote-projects-changed",
        projects: [
          {
            name: "new-app",
            location: { kind: locationKind, path: "/repo/new-app" },
          },
        ],
      },
    });
    ws.close();
  });

  it("serves browser state/commands and streams mirror status to watchers", async () => {
    const navigated: unknown[] = [];
    const moved: unknown[] = [];
    const fakeManager = {
      snapshot: () => ({
        tabs: [
          {
            tabId: "tab-1",
            url: "https://example.com",
            title: "Example",
            loading: false,
            canGoBack: false,
            canGoForward: true,
            devToolsOpen: false,
          },
        ],
        activeTabId: "tab-1",
      }),
      addEventListener: () => () => {},
      // No attached webview in this harness, so the mirror reports
      // unavailable instead of streaming frames.
      getActiveTab: () => null,
      revealPanel: () => {},
      navigate: (tabId: string, url: string) => {
        navigated.push({ tabId, url });
        return Promise.resolve();
      },
      moveTab: (tabId: string, targetTabId: string, position: "before" | "after") => {
        moved.push({ tabId, targetTabId, position });
      },
    } as unknown as BrowserPanelManager;

    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      browser: new RemoteBrowserGateway(() => fakeManager),
    });
    servers.push(server);
    const info = await server.start();

    const pairing = new URL(info.pairingUrl);
    const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        scopes: ["session:read", "session:operate"],
        client: { label: "Test mobile", deviceType: "mobile" },
      }),
    });
    const token = (await tokenResponse.json()) as { accessToken: string };
    const headers = {
      authorization: `Bearer ${token.accessToken}`,
      "content-type": "application/json",
    };

    const stateResponse = await fetch(new URL("/api/browser/state", info.httpBaseUrl), {
      headers,
    });
    expect(stateResponse.status).toBe(200);
    // devToolsOpen is desktop-only and must not leak into the remote shape.
    await expect(stateResponse.json()).resolves.toEqual({
      state: {
        tabs: [
          {
            tabId: "tab-1",
            url: "https://example.com",
            title: "Example",
            loading: false,
            canGoBack: false,
            canGoForward: true,
          },
        ],
        activeTabId: "tab-1",
      },
    });

    const commandResponse = await fetch(new URL("/api/browser/command", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "navigate", tabId: "tab-1", url: "https://example.org" }),
    });
    expect(commandResponse.status).toBe(200);
    expect(navigated).toEqual([{ tabId: "tab-1", url: "https://example.org" }]);

    const moveResponse = await fetch(new URL("/api/browser/command", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: "move-tab",
        tabId: "tab-1",
        targetTabId: "tab-2",
        position: "after",
      }),
    });
    expect(moveResponse.status).toBe(200);
    expect(moved).toEqual([{ tabId: "tab-1", targetTabId: "tab-2", position: "after" }]);

    const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
      method: "POST",
      headers,
    });
    const ticket = (await ticketResponse.json()) as { ticket: string };
    const wsUrl = new URL("/ws", info.wsBaseUrl);
    wsUrl.searchParams.set("ticket", ticket.ticket);
    const ws = new WebSocket(wsUrl);
    const read = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    expect(await read()).toMatchObject({ type: "ready" });

    ws.send(JSON.stringify({ type: "browser-watch" }));
    expect(await read()).toMatchObject({
      type: "browser-state",
      state: { activeTabId: "tab-1" },
    });
    expect(await read()).toMatchObject({
      type: "browser-mirror-status",
      status: { status: "unavailable" },
    });
    ws.close();
  });

  it("serves port discovery/forwarding via the injected gateway, scope-gated", async () => {
    // A real loopback TCP echo server stands in for a "dev server" the phone
    // wants to reach through the forward.
    const echo = createNetServer((socket) => socket.pipe(socket));
    await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", resolve));
    const targetPort = (echo.address() as AddressInfo).port;

    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      portForward: new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] }),
    });
    servers.push(server);
    const info = await server.start();

    const forwardToken = await issueAccessToken(info, ["ports:forward"]);
    // The startup pairing credential is one-time-use; mint a fresh one for
    // the second (scope-limited) token exchange.
    const readOnlyCredential = new URLSearchParams(
      new URL(server.issuePairingUrl()).hash.slice(1),
    ).get("token");
    const readOnlyTokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: readOnlyCredential,
        scopes: ["session:read"],
      }),
    });
    const readOnlyToken = ((await readOnlyTokenResponse.json()) as { accessToken: string })
      .accessToken;

    // Missing the ports:forward scope is rejected.
    const forbidden = await fetch(new URL("/api/ports", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    expect(forbidden.status).toBe(403);

    const headers = {
      authorization: `Bearer ${forwardToken}`,
      "content-type": "application/json",
    };

    const emptyState = await fetch(new URL("/api/ports", info.httpBaseUrl), { headers });
    expect(emptyState.status).toBe(200);
    await expect(emptyState.json()).resolves.toEqual({ detected: [], forwards: [] });

    const forwardResponse = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ targetPort }),
    });
    expect(forwardResponse.status).toBe(200);
    const forwardResult = (await forwardResponse.json()) as {
      forward: { id: string; targetPort: number; listenPort: number };
    };
    expect(forwardResult.forward.targetPort).toBe(targetPort);

    // Idempotent: forwarding the same target port again returns the same forward.
    const secondForwardResponse = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ targetPort }),
    });
    await expect(secondForwardResponse.json()).resolves.toEqual(forwardResult);

    // Bytes actually round-trip through the forward to the echo server.
    const client = connect(forwardResult.forward.listenPort, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", reject);
    });
    const echoed = await new Promise<string>((resolve) => {
      client.once("data", (data) => resolve(data.toString("utf8")));
      client.write("ping");
    });
    expect(echoed).toBe("ping");
    client.end();

    const stateWithForward = await fetch(new URL("/api/ports", info.httpBaseUrl), { headers });
    await expect(stateWithForward.json()).resolves.toMatchObject({
      forwards: [{ id: forwardResult.forward.id, targetPort }],
    });

    const unforwardResponse = await fetch(new URL("/api/ports/unforward", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ id: forwardResult.forward.id }),
    });
    expect(unforwardResponse.status).toBe(200);
    await expect(unforwardResponse.json()).resolves.toEqual({ ok: true });

    const stateAfterUnforward = await fetch(new URL("/api/ports", info.httpBaseUrl), { headers });
    await expect(stateAfterUnforward.json()).resolves.toMatchObject({ forwards: [] });

    await new Promise<void>((resolve) => echo.close(() => resolve()));
  });

  it("returns ports_unavailable when no port-forward gateway is injected", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["ports:forward"]);

    const response = await fetch(new URL("/api/ports", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ports_unavailable" },
    });
  });

  it("proxies HTTP requests to a forwarded dev server through an authenticated enter-token/cookie session", async () => {
    const upstream = await startUpstreamHttpServer();
    const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
    const portProxy = new PortProxy({ gateway });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      portForward: gateway,
      portProxy,
    });
    servers.push(server);
    const info = await server.start();

    const token = await issueAccessToken(info, ["ports:forward"]);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const forwardResponse = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ targetPort: upstream.port }),
    });
    const forwardResult = (await forwardResponse.json()) as {
      forward: { id: string };
      enterPath: string;
    };
    expect(forwardResult.enterPath).toMatch(
      new RegExp(`^/forward/${forwardResult.forward.id}/enter\\?fwt=.+`),
    );

    // `POST /api/ports/enter` mints a fresh token for an already-open forward
    // (what the mobile app calls right before opening the tab).
    const enterMintResponse = await fetch(new URL("/api/ports/enter", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ id: forwardResult.forward.id }),
    });
    expect(enterMintResponse.status).toBe(200);
    const enterMintResult = (await enterMintResponse.json()) as { enterPath: string };
    expect(enterMintResult.enterPath).not.toBe(forwardResult.enterPath);

    const enterResponse = await rawGet(new URL(enterMintResult.enterPath, info.httpBaseUrl));
    expect(enterResponse.status).toBe(302);
    expect(enterResponse.headers.location).toBe("/");
    const setCookie = enterResponse.headers["set-cookie"]?.[0];
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("Secure");
    expect(setCookie).not.toContain("Domain=");
    const cookieHeader = `lc_forward=${extractForwardCookieValue(setCookie!)}`;

    const rootResponse = await fetch(new URL("/", info.httpBaseUrl), {
      headers: { cookie: cookieHeader },
    });
    expect(rootResponse.status).toBe(200);
    await expect(rootResponse.json()).resolves.toEqual({
      url: "/",
      host: `localhost:${upstream.port}`,
    });

    // Absolute nested path + query string proxy verbatim, and the upstream
    // sees the rewritten Host (not the remote-access server's own host:port).
    const nestedResponse = await fetch(new URL("/some/nested/path?q=1", info.httpBaseUrl), {
      headers: { cookie: cookieHeader },
    });
    expect(nestedResponse.status).toBe(200);
    await expect(nestedResponse.json()).resolves.toEqual({
      url: "/some/nested/path?q=1",
      host: `localhost:${upstream.port}`,
    });

    await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
  });

  // Reproduces the real-world defect this pair of IPv6 tests guards against:
  // `vite --port …` (and other tools that bind the bare hostname `localhost`)
  // can end up bound to `::1` only on some systems, so the HTTP reverse proxy
  // must fall back from 127.0.0.1 to ::1, not just the raw TCP forward.
  it.skipIf(!ipv6Supported)(
    "proxies HTTP requests to an IPv6-only forwarded dev server through an authenticated enter-token/cookie session",
    async () => {
      const upstream = await startUpstreamHttpServer("::1");
      const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
      const portProxy = new PortProxy({ gateway });
      const server = new RemoteAccessServer({
        appVersion: "1.0.0",
        identity: { desktopId: "desktop-test", label: "Test Desktop" },
        host: "127.0.0.1",
        port: 0,
        callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
        portForward: gateway,
        portProxy,
      });
      servers.push(server);
      const info = await server.start();

      const token = await issueAccessToken(info, ["ports:forward"]);
      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

      const forwardResponse = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({ targetPort: upstream.port }),
      });
      const forwardResult = (await forwardResponse.json()) as {
        forward: { id: string };
        enterPath: string;
      };

      const enterResponse = await rawGet(new URL(forwardResult.enterPath, info.httpBaseUrl));
      expect(enterResponse.status).toBe(302);
      const setCookie = enterResponse.headers["set-cookie"]?.[0];
      expect(setCookie).toBeTruthy();
      const cookieHeader = `lc_forward=${extractForwardCookieValue(setCookie!)}`;

      const rootResponse = await fetch(new URL("/", info.httpBaseUrl), {
        headers: { cookie: cookieHeader },
      });
      expect(rootResponse.status).toBe(200);
      await expect(rootResponse.json()).resolves.toEqual({
        url: "/",
        host: `localhost:${upstream.port}`,
      });

      await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
    },
  );

  it("lets an active forward session win over the bundled mobile PWA for /assets/*, and leaves the no-session PWA/404 fallback unchanged", async () => {
    const upstream = await startUpstreamHttpServer();
    const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
    const portProxy = new PortProxy({ gateway });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      portForward: gateway,
      portProxy,
    });
    servers.push(server);
    const info = await server.start();

    const token = await issueAccessToken(info, ["ports:forward"]);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const forwardResponse = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ targetPort: upstream.port }),
    });
    const forwardResult = (await forwardResponse.json()) as { enterPath: string };
    const enterResponse = await rawGet(new URL(forwardResult.enterPath, info.httpBaseUrl));
    const cookieHeader = `lc_forward=${extractForwardCookieValue(enterResponse.headers["set-cookie"]![0]!)}`;

    // With a valid forward session cookie, `/assets/app.js` reaches the
    // forwarded dev server: the upstream stand-in echoes the request
    // url/host as distinctive JSON, which is nothing the bundled PWA would
    // ever serve at that path.
    const assetWithSession = await fetch(new URL("/assets/app.js", info.httpBaseUrl), {
      headers: { cookie: cookieHeader },
    });
    expect(assetWithSession.status).toBe(200);
    await expect(assetWithSession.json()).resolves.toEqual({
      url: "/assets/app.js",
      host: `localhost:${upstream.port}`,
    });

    // Without a session cookie, `/assets/*` keeps falling through to the
    // bundled-PWA lookup — which 404s here since there is no built renderer
    // dist in this test environment — exactly as before this feature existed.
    const assetWithoutSession = await fetch(new URL("/assets/app.js", info.httpBaseUrl));
    expect(assetWithoutSession.status).toBe(404);

    await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
  });

  it("rejects an invalid or expired forward enter token with a plain error page and no cookie", async () => {
    const upstream = await startUpstreamHttpServer();
    const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
    const portProxy = new PortProxy({ gateway, enterTokenTtlMs: 0 });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      portForward: gateway,
      portProxy,
    });
    servers.push(server);
    const info = await server.start();

    // An outright bogus token/forward id.
    const invalidResponse = await fetch(
      new URL("/forward/nonexistent-id/enter?fwt=bogus", info.httpBaseUrl),
    );
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.headers.getSetCookie()).toEqual([]);
    await expect(invalidResponse.text()).resolves.toContain("<html");

    // A real token configured to expire immediately.
    const token = await issueAccessToken(info, ["ports:forward"]);
    const forwardResponse = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ targetPort: upstream.port }),
    });
    const forwardResult = (await forwardResponse.json()) as { enterPath: string };
    const expiredResponse = await fetch(new URL(forwardResult.enterPath, info.httpBaseUrl));
    expect(expiredResponse.status).toBe(400);
    expect(expiredResponse.headers.getSetCookie()).toEqual([]);

    await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
  });

  it("invalidates a forward's cookie sessions as soon as the forward is stopped", async () => {
    const upstream = await startUpstreamHttpServer();
    const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
    const portProxy = new PortProxy({ gateway });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      portForward: gateway,
      portProxy,
    });
    servers.push(server);
    const info = await server.start();

    const token = await issueAccessToken(info, ["ports:forward"]);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const forwardResponse = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ targetPort: upstream.port }),
    });
    const forwardResult = (await forwardResponse.json()) as {
      forward: { id: string };
      enterPath: string;
    };
    const enterResponse = await rawGet(new URL(forwardResult.enterPath, info.httpBaseUrl));
    const cookieHeader = `lc_forward=${extractForwardCookieValue(enterResponse.headers["set-cookie"]![0]!)}`;

    const beforeStop = await fetch(new URL("/", info.httpBaseUrl), {
      headers: { cookie: cookieHeader },
    });
    expect(beforeStop.status).toBe(200);

    const unforwardResponse = await fetch(new URL("/api/ports/unforward", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ id: forwardResult.forward.id }),
    });
    expect(unforwardResponse.status).toBe(200);

    const afterStop = await fetch(new URL("/", info.httpBaseUrl), {
      headers: { cookie: cookieHeader },
    });
    expect(afterStop.status).toBe(404);

    await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
  });

  it("proxies WebSocket upgrades (e.g. Vite/webpack HMR) to a forwarded dev server via the cookie session", async () => {
    const upstreamWss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => upstreamWss.once("listening", resolve));
    upstreamWss.on("connection", (ws) => {
      ws.on("message", (data) => ws.send(data.toString()));
    });
    const upstreamPort = (upstreamWss.address() as AddressInfo).port;

    const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
    const portProxy = new PortProxy({ gateway });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      portForward: gateway,
      portProxy,
    });
    servers.push(server);
    const info = await server.start();

    const token = await issueAccessToken(info, ["ports:forward"]);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const forwardResponse = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ targetPort: upstreamPort }),
    });
    const forwardResult = (await forwardResponse.json()) as { enterPath: string };
    const enterResponse = await rawGet(new URL(forwardResult.enterPath, info.httpBaseUrl));
    const cookieValue = extractForwardCookieValue(enterResponse.headers["set-cookie"]![0]!);

    const wsUrl = new URL("/anything", info.httpBaseUrl);
    wsUrl.protocol = "ws:";
    const client = new WebSocket(wsUrl, { headers: { cookie: `lc_forward=${cookieValue}` } });
    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });
    const echoed = await new Promise<string>((resolve, reject) => {
      client.once("message", (data) => resolve(data.toString()));
      client.once("error", reject);
      client.send("ping-through-the-proxy");
    });
    expect(echoed).toBe("ping-through-the-proxy");
    client.close();

    await new Promise<void>((resolve) => upstreamWss.close(() => resolve()));
  });

  it("does not proxy reserved app routes even with a valid forward session cookie", async () => {
    const upstream = await startUpstreamHttpServer();
    const gateway = new RemotePortForwardGateway({ bindHost: "127.0.0.1", candidatePorts: [] });
    const portProxy = new PortProxy({ gateway });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      portForward: gateway,
      portProxy,
    });
    servers.push(server);
    const info = await server.start();

    const token = await issueAccessToken(info, ["ports:forward"]);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const forwardResponse = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ targetPort: upstream.port }),
    });
    const forwardResult = (await forwardResponse.json()) as { enterPath: string };
    const enterResponse = await rawGet(new URL(forwardResult.enterPath, info.httpBaseUrl));
    const cookieHeader = `lc_forward=${extractForwardCookieValue(enterResponse.headers["set-cookie"]![0]!)}`;

    // `/api/snapshot` is a reserved app route: a forward session cookie alone
    // must not satisfy it — it still requires its own bearer token.
    const snapshotResponse = await fetch(new URL("/api/snapshot", info.httpBaseUrl), {
      headers: { cookie: cookieHeader },
    });
    expect(snapshotResponse.status).toBe(401);

    await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
  });

  it("404s the proxy fallthrough path when there is no forward session cookie", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    const response = await fetch(new URL("/some/random/path", info.httpBaseUrl));
    expect(response.status).toBe(404);
  });

  it("serves and updates remote-editable settings", async () => {
    let stored: RemoteSettings = pickRemoteSettings(defaultSharedSettings);
    const update = vi.fn<(patch: Partial<RemoteSettings>) => RemoteSettings>((patch) => {
      stored = { ...stored, ...patch };
      return stored;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      settings: { read: () => stored, update },
    });
    servers.push(server);
    const info = await server.start();

    const pairing = new URL(info.pairingUrl);
    const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential }),
    });
    const token = (await tokenResponse.json()) as { accessToken: string };
    const auth = { authorization: `Bearer ${token.accessToken}` };

    const getResponse = await fetch(new URL("/api/settings", info.httpBaseUrl), {
      headers: auth,
    });
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      settings: { titleGenProvider: defaultSharedSettings.titleGenProvider },
    });

    const postResponse = await fetch(new URL("/api/settings", info.httpBaseUrl), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        titleGenProvider: "claude",
        titleGenModel: "claude-haiku-4-5-20251001",
        // Unknown keys are stripped by the schema, not persisted.
        providerConfigs: { evil: true },
      }),
    });
    expect(postResponse.status).toBe(200);
    await expect(postResponse.json()).resolves.toMatchObject({
      settings: { titleGenProvider: "claude", titleGenModel: "claude-haiku-4-5-20251001" },
    });
    expect(update).toHaveBeenCalledWith({
      titleGenProvider: "claude",
      titleGenModel: "claude-haiku-4-5-20251001",
    });
    expect(stored.titleGenProvider).toBe("claude");
  });

  it("lists and modifies device schedules with read and operate scopes", async () => {
    let stored: ScheduledTask[] = [];
    const input: ScheduledTaskInput = {
      name: "Daily brief",
      prompt: "Summarize my priorities.",
      agentKind: "claude:home",
      config: { model: "claude-fable-5", effort: "high" },
      recurrence: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" },
      enabled: true,
    };
    const create = vi.fn<(task: ScheduledTaskInput) => ScheduledTask>((task) => {
      const created: ScheduledTask = {
        id: "d2ac39e9-14ac-4776-9279-37a1e455a5db",
        ...task,
        nextRunAt: "2026-07-13T15:00:00.000Z",
        lastRunAt: null,
        lastCompletedAt: null,
        lastStatus: "never",
        lastResult: null,
        lastError: null,
        createdAt: "2026-07-10T12:00:00.000Z",
        updatedAt: "2026-07-10T12:00:00.000Z",
      };
      stored = [created];
      return created;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      schedules: {
        list: () => stored,
        create,
        update: (id, task) => {
          const next = { ...stored[0]!, ...task, id };
          stored = [next];
          return next;
        },
        delete: (id) => {
          stored = stored.filter((task) => task.id !== id);
        },
        runNow: (id) => {
          const next = { ...stored[0]!, id, lastStatus: "running" as const };
          stored = [next];
          return next;
        },
      },
    });
    servers.push(server);
    const info = await server.start();

    const readToken = await issueAccessToken(info, ["session:read"]);
    const readHeaders = { authorization: `Bearer ${readToken}` };
    const emptyResponse = await fetch(new URL("/api/schedules", info.httpBaseUrl), {
      headers: readHeaders,
    });
    expect(emptyResponse.status).toBe(200);
    await expect(emptyResponse.json()).resolves.toEqual({ schedules: [] });

    const denied = await fetch(new URL("/api/schedules/command", info.httpBaseUrl), {
      method: "POST",
      headers: { ...readHeaders, "content-type": "application/json" },
      body: JSON.stringify({ kind: "create", task: input }),
    });
    expect(denied.status).toBe(403);

    const pairing = new URL(server.issuePairingUrl());
    const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        scopes: ["session:operate"],
      }),
    });
    const operateToken = ((await tokenResponse.json()) as { accessToken: string }).accessToken;
    const createResponse = await fetch(new URL("/api/schedules/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${operateToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "create", task: input }),
    });
    expect(createResponse.status).toBe(200);
    await expect(createResponse.json()).resolves.toMatchObject({
      schedule: { name: "Daily brief", agentKind: "claude:home" },
      schedules: [{ name: "Daily brief" }],
    });
    expect(create).toHaveBeenCalledWith(input);
  });

  it("serves profile devices/stats reads and the identity write, gated by scope", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    async function pair(scopes: readonly string[]): Promise<string> {
      const pairing = new URL(server.issuePairingUrl());
      const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
      const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantType: "pairing-token", credential, scopes }),
      });
      const token = (await tokenResponse.json()) as { accessToken: string };
      return token.accessToken;
    }

    const readToken = await pair(["session:read"]);
    const readHeaders = {
      authorization: `Bearer ${readToken}`,
      "content-type": "application/json",
    };

    const devicesResponse = await fetch(new URL("/api/profile/devices", info.httpBaseUrl), {
      headers: readHeaders,
    });
    expect(devicesResponse.status).toBe(200);
    const devices = (await devicesResponse.json()) as {
      devices: Array<{ id: string; isCurrent?: boolean }>;
      currentDeviceId: string;
    };
    expect(devices.currentDeviceId).toBeTruthy();
    expect(devices.devices.some((d) => d.id === devices.currentDeviceId)).toBe(true);

    const coreStatsResponse = await fetch(new URL("/api/profile/core-stats", info.httpBaseUrl), {
      method: "POST",
      headers: readHeaders,
      body: JSON.stringify({ utcOffsetMinutes: 0 }),
    });
    expect(coreStatsResponse.status).toBe(200);
    await expect(coreStatsResponse.json()).resolves.toMatchObject({
      scope: "device",
      identity: { plan: "Local" },
    });

    const tokenStatsResponse = await fetch(new URL("/api/profile/token-stats", info.httpBaseUrl), {
      method: "POST",
      headers: readHeaders,
      body: JSON.stringify({ utcOffsetMinutes: 0 }),
    });
    expect(tokenStatsResponse.status).toBe(200);
    await expect(tokenStatsResponse.json()).resolves.toMatchObject({ available: false });

    // A malformed stats request (missing the required utcOffsetMinutes) is a
    // client error, not a 500.
    const invalidStatsResponse = await fetch(new URL("/api/profile/core-stats", info.httpBaseUrl), {
      method: "POST",
      headers: readHeaders,
      body: JSON.stringify({}),
    });
    expect(invalidStatsResponse.status).toBe(400);
    await expect(invalidStatsResponse.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    });

    // Identity writes require session:operate; a read-only token is refused.
    const deniedIdentityResponse = await fetch(new URL("/api/profile/identity", info.httpBaseUrl), {
      method: "POST",
      headers: readHeaders,
      body: JSON.stringify({ name: "Ada", handle: "ada", avatarColor: "oklch(0.6 0.1 200)" }),
    });
    expect(deniedIdentityResponse.status).toBe(403);
    await expect(deniedIdentityResponse.json()).resolves.toMatchObject({
      error: { code: "missing_scope" },
    });

    const operateToken = await pair(["session:read", "session:operate"]);
    const operateHeaders = {
      authorization: `Bearer ${operateToken}`,
      "content-type": "application/json",
    };
    const identityResponse = await fetch(new URL("/api/profile/identity", info.httpBaseUrl), {
      method: "POST",
      headers: operateHeaders,
      body: JSON.stringify({
        name: "Ada Lovelace",
        handle: "@Ada!",
        avatarColor: "oklch(0.6 0.1 200)",
      }),
    });
    expect(identityResponse.status).toBe(200);
    await expect(identityResponse.json()).resolves.toMatchObject({
      identity: { name: "Ada Lovelace", handle: "ada" },
    });

    // The write persisted: a fresh core-stats read echoes the updated identity.
    const afterWriteResponse = await fetch(new URL("/api/profile/core-stats", info.httpBaseUrl), {
      method: "POST",
      headers: readHeaders,
      body: JSON.stringify({ utcOffsetMinutes: 0 }),
    });
    await expect(afterWriteResponse.json()).resolves.toMatchObject({
      identity: { name: "Ada Lovelace", handle: "ada" },
    });
  });

  it("forwards allowlisted git calls and enforces scope + allowlist", async () => {
    const calls: Array<{ name: string; payload: unknown }> = [];
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async (name, payload) => {
        calls.push({ name, payload });
        return { ok: name } as never;
      },
    );
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    const info = await server.start();

    async function pair(scopes: readonly string[]): Promise<string> {
      // Pairing credentials are single-use, so mint a fresh one per pairing.
      const pairing = new URL(server.issuePairingUrl());
      const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
      const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantType: "pairing-token", credential, scopes }),
      });
      const token = (await response.json()) as { accessToken: string };
      return token.accessToken;
    }

    const fullToken = await pair(["session:read", "session:operate"]);
    const fullHeaders = {
      authorization: `Bearer ${fullToken}`,
      "content-type": "application/json",
    };
    const projectLocation = { kind: "posix", path: "/tmp/repo" };

    // A read procedure forwards to the supervisor with the validated payload.
    const statusResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: fullHeaders,
      body: JSON.stringify({ procedure: "getGitStatus", payload: { projectLocation } }),
    });
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({ result: { ok: "getGitStatus" } });
    expect(calls).toContainEqual({ name: "getGitStatus", payload: { projectLocation } });

    const checkpointCalls = [
      {
        procedure: "rollbackThreadConversation",
        payload: { threadId: "thread-1", numTurns: 1 },
      },
      {
        procedure: "listFileCheckpoints",
        payload: { threadId: "thread-1", projectLocation },
      },
      {
        procedure: "restoreFileCheckpoint",
        payload: { threadId: "thread-1", checkpointItemId: "user-2", projectLocation },
      },
    ] as const;
    for (const call of checkpointCalls) {
      const response = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
        method: "POST",
        headers: fullHeaders,
        body: JSON.stringify(call),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        result: { ok: call.procedure },
      });
      expect(calls).toContainEqual({ name: call.procedure, payload: call.payload });
    }

    const pushPayload = {
      projectLocation,
      remote: "origin",
      branch: "feature/mobile",
      setUpstream: true,
    };
    const pushResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: fullHeaders,
      body: JSON.stringify({ procedure: "gitPush", payload: pushPayload }),
    });
    expect(pushResponse.status).toBe(200);
    await expect(pushResponse.json()).resolves.toEqual({ result: { ok: "gitPush" } });
    expect(calls).toContainEqual({ name: "gitPush", payload: pushPayload });

    // Payload/schema errors are client errors, not hidden as 500s.
    const invalidPayloadResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: fullHeaders,
      body: JSON.stringify({ procedure: "getGitStatus", payload: {} }),
    });
    expect(invalidPayloadResponse.status).toBe(400);
    await expect(invalidPayloadResponse.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    });

    // A non-allowlisted supervisor procedure is rejected before it can run.
    const blockedResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: fullHeaders,
      body: JSON.stringify({ procedure: "startThread", payload: {} }),
    });
    expect(blockedResponse.status).toBe(403);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      error: { code: "git_procedure_not_allowed" },
    });
    expect(calls.some((c) => c.name === "startThread")).toBe(false);

    // A mutation requires session:operate; a read-only token is refused.
    const readToken = await pair(["session:read"]);
    const stageResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${readToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        procedure: "gitStage",
        payload: { projectLocation, filePath: "a.ts" },
      }),
    });
    expect(stageResponse.status).toBe(403);
    await expect(stageResponse.json()).resolves.toMatchObject({ error: { code: "missing_scope" } });
    expect(calls.some((c) => c.name === "gitStage")).toBe(false);

    const pushWithoutOperateResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${readToken}`, "content-type": "application/json" },
      body: JSON.stringify({ procedure: "gitPush", payload: pushPayload }),
    });
    expect(pushWithoutOperateResponse.status).toBe(403);
    await expect(pushWithoutOperateResponse.json()).resolves.toMatchObject({
      error: { code: "missing_scope" },
    });
    expect(calls.filter((c) => c.name === "gitPush")).toHaveLength(1);
  });

  it("rejects settings endpoints when no gateway is configured", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    const pairing = new URL(info.pairingUrl);
    const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential }),
    });
    const token = (await tokenResponse.json()) as { accessToken: string };

    const response = await fetch(new URL("/api/settings", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "settings_unavailable" },
    });
  });

  it("rejects browser endpoints when no gateway is configured", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    const pairing = new URL(info.pairingUrl);
    const credential = new URLSearchParams(pairing.hash.slice(1)).get("token");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential }),
    });
    const token = (await tokenResponse.json()) as { accessToken: string };

    const stateResponse = await fetch(new URL("/api/browser/state", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    expect(stateResponse.status).toBe(503);
    await expect(stateResponse.json()).resolves.toMatchObject({
      error: { code: "browser_unavailable" },
    });
  });

  it("registers and unregisters push tokens via the injected sink", async () => {
    const pushRegistrations = {
      upsert: vi.fn<(registration: unknown) => void>(),
      remove: vi.fn<(deviceId: string) => void>(),
    };
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      pushRegistrations,
    });
    servers.push(server);
    const info = await server.start();

    // No token → 401.
    const anonResponse = await fetch(new URL("/api/push/register", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "device-abcdef", platform: "ios" }),
    });
    expect(anonResponse.status).toBe(401);
    expect(pushRegistrations.upsert).not.toHaveBeenCalled();

    // session:read only → 403 (register requires session:operate). Mint a fresh
    // pairing credential since each is single-use.
    const readPairing = new URL(server.issuePairingUrl());
    const readCredential = new URLSearchParams(readPairing.hash.slice(1)).get("token");
    const readTokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: readCredential,
        scopes: ["session:read"],
      }),
    });
    const readToken = (await readTokenResponse.json()) as { accessToken: string };
    const forbidden = await fetch(new URL("/api/push/register", info.httpBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${readToken.accessToken}`,
      },
      body: JSON.stringify({ deviceId: "device-abcdef", platform: "ios" }),
    });
    expect(forbidden.status).toBe(403);
    expect(pushRegistrations.upsert).not.toHaveBeenCalled();

    // session:operate → happy path (consumes the startup pairing credential).
    const token = await issueAccessToken(info, ["session:read", "session:operate"]);
    const registration = {
      deviceId: "device-abcdef",
      platform: "ios",
      deviceToken: "dev-token",
      activityTokens: { activity1: "act-token" },
    };
    const registerResponse = await fetch(new URL("/api/push/register", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(registration),
    });
    expect(registerResponse.status).toBe(200);
    await expect(registerResponse.json()).resolves.toMatchObject({ ok: true });
    expect(pushRegistrations.upsert).toHaveBeenCalledWith(registration);

    const unregisterResponse = await fetch(new URL("/api/push/unregister", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId: "device-abcdef" }),
    });
    expect(unregisterResponse.status).toBe(200);
    expect(pushRegistrations.remove).toHaveBeenCalledWith("device-abcdef");
  });

  it("rejects push endpoints when no registration sink is configured", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read", "session:operate"]);

    const response = await fetch(new URL("/api/push/register", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId: "device-abcdef", platform: "ios" }),
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "push_unavailable" },
    });
  });
});
