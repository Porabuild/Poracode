import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import { RemoteAuthStore } from "./auth";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "./RemoteAccessServer";
import type { RemoteAuditEvent } from "./server/auditLog";

const servers: RemoteAccessServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

type ProjectWatches = NonNullable<RemoteAccessServerOptions["projectWatches"]>;

function fixture(overrides: Partial<RemoteAccessServerOptions> = {}) {
  let failPersist = false;
  const authStore = new RemoteAuthStore({
    onPersistedStateChanged: () => {
      if (failPersist) throw new Error("remote-access-auth.json: disk full");
    },
  });
  const audits: RemoteAuditEvent[] = [];
  const releaseOwner = vi.fn<ProjectWatches["releaseOwner"]>(async () => {});
  const projectWatches = {
    watchProject: vi.fn<ProjectWatches["watchProject"]>(async () => {}),
    setWorktrees: vi.fn<ProjectWatches["setWorktrees"]>(async () => {}),
    unwatchProject: vi.fn<ProjectWatches["unwatchProject"]>(async () => {}),
    pinWorktree: vi.fn<ProjectWatches["pinWorktree"]>(async () => {}),
    unpinWorktree: vi.fn<ProjectWatches["unpinWorktree"]>(async () => {}),
    releaseOwner,
  };
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-revoke", label: "Revoke Host" },
    host: "127.0.0.1",
    port: 0,
    authStore,
    audit: {
      record: (event) => {
        audits.push(event);
      },
      rotate: () => {},
    },
    projectWatches,
    callSupervisor: (async (name: string) =>
      name === "getThreadSnapshots"
        ? []
        : undefined) as RemoteAccessServerOptions["callSupervisor"],
    ...overrides,
  });
  servers.push(server);
  return {
    server,
    audits,
    releaseOwner,
    failPersistence: () => {
      failPersist = true;
    },
  };
}

async function pairWithSocket(
  info: RemoteAccessServerInfo,
): Promise<{ accessToken: string; refreshToken: string; sessionId: string; socket: WebSocket }> {
  const pairing = new URL(info.pairingUrl);
  const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential: new URLSearchParams(pairing.hash.slice(1)).get("token"),
      scopes: ["session:read", "session:operate"],
      client: { label: "Paired phone", deviceType: "mobile" },
    }),
  });
  expect(tokenResponse.status).toBe(200);
  const token = (await tokenResponse.json()) as {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  };
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token.accessToken}`,
      [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
    },
  });
  expect(ticketResponse.status).toBe(200);
  const { ticket } = (await ticketResponse.json()) as { ticket: string };
  const url = new URL("/ws", info.wsBaseUrl);
  url.searchParams.set("ticket", ticket);
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  return { ...token, socket };
}

function closeOf(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

async function bearerStatus(info: RemoteAccessServerInfo, accessToken: string): Promise<number> {
  const response = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
    },
  });
  return response.status;
}

describe("RemoteAccessServer.revokeAccessSession teardown", () => {
  it("audits refresh reuse and preserves its 401 when revocation cannot persist", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { server, audits, failPersistence } = fixture();
      const info = await server.start();
      const paired = await pairWithSocket(info);
      const refresh = () =>
        fetch(new URL("/oauth/token", info.httpBaseUrl), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ grantType: "refresh_token", refreshToken: paired.refreshToken }),
        });
      expect((await refresh()).status).toBe(200);
      const closed = closeOf(paired.socket);
      failPersistence();

      const reused = await refresh();
      expect(reused.status).toBe(401);
      expect(await reused.json()).toMatchObject({ error: { code: "refresh_token_reused" } });
      await expect(closed).resolves.toMatchObject({ code: 1008 });
      expect(audits.filter((event) => event.kind === "refresh_reuse")).toMatchObject([
        { sessionId: paired.sessionId },
      ]);
      expect(warned).toHaveBeenCalled();
    } finally {
      warned.mockRestore();
    }
  });

  it("tears every live grant down and still reports a failed durable revocation", async () => {
    const { server, audits, releaseOwner, failPersistence } = fixture();
    const info = await server.start();
    const paired = await pairWithSocket(info);
    const closed = closeOf(paired.socket);
    failPersistence();

    expect(() => server.revokeAccessSession(paired.sessionId)).toThrow(/disk full/);

    await expect(closed).resolves.toEqual({ code: 1008, reason: "Remote access session revoked" });
    expect(releaseOwner).toHaveBeenCalledExactlyOnceWith(`session:${paired.sessionId}`);
    expect(await bearerStatus(info, paired.accessToken)).toBe(401);
    // Not confirmed durable, so no revoke audit line claims it was.
    expect(audits.filter((event) => event.kind === "revoke")).toEqual([]);
  });

  it("runs the remaining teardown when one live grant fails, then surfaces that failure", async () => {
    const portTeardown = new Error("port forward tickets unavailable");
    const { server, audits, releaseOwner } = fixture({
      portForward: {
        revokeSessionTickets: () => {
          throw portTeardown;
        },
      } as unknown as NonNullable<RemoteAccessServerOptions["portForward"]>,
    });
    const info = await server.start();
    const paired = await pairWithSocket(info);
    const closed = closeOf(paired.socket);

    expect(() => server.revokeAccessSession(paired.sessionId)).toThrow(portTeardown);

    await expect(closed).resolves.toMatchObject({ code: 1008 });
    expect(releaseOwner).toHaveBeenCalledExactlyOnceWith(`session:${paired.sessionId}`);
    expect(audits.filter((event) => event.kind === "revoke")).toHaveLength(1);
  });

  it("revokes, audits and releases on the normal path, and reports unknown sessions", async () => {
    const { server, audits, releaseOwner } = fixture();
    const info = await server.start();
    const paired = await pairWithSocket(info);
    const closed = closeOf(paired.socket);

    expect(server.revokeAccessSession(paired.sessionId)).toBe(true);

    await expect(closed).resolves.toMatchObject({ code: 1008 });
    expect(releaseOwner).toHaveBeenCalledExactlyOnceWith(`session:${paired.sessionId}`);
    expect(audits.filter((event) => event.kind === "revoke")).toHaveLength(1);
    expect(server.revokeAccessSession(paired.sessionId)).toBe(false);
    expect(releaseOwner).toHaveBeenCalledOnce();
  });
});
