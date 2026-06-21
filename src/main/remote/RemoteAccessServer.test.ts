import { WebSocket } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { pickRemoteSettings, type RemoteSettings } from "@/shared/remote";
import { defaultSharedSettings } from "@/shared/settings";
import type { BrowserPanelManager } from "../browser";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";
import { RemoteBrowserGateway } from "./RemoteBrowserGateway";

vi.mock("../db", () => ({
  dbGetProjects: vi.fn<() => unknown[]>(() => []),
  dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
  dbGetThreadContextUsage: vi.fn<() => null>(() => null),
  dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
  dbGetThreads: vi.fn<() => unknown[]>(() => []),
}));

const servers: RemoteAccessServer[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.dispose();
  }
});

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

  it("forwards thread commands to the renderer dispatcher", async () => {
    const dispatched: unknown[] = [];
    let rendererAvailable = true;
    const server = new RemoteAccessServer({
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
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

    const doneResponse = await fetch(new URL("/api/threads/thread-1/command", info.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "set-done", done: true }),
    });
    expect(doneResponse.status).toBe(200);
    expect(dispatched[1]).toEqual({ kind: "set-done", threadId: "thread-1", done: true });

    rendererAvailable = false;
    const unavailableResponse = await fetch(
      new URL("/api/threads/thread-1/command", info.httpBaseUrl),
      { method: "POST", headers, body: JSON.stringify({ kind: "archive" }) },
    );
    expect(unavailableResponse.status).toBe(503);
    await expect(unavailableResponse.json()).resolves.toMatchObject({
      error: { code: "desktop_unavailable" },
    });
  });

  it("serves browser state/commands and streams mirror status to watchers", async () => {
    const navigated: unknown[] = [];
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
