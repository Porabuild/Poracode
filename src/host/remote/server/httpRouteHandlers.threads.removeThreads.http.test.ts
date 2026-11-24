import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import type { Project, RemoteThreadCommand } from "@/shared/contracts";
import {
  closeDatabase,
  dbGetThread,
  dbGetThreads,
  dbUpsertProject,
  dbUpsertThread,
  initDatabase,
} from "@/host/db";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

const servers: RemoteAccessServer[] = [];

const PROJECT: Project = {
  id: "proj-http-bulk",
  name: "Bulk Removal Project",
  location: { kind: "posix", path: "/repo/bulk" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

async function exchangePairingUrl(pairingUrl: string): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read", "session:operate"],
      client: { label: "Bulk removal HTTP test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function openSocket(
  info: RemoteAccessServerInfo,
  token: string,
): Promise<{ ws: WebSocket; read: () => Promise<Record<string, unknown>> }> {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(ticketResponse.status).toBe(200);
  const { ticket } = (await ticketResponse.json()) as { ticket: string };
  const wsUrl = new URL("/ws", info.wsBaseUrl);
  wsUrl.searchParams.set("ticket", ticket);
  const ws = new WebSocket(wsUrl);
  const queue: Array<Record<string, unknown>> = [];
  const waiters: Array<(value: Record<string, unknown>) => void> = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  const read = () =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const queued = queue.shift();
      if (queued) {
        resolve(queued);
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for websocket message")),
        10_000,
      );
      waiters.push((value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  expect(await read()).toMatchObject({ type: "ready" });
  return { ws, read };
}

describe.skipIf(!sqliteAvailable)("remove-threads HTTP route and capability advertisement", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  const dispatchThreadCommand =
    vi.fn<NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>>();

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-http-remove-threads-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(PROJECT, 0);
    dispatchThreadCommand.mockReset();
    dispatchThreadCommand.mockReturnValue(true);

    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-bulk-http", label: "Bulk HTTP desktop" },
      host: "127.0.0.1",
      port: 0,
      dispatchThreadCommand,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((instance) => instance.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("advertises bulkThreadRemoval v1 on /.well-known/poracode/environment", async () => {
    const response = await fetch(new URL("/.well-known/poracode/environment", info.httpBaseUrl), {
      headers: {
        authorization: `Bearer ${token}`,
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      capabilities?: { bulkThreadRemoval?: { versions?: number[] } };
    };
    expect(body.capabilities?.bulkThreadRemoval).toEqual({ versions: [1] });
  });

  it("executes archive and delete remove-threads over POST /api/threads/:id/command and broadcasts all threadIds", async () => {
    dbUpsertThread(
      { ...testThread(), id: "t1", projectId: PROJECT.id, status: "idle", attention: "none" },
      0,
    );
    dbUpsertThread(
      { ...testThread(), id: "t2", projectId: PROJECT.id, status: "idle", attention: "none" },
      1,
    );
    dbUpsertThread(
      { ...testThread(), id: "t3", projectId: PROJECT.id, status: "idle", attention: "none" },
      2,
    );

    const { ws, read } = await openSocket(info, token);
    try {
      const archiveCommand: RemoteThreadCommand = {
        kind: "remove-threads",
        threadId: "t1",
        threadIds: ["t1", "t2"],
        action: "archive",
      };
      const archiveRes = await fetch(new URL("/api/threads/t1/command", info.httpBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
        },
        body: JSON.stringify(archiveCommand),
      });
      expect(archiveRes.status).toBe(200);
      expect(await archiveRes.json()).toEqual({ ok: true });
      expect(dbGetThread("t1")?.archived).toBe(true);
      expect(dbGetThread("t2")?.archived).toBe(true);
      expect(dbGetThread("t3")?.archived).toBe(false);
      expect(dispatchThreadCommand).toHaveBeenCalledWith(archiveCommand);

      const archiveEvent = await read();
      expect(archiveEvent).toMatchObject({
        type: "event",
        event: {
          type: "remote-threads-changed",
          threadIds: ["t1", "t2"],
        },
      });

      const deleteCommand: RemoteThreadCommand = {
        kind: "remove-threads",
        threadId: "t1",
        threadIds: ["t1", "t2"],
        action: "delete",
      };
      const deleteRes = await fetch(new URL("/api/threads/t1/command", info.httpBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
        },
        body: JSON.stringify(deleteCommand),
      });
      expect(deleteRes.status).toBe(200);
      expect(await deleteRes.json()).toEqual({ ok: true });
      expect(dbGetThreads().map((thread) => thread.id)).toEqual(["t3"]);
      expect(dispatchThreadCommand).toHaveBeenCalledWith(deleteCommand);

      const deleteEvent = await read();
      expect(deleteEvent).toMatchObject({
        type: "event",
        event: {
          type: "remote-threads-changed",
          threadIds: ["t1", "t2"],
        },
      });
    } finally {
      ws.close();
    }
  });
});
