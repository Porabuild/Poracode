import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  closeDatabase,
  dbGetProject,
  dbUpsertProject,
  dbUpsertThread,
  initDatabase,
} from "@/host/db";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import { ProjectWatchLeases, type ProjectWatchSupervisorCaller } from "@/host/gitState";
import type { ProjectLocation, Thread } from "@/shared/contracts";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import { buildWorktreeLocation } from "@/shared/worktree";
import { ProjectWatcher } from "@/supervisor/projectWatcher";
import { createPersistentRemoteAuthStore } from "../auth";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

interface Session {
  readonly accessToken: string;
  readonly sessionId: string;
}

function locationFor(path: string): ProjectLocation {
  return process.platform === "win32" ? { kind: "windows", path } : { kind: "posix", path };
}

async function exchange(
  pairingUrl: string,
  scopes: readonly string[] = ["session:read", "session:operate"],
): Promise<Session> {
  const url = new URL(pairingUrl);
  const response = await fetch(new URL("/oauth/token", url.origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential: new URLSearchParams(url.hash.slice(1)).get("token"),
      scopes,
      client: { label: "Project watch test", deviceType: "desktop" },
    }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Session;
}

/** Dispatches like src/supervisor/ipcHandlers.ts (gitWatchProject/…/gitUnwatchProject). */
function supervisorFor(watcher: ProjectWatcher): ProjectWatchSupervisorCaller {
  return async (name, payload) => {
    if (name === "gitWatchProject") {
      const watch = payload as { projectId: string; projectLocation: ProjectLocation };
      watcher.watch(watch.projectId, watch.projectLocation);
    } else if (name === "gitWatchWorktrees") {
      const worktrees = payload as { projectId: string; worktreePaths: string[] };
      watcher.watchWorktrees(worktrees.projectId, worktrees.worktreePaths);
    } else {
      await watcher.unwatch((payload as { projectId: string }).projectId);
    }
  };
}

function worktreeThread(id: string, worktreePath: string): Thread {
  return {
    id,
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "terminal",
    worktreePath,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function watched(watcher: ProjectWatcher) {
  const internals = watcher as unknown as {
    watchers: Map<string, unknown>;
    worktreeWatchers: Map<string, unknown>;
  };
  return {
    roots: [...internals.watchers.keys()].sort(),
    worktrees: [...internals.worktreeWatchers.keys()].sort(),
  };
}

describe.skipIf(!sqliteAvailable)("project watch leases over /api/git/call", () => {
  let dir: string;
  let repo: string;
  let otherRepo: string;
  let worktree: string;
  let watcher: ProjectWatcher;
  let leases: ProjectWatchLeases;
  let events: string[];
  let servers: RemoteAccessServer[];

  function startServer(): Promise<{ server: RemoteAccessServer; info: RemoteAccessServerInfo }> {
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-watch", label: "Watch Host" },
      host: "127.0.0.1",
      port: 0,
      authStore: createPersistentRemoteAuthStore(dir),
      projectWatches: leases,
      callSupervisor: (async (name: string) => {
        if (name === "getThreadSnapshots") return [];
        // A watch procedure reaching the supervisor directly would bypass the
        // leases; fail loudly instead.
        if (
          name === "gitWatchProject" ||
          name === "gitWatchWorktrees" ||
          name === "gitUnwatchProject"
        ) {
          throw new Error(`unexpected direct ${name}`);
        }
        return undefined;
      }) as RemoteAccessServerOptions["callSupervisor"],
    });
    servers.push(server);
    return server.start().then((info) => ({ server, info }));
  }

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-watch-leases-"));
    repo = join(dir, "repo");
    otherRepo = join(dir, "other");
    worktree = join(dir, "wt-feature");
    for (const path of [repo, join(repo, ".git"), otherRepo, worktree]) {
      mkdirSync(path, { recursive: true });
    }
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      { id: "project-1", name: "Repo", location: locationFor(repo), createdAt: "2026-01-01" },
      0,
    );
    dbUpsertProject(
      { id: "project-2", name: "Other", location: locationFor(otherRepo), createdAt: "2026-01-01" },
      1,
    );
    events = [];
    watcher = new ProjectWatcher({
      onGitChanged: (projectId) => events.push(`git:${projectId}`),
      onTreeChanged: (projectId) => events.push(`tree:${projectId}`),
    });
    leases = new ProjectWatchLeases({ call: supervisorFor(watcher), getProject: dbGetProject });
    servers = [];
  });

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.dispose()));
    await leases.dispose();
    await watcher.dispose();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const call = (
    info: RemoteAccessServerInfo,
    session: Session,
    procedure: string,
    payload: Record<string, unknown>,
  ) =>
    fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      body: JSON.stringify({ procedure, payload }),
    });

  async function expectOk(response: Promise<Response>): Promise<void> {
    const settled = await response;
    // The body rides along so a refusal shows its typed error code.
    expect({ status: settled.status, body: await settled.text() }).toMatchObject({ status: 200 });
  }

  async function managedWindowWatches(
    info: RemoteAccessServerInfo,
    managed: Session,
  ): Promise<void> {
    await expectOk(
      call(info, managed, "gitWatchProject", {
        projectId: "project-1",
        projectLocation: locationFor(repo),
      }),
    );
    await expectOk(
      call(info, managed, "gitWatchWorktrees", {
        projectId: "project-1",
        worktreePaths: [worktree],
      }),
    );
  }

  async function touchAndCollect(path: string): Promise<string[]> {
    events.length = 0;
    writeFileSync(join(path, `touch-${Date.now()}-${Math.random()}.txt`), "x");
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    return [...events];
  }

  it("keeps the managed window watched through a paired client's unwatch, re-watch and narrower set", async () => {
    const { server, info } = await startServer();
    const managed = await exchange(server.mintLoopbackRendererCredential()!.pairingUrl);
    const paired = await exchange(info.pairingUrl);
    await managedWindowWatches(info, managed);

    await expectOk(call(info, paired, "gitUnwatchProject", { projectId: "project-1" }));
    await expectOk(
      call(info, paired, "gitWatchProject", {
        projectId: "project-1",
        projectLocation: locationFor(repo),
      }),
    );
    await expectOk(
      call(info, paired, "gitWatchWorktrees", { projectId: "project-1", worktreePaths: [] }),
    );

    expect(watched(watcher)).toEqual({ roots: ["project-1"], worktrees: [worktree] });
    expect(await touchAndCollect(repo)).toContain("tree:project-1");
    expect(await touchAndCollect(worktree)).toContain("tree:project-1");
  });

  it("derives the owner from the bearer session, never from the payload", async () => {
    const { server, info } = await startServer();
    const managed = await exchange(server.mintLoopbackRendererCredential()!.pairingUrl);
    const paired = await exchange(info.pairingUrl);
    await managedWindowWatches(info, managed);

    const spoofed = await call(info, paired, "gitUnwatchProject", {
      projectId: "project-1",
      owner: "managed-renderer",
    });

    expect(spoofed.status).toBe(200);
    expect(watched(watcher)).toEqual({ roots: ["project-1"], worktrees: [worktree] });
  });

  it("binds gitWatchProject to the project's own registered root", async () => {
    const { info } = await startServer();
    const paired = await exchange(info.pairingUrl);
    dbUpsertThread(worktreeThread("thread-1", worktree), 0);

    for (const projectLocation of [
      locationFor(otherRepo),
      buildWorktreeLocation(locationFor(repo), worktree),
    ]) {
      const refused = await call(info, paired, "gitWatchProject", {
        projectId: "project-1",
        projectLocation,
      });
      expect(refused.status).toBe(403);
      await expect(refused.json()).resolves.toMatchObject({
        error: { code: "project_location_not_registered" },
      });
    }
    expect(watched(watcher)).toEqual({ roots: [], worktrees: [] });
  });

  it("treats an unknown project's unwatch as harmless and refuses its worktree set", async () => {
    const { info } = await startServer();
    const paired = await exchange(info.pairingUrl);

    await expectOk(call(info, paired, "gitUnwatchProject", { projectId: "no-such-project" }));
    await expectOk(
      call(info, paired, "gitWatchWorktrees", { projectId: "no-such-project", worktreePaths: [] }),
    );
    const refused = await call(info, paired, "gitWatchWorktrees", {
      projectId: "no-such-project",
      worktreePaths: [worktree],
    });

    expect(refused.status).toBe(404);
    expect(watched(watcher)).toEqual({ roots: [], worktrees: [] });
  });

  it("lets a re-bootstrapped managed window release what its predecessor registered", async () => {
    const { server, info } = await startServer();
    const first = await exchange(server.mintLoopbackRendererCredential()!.pairingUrl);
    await managedWindowWatches(info, first);
    const successor = await exchange(server.mintLoopbackRendererCredential()!.pairingUrl);
    expect(successor.sessionId).not.toBe(first.sessionId);

    await expectOk(call(info, successor, "gitUnwatchProject", { projectId: "project-1" }));

    expect(watched(watcher)).toEqual({ roots: [], worktrees: [] });
  });

  it("releases a revoked paired session's leases but keeps the managed window's", async () => {
    const { server, info } = await startServer();
    const managed = await exchange(server.mintLoopbackRendererCredential()!.pairingUrl);
    const paired = await exchange(info.pairingUrl);
    await managedWindowWatches(info, managed);
    for (const [projectId, path] of [
      ["project-1", repo],
      ["project-2", otherRepo],
    ] as const) {
      await expectOk(
        call(info, paired, "gitWatchProject", { projectId, projectLocation: locationFor(path) }),
      );
    }

    expect(server.revokeAccessSession(paired.sessionId)).toBe(true);
    await expect.poll(() => watched(watcher).roots).toEqual(["project-1"]);
    expect(server.revokeAccessSession(managed.sessionId)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(watched(watcher)).toEqual({ roots: ["project-1"], worktrees: [worktree] });
  });

  it("keeps leases through a socket close and a server replacement", async () => {
    const first = await startServer();
    const managed = await exchange(first.server.mintLoopbackRendererCredential()!.pairingUrl);
    const paired = await exchange(first.info.pairingUrl);
    await managedWindowWatches(first.info, managed);
    await expectOk(
      call(first.info, paired, "gitWatchProject", {
        projectId: "project-2",
        projectLocation: locationFor(otherRepo),
      }),
    );
    const ticket = await fetch(new URL("/api/auth/websocket-ticket", first.info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${paired.accessToken}`,
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
    }).then((response) => response.json() as Promise<{ ticket: string }>);
    const socketUrl = new URL("/ws", first.info.wsBaseUrl);
    socketUrl.searchParams.set("ticket", ticket.ticket);
    const socket = new WebSocket(socketUrl);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    socket.close();
    await new Promise((resolve) => socket.once("close", resolve));
    await first.server.dispose();

    const second = await startServer();
    expect(watched(watcher)).toEqual({
      roots: ["project-1", "project-2"],
      worktrees: [worktree],
    });
    // The paired session is persisted, so it keeps its owner on the new server.
    await expectOk(call(second.info, paired, "gitUnwatchProject", { projectId: "project-2" }));
    expect(watched(watcher).roots).toEqual(["project-1"]);
    // The managed window's memory-only session died with the old server; its
    // re-bootstrapped successor still releases the shared managed lease.
    expect((await call(second.info, managed, "gitUnwatchProject", { projectId: "x" })).status).toBe(
      401,
    );
    const successor = await exchange(second.server.mintLoopbackRendererCredential()!.pairingUrl);
    await expectOk(call(second.info, successor, "gitUnwatchProject", { projectId: "project-1" }));
    expect(watched(watcher)).toEqual({ roots: [], worktrees: [] });
  });

  it("pins host-prepared worktrees through client set changes until the host removes them", async () => {
    const { info } = await startServer();
    const paired = await exchange(info.pairingUrl);
    const command = (threadId: string, body: Record<string, unknown>) =>
      fetch(new URL(`/api/threads/${threadId}/command`, info.httpBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${paired.accessToken}`,
          "content-type": "application/json",
          [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
        },
        body: JSON.stringify(body),
      });

    await expectOk(
      command("thread-9", {
        kind: "prepare-worktree",
        projectId: "project-1",
        worktreePath: worktree,
      }),
    );
    expect(watched(watcher).worktrees).toEqual([worktree]);
    await expectOk(
      call(info, paired, "gitWatchWorktrees", { projectId: "project-1", worktreePaths: [] }),
    );
    await expectOk(call(info, paired, "gitUnwatchProject", { projectId: "project-1" }));
    expect(watched(watcher).worktrees).toEqual([worktree]);

    dbUpsertThread(worktreeThread("thread-9", worktree), 0);
    await expectOk(
      command("thread-9", {
        kind: "delete-worktree-group",
        projectId: "project-1",
        worktreePath: worktree,
        threadIds: ["thread-9"],
      }),
    );
    expect(watched(watcher).worktrees).toEqual([]);
  });
});
