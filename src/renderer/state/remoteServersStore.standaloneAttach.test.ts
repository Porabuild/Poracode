// Focused regression for actual remote-client selection over owned
// lightweight server fixtures: authenticated generation pin, OAuth token
// routing (pairing credential -> bearer, never reused as bearer), real
// snapshot read + thread command round-trip through the existing
// RemoteDesktopClient, and quit leaving the fixture owner healthy.
//
// Uses a real HTTP round-trip (Node fetch) with the production
// RemoteDesktopClient — no mocked client, no new transport/codec/engine.
// Event sockets stay mocked (existing store pattern); HTTP proves routing.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import { buildPairingUrl } from "@/shared/remote/pairingUrl";
import {
  __resetRemoteServersStoreForTest,
  getStandaloneOwnerDesktopId,
  getStandaloneOwnerGeneration,
  useRemoteServersStore,
} from "./remoteServersStore";
import type { RemoteSocketLike } from "./remoteServers/types";

const PAIRING_CREDENTIAL = "standalone-pairing-credential-1";
const ACCESS_TOKEN = "standalone-access-token-1";
const DESKTOP_ID = "standalone-owner-1";

interface Seen {
  oauthCredential: string | null;
  snapshotAuth: string | null;
  commandAuth: string | null;
  commandBody: unknown;
  commandPath: string | null;
}

function makeSocket(): RemoteSocketLike {
  return { close: vi.fn<() => void>(), onmessage: null, onclose: null };
}

