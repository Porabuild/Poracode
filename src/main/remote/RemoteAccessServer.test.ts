import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  createServer as createHttpServer,
  request as httpRequestNode,
  type IncomingHttpHeaders,
  type Server as HttpServer,
} from "node:http";
import { connect, createServer as createNetServer, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Experiment,
  PrWatch,
  PrWatchInput,
  Project,
  ProjectNotes,
  ScheduledTask,
  ScheduledTaskInput,
  Thread,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { REMOTE_PROCEDURE_RESULT_FIXTURES } from "@/shared/remote/contract/goldens/procedureFixtures";
import {
  isRemoteOmittedField,
  pickRemoteSettings,
  readRemoteImageRef,
  type RemoteHostUpdateStatus,
  type RemoteSettings,
} from "@/shared/remote";
import { defaultSharedSettings } from "@/shared/settings";
import { emptyGitStateSnapshot } from "@/shared/gitState";
import type { BrowserPanelManager } from "../browser";
import {
  dbAppendThreadCompletedTurn,
  dbApplyThreadRuntimeEvents,
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbDeleteProject,
  dbDeleteThread,
  dbFailRemoteCommand,
  dbGetProject,
  dbGetProjectNotes,
  dbGetThreadCompletedTurns,
  dbGetProjects,
  dbGetThread,
  dbGetThreadContextUsage,
  dbGetLatestThreadRuntimeAnchorItemId,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeItemsPage,
  dbGetThreadRuntimeSummaries,
  dbGetThreadTerminalScrollbackRecord,
  dbGetThreads,
  dbReplaceThreadRuntimeSnapshot,
  dbSetState,
  dbSetProjectNotes,
  dbTruncateThreadRuntimeAfter,
  dbUpdateProject,
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
const tempDirs: string[] = [];

/** Creates a real temp dir for the local-image endpoint tests. */
function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-remote-image-"));
  tempDirs.push(dir);
  return dir;
}

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
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.mocked(dbAppendThreadCompletedTurn).mockReset();
  vi.mocked(dbDeleteProject).mockReset();
  vi.mocked(dbApplyThreadRuntimeEvents).mockReset();
  vi.mocked(dbClaimRemoteCommand).mockReset().mockReturnValue({ state: "claimed" });
  vi.mocked(dbCompleteRemoteCommand).mockReset();
  vi.mocked(dbFailRemoteCommand).mockReset();
  vi.mocked(dbDeleteThread).mockReset();
  vi.mocked(dbGetThreadCompletedTurns).mockReset().mockReturnValue([]);
  vi.mocked(dbGetProject).mockReset().mockReturnValue(null);
  vi.mocked(dbGetProjectNotes).mockReset().mockReturnValue(null);
  vi.mocked(dbGetProjects).mockReset().mockReturnValue([]);
  vi.mocked(dbGetThreadContextUsage).mockReset().mockReturnValue(null);
  vi.mocked(dbGetLatestThreadRuntimeAnchorItemId).mockReset().mockReturnValue(null);
  vi.mocked(dbGetThreadRuntimeItems).mockReset().mockReturnValue([]);
  vi.mocked(dbGetThreadRuntimeItemsPage)
    .mockReset()
    .mockReturnValue({ items: [], nextCursor: null });
  vi.mocked(dbGetThreadRuntimeSummaries).mockReset().mockReturnValue({});
  vi.mocked(dbGetThread).mockReset().mockReturnValue(null);
  vi.mocked(dbGetThreadTerminalScrollbackRecord).mockReset().mockReturnValue(null);
  vi.mocked(dbGetThreads).mockReset().mockReturnValue([]);
  vi.mocked(dbReplaceThreadRuntimeSnapshot).mockReset();
  vi.mocked(dbUpsertProject).mockReset();
  vi.mocked(dbUpsertThread).mockReset();
  dbSetState("poracode-experiments-v1", "");
  vi.mocked(dbSetState).mockClear();
  vi.mocked(dbSetProjectNotes).mockReset();
  vi.mocked(dbTruncateThreadRuntimeAfter).mockReset();
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

function persistTestExperiment(overrides: Partial<Experiment> = {}): Experiment {
  const experiment: Experiment = {
    id: "experiment-1",
    projectId: "project-1",
    title: "Experiment",
    prompt: "Implement the change",
    baseBranch: "main",
    baseCommit: "a".repeat(40),
    candidates: [
      {
        threadId: "thread-1",
        agentKind: "codex",
        worktreePath: "/repo/one",
        worktreeBranch: "poracode/experiment-one",
        worktreeOwnerToken: "experiment-1:thread-1",
        worktreeState: "owned",
      },
      {
        threadId: "thread-2",
        agentKind: "claude",
        worktreePath: "/repo/two",
        worktreeBranch: "poracode/experiment-two",
        worktreeOwnerToken: "experiment-1:thread-2",
        worktreeState: "owned",
      },
    ],
    status: "running",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  dbSetState(
    "poracode-experiments-v1",
    JSON.stringify({ state: { experiments: { [experiment.id]: experiment } }, version: 1 }),
  );
  return experiment;
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
  it("checks and installs a downloaded host update for manage-scoped clients", async () => {
    let updateStatus: RemoteHostUpdateStatus | null = null;
    const check = vi.fn<() => Promise<void>>(async () => {
      updateStatus = { type: "downloaded", version: "1.1.0" };
    });
    const install = vi.fn<() => void>();
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      updates: {
        currentVersion: () => "1.0.0",
        status: () => updateStatus,
        check,
        install,
      },
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read", "projects:manage"]);
    const headers = { authorization: `Bearer ${token}` };

    const checkResponse = await fetch(new URL("/api/host-update/check", info.httpBaseUrl), {
      method: "POST",
      headers,
    });
    expect(checkResponse.status).toBe(200);
    await expect(checkResponse.json()).resolves.toEqual({
      currentVersion: "1.0.0",
      status: { type: "downloaded", version: "1.1.0" },
    });
    expect(check).toHaveBeenCalledOnce();

    const installResponse = await fetch(new URL("/api/host-update/install", info.httpBaseUrl), {
      method: "POST",
      headers,
    });
    expect(installResponse.status).toBe(202);
    await new Promise((resolve) => setImmediate(resolve));
    expect(install).toHaveBeenCalledOnce();
  });

  it("retries the assigned port without falling back to a different endpoint", async () => {
    const blocker = createNetServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", resolve);
    });
    const port = (blocker.address() as AddressInfo).port;
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port,
      listenRetryAttempts: 5,
      listenRetryDelayMs: 50,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);

    setTimeout(() => blocker.close(), 75);
    const info = await server.start();

    expect(new URL(info.httpBaseUrl).port).toBe(String(port));
  });

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

  it("persists runtime event batches immediately before a settling thread-state", () => {
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
    expect(dbApplyThreadRuntimeEvents).toHaveBeenCalledWith(
      "thread-runtime",
      expect.arrayContaining([
        expect.objectContaining({ type: "item.started", itemId: "assistant-1" }),
        expect.objectContaining({ type: "content.delta", delta: "hello" }),
        expect.objectContaining({ type: "item.completed", itemId: "assistant-1" }),
      ]),
    );

    server.publishSupervisorEvent({
      type: "thread-state",
      threadId: "thread-runtime",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });

    expect(dbApplyThreadRuntimeEvents).toHaveBeenCalledTimes(1);
  });

  it("rotates the desktop pairing code after exchange and rejects replay", async () => {
    const onPairingChanged = vi.fn<() => void>();
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      onPairingChanged,
    });
    servers.push(server);
    const info = await server.start();
    const originalCredential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get(
      "token",
    );
    expect(originalCredential).toBeTruthy();

    const firstExchange = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: originalCredential,
      }),
    });
    expect(firstExchange.status).toBe(200);

    const rotatedInfo = server.getInfo();
    expect(rotatedInfo).not.toBeNull();
    const rotatedCredential = new URLSearchParams(
      new URL(rotatedInfo!.pairingUrl).hash.slice(1),
    ).get("token");
    expect(rotatedCredential).toBeTruthy();
    expect(rotatedCredential).not.toBe(originalCredential);
    expect(onPairingChanged).toHaveBeenCalledTimes(1);

    const replay = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: originalCredential,
      }),
    });
    expect(replay.status).toBe(401);

    const nextDevice = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: rotatedCredential,
      }),
    });
    expect(nextDevice.status).toBe(200);
    expect(onPairingChanged).toHaveBeenCalledTimes(2);
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
    expect(pairingUrl.pathname).toBe("/");

    const descriptorResponse = await fetch(
      new URL("/.well-known/poracode/environment", info.httpBaseUrl),
    );
    expect(descriptorResponse.status).toBe(200);
    await expect(descriptorResponse.json()).resolves.toMatchObject({
      hostMode: "desktop",
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

    for (const path of [
      "/app",
      "/app/settings/appearance?host=https%3A%2F%2Fdesktop.example",
      "/desktop",
      "/desktop/projects/example",
      "/pair?host=https%3A%2F%2Fdesktop.example",
      "/mobile.html",
    ]) {
      const legacyResponse = await fetch(new URL(path, info.httpBaseUrl), { redirect: "manual" });
      expect(legacyResponse.status).toBe(308);
      expect(legacyResponse.headers.get("location")).toBe(
        path.includes("?") ? `/?${path.split("?")[1]}` : "/",
      );
    }

    const manifestResponse = await fetch(new URL("/manifest.webmanifest", info.httpBaseUrl));
    expect(manifestResponse.status).toBe(200);
    await expect(manifestResponse.json()).resolves.toMatchObject({
      name: "Poracode",
      start_url: "/",
      display: "standalone",
    });

    const serviceWorkerResponse = await fetch(new URL("/service-worker.js", info.httpBaseUrl));
    expect(serviceWorkerResponse.status).toBe(200);
    const serviceWorker = await serviceWorkerResponse.text();
    expect(serviceWorker).toContain("poracode-remote-local-1.0.0");
    expect(serviceWorker).toContain("caches.delete(LEGACY_CACHE_NAME)");
    expect(serviceWorker).toContain('self.addEventListener("push"');
    expect(serviceWorker).toContain("showNotification");
    expect(serviceWorker).toContain('self.addEventListener("notificationclick"');
    expect(serviceWorker).toContain("if (response.ok)");
    expect(serviceWorker).toContain('url.pathname.startsWith("/assets/")');
    expect(serviceWorker).toContain("caches.match(request, { ignoreVary: true })");
    expect(serviceWorker).toContain("NAVIGATION_FALLBACK_DELAY_MS = 500");
    expect(serviceWorker).toContain('if (request.mode === "navigate")');
    expect(serviceWorker).toContain("if (!isAppRequest && !isPwaStaticRequest) return");
    expect(serviceWorker).toContain('request.mode === "navigate" ? "/" : request');

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

  it("pages remote thread runtime history while preserving the legacy full response", async () => {
    const thread = createTestThread({ id: "thread-paged", presentationMode: "gui" });
    const fullItems = [
      {
        id: "old",
        type: "assistant_message",
        state: "completed" as const,
        payload: {},
        streams: {},
      },
      {
        id: "tail",
        type: "assistant_message",
        state: "completed" as const,
        payload: {},
        streams: {},
      },
    ];
    const tailPage = { items: [fullItems[1]!], nextCursor: 41 };
    vi.mocked(dbGetThread).mockReturnValue(thread);
    vi.mocked(dbGetThreadRuntimeItems).mockReturnValue(fullItems);
    vi.mocked(dbGetThreadRuntimeItemsPage).mockReturnValue(tailPage);

    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: async () => null as never,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read"]);
    const headers = { authorization: `Bearer ${token}` };

    const legacyResponse = await fetch(
      new URL("/api/threads/thread-paged/history", info.httpBaseUrl),
      { headers },
    );
    expect(legacyResponse.status).toBe(200);
    await expect(legacyResponse.json()).resolves.toMatchObject({ runtimeItems: fullItems });

    const tailResponse = await fetch(
      new URL("/api/threads/thread-paged/history?runtimePage=1", info.httpBaseUrl),
      { headers },
    );
    expect(tailResponse.status).toBe(200);
    await expect(tailResponse.json()).resolves.toMatchObject({
      runtimeItems: tailPage.items,
      runtimeNextCursor: 41,
    });
    expect(dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith(
      "thread-paged",
      undefined,
      500,
      40,
    );

    const narrowTailResponse = await fetch(
      new URL(
        "/api/threads/thread-paged/history?runtimePage=1&targetTimelineEntryCount=20",
        info.httpBaseUrl,
      ),
      { headers },
    );
    expect(narrowTailResponse.status).toBe(200);
    await expect(narrowTailResponse.json()).resolves.toMatchObject({
      runtimeItems: tailPage.items,
      runtimeNextCursor: 41,
    });
    expect(dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith(
      "thread-paged",
      undefined,
      500,
      20,
    );

    const olderResponse = await fetch(
      new URL(
        "/api/threads/thread-paged/history/items?beforePosition=41&limit=500&targetTimelineEntryCount=40",
        info.httpBaseUrl,
      ),
      { headers },
    );
    expect(olderResponse.status).toBe(200);
    await expect(olderResponse.json()).resolves.toEqual(tailPage);
    expect(dbGetThreadRuntimeItemsPage).toHaveBeenLastCalledWith("thread-paged", 41, 500, 40);
  });

  it("re-reads thread state after asynchronous terminal snapshot calls", async () => {
    const working = createTestThread({ id: "thread-race", status: "working" });
    const idle = createTestThread({ id: "thread-race", status: "idle" });
    vi.mocked(dbGetThread).mockReturnValueOnce(working).mockReturnValue(idle);

    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: async () => null as never,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read"]);
    const response = await fetch(new URL("/api/threads/thread-race/history", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ thread: { status: "idle" } });
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
    expect((snapshot as { threads: Thread[] }).threads).toContainEqual(
      expect.objectContaining({ id: "thread-archived", archived: true }),
    );
    expect((snapshot as { projects: Project[] }).projects[0]).not.toHaveProperty("mcpServers");
    expect(dbGetThreadRuntimeSummaries).toHaveBeenCalledWith(["thread-visible"]);
    expect(dbGetThreadRuntimeItems).not.toHaveBeenCalled();
    expect(dbGetThreadContextUsage).not.toHaveBeenCalled();
  });

  it("serves host Git state and owns WebSocket interest lifetimes", async () => {
    type GitStateGateway = NonNullable<RemoteAccessServerOptions["gitState"]>;
    const setInterests = vi.fn<GitStateGateway["setInterests"]>();
    const clearInterests = vi.fn<GitStateGateway["clearInterests"]>();
    const gitState: GitStateGateway = {
      getSnapshot: () => ({ ...emptyGitStateSnapshot(), revision: 7 }),
      setInterests,
      clearInterests,
      refreshTarget: vi.fn<GitStateGateway["refreshTarget"]>(async () => {}),
      refreshPullRequestReviewBundle: vi.fn<GitStateGateway["refreshPullRequestReviewBundle"]>(
        async () => {},
      ),
      refreshProjectPullRequests: vi.fn<GitStateGateway["refreshProjectPullRequests"]>(
        async () => {},
      ),
    };
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
        async () => undefined as never,
      ),
      gitState,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read"]);
    const snapshotResponse = await fetch(new URL("/api/snapshot", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(snapshotResponse.json()).resolves.toMatchObject({
      gitState: { revision: 7 },
    });

    const ticket = await issueWebSocketTicket(info, token);
    const wsUrl = new URL("/ws", info.wsBaseUrl);
    wsUrl.searchParams.set("ticket", ticket);
    const ws = new WebSocket(wsUrl);
    // Register the reader before awaiting `open`: the server sends `ready`
    // immediately on connection, so a listener attached after the open event can
    // miss a frame delivered in the same tick.
    const readyPromise = readWsMessage(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await readyPromise;
    ws.send(
      JSON.stringify({
        type: "git-state-interests",
        interests: [
          {
            kind: "target",
            projectId: "project-1",
            worktreePath: "/repo/worktree",
            includePrDetails: true,
          },
        ],
      }),
    );
    await vi.waitFor(() => expect(setInterests).toHaveBeenCalledTimes(1));
    const ownerId = setInterests.mock.calls[0]![0] as string;
    expect(setInterests).toHaveBeenCalledWith(ownerId, [
      {
        kind: "target",
        projectId: "project-1",
        worktreePath: "/repo/worktree",
        includePrDetails: true,
      },
    ]);

    const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.close();
    await closed;
    await vi.waitFor(() => expect(clearInterests).toHaveBeenCalledWith(ownerId));
  });

  it("serves and guards the image-reference endpoint", async () => {
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

    const refUrl = (path: string, threadId = "thread-1", itemId = "item-1") => {
      const url = new URL(`/api/threads/${threadId}/items/${itemId}/image`, info.httpBaseUrl);
      url.searchParams.set("path", path);
      url.searchParams.set("access_token", token);
      return url;
    };

    // Unauthenticated requests are rejected before any lookup happens.
    const noToken = new URL("/api/threads/thread-1/items/item-1/image", info.httpBaseUrl);
    noToken.searchParams.set("path", '["images",0]');
    expect((await fetch(noToken)).status).toBe(401);

    // A malformed reference path is a client error, not a lookup.
    expect((await fetch(refUrl("not-json"))).status).toBe(400);
    expect((await fetch(refUrl("[]"))).status).toBe(400);

    // These tests have no DB attached, so a well-formed reference resolves to
    // nothing — which must be a clean 404 rather than a crash.
    expect((await fetch(refUrl('["images",0]'))).status).toBe(404);
  });

  it("serves local image files over the authenticated image endpoint", async () => {
    const dir = createTempDir();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const imagePath = join(dir, "pixel.png");
    writeFileSync(imagePath, pngBytes);
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

    // <img> tags can't send Authorization headers, so the token rides in the query.
    const queryUrl = new URL("/api/files/image", info.httpBaseUrl);
    queryUrl.searchParams.set("path", imagePath);
    queryUrl.searchParams.set("access_token", token);
    const queryResponse = await fetch(queryUrl);
    expect(queryResponse.status).toBe(200);
    expect(queryResponse.headers.get("content-type")).toBe("image/png");
    expect(queryResponse.headers.get("cache-control")).toBe("private, max-age=300");
    expect(Buffer.from(await queryResponse.arrayBuffer())).toEqual(pngBytes);

    // The usual bearer header works too.
    const headerUrl = new URL("/api/files/image", info.httpBaseUrl);
    headerUrl.searchParams.set("path", imagePath);
    const headerResponse = await fetch(headerUrl, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(headerResponse.status).toBe(200);
    expect(headerResponse.headers.get("content-type")).toBe("image/png");
  });

  it("rejects local image requests without a valid access token", async () => {
    const dir = createTempDir();
    const imagePath = join(dir, "pixel.png");
    writeFileSync(imagePath, Buffer.from("png"));
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    const url = new URL("/api/files/image", info.httpBaseUrl);
    url.searchParams.set("path", imagePath);
    expect((await fetch(url)).status).toBe(401);

    url.searchParams.set("access_token", "lc_access_bogus");
    expect((await fetch(url)).status).toBe(401);
  });

  it("rejects local image requests for missing, non-image, or relative paths", async () => {
    const dir = createTempDir();
    const textPath = join(dir, "notes.txt");
    writeFileSync(textPath, Buffer.from("hello"));
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

    const fetchImage = (path: string) => {
      const url = new URL("/api/files/image", info.httpBaseUrl);
      url.searchParams.set("path", path);
      url.searchParams.set("access_token", token);
      return fetch(url);
    };

    expect((await fetchImage(join(dir, "missing.png"))).status).toBe(404);
    expect((await fetchImage(textPath)).status).toBe(415);
    expect((await fetchImage("images/pixel.png")).status).toBe(400);
  });

  it("accepts authenticated remote attachment uploads", async () => {
    const save = vi.fn<(input: { threadId: string; fileName: string; data: Uint8Array }) => string>(
      () => "C:\\attachments\\notes.md",
    );
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      attachments: { save },
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:operate"]);
    const url = new URL("/api/files/attachment", info.httpBaseUrl);
    url.searchParams.set("threadId", "thread-1");
    url.searchParams.set("name", "notes.md");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/octet-stream",
      },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ path: "C:\\attachments\\notes.md" });
    expect(save).toHaveBeenCalledWith({
      threadId: "thread-1",
      fileName: "notes.md",
      data: Buffer.from([1, 2, 3]),
    });
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

  it("publishes aggregate terminal and runtime interests for connected clients", async () => {
    const onEventInterestsChanged =
      vi.fn<NonNullable<RemoteAccessServerOptions["onEventInterestsChanged"]>>();
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      onEventInterestsChanged,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read", "terminal:read"]);
    const ticket = await issueWebSocketTicket(info, token);
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    url.searchParams.set("threadItemInterests", JSON.stringify(["chat-1"]));
    const ws = new WebSocket(url);
    const next = createWsReader(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await next();

    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenLastCalledWith({
        terminalThreadIds: [],
        runtimeThreadIds: ["chat-1"],
        allRuntimeEvents: false,
      }),
    );

    ws.send(JSON.stringify({ type: "terminal-watch", id: "terminal-1" }));
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenLastCalledWith({
        terminalThreadIds: ["terminal-1"],
        runtimeThreadIds: ["chat-1"],
        allRuntimeEvents: false,
      }),
    );

    ws.send(JSON.stringify({ type: "thread-item-interests", threadIds: ["chat-2"] }));
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenLastCalledWith({
        terminalThreadIds: ["terminal-1"],
        runtimeThreadIds: ["chat-2"],
        allRuntimeEvents: false,
      }),
    );

    ws.close();
    await vi.waitFor(() =>
      expect(onEventInterestsChanged).toHaveBeenLastCalledWith({
        terminalThreadIds: [],
        runtimeThreadIds: [],
        allRuntimeEvents: false,
      }),
    );
  });

  it("scopes transcript content per connection without breaking approvals or replay", async () => {
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

    // One client watches thread-A; the other never declares interests at all,
    // standing in for an older client that must keep receiving everything. Both
    // ride one access token because a pairing credential is single-use.
    const token = await issueAccessToken(info, ["session:read"]);
    const openSocket = async (options?: {
      readonly lastSeenSeq?: number;
      readonly threadItemInterests?: readonly string[];
    }) => {
      const ticket = await issueWebSocketTicket(info, token);
      const url = new URL("/ws", info.wsBaseUrl);
      url.searchParams.set("ticket", ticket);
      if (options?.lastSeenSeq !== undefined) {
        url.searchParams.set("lastSeenSeq", String(options.lastSeenSeq));
      }
      if (options?.threadItemInterests) {
        url.searchParams.set("threadItemInterests", JSON.stringify(options.threadItemInterests));
      }
      const ws = new WebSocket(url);
      // Reader before `open`: `ready` can arrive in the same tick.
      const next = createWsReader(ws);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });
      const ready = await next();
      expect(ready).toMatchObject({ type: "ready" });
      return { ws, next, ready };
    };
    const watcher = await openSocket();
    const legacy = await openSocket();
    const watcherNext = watcher.next;
    const legacyNext = legacy.next;
    watcher.ws.send(JSON.stringify({ type: "thread-item-interests", threadIds: ["thread-A"] }));
    await vi.waitFor(() => {
      const interests = (server as unknown as { itemInterests: Map<unknown, ReadonlySet<string>> })
        .itemInterests;
      expect(interests.size).toBe(1);
    });

    const itemEventFor = (threadId: string) =>
      ({
        type: "thread-runtime-event",
        threadId,
        event: {
          type: "item.completed",
          threadId,
          itemId: `${threadId}-item`,
          payload: { name: "bash", result: "R".repeat(5_000) },
        },
      }) as const;

    // Content for the watched thread arrives intact.
    server.publishSupervisorEvent(itemEventFor("thread-A"));
    const watchedFrame = (await watcherNext()) as {
      seq: number;
      event: { event: { payload: { result: string } } };
    };
    expect(watchedFrame.seq).toBe(1);
    expect(watchedFrame.event.event.payload.result).toHaveLength(5_000);
    expect(await legacyNext()).toMatchObject({ seq: 1 });

    // Content for an unwatched thread is emptied for the watcher...
    server.publishSupervisorEvent(itemEventFor("thread-B"));
    const scoped = (await watcherNext()) as {
      seq: number;
      event: { type: string; threadId: string; events: unknown[] };
    };
    expect(scoped.seq).toBe(2);
    expect(scoped.event).toEqual({
      type: "thread-runtime-events",
      threadId: "thread-B",
      events: [],
    });
    // ...while the client that never declared interests still gets it in full.
    const legacyFrame = (await legacyNext()) as {
      seq: number;
      event: { event: { payload: { result: string } } };
    };
    expect(legacyFrame.seq).toBe(2);
    expect(legacyFrame.event.event.payload.result).toHaveLength(5_000);

    // A permission request on an UNWATCHED thread must still reach the watcher,
    // or a background thread would block on an approval nobody can see.
    server.publishSupervisorEvent({
      type: "thread-runtime-event",
      threadId: "thread-B",
      event: {
        type: "request.opened",
        threadId: "thread-B",
        requestId: "req-1",
        requestType: "tool_call_approval",
        payload: { summary: "Allow this tool?" },
      },
    });
    expect(await watcherNext()).toMatchObject({
      seq: 3,
      event: { event: { type: "request.opened", requestId: "req-1" } },
    });

    // Every seq was delivered to both clients, so the replay contiguity check
    // still holds and neither client is forced into a spurious resync.
    const buffer = (server as unknown as { eventBuffer: unknown[] }).eventBuffer;
    expect(buffer).toHaveLength(3);

    const replay = await openSocket({ lastSeenSeq: 0, threadItemInterests: ["thread-A"] });
    expect(replay.ready).toMatchObject({ type: "ready", seq: 3 });
    expect(await replay.next()).toMatchObject({
      type: "event",
      seq: 1,
      event: { threadId: "thread-A", event: { payload: { result: expect.any(String) } } },
    });
    expect(await replay.next()).toEqual({
      type: "event",
      seq: 2,
      event: { type: "thread-runtime-events", threadId: "thread-B", events: [] },
    });
    expect(await replay.next()).toMatchObject({
      type: "event",
      seq: 3,
      event: { event: { type: "request.opened", requestId: "req-1" } },
    });
    replay.ws.close();
  });

  it("replaces inline images with references on the live event stream", async () => {
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
    const { ws, ready } = await openPairedSocket(info);
    expect(ready).toMatchObject({ type: "ready", seq: 0 });
    const nextMessage = createWsReader(ws);

    const clients = (server as unknown as { clients: Map<WebSocket, unknown> }).clients;
    const serverSocket = [...clients.keys()][0];

    // 3 MB of inline PNG, prefixed with a real 1x1 PNG header so the host can
    // read its intrinsic size. Before the projection this rode the socket in full
    // and was the dominant source of remote traffic.
    const pngHeader =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AABAwMDAwMDAAAAP//AwABAAEAAQABAAEA";
    const inline = `data:image/png;base64,${pngHeader}${"A".repeat(3_000_000)}`;
    server.publishSupervisorEvent({
      type: "thread-runtime-event",
      threadId: "thread-1",
      event: {
        type: "item.completed",
        threadId: "thread-1",
        itemId: "image_view-1",
        payload: { name: "imageView", status: "success", images: [inline] },
      },
    });

    const message = (await nextMessage()) as {
      type: string;
      event: { event: { payload: { images: unknown[]; name: string } } };
    };
    expect(message.type).toBe("event");
    const payload = message.event.event.payload;
    const ref = readRemoteImageRef(payload.images[0]);
    expect(ref).toMatchObject({
      threadId: "thread-1",
      itemId: "image_view-1",
      path: ["images", 0],
      mime: "image/png",
    });
    // Intrinsic size rides along even on the LIVE path, so a streaming image
    // lands in a slot the timeline already reserved instead of shoving the
    // transcript down when its bytes arrive.
    expect(ref?.width).toBe(1);
    expect(ref?.height).toBe(1);
    expect(payload.name).toBe("imageView");
    // The frame is now tiny, so the size cap never had to withhold anything.
    expect(JSON.stringify(message).length).toBeLessThan(4000);
    expect(clients.has(serverSocket!)).toBe(true);
  });

  it("gzips and revalidates the shell snapshot", async () => {
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

    const first = await fetch(new URL("/api/snapshot", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token}`, "accept-encoding": "gzip" },
    });
    expect(first.status).toBe(200);
    expect(first.headers.get("vary")).toBe("Accept-Encoding");
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    // The snapshot still parses through the transparent gzip decode.
    await expect(first.json()).resolves.toMatchObject({ threads: expect.any(Array) });

    // Unchanged content revalidates to a bodyless 304 instead of resending the
    // whole snapshot — this is the refetch-on-every-status-event path.
    const second = await fetch(new URL("/api/snapshot", info.httpBaseUrl), {
      headers: {
        authorization: `Bearer ${token}`,
        "accept-encoding": "gzip",
        "if-none-match": etag!,
      },
    });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");

    // A stale tag from a different body must not be honored.
    const third = await fetch(new URL("/api/snapshot", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token}`, "if-none-match": '"stale-tag"' },
    });
    expect(third.status).toBe(200);
    await third.arrayBuffer();
  });

  it("keeps clients connected when a runtime event exceeds the outbound budget", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      maxWebSocketOutboundBufferBytes: 200_000,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const { ws, ready } = await openPairedSocket(info);
    expect(ready).toMatchObject({ type: "ready", seq: 0 });
    const nextMessage = createWsReader(ws);

    const clients = (server as unknown as { clients: Map<WebSocket, unknown> }).clients;
    const serverSocket = [...clients.keys()][0];
    expect(serverSocket).toBeDefined();

    // A 400 KB tool result against a 200 KB socket budget: before the size guard
    // this terminated every connected client. Inline images take the lossless
    // reference path instead (covered separately), so this exercises the cap with
    // the payload shape that genuinely cannot be referenced — bulk text.
    server.publishSupervisorEvent({
      type: "thread-runtime-event",
      threadId: "thread-1",
      event: {
        type: "item.completed",
        threadId: "thread-1",
        itemId: "tool_call-1",
        payload: {
          name: "bash",
          args: { command: "cat huge.log" },
          status: "success",
          result: "R".repeat(400_000),
        },
      },
    });

    const message = (await nextMessage()) as {
      type: string;
      seq: number;
      event: { event: { payload: Record<string, unknown> } };
    };
    expect(message.type).toBe("event");
    expect(message.seq).toBe(1);
    // Descriptive fields survive; only the bulk field is withheld.
    const payload = message.event.event.payload;
    expect(payload.name).toBe("bash");
    expect(payload.args).toEqual({ command: "cat huge.log" });
    expect(isRemoteOmittedField(payload.result)).toBe(true);

    // The client is still connected and still on the live stream.
    expect(clients.has(serverSocket!)).toBe(true);
    expect(ws.readyState).toBe(WebSocket.OPEN);

    server.publishSupervisorEvent({
      type: "thread-state",
      threadId: "thread-1",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });
    expect(await nextMessage()).toMatchObject({ type: "event", seq: 2 });
    expect(clients.has(serverSocket!)).toBe(true);
  });

  it("asks clients to resync when an event cannot be shrunk to fit", async () => {
    const onOversizedEventDropped =
      vi.fn<NonNullable<RemoteAccessServerOptions["onOversizedEventDropped"]>>();
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      maxWebSocketOutboundBufferBytes: 200_000,
      onOversizedEventDropped,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const { ws, ready } = await openPairedSocket(info);
    expect(ready).toMatchObject({ type: "ready", seq: 0 });
    const nextMessage = createWsReader(ws);

    const clients = (server as unknown as { clients: Map<WebSocket, unknown> }).clients;
    const serverSocket = [...clients.keys()][0];

    // `remote-git-state` carries no runtime payload the guard can strip, so an
    // oversized patch must degrade to a resync rather than a disconnect.
    server.publishSupervisorEvent({
      type: "remote-git-state",
      patch: { revision: 1, pullRequests: { pr: { diff: "d".repeat(300_000) } } } as never,
    });

    expect(await nextMessage()).toMatchObject({ type: "resync-required", seq: 1 });
    expect(onOversizedEventDropped).toHaveBeenCalledWith(
      expect.objectContaining({ type: "remote-git-state" }),
    );
    expect(clients.has(serverSocket!)).toBe(true);
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // The undeliverable event is not buffered, so a client reconnecting from an
    // older cursor is told to resync instead of being fed it again.
    const eventBuffer = (server as unknown as { eventBuffer: unknown[] }).eventBuffer;
    expect(eventBuffer).toHaveLength(0);
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

  it("trusts loopback PWA origins in development and production", async () => {
    // The Vite-served canonical browser app pairs without an explicit
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

    // The same localhost app can pair with a packaged/headless app. The app can
    // be on another machine; authentication still requires its pairing token.
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
      { headers: { origin: "http://127.0.0.1:3100" } },
    );
    expect(prodResponse.status).toBe(200);
    expect(prodResponse.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3100");

    const prodPreflight = await fetch(new URL("/api/auth/token", prodInfo.httpBaseUrl), {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3100",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(prodPreflight.status).toBe(204);
    expect(prodPreflight.headers.get("access-control-allow-origin")).toBe("http://localhost:3100");
  });

  it("advertises a full advertisedBaseUrl over host/port (https → wss)", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "0.0.0.0",
      port: 0,
      advertisedHost: "192.168.1.5",
      advertisedBaseUrl: "https://my-machine.tailnet-1234.ts.net",
      tailscaleHttpBaseUrl: "https://my-machine.tailnet-1234.ts.net",
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    expect(info.httpBaseUrl).toBe("https://my-machine.tailnet-1234.ts.net/");
    expect(info.localHttpBaseUrl).toMatch(/^http:\/\/192\.168\.1\.5:\d+$/);
    expect(info.tailscaleHttpBaseUrl).toBe("https://my-machine.tailnet-1234.ts.net");
    expect(info.wsBaseUrl).toBe("wss://my-machine.tailnet-1234.ts.net/");
    const pairingUrl = new URL(info.pairingUrl);
    expect(pairingUrl.origin).toBe("https://my-machine.tailnet-1234.ts.net");
    expect(pairingUrl.pathname).toBe("/");
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

  it("points dev pairing links at the canonical dev app origin", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      devWebAppUrl: "http://192.168.1.20:3100/",
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    const startupPairing = new URL(info.pairingUrl);
    expect(startupPairing.origin).toBe("http://192.168.1.20:3100");
    expect(startupPairing.pathname).toBe("/");
    expect(startupPairing.searchParams.get("host")).toBe(info.httpBaseUrl);
    expect(new URLSearchParams(startupPairing.hash.slice(1)).get("token")).toMatch(/^lc_pair_/);

    const settingsPairing = new URL(server.issuePairingUrl("Settings QR"));
    expect(settingsPairing.origin).toBe(startupPairing.origin);
    expect(settingsPairing.pathname).toBe("/");
    expect(settingsPairing.searchParams.get("host")).toBe(info.httpBaseUrl);
  });

  it("points production pairing links at the hosted Poracode app", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      pairingAppUrl: "https://poracode.com",
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    const startupPairing = new URL(info.pairingUrl);
    expect(startupPairing.origin).toBe("https://poracode.com");
    expect(startupPairing.pathname).toBe("/");
    expect(startupPairing.searchParams.get("host")).toBe(info.httpBaseUrl);
    expect(new URLSearchParams(startupPairing.hash.slice(1)).get("token")).toMatch(/^lc_pair_/);

    const settingsPairing = new URL(server.issuePairingUrl("Settings QR"));
    expect(settingsPairing.origin).toBe(startupPairing.origin);
    expect(settingsPairing.pathname).toBe("/");
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

  it("allows paired clients to list the global pull request rows", async () => {
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "ghListPullRequests") {
        return { pullRequests: [], viewerLogin: "remote-user" } as never;
      }
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
        procedure: "ghListPullRequests",
        payload: {
          projectLocation: { kind: "posix", path: "/tmp/example" },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { pullRequests: [], viewerLogin: "remote-user" },
    });
    expect(callSupervisor).toHaveBeenCalledWith("ghListPullRequests", {
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
        userMessageItemId: "user-optimistic",
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
        userMessageItemId: "user-optimistic",
        ...mcpSnapshot,
      }),
    );
    expect(dispatched).toEqual([
      expect.objectContaining({
        kind: "start",
        threadId: "thread-remote",
        projectId: "project-1",
        launchRuntime: false,
        userMessageItemId: "user-optimistic",
      }),
    ]);
  });

  it("runs new-worktree setup on the host before launching the remote thread", async () => {
    const project = createTestProject({
      scripts: { actions: [], setupScript: "pnpm install" },
    });
    vi.mocked(dbGetProjects).mockReturnValue([project]);
    mockThreadDb();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "startThread") return { threadId: "thread-worktree" } as never;
      return undefined as never;
    });
    const dispatchThreadCommand = vi.fn<
      NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>
    >(() => true);
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
      dispatchThreadCommand,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:operate"]);

    const response = await fetch(
      new URL("/api/threads/thread-worktree/command", info.httpBaseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "start",
          projectId: project.id,
          agentKind: "codex",
          config: { model: "gpt-5" },
          prompt: "start from the PWA",
          worktreePath: "/repo/worktrees/mobile-fix",
          worktreeBranch: "mobile-fix",
          isNewWorktree: true,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith(
      "gitWatchWorktrees",
      expect.objectContaining({
        projectId: project.id,
        worktreePaths: ["/repo/worktrees/mobile-fix"],
      }),
    );
    expect(callSupervisor).toHaveBeenCalledWith(
      "startShell",
      expect.objectContaining({ worktreePath: "/repo/worktrees/mobile-fix" }),
    );
    expect(callSupervisor).toHaveBeenCalledWith(
      "writeTerminal",
      expect.objectContaining({ data: "pnpm install && exit\r" }),
    );
    expect(callSupervisor).toHaveBeenCalledWith(
      "startThread",
      expect.objectContaining({ threadId: "thread-worktree" }),
    );
    const startShellOrder =
      callSupervisor.mock.invocationCallOrder[
        callSupervisor.mock.calls.findIndex((call) => call[0] === "startShell")
      ]!;
    const startThreadOrder =
      callSupervisor.mock.invocationCallOrder[
        callSupervisor.mock.calls.findIndex((call) => call[0] === "startThread")
      ]!;
    expect(startShellOrder).toBeLessThan(startThreadOrder);
    expect(dispatchThreadCommand).toHaveBeenNthCalledWith(1, {
      kind: "prepare-worktree",
      threadId: "thread-worktree",
      projectId: project.id,
      worktreePath: "/repo/worktrees/mobile-fix",
    });
    expect(dispatchThreadCommand).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({ isNewWorktree: true }),
    );
  });

  it("prepares a new worktree on the host when the desktop window is gone", async () => {
    const project = createTestProject({
      scripts: { actions: [], setupScript: "pnpm install" },
    });
    vi.mocked(dbGetProjects).mockReturnValue([project]);
    mockThreadDb();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      if (name === "startThread") return { threadId: "thread-offline" } as never;
      return undefined as never;
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
      dispatchThreadCommand: () => false,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:operate"]);

    const response = await fetch(new URL("/api/threads/thread-offline/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "start",
        projectId: project.id,
        agentKind: "codex",
        config: { model: "gpt-5" },
        prompt: "start offline",
        worktreePath: "/repo/worktrees/offline",
        isNewWorktree: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith(
      "startShell",
      expect.objectContaining({ worktreePath: "/repo/worktrees/offline" }),
    );
    expect(callSupervisor).toHaveBeenCalledWith(
      "startThread",
      expect.objectContaining({ threadId: "thread-offline" }),
    );
  });

  it("does not enqueue setup when a remote thread reuses an existing worktree", async () => {
    const project = createTestProject();
    vi.mocked(dbGetProjects).mockReturnValue([project]);
    mockThreadDb();
    const dispatchThreadCommand = vi.fn<
      NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>
    >(() => true);
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
        async () => ({ threadId: "thread-existing" }) as never,
      ),
      dispatchThreadCommand,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:operate"]);

    const response = await fetch(
      new URL("/api/threads/thread-existing/command", info.httpBaseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "start",
          projectId: project.id,
          agentKind: "codex",
          config: { model: "gpt-5" },
          prompt: "reuse from the PWA",
          worktreePath: "/repo/worktrees/existing",
          worktreeBranch: "existing",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(dispatchThreadCommand).toHaveBeenCalledTimes(1);
    expect(dispatchThreadCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "prepare-worktree" }),
    );
  });

  it("truncates durable remote runtime history during a PWA checkpoint revert", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
        async () => undefined as never,
      ),
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:operate"]);

    const response = await fetch(
      new URL("/api/threads/thread-1/runtime/truncate", info.httpBaseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ itemId: "user-2" }),
      },
    );

    expect(response.status).toBe(200);
    expect(dbTruncateThreadRuntimeAfter).toHaveBeenCalledWith("thread-1", "user-2");
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

  it("replays a completed remote start receipt without launching twice", async () => {
    mockThreadDb([createTestThread()]);
    const result = { threadId: "thread-1" };
    vi.mocked(dbClaimRemoteCommand)
      .mockReturnValueOnce({ state: "claimed" })
      .mockReturnValueOnce({ state: "completed", response: result });
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => result as never,
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
      "x-poracode-command-id": "prompt-item-1",
    };
    const body = JSON.stringify({
      threadId: "thread-1",
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "codex",
      config: { model: "gpt-5" },
      prompt: "continue",
      initialSize: { cols: 120, rows: 30 },
    });

    const first = await fetch(new URL("/api/threads/start", info.httpBaseUrl), {
      method: "POST",
      headers,
      body,
    });
    const retry = await fetch(new URL("/api/threads/start", info.httpBaseUrl), {
      method: "POST",
      headers,
      body,
    });

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual(result);
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(dbCompleteRemoteCommand).toHaveBeenCalledWith("prompt-item-1", result);
  });

  it("persists simple thread commands and mirrors them to the renderer", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([createTestProject()]);
    const db = mockThreadDb([
      createTestThread({ worktreePath: "/repo/wt", worktreeBranch: "feat/x" }),
    ]);
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
      dispatchThreadCommand: async (command) => {
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
    expect(db.threads()[0]).toMatchObject({
      title: "New title",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
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
    expect(db.threads()).toEqual([]);
    expect(callSupervisor).toHaveBeenCalledWith(
      "gitRemoveWorktree",
      expect.objectContaining({ path: "/repo/wt", force: true }),
    );
    expect(callSupervisor).toHaveBeenCalledWith(
      "gitDeleteBranch",
      expect.objectContaining({ branch: "feat/x", force: true }),
    );

    rendererAvailable = false;
    const offlineDeleteResponse = await fetch(
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
    expect(offlineDeleteResponse.status).toBe(200);
    ws.close();
  });

  it("acknowledges a finished thread in the source DB and renderer", async () => {
    const db = mockThreadDb([createTestThread({ status: "finished" })]);
    const dispatched: unknown[] = [];
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
        async () => undefined as never,
      ),
      dispatchThreadCommand: (command) => {
        dispatched.push(command);
        return true;
      },
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:operate"]);
    const publishSpy = vi.spyOn(server, "publishSupervisorEvent");

    const response = await fetch(new URL("/api/threads/thread-1/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "acknowledge" }),
    });

    expect(response.status).toBe(200);
    expect(db.threads()[0]?.status).toBe("idle");
    expect(dispatched).toEqual([{ kind: "acknowledge", threadId: "thread-1" }]);
    expect(publishSpy).toHaveBeenCalledWith({
      type: "remote-threads-changed",
      threadIds: ["thread-1"],
      viewedThreadIds: ["thread-1"],
    });
  });

  it("rejects destructive remote commands for experiment candidates before persistence", async () => {
    const candidate = createTestThread({
      worktreePath: "/repo/one",
      worktreeBranch: "poracode/experiment-one",
    });
    const db = mockThreadDb([candidate]);
    persistTestExperiment();
    vi.mocked(dbGetProjects).mockReturnValue([createTestProject()]);
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => undefined as never,
    );
    const dispatchThreadCommand = vi.fn<
      NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>
    >(() => true);
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
      dispatchThreadCommand,
    });
    servers.push(server);
    const info = await server.start();
    const token = await issueAccessToken(info, ["session:read", "session:operate"]);
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const commands = [
      {
        threadId: "thread-1",
        body: {
          kind: "start",
          projectId: "project-1",
          agentKind: "codex",
          config: { model: "gpt-5" },
          prompt: "replace candidate",
        },
      },
      { threadId: "thread-1", body: { kind: "set-done", done: true } },
      {
        threadId: "thread-1",
        body: { kind: "set-worktree", worktreePath: "/repo/reassigned" },
      },
      { threadId: "thread-1", body: { kind: "archive" } },
      { threadId: "thread-1", body: { kind: "delete" } },
      {
        threadId: "thread-3",
        body: {
          kind: "delete-worktree-group",
          projectId: "project-1",
          worktreePath: "/repo/one",
          threadIds: ["thread-3", "thread-1"],
        },
      },
    ] as const;

    for (const command of commands) {
      const response = await fetch(
        new URL(`/api/threads/${command.threadId}/command`, info.httpBaseUrl),
        { method: "POST", headers, body: JSON.stringify(command.body) },
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "experiment_owned" },
      });
    }

    expect(db.threads()).toEqual([candidate]);
    expect(dbUpsertThread).not.toHaveBeenCalled();
    expect(dbDeleteThread).not.toHaveBeenCalled();
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(dispatchThreadCommand).not.toHaveBeenCalled();

    const restartResponse = await fetch(new URL("/api/threads/start", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        threadId: "thread-1",
        projectLocation: { kind: "posix", path: "/repo/one" },
        agentKind: "codex",
        config: { model: "gpt-5" },
        prompt: "",
        initialSize: { cols: 120, rows: 30 },
        presentationMode: "terminal",
      }),
    });
    expect(restartResponse.status).toBe(409);
    await expect(restartResponse.json()).resolves.toMatchObject({
      error: { code: "experiment_owned" },
    });

    dbSetState("poracode-experiments-v1", "{");
    const unreadableResponse = await fetch(
      new URL("/api/threads/thread-1/command", info.httpBaseUrl),
      { method: "POST", headers, body: JSON.stringify({ kind: "archive" }) },
    );
    expect(unreadableResponse.status).toBe(503);
    await expect(unreadableResponse.json()).resolves.toMatchObject({
      error: { code: "experiment_state_unavailable" },
    });
    expect(db.threads()).toEqual([candidate]);
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
    const onProjectsChanged = vi.fn<(projects: readonly Project[]) => void>();
    vi.mocked(dbGetProjects).mockImplementation(() => projects);
    vi.mocked(dbUpsertProject).mockImplementation((project) => {
      const parsed = project as Project;
      projects = [parsed, ...projects.filter((entry) => entry.id !== parsed.id)];
    });
    vi.mocked(dbUpdateProject).mockImplementation((project) => {
      const parsed = project as Project;
      projects = projects.map((entry) => (entry.id === parsed.id ? parsed : entry));
    });
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      onProjectsChanged,
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
    expect(onProjectsChanged).toHaveBeenCalledWith([expect.objectContaining({ name: "new-app" })]);
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

    const createdProject = projects[0]!;
    const projectWithMcp: Project = {
      ...createdProject,
      mcpServers: [
        {
          id: "memory-id",
          name: "memory",
          description: "Memory tools",
          enabled: true,
          timeoutMs: 30_000,
          transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
        },
      ],
    };
    projects = [projectWithMcp];
    const updateResponse = await fetch(new URL("/api/projects/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${manageToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "update",
        projectId: createdProject.id,
        patch: { name: "new-app-updated" },
      }),
    });
    expect(updateResponse.status).toBe(200);
    const updateResult = (await updateResponse.json()) as { project: Project };
    expect(updateResult.project).not.toHaveProperty("mcpServers");
    expect(onProjectsChanged).toHaveBeenLastCalledWith([
      expect.objectContaining({
        name: "new-app-updated",
        mcpServers: [expect.objectContaining({ id: "memory-id" })],
      }),
    ]);
    expect(await read()).toMatchObject({
      type: "event",
      event: {
        type: "remote-projects-changed",
        projects: [expect.not.objectContaining({ mcpServers: expect.anything() })],
      },
    });

    vi.mocked(dbGetProject).mockImplementation(
      (projectId) => projects.find((project) => project.id === projectId) ?? null,
    );
    const settingsUrl = new URL(
      `/api/projects/${encodeURIComponent(createdProject.id)}/settings`,
      info.httpBaseUrl,
    );
    const forbiddenSettings = await fetch(settingsUrl, {
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    expect(forbiddenSettings.status).toBe(403);
    const settingsResponse = await fetch(settingsUrl, {
      headers: { authorization: `Bearer ${manageToken}` },
    });
    expect(settingsResponse.status).toBe(200);
    await expect(settingsResponse.json()).resolves.toMatchObject({
      mcpServers: [{ id: "memory-id", name: "memory" }],
    });
    ws.close();
  });

  it("removes durable experiments before remotely removing their project", async () => {
    const project = createTestProject();
    let projects = [project];
    vi.mocked(dbGetProjects).mockImplementation(() => projects);
    vi.mocked(dbDeleteProject).mockImplementation((projectId) => {
      projects = projects.filter((candidate) => candidate.id !== projectId);
    });
    vi.mocked(dbGetThreads).mockReturnValue([createTestThread()]);
    persistTestExperiment();
    const callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async (name) =>
        (name === "removeExperimentWorktrees"
          ? {
              candidates: [
                { threadId: "thread-1", branch: "poracode/experiment-one" },
                { threadId: "thread-2", branch: "poracode/experiment-two" },
              ],
            }
          : undefined) as never,
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
    const token = await issueAccessToken(info, ["session:read", "projects:manage"]);
    const response = await fetch(new URL("/api/projects/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "remove", projectId: project.id }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      projects: [],
    });
    expect(callSupervisor).toHaveBeenNthCalledWith(
      1,
      "removeExperimentWorktrees",
      expect.objectContaining({ projectLocation: project.location }),
    );
    expect(callSupervisor).toHaveBeenCalledWith("closeThread", { threadId: "thread-1" });
    expect(dbDeleteProject).toHaveBeenCalledWith(project.id);
    const persisted = JSON.parse(
      vi.mocked(dbSetState).mock.calls.findLast(([key]) => key === "poracode-experiments-v1")![1],
    ) as { state: { experiments: Record<string, unknown> } };
    expect(persisted.state.experiments).toEqual({});
  });

  it("serves browser state/commands and streams mirror status to watchers", async () => {
    const navigated: unknown[] = [];
    const moved: unknown[] = [];
    const createTab = vi.fn<() => Promise<{ tabId: string }>>(async () => ({ tabId: "tab-2" }));
    const revealPanel = vi.fn<() => void>();
    let activeTabAttached = false;
    const cdpSend = vi.fn<() => Promise<Record<string, never>>>(async () => ({}));
    const activeTab = {
      tabId: "tab-1",
      isAttached: () => activeTabAttached,
      isDestroyed: () => false,
      cdp: {
        attach: vi.fn<() => Promise<void>>(async () => {}),
        detach: vi.fn<() => void>(),
        isAttached: () => true,
        on: vi.fn<() => () => void>(() => () => {}),
        send: cdpSend,
      },
      webContents: {
        once: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
      },
    };
    const setAutomationSession = vi.fn<(_sessionId: string, active: boolean) => boolean>(
      (_sessionId, active) => {
        if (active)
          setTimeout(() => {
            activeTabAttached = true;
          }, 0);
        return false;
      },
    );
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
      // The automation session simulates BrowserHost mounting the webview in
      // background mode on the next task, without revealing the desktop panel.
      getActiveTab: () => activeTab,
      createTab,
      revealPanel,
      setAutomationSession,
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

    const createTabResponse = await fetch(new URL("/api/browser/command", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "create-tab", url: "https://example.net" }),
    });
    expect(createTabResponse.status).toBe(200);
    expect(createTab).toHaveBeenCalledWith({ url: "https://example.net", activate: true });
    expect(revealPanel).not.toHaveBeenCalled();

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
      status: { status: "starting" },
    });
    expect(await read()).toMatchObject({
      type: "browser-mirror-status",
      status: { status: "active" },
    });
    expect(setAutomationSession).toHaveBeenCalledWith("remote-browser-mirror", true);
    expect(revealPanel).not.toHaveBeenCalled();
    ws.close();
    await vi.waitFor(() => {
      expect(setAutomationSession).toHaveBeenCalledWith("remote-browser-mirror", false);
    });
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
    // (what the browser client calls right before opening the tab).
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

  it("lets an active forward session win over bundled client assets and preserves the no-session 404 fallback", async () => {
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
    // url/host as distinctive JSON, which is nothing the bundled client would
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
    // bundled-client lookup — which 404s here since there is no built renderer
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
    expect(afterStop.status).toBe(200);
    await expect(afterStop.text()).resolves.toContain("<!doctype html>");

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
    let stored: RemoteSettings = pickRemoteSettings({
      ...defaultSharedSettings,
      enabledMcpServers: { browser: true, crossagents: false },
      disabledBuiltInMcpServers: { chrome: true },
    });
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
      settings: {
        titleGenProvider: defaultSharedSettings.titleGenProvider,
        enabledMcpServers: { browser: true, crossagents: false },
        disabledBuiltInMcpServers: { chrome: true },
      },
    });

    const postResponse = await fetch(new URL("/api/settings", info.httpBaseUrl), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        titleGenProvider: "claude",
        titleGenModel: "claude-haiku-4-5-20251001",
        enabledMcpServers: { browser: true, crossagents: true },
        // Unknown keys are stripped by the schema, not persisted.
        providerConfigs: { evil: true },
      }),
    });
    expect(postResponse.status).toBe(200);
    await expect(postResponse.json()).resolves.toMatchObject({
      settings: {
        titleGenProvider: "claude",
        titleGenModel: "claude-haiku-4-5-20251001",
        enabledMcpServers: { browser: true, crossagents: true },
      },
    });
    expect(update).toHaveBeenCalledWith({
      titleGenProvider: "claude",
      titleGenModel: "claude-haiku-4-5-20251001",
      enabledMcpServers: { browser: true, crossagents: true },
    });
    expect(stored.titleGenProvider).toBe("claude");
    expect(stored.enabledMcpServers).toEqual({ browser: true, crossagents: true });
  });

  it("serves and updates project notes with read and operate scopes", async () => {
    const project = createTestProject();
    const notes: ProjectNotes = {
      projectId: project.id,
      doc: { type: "doc", content: [] },
      todos: [
        {
          id: "todo-1",
          text: "Review the panel",
          done: false,
          createdAt: "2026-07-23T00:00:00.000Z",
        },
      ],
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    vi.mocked(dbGetProject).mockReturnValue(project);
    vi.mocked(dbGetProjectNotes).mockReturnValue(notes);

    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();

    const readToken = await issueAccessToken(info, ["session:read"]);
    const readHeaders = {
      authorization: `Bearer ${readToken}`,
      "content-type": "application/json",
    };
    const getResponse = await fetch(
      new URL(`/api/projects/${project.id}/notes`, info.httpBaseUrl),
      { headers: readHeaders },
    );
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({ notes });

    const deniedWrite = await fetch(
      new URL(`/api/projects/${project.id}/notes`, info.httpBaseUrl),
      {
        method: "POST",
        headers: readHeaders,
        body: JSON.stringify(notes),
      },
    );
    expect(deniedWrite.status).toBe(403);

    const operateToken = await issueAccessToken({ ...info, pairingUrl: server.issuePairingUrl() }, [
      "session:operate",
    ]);
    const writeResponse = await fetch(
      new URL(`/api/projects/${project.id}/notes`, info.httpBaseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${operateToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(notes),
      },
    );
    expect(writeResponse.status).toBe(200);
    expect(dbSetProjectNotes).toHaveBeenCalledWith(notes);
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

  it("reads and modifies PR automation with read and operate scopes", async () => {
    let stored: PrWatch | null = null;
    const upsert = vi.fn<(input: PrWatchInput) => PrWatch>((input) => {
      stored = {
        ...input,
        lastCommentCursor: null,
        lastReviewCommentCursor: null,
        lastReviewCursor: null,
        lastCheckKey: null,
        activeThreadId: null,
        lastError: null,
      };
      return stored;
    });
    const remove = vi.fn<(projectId: string, prNumber: number) => void>(() => {
      stored = null;
    });
    const requestCheck = vi.fn<(projectId: string, prNumber: number) => void>();
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      prWatches: {
        get: () => stored,
        requestCheck,
        upsert,
        delete: remove,
      },
    });
    servers.push(server);
    const info = await server.start();

    const readToken = await issueAccessToken(info, ["session:read"]);
    const readHeaders = {
      authorization: `Bearer ${readToken}`,
      "content-type": "application/json",
    };
    const emptyResponse = await fetch(
      new URL("/api/pr-watches?projectId=project-1&prNumber=42", info.httpBaseUrl),
      { headers: readHeaders },
    );
    expect(emptyResponse.status).toBe(200);
    await expect(emptyResponse.json()).resolves.toEqual({ watch: null });

    const input: PrWatchInput = {
      projectId: "project-1",
      prNumber: 42,
      headBranch: "feature/mobile",
      worktreePath: "/repo/worktree",
      watchEnabled: true,
      autoMerge: true,
      agentKind: "codex",
      config: { model: "gpt-5.6-sol", effort: "high" },
    };
    const deniedWrite = await fetch(new URL("/api/pr-watches", info.httpBaseUrl), {
      method: "POST",
      headers: readHeaders,
      body: JSON.stringify(input),
    });
    expect(deniedWrite.status).toBe(403);

    const operateToken = await issueAccessToken({ ...info, pairingUrl: server.issuePairingUrl() }, [
      "session:operate",
    ]);
    const operateHeaders = {
      authorization: `Bearer ${operateToken}`,
      "content-type": "application/json",
    };
    const upsertResponse = await fetch(new URL("/api/pr-watches", info.httpBaseUrl), {
      method: "POST",
      headers: operateHeaders,
      body: JSON.stringify(input),
    });
    expect(upsertResponse.status).toBe(200);
    await expect(upsertResponse.json()).resolves.toMatchObject({
      watch: {
        projectId: "project-1",
        prNumber: 42,
        autoMerge: true,
      },
    });
    expect(upsert).toHaveBeenCalledWith(input);

    const checkResponse = await fetch(new URL("/api/pr-watches/check", info.httpBaseUrl), {
      method: "POST",
      headers: operateHeaders,
      body: JSON.stringify({ projectId: "project-1", prNumber: 42 }),
    });
    expect(checkResponse.status).toBe(200);
    expect(requestCheck).toHaveBeenCalledWith("project-1", 42);

    const deleteResponse = await fetch(new URL("/api/pr-watches", info.httpBaseUrl), {
      method: "DELETE",
      headers: operateHeaders,
      body: JSON.stringify({ projectId: "project-1", prNumber: 42 }),
    });
    expect(deleteResponse.status).toBe(200);
    expect(remove).toHaveBeenCalledWith("project-1", 42);
    expect(stored).toBeNull();
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
        return REMOTE_PROCEDURE_RESULT_FIXTURES[
          name as keyof typeof REMOTE_PROCEDURE_RESULT_FIXTURES
        ] as never;
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
    await expect(statusResponse.json()).resolves.toEqual({
      result: REMOTE_PROCEDURE_RESULT_FIXTURES.getGitStatus,
    });
    expect(calls).toContainEqual({ name: "getGitStatus", payload: { projectLocation } });

    const dispatchPayload = {
      projectLocation,
      workflowId: 12,
      ref: "main",
      inputs: { release: "true" },
    };
    const cancelPayload = { projectLocation, runId: 34 };
    const forwardedCalls = [
      {
        procedure: "ghListWorkflows",
        payload: { projectLocation },
      },
      {
        procedure: "ghDispatchWorkflow",
        payload: dispatchPayload,
      },
      {
        procedure: "ghCancelWorkflowRun",
        payload: cancelPayload,
      },
      {
        procedure: "rollbackThreadConversation",
        payload: {
          threadId: "thread-1",
          numTurns: 1,
          config: {
            model: "gpt-5.6-terra",
            approvalPolicy: "on-request",
            sandboxMode: "workspace-write",
          },
        },
      },
      {
        procedure: "listFileCheckpoints",
        payload: { threadId: "thread-1", projectLocation },
      },
      {
        procedure: "restoreFileCheckpoint",
        payload: { threadId: "thread-1", checkpointItemId: "user-2", projectLocation },
      },
      {
        procedure: "stageThreadInput",
        payload: { threadId: "thread-1", prompt: "selected element" },
      },
    ] as const;
    for (const call of forwardedCalls) {
      const response = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
        method: "POST",
        headers: fullHeaders,
        body: JSON.stringify(call),
      });
      expect(response.status).toBe(200);
      const result = REMOTE_PROCEDURE_RESULT_FIXTURES[call.procedure];
      await expect(response.json()).resolves.toEqual(result === undefined ? {} : { result });
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
    await expect(pushResponse.json()).resolves.toEqual({});
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

    const dispatchWithoutOperateResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${readToken}`, "content-type": "application/json" },
      body: JSON.stringify({ procedure: "ghDispatchWorkflow", payload: dispatchPayload }),
    });
    expect(dispatchWithoutOperateResponse.status).toBe(403);
    await expect(dispatchWithoutOperateResponse.json()).resolves.toMatchObject({
      error: { code: "missing_scope" },
    });
    expect(calls.filter((c) => c.name === "ghDispatchWorkflow")).toHaveLength(1);

    const cancelWithoutOperateResponse = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${readToken}`, "content-type": "application/json" },
      body: JSON.stringify({ procedure: "ghCancelWorkflowRun", payload: cancelPayload }),
    });
    expect(cancelWithoutOperateResponse.status).toBe(403);
    await expect(cancelWithoutOperateResponse.json()).resolves.toMatchObject({
      error: { code: "missing_scope" },
    });
    expect(calls.filter((c) => c.name === "ghCancelWorkflowRun")).toHaveLength(1);
  });

  it("rejects remote Git lifecycle mutations for experiment-owned branches and worktrees", async () => {
    persistTestExperiment();
    vi.mocked(dbGetProjects).mockReturnValue([createTestProject()]);
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
    const token = await issueAccessToken(info, ["session:read", "session:operate"]);
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const projectLocation = { kind: "posix", path: "/repo" } as const;
    const worktreeLocation = { kind: "posix", path: "/repo/one" } as const;
    const calls = [
      {
        procedure: "gitSwitchBranch",
        payload: {
          projectLocation: { kind: "posix", path: `${worktreeLocation.path}/./` },
          branch: "feature/other",
        },
      },
      {
        procedure: "gitDeleteBranch",
        payload: { projectLocation, branch: "poracode/experiment-one" },
      },
      {
        procedure: "gitRemoveWorktree",
        payload: { projectLocation, path: "/repo/one" },
      },
      {
        procedure: "gitRemoveWorktree",
        payload: {
          projectLocation: { kind: "windows", path: "/repo" },
          path: "/REPO/ONE",
          force: true,
        },
      },
      {
        procedure: "gitMergeToSource",
        payload: {
          projectLocation,
          worktreeLocation,
          worktreeBranch: "poracode/experiment-one",
          sourceBranch: "main",
        },
      },
      {
        procedure: "gitRevertAll",
        payload: { projectLocation: worktreeLocation },
      },
      {
        procedure: "gitRevertAll",
        payload: { projectLocation: { kind: "windows", path: worktreeLocation.path } },
      },
      {
        procedure: "writeProjectFile",
        payload: {
          projectLocation: worktreeLocation,
          path: "src/index.ts",
          content: "changed",
          baseModifiedAtMs: 0,
        },
      },
      {
        procedure: "gitPruneWorktrees",
        payload: { projectLocation, activeWorktreePaths: [] },
      },
      {
        procedure: "rollbackThreadConversation",
        payload: { threadId: "thread-1", numTurns: 1 },
      },
    ] as const;

    for (const call of calls) {
      const response = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(call),
      });
      const body = await response.json();
      expect(response.status, `${call.procedure}: ${JSON.stringify(body)}`).toBe(409);
      expect(body).toMatchObject({
        error: { code: "experiment_owned" },
      });
    }
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("fails closed for remote worktree mutations while candidate ownership has no path", async () => {
    const experiment = persistTestExperiment();
    delete experiment.candidates[0]!.worktreePath;
    dbSetState(
      "poracode-experiments-v1",
      JSON.stringify({ state: { experiments: { [experiment.id]: experiment } }, version: 1 }),
    );
    vi.mocked(dbGetProjects).mockReturnValue([createTestProject()]);
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
    const token = await issueAccessToken(info, ["session:read", "session:operate"]);
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const calls = [
      {
        procedure: "gitSwitchBranch",
        payload: {
          projectLocation: { kind: "posix", path: "/repo/recovered" },
          branch: "feature/other",
        },
      },
      {
        procedure: "gitRemoveWorktree",
        payload: {
          projectLocation: { kind: "posix", path: "/repo" },
          path: "/repo/recovered",
        },
      },
    ] as const;

    for (const call of calls) {
      const response = await fetch(new URL("/api/git/call", info.httpBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(call),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "experiment_owned" },
      });
    }
    expect(callSupervisor).not.toHaveBeenCalled();
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
      webPublicKey: vi.fn<() => Promise<string>>(async () => "vapid-public-key"),
      upsert: vi.fn<(registration: unknown) => void>(),
      remove: vi.fn<(deviceId: string, routing?: unknown) => void>(),
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
    const environment = await (
      await fetch(new URL("/.well-known/poracode/environment", info.httpBaseUrl))
    ).json();
    expect(environment).toMatchObject({ capabilities: { pushRouting: { versions: [1] } } });

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

    // session:operate → happy path (consumes the automatically rotated credential).
    const token = await issueAccessToken(server.getInfo()!, ["session:read", "session:operate"]);
    const configResponse = await fetch(new URL("/api/push/config", info.httpBaseUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(configResponse.status).toBe(200);
    await expect(configResponse.json()).resolves.toEqual({ publicKey: "vapid-public-key" });
    const registration = {
      deviceId: "device-abcdef",
      platform: "ios",
      deviceToken: "dev-token",
      activityTokens: { activity1: "act-token" },
      routing: {
        version: 1,
        clientConnectionId: "11111111-1111-4111-8111-111111111111",
        desktopId: "desktop-test",
      },
    };
    const registerResponse = await fetch(new URL("/api/push/register", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(registration),
    });
    expect(registerResponse.status).toBe(200);
    await expect(registerResponse.json()).resolves.toEqual({
      ok: true,
      routing: { version: 1 },
    });
    expect(pushRegistrations.upsert).toHaveBeenCalledWith(registration);

    const unregisterResponse = await fetch(new URL("/api/push/unregister", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId: "device-abcdef", routing: registration.routing }),
    });
    expect(unregisterResponse.status).toBe(200);
    expect(pushRegistrations.remove).toHaveBeenCalledWith("device-abcdef", registration.routing);
  });

  it("rejects a routed push registration bound to another desktop", async () => {
    const pushRegistrations = {
      webPublicKey: vi.fn<() => Promise<string>>(async () => "vapid-public-key"),
      upsert: vi.fn<(registration: unknown) => void>(),
      remove: vi.fn<(deviceId: string, routing?: unknown) => void>(),
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
    const token = await issueAccessToken(info, ["session:read", "session:operate"]);

    const response = await fetch(new URL("/api/push/register", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: "device-abcdef",
        platform: "ios",
        routing: {
          version: 1,
          clientConnectionId: "11111111-1111-4111-8111-111111111111",
          desktopId: "another-desktop",
        },
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "push_routing_desktop_mismatch" },
    });
    expect(pushRegistrations.upsert).not.toHaveBeenCalled();
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
