import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, closeDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { dbReplaceThreadRuntimeItems } from "@/host/db/runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";

describe.skipIf(!sqliteAvailable)("conversation search HTTP boundary", () => {
  let directory: string;
  let server: RemoteAccessServer;
  let info: RemoteAccessServerInfo;
  let token: string;
  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-search-http-"));
    initDatabase(join(directory, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Project",
        location: { kind: "posix", path: directory },
        createdAt: "2026-01-01",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), status: "idle", attention: "none", archived: true }, 0);
    await dbReplaceThreadRuntimeItems(
      "thread-1",
      Array.from({ length: 55 }, (_, index) => ({
        id: `saved-${index}`,
        type: "user_message",
        state: "completed",
        streams: {},
        payload: { content: [{ kind: "text", text: `needle older saved message ${index}` }] },
      })),
    );
    server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "test",
      identity: { desktopId: "search-http", label: "Search" },
      host: "127.0.0.1",
      port: 0,
      webSocketHeartbeatIntervalMs: 0,
      ownsSupervisorPersistence: false,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never),
    });
    info = await server.start();
    token = await pair(["session:read"]);
  });
  afterEach(async () => {
    await server?.dispose();
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });
  async function pair(scopes: string[]) {
    const bootstrap = new URL(server.issueIndependentPairingUrl());
    const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: new URLSearchParams(bootstrap.hash.slice(1)).get("token"),
        scopes,
        client: { label: "search-test", deviceType: "mobile" },
      }),
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { accessToken: string }).accessToken;
  }
  const url = (query: string) => new URL(`/api/search/conversations?${query}`, info.httpBaseUrl);

  it("advertises v1 and serves bounded archived/unopened message pages to a viewer", async () => {
    const client = new RemoteDesktopClient(info.httpBaseUrl, token);
    expect((await client.environment()).capabilities?.conversationSearch?.versions).toEqual([1]);
    let first;
    do {
      first = await client.searchConversations({ query: "needle", limit: 50 });
    } while (first.indexing);
    expect(first.entries).toHaveLength(50);
    expect(first.entries[0]).toMatchObject({
      threadId: "thread-1",
      projectId: "project-1",
      role: "user",
      archived: true,
    });
    const second = await client.searchConversations({ query: "needle", cursor: first.nextCursor! });
    expect(second.entries).toHaveLength(5);
    expect(new Set([...first.entries, ...second.entries].map((entry) => entry.itemId)).size).toBe(
      55,
    );
    expect(
      (await client.searchConversations({ query: "needle", includeArchived: "false" })).entries,
    ).toEqual([]);
    await expect(
      client.searchConversations({ query: "different", cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_search_cursor" });
  });

  it("requires authentication, session:read, and an exact search version", async () => {
    expect((await fetch(url("version=1&query=needle"))).status).toBe(401);
    const terminalToken = await pair(["terminal:read"]);
    expect(
      (
        await fetch(url("version=1&query=needle"), {
          headers: { authorization: `Bearer ${terminalToken}` },
        })
      ).status,
    ).toBe(403);
    for (const version of ["", "0", "2"]) {
      const response = await fetch(url(`query=needle${version ? `&version=${version}` : ""}`), {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(400);
    }
  });

  it("does not call the new route on a previous host without the capability", async () => {
    const descriptor = await new RemoteDesktopClient(info.httpBaseUrl, token).environment();
    const request = vi.fn<RemoteFetch>();
    const client = new RemoteDesktopClient(info.httpBaseUrl, token, request);
    vi.spyOn(client, "environment").mockResolvedValue({ ...descriptor, capabilities: {} });
    await expect(client.searchConversations({ query: "needle" })).rejects.toThrow("not supported");
    expect(request).not.toHaveBeenCalled();
  });
});