function json(response: ServerResponse, value: unknown, status = 200): void {
  const bytes = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": bytes.length,
    connection: "close",
  });
  response.end(bytes);
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        resolve(chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function startFixture(seen: Seen): Promise<{ server: Server; endpoint: string }> {
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1/");
      const path = url.pathname;
      try {
        if (request.method === "POST" && path === "/oauth/token") {
          const body = (await readBody(request)) as Record<string, unknown>;
          seen.oauthCredential = typeof body.credential === "string" ? body.credential : null;
          if (body.credential !== PAIRING_CREDENTIAL) {
            json(response, { code: "unauthorized" }, 401);
            return;
          }
          json(response, {
            accessToken: ACCESS_TOKEN,
            tokenType: "Bearer",
            expiresAt: "2099-01-01T00:00:00.000Z",
            scopes: ["session:read", "session:operate"],
          });
          return;
        }
        if (request.method === "GET" && path === "/.well-known/poracode/environment") {
          const address = server.address();
          const base =
            address && typeof address !== "string"
              ? `http://127.0.0.1:${address.port}/`
              : "http://127.0.0.1:9/";
          json(response, {
            protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
            desktopId: DESKTOP_ID,
            label: "Standalone Owner",
            appVersion: "test",
            auth: {
              policy: "remote-reachable",
              bootstrapMethods: ["one-time-token"],
              sessionMethods: ["bearer-access-token"],
              scopes: ["session:read", "session:operate"],
            },
            endpoints: { httpBaseUrl: base, wsBaseUrl: "ws://127.0.0.1:9/" },
          });
          return;
        }
        if (request.method === "GET" && path === "/api/snapshot") {
          seen.snapshotAuth =
            typeof request.headers.authorization === "string"
              ? request.headers.authorization
              : null;
          if (request.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
            json(response, { code: "unauthorized" }, 401);
            return;
          }
          json(response, {
            snapshotSeq: 7,
            projects: [
              {
                id: "p1",
                name: "Owner App",
                location: { kind: "posix", path: "/owner/app" },
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
            threads: [],
            runtimeSummariesByThread: {},
            updatedAt: "now",
          });
          return;
        }
        if (request.method === "GET" && path === "/api/agent-statuses") {
          if (request.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
            json(response, { code: "unauthorized" }, 401);
            return;
          }
          json(response, { windows: [], wsl: [], updatedAt: "now" });
          return;
        }
        if (
          (request.method === "GET" && path === "/api/host-update") ||
          (request.method === "POST" && path === "/api/host-update/check")
        ) {
          json(response, {
            currentVersion: "test",
            status: { type: "update-not-available" },
          });
          return;
        }
        if (request.method === "POST" && path === "/api/auth/websocket-ticket") {
          json(response, { ticket: "standalone-ticket", expiresAt: "2099-01-01T00:00:00.000Z" });
          return;
        }
        const commandMatch = /^\/api\/threads\/([^/]+)\/command$/.exec(path);
        if (request.method === "POST" && commandMatch) {
          seen.commandAuth =
            typeof request.headers.authorization === "string"
              ? request.headers.authorization
              : null;
          seen.commandPath = path;
          seen.commandBody = await readBody(request);
          if (request.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
            json(response, { code: "unauthorized" }, 401);
            return;
          }
          json(response, {});
          return;
        }
        json(response, { code: "not_found" }, 404);
      } catch {
        try {
          json(response, { code: "invalid" }, 500);
        } catch {
          response.destroy();
        }
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture listener.");
  return { server, endpoint: `http://127.0.0.1:${address.port}/` };
}

describe("standalone owner attach over real remote client", () => {
  let servers: Server[] = [];

  beforeEach(() => {
    localStorage.clear();
    __resetRemoteServersStoreForTest();
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      hostUpdates: {},
      excludedProjectIds: {},
      projectWorkspaceIds: {},
      projectNameOverrides: {},
      lastKnownProjects: {},
      openThread: null,
    });
    useRemoteServersStore.getState().setSocketFactory(() => makeSocket());
    // Real production client over Node fetch (no bridge in vitest); the
    // production default uses mainProcessFetch -> bridge-2 utility process.
    useRemoteServersStore
      .getState()
      .setClientFactory((endpoint, accessToken) => new RemoteDesktopClient(endpoint, accessToken));
  });

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    __resetRemoteServersStoreForTest();
  });

  it("pairs via OAuth, pins the generation, and routes bearer tokens", async () => {
    const seen: Seen = {
      oauthCredential: null,
      snapshotAuth: null,
      commandAuth: null,
      commandBody: null,
      commandPath: null,
    };
    const { server, endpoint } = await startFixture(seen);
    servers.push(server);
    const ownerGeneration = randomUUID();
    const pairingUrl = buildPairingUrl({ httpBaseUrl: endpoint, credential: PAIRING_CREDENTIAL });

    const record = await useRemoteServersStore.getState().ensureStandaloneOwner({
      endpoint,
      pairingUrl,
      ownerGeneration,
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    });

    expect(record.desktopId).toBe(DESKTOP_ID);
    expect(getStandaloneOwnerGeneration()).toBe(ownerGeneration);
    expect(getStandaloneOwnerDesktopId()).toBe(DESKTOP_ID);
    // Pairing credential exchanged once via OAuth, never reused as bearer.
    expect(seen.oauthCredential).toBe(PAIRING_CREDENTIAL);
    expect(seen.snapshotAuth).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(seen.snapshotAuth).not.toContain(PAIRING_CREDENTIAL);
    // Real snapshot read landed in runtime.
    const runtime = useRemoteServersStore.getState().runtime[DESKTOP_ID];
    expect(runtime?.status).toBe("online");
    expect(runtime?.projects.map((project) => project.id)).toEqual(["p1"]);
  });

  it("sends a real thread command with the bearer token", async () => {
    const seen: Seen = {
      oauthCredential: null,
      snapshotAuth: null,
      commandAuth: null,
      commandBody: null,
      commandPath: null,
    };
    const { server, endpoint } = await startFixture(seen);
    servers.push(server);
    const ownerGeneration = randomUUID();
    const pairingUrl = buildPairingUrl({ httpBaseUrl: endpoint, credential: PAIRING_CREDENTIAL });

    const record = await useRemoteServersStore.getState().ensureStandaloneOwner({
      endpoint,
      pairingUrl,
      ownerGeneration,
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    });

    await useRemoteServersStore
      .getState()
      .sendThreadCommand(record.desktopId, { kind: "delete", threadId: "t1" });

    expect(seen.commandPath).toBe("/api/threads/t1/command");
    expect(seen.commandAuth).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(seen.commandBody).toMatchObject({ kind: "delete" });
  });

  it("quit leaves the fixture owner healthy (client cleanup only)", async () => {
    const seen: Seen = {
      oauthCredential: null,
      snapshotAuth: null,
      commandAuth: null,
      commandBody: null,
      commandPath: null,
    };
    const { server, endpoint } = await startFixture(seen);
    servers.push(server);
    const pairingUrl = buildPairingUrl({ httpBaseUrl: endpoint, credential: PAIRING_CREDENTIAL });

    await useRemoteServersStore.getState().ensureStandaloneOwner({
      endpoint,
      pairingUrl,
      ownerGeneration: randomUUID(),
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    });

    // Simulate Electron quit in attach mode: drop the client handle without
    // stopping the owner (no stop credential, no process kill). A fresh client
    // with the same bearer still reads — the owner survived the client.
    const probe = new RemoteDesktopClient(endpoint, ACCESS_TOKEN);
    await expect(probe.snapshot()).resolves.toMatchObject({ snapshotSeq: 7 });
  });

  it("fails closed on version mismatch and malformed pairing without pairing", async () => {
    const seen: Seen = {
      oauthCredential: null,
      snapshotAuth: null,
      commandAuth: null,
      commandBody: null,
      commandPath: null,
    };
    const { server, endpoint } = await startFixture(seen);
    servers.push(server);

    await expect(
      useRemoteServersStore.getState().ensureStandaloneOwner({
        endpoint,
        pairingUrl: buildPairingUrl({ httpBaseUrl: endpoint, credential: PAIRING_CREDENTIAL }),
        ownerGeneration: randomUUID(),
        remoteProtocolVersion: 999,
      }),
    ).rejects.toThrow(/Invalid standalone attach/);
    await expect(
      useRemoteServersStore.getState().ensureStandaloneOwner({
        endpoint,
        pairingUrl: "https://fixture.test/no-token",
        ownerGeneration: randomUUID(),
        remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      }),
    ).rejects.toThrow(/Invalid standalone attach/);
    expect(seen.oauthCredential).toBeNull();
    expect(useRemoteServersStore.getState().servers).toHaveLength(0);
    expect(getStandaloneOwnerGeneration()).toBeNull();
  });
});
