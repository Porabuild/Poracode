import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, vi } from "vitest";
import {
  closeDatabase,
  initDatabase,
  attachRuntimePersistenceDurableGapFromCurrentConnection,
} from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, testThread } from "@/host/db/runtimeItems.testFixtures";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "../RemoteAccessServer";

let server: RemoteAccessServer | undefined;
let directory: string | undefined;
export async function cleanupRuntimePresentationFixture() {
  await server?.dispose();
  server = undefined;
  closeDatabase();
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
}

export async function startRuntimePresentationFixture(scopes = ["session:read"]) {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  directory = mkdtempSync(join(tmpdir(), "poracode-presentations-"));
  initDatabase(join(directory, "state.sqlite"));
  attachRuntimePersistenceDurableGapFromCurrentConnection();
  dbUpsertProject(
    {
      id: "project-1",
      name: "Project",
      location: { kind: "posix", path: "/tmp/project" },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    0,
  );
  dbUpsertThread(testThread(), 0);
  server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "test",
    identity: { desktopId: "presentation-http", label: "Presentation" },
    host: "127.0.0.1",
    port: 0,
    webSocketHeartbeatIntervalMs: 0,
    ownsSupervisorPersistence: false,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never),
  });
  const info = await server.start();
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes,
      client: { label: "presentation-http", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  const { accessToken } = (await response.json()) as { accessToken: string };
  return { base: info.httpBaseUrl, token: accessToken };
}

export function seedRuntimePresentationItem(
  itemId: string,
  type: string,
  payload: unknown,
  threadId = "thread-1",
) {
  getSqlite()
    .prepare(
      "INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload) VALUES (?, ?, ?, ?, 'completed', ?)",
    )
    .run(threadId, itemId, 1, type, JSON.stringify(payload));
}

export function postRuntimePresentationRead(
  base: string,
  token: string | undefined,
  items: unknown[],
  query = "notices=v1",
  threadId = "thread-1",
  version = 1,
) {
  return fetch(new URL(`/api/threads/${threadId}/item-presentations?${query}`, base), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ version, items }),
  });
}
