import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import { closeDatabase, dbUpsertProject, initDatabase } from "@/host/db";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

const servers: RemoteAccessServer[] = [];

async function exchangePairingUrl(pairingUrl: string): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:operate"],
      client: { label: "Worktree placement test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

const projectLocation = { kind: "posix", path: "/tmp/repo" } as const;

/**
 * A worktree requested through the procedure passthrough without a placement
 * lands where the host places worktrees, whichever client asked; an explicit
 * placement or path from the caller is kept.
 */
describe.skipIf(!sqliteAvailable)("gitAddWorktree host placement", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-worktree-placement-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      { id: "project-1", name: "Repo", createdAt: "2026-01-01", location: projectLocation },
      0,
    );
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => ({ path: "/srv/worktrees/repo/feature" }) as never,
    );
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
      resolveWorktreePlacement: () => ({ root: "/srv/worktrees", omitRepoDir: false }),
    });
    servers.push(server);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
    callSupervisor.mockClear();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const addWorktree = (payload: Record<string, unknown>) =>
    fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      body: JSON.stringify({ procedure: "gitAddWorktree", payload }),
    });

  const base = {
    projectLocation,
    branch: "feature",
    createBranch: true,
    transferUncommitted: false,
    keepChangesInSource: false,
  };

  it("places a worktree requested without a placement where the host places worktrees", async () => {
    const response = await addWorktree(base);
    expect(response.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith(
      "gitAddWorktree",
      expect.objectContaining({ ...base, worktreeRoot: "/srv/worktrees" }),
    );
  });

  it("keeps a caller's explicit placement", async () => {
    const response = await addWorktree({ ...base, worktreeRoot: "/custom" });
    expect(response.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith(
      "gitAddWorktree",
      expect.objectContaining({ worktreeRoot: "/custom" }),
    );
  });
});
