import { WebSocket } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { pickRemoteSettings, type RemoteSettings } from "@/shared/remote";
import { defaultSharedSettings } from "@/shared/settings";
import type { BrowserPanelManager } from "../browser";
import { dbDeleteThread, dbGetProjects, dbGetThreads, dbUpsertThread } from "../db";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";
import { RemoteBrowserGateway } from "./RemoteBrowserGateway";

vi.mock("../db", () => ({
  dbDeleteThread: vi.fn<(threadId: string) => void>(),
  dbGetProjects: vi.fn<() => unknown[]>(() => []),
  dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => null>(() => null),
  dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
  dbGetThreads: vi.fn<() => unknown[]>(() => []),
  dbUpsertThread: vi.fn<(thread: unknown, sortOrder: number) => void>(),
}));

const servers: RemoteAccessServer[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.dispose();
  }
  vi.mocked(dbDeleteThread).mockReset();
  vi.mocked(dbGetProjects).mockReset().mockReturnValue([]);
  vi.mocked(dbGetThreads).mockReset().mockReturnValue([]);
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

describe("RemoteAccessServer", () => {
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
      new URL("/.well-known/lightcode/environment", info.httpBaseUrl),
    );
    expect(descriptorResponse.status).toBe(200);
    await expect(descriptorResponse.json()).resolves.toMatchObject({
      desktopId: "desktop-test",
      label: "Test Desktop",
      appVersion: "1.0.0",
    });

    const pairingPageResponse = await fetch(info.pairingUrl);
    expect(pairingPageResponse.status).toBe(200);
    const pairingHtml = await pairingPageResponse.text();
    expect(pairingHtml).toContain("Lightcode Remote");
    expect(pairingHtml).toContain('rel="manifest"');

    const appResponse = await fetch(new URL("/app", info.httpBaseUrl));
    expect(appResponse.status).toBe(200);
    await expect(appResponse.text()).resolves.toContain("Lightcode Remote");

    const manifestResponse = await fetch(new URL("/manifest.webmanifest", info.httpBaseUrl));
    expect(manifestResponse.status).toBe(200);
    await expect(manifestResponse.json()).resolves.toMatchObject({
      name: "Lightcode",
      start_url: "/app",
      display: "standalone",
    });

    const serviceWorkerResponse = await fetch(new URL("/service-worker.js", info.httpBaseUrl));
    expect(serviceWorkerResponse.status).toBe(200);
    await expect(serviceWorkerResponse.text()).resolves.toContain("lightcode-remote-local");

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

  it("limits CORS to trusted origins", async () => {
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      pairingAppUrl: "https://mobile.lightcode.test/app",
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    const info = await server.start();
    const descriptorUrl = new URL("/.well-known/lightcode/environment", info.httpBaseUrl);

    const hostedResponse = await fetch(descriptorUrl, {
      headers: { origin: "https://mobile.lightcode.test" },
    });
    expect(hostedResponse.status).toBe(200);
    expect(hostedResponse.headers.get("access-control-allow-origin")).toBe(
      "https://mobile.lightcode.test",
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
    const token = await issueAccessToken(info, ["session:read", "session:operate"]);

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
          manifestPath: "/tmp/lightcode/workflows/wf_1.json",
          transcriptDir: "/tmp/lightcode/subagents/workflows/wf_1",
          includeAgentChats: true,
          location: { kind: "posix", path: "/tmp/example" },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: { run: null } });
    expect(callSupervisor).toHaveBeenCalledWith("workflowGetRun", {
      manifestPath: "/tmp/lightcode/workflows/wf_1.json",
      transcriptDir: "/tmp/lightcode/subagents/workflows/wf_1",
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
    expect(tokenResponse.status).toBe(200);
    const token = (await tokenResponse.json()) as { accessToken: string };
    const headers = {
      authorization: `Bearer ${token.accessToken}`,
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

    const doneResponse = await fetch(new URL("/api/threads/thread-1/command", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "set-done", done: true }),
    });
    expect(doneResponse.status).toBe(200);
    expect(dispatched[1]).toEqual({ kind: "set-done", threadId: "thread-1", done: true });
    expect(db.threads()[0]).toMatchObject({ done: true, starred: false });
    expect(callSupervisor).toHaveBeenCalledWith("closeThread", { threadId: "thread-1" });

    rendererAvailable = false;
    const archiveResponse = await fetch(
      new URL("/api/threads/thread-1/command", info.httpBaseUrl),
      { method: "POST", headers, body: JSON.stringify({ kind: "archive" }) },
    );
    expect(archiveResponse.status).toBe(200);
    expect(db.threads()[0]?.archived).toBe(true);

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
});
