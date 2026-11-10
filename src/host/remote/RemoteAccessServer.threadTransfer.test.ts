import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, dbUpsertProject, dbUpsertThread, initDatabase } from "@/host/db";
import { dbGetThreadRuntimeItems, dbReplaceThreadRuntimeSnapshot } from "@/host/db/runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";

describe.skipIf(!sqliteAvailable)("thread transfer routes", () => {
  let dir: string;
  const servers: RemoteAccessServer[] = [];

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-transfer-routes-"));
    initDatabase(join(dir, "state.sqlite"));
    for (const id of ["project-1", "project-2"]) {
      dbUpsertProject(
        {
          id,
          name: id,
          location: { kind: "posix", path: join(dir, id) },
          createdAt: "2026-11-01T10:00:00Z",
        },
        0,
      );
    }
    dbUpsertThread(
      { ...testThread(), status: "idle", attention: "none", presentationMode: "gui" },
      0,
    );
    await dbReplaceThreadRuntimeSnapshot(
      "thread-1",
      [
        {
          id: "u1",
          type: "user_message",
          state: "completed",
          payload: { content: [{ kind: "text", text: "Plan the release" }] },
          streams: {},
        },
        {
          id: "a1",
          type: "assistant_message",
          state: "completed",
          streams: { assistant_text: "Here is the plan" },
        },
      ],
      [{ anchorItemId: "a1", startedAt: "2026-11-01T10:00:00Z", endedAt: "2026-11-01T10:01:00Z" }],
      null,
    );
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  async function fixture(preset: "viewer" | "operator") {
    // Neither project is a Git checkout here: only the conversation moves.
    const callSupervisor = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(
      async (name, payload) => {
        if (name === "threadTransferInspectGit") {
          return { repository: false, changedFiles: 0, repoIdentities: [] };
        }
        if (name === "threadTransferRepoProbe") {
          const { projectLocations } = payload as { projectLocations: unknown[] };
          return {
            repositories: projectLocations.map(() => ({ repository: false, repoIdentities: [] })),
          };
        }
        throw new Error(`unexpected supervisor call ${name}`);
      },
    );
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "transfer-host", label: "Transfer host" },
      host: "127.0.0.1",
      port: 0,
      tls: null,
      callSupervisor: callSupervisor as unknown as RemoteAccessServerOptions["callSupervisor"],
    });
    servers.push(server);
    const info = await server.start();
    const pairingUrl = server.issueIndependentPairingUrl("Transfer fixture", { preset });
    const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        client: { label: "Transfer fixture", deviceType: "browser" },
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const { accessToken } = (await tokenResponse.json()) as { accessToken: string };
    const headers = {
      authorization: `Bearer ${accessToken}`,
      [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
    };
    const command = (body: unknown) =>
      fetch(new URL("/api/thread-transfers/command", info.httpBaseUrl), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const upload = (transferId: string, query: string, data: Uint8Array) =>
      fetch(new URL(`/api/thread-transfers/${transferId}/package?${query}`, info.httpBaseUrl), {
        method: "POST",
        headers: { ...headers, "content-type": "application/octet-stream" },
        body: new Uint8Array(data),
      });
    return { command, upload };
  }

  it("moves a thread through the command and upload routes", async () => {
    const { command, upload } = await fixture("operator");
    const described = await command({ kind: "describe", threadId: "thread-1" });
    expect(described.status).toBe(200);
    expect(await described.json()).toMatchObject({ kind: "describe", source: { git: null } });

    const exportResponse = await command({
      kind: "export",
      transferId: "transfer-0001",
      threadId: "thread-1",
      haves: [],
    });
    expect(exportResponse.status).toBe(200);
    const exported = (await exportResponse.json()) as { byteLength: number; sha256: string };

    const chunks: Buffer[] = [];
    for (let offset = 0; offset < exported.byteLength; offset += 512) {
      const read = await command({
        kind: "read",
        transferId: "transfer-0001",
        offset,
        length: 512,
      });
      expect(read.status).toBe(200);
      chunks.push(Buffer.from(((await read.json()) as { data: string }).data, "base64"));
    }
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBe(exported.byteLength);

    for (let offset = 0; offset < bytes.length; offset += 512) {
      const query = new URLSearchParams({
        offset: String(offset),
        total: String(bytes.length),
        sha256: exported.sha256,
      });
      const uploaded = await upload(
        "transfer-0001",
        query.toString(),
        bytes.subarray(offset, offset + 512),
      );
      expect(uploaded.status).toBe(200);
      expect(await uploaded.json()).toEqual({ received: Math.min(bytes.length, offset + 512) });
    }

    const committed = await command({
      kind: "commit",
      transferId: "transfer-0001",
      threadId: "moved-1",
      projectId: "project-2",
      byteLength: exported.byteLength,
      sha256: exported.sha256,
    });
    expect(committed.status).toBe(200);
    expect(await committed.json()).toMatchObject({
      kind: "commit",
      replayed: false,
      thread: {
        id: "moved-1",
        projectId: "project-2",
        forkedFrom: { transfer: { sourceHostLabel: "Transfer host", transferId: "transfer-0001" } },
      },
    });
    expect((await dbGetThreadRuntimeItems("moved-1")).map((item) => item.id)).toEqual(["u1", "a1"]);
  });

  it("refuses viewers, malformed uploads and unknown transfers", async () => {
    const viewer = await fixture("viewer");
    expect((await viewer.command({ kind: "describe", threadId: "thread-1" })).status).toBe(403);

    const { command, upload } = await fixture("operator");
    const sha256 = "a".repeat(64);
    expect(
      (await upload("transfer-0002", `offset=0&total=3&sha256=nothex`, new Uint8Array([1]))).status,
    ).toBe(400);
    expect(
      (await upload("transfer-0002", `total=3&sha256=${sha256}`, new Uint8Array([1]))).status,
    ).toBe(400);
    expect(
      (await upload("../escape", `offset=0&total=3&sha256=${sha256}`, new Uint8Array([1]))).status,
    ).toBe(404);
    const missing = await command({
      kind: "read",
      transferId: "transfer-0003",
      offset: 0,
      length: 8,
    });
    expect(missing.status).toBe(410);
    expect(await missing.json()).toMatchObject({ error: { code: "thread_transfer_expired" } });
  });
});
