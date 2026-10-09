import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createSidebarTransportPolicy } from "./transportPolicy";
import { createSecureRemoteServersStorage } from "@/renderer/state/remoteServers/secureStorage";
import {
  setDesktopToken,
  __resetTokenVaultForTest,
} from "@/renderer/state/remoteServers/tokenVault";
import {
  hydrateRefreshTokens,
  refreshTokenForDesktop,
  writeRefreshTokenToVault,
} from "@/renderer/state/remoteServers/refreshTokens";
import type { RemoteFetch } from "@/shared/remote/client";
import type { RemoteServerRecord, RemoteSocketLike } from "@/renderer/state/remoteServers/types";

const endpoint = "http://127.0.0.1:43210/";
const bootstrap = { endpoint, pairingUrl: `${endpoint}pair#token=once` };
const proof = { version: 1, session: "a".repeat(64), endpoint };
const tokens = {
  accessToken: "fresh-access",
  refreshToken: "fresh-refresh",
  tokenType: "Bearer",
  expiresAt: "2099-01-01T00:00:00.000Z",
  scopes: ["session:read"],
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
let descriptor: unknown;
let policy: ReturnType<typeof createSidebarTransportPolicy>;
let fetchPeer: ReturnType<typeof vi.fn<RemoteFetch>>;
let ask: ReturnType<typeof vi.fn<(cmd: string) => Promise<unknown>>>;
let openSocket: ReturnType<typeof vi.fn<(url: string) => RemoteSocketLike>>;
beforeEach(() => {
  descriptor = null;
  ask = vi.fn<(cmd: string) => Promise<unknown>>(async () => descriptor);
  fetchPeer = vi.fn<RemoteFetch>(async (url) => {
    if (new URL(url).pathname === "/oauth/token") return json(tokens);
    if (new URL(url).pathname === "/api/auth/websocket-ticket")
      return json({ ticket: "fresh-ticket", expiresAt: tokens.expiresAt });
    return json({});
  });
  openSocket = vi.fn<(url: string) => RemoteSocketLike>(() => ({
    close: vi.fn<() => void>(),
    onclose: null,
    onmessage: null,
  }));
  policy = createSidebarTransportPolicy(ask, fetchPeer, openSocket);
});
afterEach(() => {
  policy.retire();
  vi.restoreAllMocks();
});
async function pair() {
  descriptor = proof;
  await policy.authorize(bootstrap);
  await policy.client(endpoint).exchangePairingCredential({ credential: "once" });
  return policy.client(endpoint, tokens.accessToken);
}

it("hydrates actual encrypted pre-upgrade vault records without dispatching saved access or refresh to a hostile peer", async () => {
  localStorage.clear();
  __resetTokenVaultForTest();
  const records: RemoteServerRecord[] = [endpoint, "http://127.0.0.1:43211/"].map((url, i) => ({
    desktopId: `saved-${i}`,
    connectionId: `saved-${i}`,
    label: "Saved",
    endpoint: url,
    accessToken: "",
    scopes: [],
    transport: { kind: "direct" },
  }));
  for (const server of records) {
    await setDesktopToken(server.desktopId, `old-access-${server.desktopId}`);
    await writeRefreshTokenToVault(
      { kind: "connection", connectionId: server.desktopId },
      `old-refresh-${server.desktopId}`,
    );
  }
  localStorage.setItem(
    "poracode-remote-servers",
    JSON.stringify({ state: { servers: records }, version: 2 }),
  );
  const storage = createSecureRemoteServersStorage((servers) => ({ servers }));
  const saved = await storage.getItem("poracode-remote-servers");
  await hydrateRefreshTokens({
    subjects: records.map((s) => ({ kind: "connection", connectionId: s.desktopId })),
  });
  expect(saved?.state.servers[0]?.accessToken).toBe("old-access-saved-0");
  expect(refreshTokenForDesktop("saved-0")).toBe("old-refresh-saved-0");
  fetchPeer.mockResolvedValue(json({ error: "unauthorized" }, 401));
  const clients = saved!.state.servers.map((server) => {
    const client = policy.client(server.endpoint, server.accessToken);
    client.setTokenLifecycle({
      refreshToken: () => refreshTokenForDesktop(server.desktopId),
      onTokensRefreshed: vi.fn<() => void>(),
    });
    return client;
  });
  for (const client of clients) {
    await expect(client.environment()).rejects.toMatchObject({ status: 0, code: "network" });
    await expect(client.snapshot()).rejects.toMatchObject({ status: 0, code: "network" });
    await expect(client.refreshTokens()).rejects.toMatchObject({ status: 0, code: "network" });
    await expect(client.websocketTicket()).rejects.toMatchObject({ status: 0, code: "network" });
  }
  expect(fetchPeer).not.toHaveBeenCalled();
  // Current proof and a new exchange still cannot lend authority to restored clients.
  fetchPeer.mockImplementation(async () => json(tokens));
  await pair();
  fetchPeer.mockClear();
  for (const client of clients)
    await expect(client.environment()).rejects.toMatchObject({ status: 0, code: "network" });
  const sameEndpoint = policy.client(endpoint, "old-access-saved-0");
  await expect(sameEndpoint.websocketTicket()).rejects.toMatchObject({
    status: 0,
    code: "network",
  });
  expect(fetchPeer).not.toHaveBeenCalled();
});

it("admits only the current endpoint's fresh pairing and checks a read-only descriptor per dispatch", async () => {
  const client = await pair();
  await client.websocketTicket();
  await policy.socket(client.websocketUrl("fresh-ticket", 0));
  expect(openSocket).toHaveBeenCalledOnce();
  expect(fetchPeer.mock.calls[0]?.[1]?.headers?.authorization).toBeUndefined();
  expect(JSON.parse(fetchPeer.mock.calls[0]?.[1]?.body as string)).toMatchObject({
    credential: "once",
    grantType: "pairing-token",
  });
  expect(fetchPeer.mock.calls[1]?.[1]?.headers?.authorization).toBe(`Bearer ${tokens.accessToken}`);
  expect(ask.mock.calls.every(([cmd]) => cmd === "getChatConnection")).toBe(true);
  const before = fetchPeer.mock.calls.length;
  await expect(
    policy.client("http://127.0.0.1:43211/", tokens.accessToken).environment(),
  ).rejects.toMatchObject({ status: 0, code: "network" });
  expect(fetchPeer).toHaveBeenCalledTimes(before);
});

it("denies cached clients, refresh and unspent event tickets after loss, and permanently retires old clients after reproof", async () => {
  const client = await pair();
  client.setTokenLifecycle({
    refreshToken: () => tokens.refreshToken,
    onTokensRefreshed: vi.fn<() => void>(),
  });
  await client.websocketTicket();
  const socket = await policy.socket(client.websocketUrl("fresh-ticket", 0));
  const closed = vi.spyOn(socket, "close");
  await client.websocketTicket();
  descriptor = null;
  fetchPeer.mockClear();
  await expect(client.environment()).rejects.toMatchObject({ status: 0, code: "network" });
  expect(closed).toHaveBeenCalledOnce();
  await expect(client.refreshTokens()).rejects.toMatchObject({ status: 0, code: "network" });
  await expect(policy.socket(client.websocketUrl("fresh-ticket", 0))).rejects.toMatchObject({
    status: 0,
    code: "network",
  });
  expect(fetchPeer).not.toHaveBeenCalled();
  expect(openSocket).toHaveBeenCalledOnce();
  await pair();
  fetchPeer.mockClear();
  await expect(client.websocketTicket()).rejects.toMatchObject({ status: 0, code: "network" });
  expect(fetchPeer).not.toHaveBeenCalled();
});

it("rechecks proof after a 401 so a disconnected peer never receives the refresh grant", async () => {
  const client = await pair();
  client.setTokenLifecycle({
    refreshToken: () => tokens.refreshToken,
    onTokensRefreshed: vi.fn<() => void>(),
  });
  fetchPeer.mockImplementation(async () => {
    descriptor = null;
    return json({ error: "unauthorized" }, 401);
  });
  fetchPeer.mockClear();
  await expect(client.environment()).rejects.toMatchObject({ status: 401 });
  expect(fetchPeer).toHaveBeenCalledOnce();
  expect(fetchPeer.mock.calls[0]?.[1]?.body).toBeUndefined();
  await expect(client.refreshTokens()).rejects.toMatchObject({ status: 0, code: "network" });
  expect(fetchPeer).toHaveBeenCalledOnce();
});

it("rotates only this grant's refresh token and admits the resulting new bearer", async () => {
  const client = await pair();
  client.setTokenLifecycle({
    refreshToken: () => "saved-refresh",
    onTokensRefreshed: vi.fn<() => void>(),
  });
  fetchPeer.mockClear();
  await expect(client.refreshTokens()).rejects.toMatchObject({ status: 0, code: "network" });
  expect(fetchPeer).not.toHaveBeenCalled();
  const refreshed = vi.fn<() => void>();
  client.setTokenLifecycle({
    refreshToken: () => tokens.refreshToken,
    onTokensRefreshed: refreshed,
  });
  fetchPeer.mockResolvedValueOnce(
    json({ ...tokens, accessToken: "rotated-access", refreshToken: "rotated-refresh" }),
  );
  await client.refreshTokens();
  expect(refreshed).toHaveBeenCalledWith(
    expect.objectContaining({ accessToken: "rotated-access" }),
  );
  await policy.client(endpoint, "rotated-access").websocketTicket();
  expect(fetchPeer.mock.calls.at(-1)?.[1]?.headers?.authorization).toBe("Bearer rotated-access");
});

it.each([
  null,
  { ...proof, session: "b".repeat(64) },
  { ...proof, endpoint: "http://127.0.0.1:43211/" },
  { ...proof, version: 0 },
])("denies a ticket opening after worker authority changes: %j", async (changed) => {
  const client = await pair();
  await client.websocketTicket();
  descriptor = changed;
  await expect(policy.socket(client.websocketUrl("fresh-ticket", 0))).rejects.toMatchObject({
    status: 0,
    code: "network",
  });
  expect(openSocket).not.toHaveBeenCalled();
});

it("fences a pending proof result against retirement", async () => {
  const client = await pair();
  const pending = Promise.withResolvers<unknown>();
  ask.mockReturnValueOnce(pending.promise);
  fetchPeer.mockClear();
  const request = client.websocketTicket();
  await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(3));
  policy.retire();
  pending.resolve(proof);
  await expect(request).rejects.toMatchObject({ status: 0, code: "network" });
  expect(fetchPeer).not.toHaveBeenCalled();
});
