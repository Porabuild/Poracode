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
import { RemoteDesktopClient } from "@/shared/remote/client";
import { RemoteAccessServer, type RemoteAccessServerInfo } from "../RemoteAccessServer";

const servers: RemoteAccessServer[] = [];

async function exchangePairingUrl(
  pairingUrl: string,
  scopes = ["session:read", "session:operate"],
): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes,
      client: { label: "Memory sync test", deviceType: "desktop" },
    }),
  });
  return ((await response.json()) as { accessToken: string }).accessToken;
}

describe.skipIf(!sqliteAvailable)("remote memory routes", () => {
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

  async function postMemory(path: "catalog" | "sync", body: unknown, accessToken = token) {
    return fetch(new URL(`/api/memory/${path}`, info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      body: JSON.stringify(body),
    });
  }

  it("manages the host catalog for a paired operator and keeps project scope authoritative", async () => {
    const client = new RemoteDesktopClient(info.httpBaseUrl, token);
    const environment = await client.environment();
    expect(environment.capabilities?.memoryCatalog?.versions).toEqual([1]);
    const entry = {
      scope: "project" as const,
      projectId: "project-host",
      category: "project" as const,
      summary: "Use SQLite for this project's ledger",
      body: "Use SQLite for this project's ledger",
      polarity: "fact" as const,
      pinned: false,
    };
    const saved = await client.memoryCatalog({ action: "save", entry });
    expect(saved).toEqual({
      action: "save",
      result: expect.objectContaining({ ...entry, repoKey: "github.com/acme/repo" }),
    });
    if (saved.action !== "save") throw new Error("Unexpected memory catalog response");
    const { id } = saved.result;
    expect(await client.memoryCatalog({ action: "list", projectId: "project-host" })).toEqual({
      action: "list",
      result: [saved.result],
    });
    const updated = await client.memoryCatalog({
      action: "save",
      entry: { ...entry, id, pinned: true },
    });
    expect(updated).toMatchObject({ action: "save", result: { id, pinned: true } });
    expect(
      await client.memoryCatalog({ action: "status", projectId: "project-host" }),
    ).toMatchObject({
      action: "status",
      result: { entryCount: 1 },
    });
    const scopeChange = await postMemory("catalog", {
      action: "save",
      entry: { ...entry, id, scope: "global", projectId: null },
    });
    expect(scopeChange.status).toBe(409);
    expect(
      (await postMemory("catalog", { action: "list", projectId: "unknown-project" })).status,
    ).toBe(404);
    expect(
      (
        await postMemory("catalog", {
          action: "save",
          entry: { ...entry, repoKey: "foreign-review" },
        })
      ).status,
    ).toBe(400);
    expect((await postMemory("catalog", { action: "sync-export" })).status).toBe(400);
    dbUpsertProject(
      {
        id: "other-project",
        name: "Unrelated project",
        location: { kind: "posix", path: join(dir, "other") },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      1,
    );
    expect(
      (await postMemory("catalog", { action: "delete", id, projectId: "other-project" })).status,
    ).toBe(404);
    expect(await client.memoryCatalog({ action: "delete", id, projectId: "project-host" })).toEqual(
      {
        action: "delete",
        result: { ok: true },
      },
    );
    expect(await client.memoryCatalog({ action: "list" })).toEqual({ action: "list", result: [] });

    const standaloneNote = await client.memoryCatalog({
      action: "save",
      entry: { ...entry, projectId: "other-project" },
    });
    expect(standaloneNote).toMatchObject({ action: "save", result: { repoKey: null } });
    expect(await client.memoryCatalog({ action: "list", projectId: "other-project" })).toEqual({
      action: "list",
      result: [standaloneNote.result],
    });
  });

  it("denies a viewer access to memory catalog operations", async () => {
    const viewerUrl = servers.at(-1)!.issueIndependentPairingUrl("Viewer", { preset: "viewer" });
    const viewer = await exchangePairingUrl(viewerUrl, ["session:read"]);
    expect(viewer).toBeTruthy();
    expect((await postMemory("catalog", { action: "list" }, viewer)).status).toBe(403);
    expect((await postMemory("catalog", { action: "delete", id: "memory-1" }, viewer)).status).toBe(
      403,
    );
  });

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

    const response = await postMemory("sync", {
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
    const refused = await postMemory("sync", { entries: [], tombstones: [] });
    expect(refused.status).toBe(200);
    expect(await refused.json()).toEqual({ synced: false, state: { entries: [], tombstones: [] } });
  });
});
