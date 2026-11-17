import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, dbUpsertProject, initDatabase } from "@/host/db";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import { handleMemoryCommand } from "@/host/memory/runtime";
import { setMemoryRepoKeyReader } from "@/host/memory/repoKeyReader";
import { setMemorySettingsReader } from "@/host/memory/settingsReader";
import { defaultMemorySettings } from "@/shared/memory";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import { RemoteAccessServer, type RemoteAccessServerInfo } from "../RemoteAccessServer";

const servers: RemoteAccessServer[] = [];

async function exchangePairingUrl(pairingUrl: string): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read", "session:operate"],
      client: { label: "Memory sync test", deviceType: "desktop" },
    }),
  });
  return ((await response.json()) as { accessToken: string }).accessToken;
}

describe.skipIf(!sqliteAvailable)("POST /api/memory/sync", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-memory-sync-http-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-host",
        name: "Repo",
        location: { kind: "posix", path: dir },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    setMemorySettingsReader(() => ({ ...defaultMemorySettings, enabled: true, syncEnabled: true }));
    setMemoryRepoKeyReader((projectId) =>
      projectId === "project-host" ? "github.com/acme/repo" : null,
    );
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<() => Promise<undefined>>(async () => undefined),
      schedules: {
        list: () => [],
        runs: () => [],
        create: () => {
          throw new Error("unexpected schedule mutation");
        },
        update: () => {
          throw new Error("unexpected schedule mutation");
        },
        delete: () => {
          throw new Error("unexpected schedule mutation");
        },
        runNow: () => {
          throw new Error("unexpected schedule mutation");
        },
        inbox: () => [],
        snapshot: () => ({ schedules: [], runs: [], unreadCount: 0 }),
      },
    });
    servers.push(server);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
  });

  afterEach(async () => {
    setMemorySettingsReader(() => defaultMemorySettings);
    setMemoryRepoKeyReader(undefined);
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  async function postSync(body: unknown) {
    return fetch(new URL("/api/memory/sync", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      body: JSON.stringify(body),
    });
  }

  it("merges incoming memories and refuses when sync is disabled on the host", async () => {
    await handleMemoryCommand({
      action: "save",
      entry: {
        scope: "global",
        category: "user",
        summary: "Host global rule",
        body: "Host global rule",
        polarity: "positive",
        pinned: false,
      },
    });

    const response = await postSync({
      entries: [
        {
          id: "peer-1",
          scope: "project",
          projectId: "peer-proj",
          repoKey: "github.com/acme/repo",
          category: "project",
          summary: "Peer project rule",
          body: "Peer project rule",
          confidence: 0.9,
          polarity: "fact",
          quote: null,
          lockedByUser: false,
          pinned: false,
          archived: false,
          usageCount: 0,
          lastUsedAt: null,
          createdAt: "2026-11-17T00:00:00.000Z",
          updatedAt: "2026-11-17T00:00:00.000Z",
          source: "user",
        },
      ],
      tombstones: [],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      synced: boolean;
      state: { entries: Array<{ summary: string; projectId: string | null }> };
    };
    expect(body.synced).toBe(true);
    expect(body.state.entries.map((entry) => entry.summary)).toEqual([
      "Host global rule",
      "Peer project rule",
    ]);
    expect(body.state.entries.find((e) => e.summary === "Peer project rule")?.projectId).toBe(
      "project-host",
    );

    setMemorySettingsReader(() => ({
      ...defaultMemorySettings,
      enabled: true,
      syncEnabled: false,
    }));
    const refused = await postSync({ entries: [], tombstones: [] });
    expect(refused.status).toBe(200);
    expect(await refused.json()).toEqual({ synced: false, state: { entries: [], tombstones: [] } });
  });
});
