import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  dbGetThread,
  dbGetProject,
  dbBeginWorktreeObservation,
  dbReconcileProjectWorktrees,
  dbClaimCheckpointRevertOperation,
  dbUpsertProject,
  dbUpsertThread,
  initDatabase,
} from "@/host/db";
import {
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GitProcessAdmissionRefusalError,
} from "@/shared/gitProcessAdmission";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { GitStateService, type GitStateExecutor } from "@/host/gitState";
import { SupervisorClient } from "@/host/supervisor/SupervisorClient";
import { applyRemoteThreadCommand } from "./threadCommands";
import type { RemoteServerContext } from "./context";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

const servers: RemoteAccessServer[] = [];

async function exchangePairingUrl(
  pairingUrl: string,
  scopes = ["session:read", "session:operate"],
): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes,
      client: { label: "Procedure ownership test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

/**
 * Generic `/api/git/call` ownership: the passthrough allowlist is
 * supervisor-typed, so a main-local IPC procedure name (raw DB or local-shell)
 * is refused with the typed 403 before any dispatch — never cast to a
 * supervisor procedure and never answered by a database dispatcher. A removed
 * name is indistinguishable from a never-allowlisted one for every client.
 */
describe.skipIf(!sqliteAvailable)("procedure passthrough ownership", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;
  let coordinator: SupervisorClient;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-procedure-ownership-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Repo",
        location: { kind: "posix", path: "/tmp/repo" },
        createdAt: "2026-01-01",
      },
      0,
    );
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never);
    coordinator = new SupervisorClient({
      appVersion: "test",
      isDev: false,
      baseDir: dir,
      supervisorPath: join(dir, "unused.cjs"),
      wslHelpersDir: dir,
      secretStorageKey: "fixture",
      onEvent: () => {},
      onReset: () => {},
    });
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
      runThreadMutation: (threadId, operation) =>
        coordinator.runThreadMutation(threadId, operation),
    });
    servers.push(server);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
    callSupervisor.mockClear();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    await coordinator.dispose();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const call = (procedure: string, payload: Record<string, unknown>) =>
    fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ procedure, payload }),
    });

  it.each(["gitProjectSnapshot", "gitListWorktrees"])(
    "repairs existing saved branch and path links after a %s observation",
    async (procedure) => {
      const thread = {
        ...testThread(),
        worktreePath: "/tmp/old-wt",
        worktreeBranch: "old-name",
      };
      dbUpsertThread(thread, 0);
      const worktree = {
        path: "/tmp/new-wt",
        branch: "old-name",
        commit: "abc123",
        isMain: false,
      };
      callSupervisor.mockResolvedValue({
        status: null,
        branches: null,
        ghAvailable: null,
        worktrees: [worktree],
      } as never);
      expect(
        (await call(procedure, { projectLocation: { kind: "posix", path: "/tmp/repo" } })).status,
      ).toBe(200);
      expect(dbGetThread(thread.id)?.worktreePath).toBe(worktree.path);

      callSupervisor.mockResolvedValue({
        status: null,
        branches: null,
        ghAvailable: null,
        worktrees: [{ ...worktree, branch: "new-name" }],
      } as never);
      expect(
        (await call(procedure, { projectLocation: { kind: "posix", path: "/tmp/repo" } })).status,
      ).toBe(200);
      expect(dbGetThread(thread.id)?.worktreeBranch).toBe("new-name");
    },
  );

  it.each(["procedure", "service"])(
    "does not roll back a newer %s observation when an older snapshot completes",
    async (source) => {
      const thread = {
        ...testThread(),
        worktreePath: "/tmp/old-wt",
        worktreeBranch: "same-branch",
      };
      dbUpsertThread(thread, 0);
      const older = Promise.withResolvers<unknown>();
      const reading = Promise.withResolvers<void>();
      const moved = { path: "/tmp/new-wt", branch: "same-branch", commit: "abc123", isMain: false };
      const snapshot = { status: null, branches: null, ghAvailable: false, worktrees: [moved] };
      callSupervisor.mockImplementationOnce(async () => {
        reading.resolve();
        return older.promise as never;
      });
      const oldResponse = call("gitProjectSnapshot", {
        projectLocation: { kind: "posix", path: "/tmp/repo" },
      });
      await reading.promise;
      let newerStatus = 200;
      if (source === "procedure") {
        callSupervisor.mockResolvedValueOnce({ worktrees: [moved] } as never);
        newerStatus = (
          await call("gitListWorktrees", {
            projectLocation: { kind: "posix", path: "/tmp/repo" },
          })
        ).status;
      } else {
        const service = new GitStateService({
          hostId: "desktop-test",
          getProject: dbGetProject,
          getProjects: () => [],
          executor: { gitProjectSnapshot: async () => snapshot } as unknown as GitStateExecutor,
          beginWorktreeObservation: (projectId) => {
            const observation = dbBeginWorktreeObservation(projectId);
            return (worktrees) =>
              dbReconcileProjectWorktrees(projectId, worktrees, observation) !== null;
          },
        });
        await service.refreshProject("project-1");
        await service.dispose();
      }
      expect(newerStatus).toBe(200);
      expect(dbGetThread(thread.id)?.worktreePath).toBe(moved.path);
      older.resolve({ ...snapshot, worktrees: [{ ...moved, path: "/tmp/old-wt" }] });
      expect((await oldResponse).status).toBe(200);
      expect(dbGetThread(thread.id)?.worktreePath).toBe(moved.path);
    },
  );

  it("retains all thread rows when a moved worktree has an unrequested sibling", async () => {
    dbUpsertThread(
      {
        ...testThread(),
        id: "selected",
        worktreePath: "/tmp/old-wt",
        worktreeBranch: "same-branch",
      },
      0,
    );
    dbUpsertThread(
      {
        ...testThread(),
        id: "sibling",
        worktreePath: "/tmp/new-wt",
        worktreeBranch: "same-branch",
      },
      1,
    );
    callSupervisor.mockImplementation(async (name) =>
      name === "gitListWorktrees"
        ? ({
            worktrees: [
              { path: "/tmp/new-wt", branch: "same-branch", commit: "abc123", isMain: false },
            ],
          } as never)
        : (undefined as never),
    );
    const response = await fetch(new URL("/api/threads/selected/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      body: JSON.stringify({
        kind: "delete-worktree-group",
        projectId: "project-1",
        worktreePath: "/tmp/old-wt",
        threadIds: ["selected"],
      }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "worktree_threads_changed" },
    });
    expect(dbGetThread("selected")).not.toBeNull();
    expect(dbGetThread("sibling")).not.toBeNull();
    expect(callSupervisor).not.toHaveBeenCalledWith("gitRemoveWorktree", expect.anything());
  });

  it("refuses a running checkpoint revert before removing any worktree files", async () => {
    dbUpsertThread(
      { ...testThread(), id: "selected", worktreePath: "/tmp/wt", worktreeBranch: "feature" },
      0,
    );
    dbClaimCheckpointRevertOperation({
      operationKey: "held-revert",
      threadId: "selected",
      checkpointItemId: "checkpoint",
      projectLocationJson: null,
      configJson: null,
    });
    const ctx = {
      options: {
        callSupervisor,
        runThreadMutation: <Result>(threadId: string, operation: () => Promise<Result>) =>
          coordinator.runThreadMutation(threadId, operation),
      },
    } as unknown as RemoteServerContext;
    await expect(
      applyRemoteThreadCommand(ctx, {
        kind: "delete-worktree-group",
        threadId: "selected",
        projectId: "project-1",
        worktreePath: "/tmp/wt",
        threadIds: ["selected"],
      }),
    ).rejects.toMatchObject({ code: "CHECKPOINT_REVERT_ACTIVE" });
    expect(dbGetThread("selected")).not.toBeNull();
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("holds deletion custody across awaited worktree removal so a new revert sees the deleted row", async () => {
    dbUpsertThread(
      { ...testThread(), id: "selected", worktreePath: "/tmp/wt", worktreeBranch: "feature" },
      0,
    );
    const removing = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    callSupervisor.mockImplementation(async (name) => {
      if (name === "gitListWorktrees")
        return {
          worktrees: [{ path: "/tmp/wt", branch: "feature", commit: "abc123", isMain: false }],
        } as never;
      if (name === "gitRemoveWorktree") {
        removing.resolve();
        await release.promise;
      }
      return undefined as never;
    });
    const deletion = fetch(new URL("/api/threads/selected/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      body: JSON.stringify({
        kind: "delete-worktree-group",
        projectId: "project-1",
        worktreePath: "/tmp/wt",
        threadIds: ["selected"],
      }),
    });
    await removing.promise;
    let revertStarted = false;
    const revert = coordinator.runThreadMutation("selected", async () => {
      revertStarted = true;
      return dbGetThread("selected");
    });
    await Promise.resolve();
    expect(revertStarted).toBe(false);
    release.resolve();
    expect((await deletion).status).toBe(200);
    await expect(revert).resolves.toBeNull();
    expect(revertStarted).toBe(true);
  });

  it.each([
    ["dbDeleteThread", { threadId: "t1" }],
    ["dbDeleteProject", { projectId: "p1" }],
    ["dbGetThreadRuntimeItems", { threadId: "t1" }],
    ["dbReplaceThreadRuntimeItems", { threadId: "t1", items: [] }],
    ["revealProjectEntry", { projectLocation: { kind: "posix", path: "/tmp/repo" } }],
    ["detectProjectIcon", { projectLocation: { kind: "posix", path: "/tmp/repo" } }],
    ["listProjectIconFiles", { projectLocation: { kind: "posix", path: "/tmp/repo" } }],
  ])("refuses main-local %s with the typed unsupported error", async (procedure, payload) => {
    const response = await call(procedure, payload);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "git_procedure_not_allowed" },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("refuses a never-allowlisted name the same way", async () => {
    const response = await call("notARealProcedure", {});
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "git_procedure_not_allowed" },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("still dispatches a retained supervisor procedure", async () => {
    callSupervisor.mockResolvedValueOnce([] as never);
    const response = await call("readThreadBackgroundTasks", { threadId: "t1" });
    expect(response.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith("readThreadBackgroundTasks", { threadId: "t1" });
  });

  it("refuses a viewer's project-relative file read from an unregistered private root", async () => {
    const response = await call("readProjectFile", {
      projectLocation: { kind: "posix", path: join(dir, "private") },
      path: "synthetic.txt",
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "project_location_not_registered" },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("requires host-file management authority for reads rooted at synthetic Home", async () => {
    dbUpsertProject(
      {
        id: HOME_PROJECT_ID,
        name: "Home",
        location: { kind: "posix", path: dir },
        createdAt: "2026-01-01",
      },
      1,
    );
    const payload = { projectLocation: { kind: "posix", path: dir }, path: "synthetic.txt" };
    expect((await call("readProjectFile", payload)).status).toBe(403);
    expect(callSupervisor).not.toHaveBeenCalled();
    token = await exchangePairingUrl(servers[0]!.issuePairingUrl(), [
      "session:read",
      "projects:manage",
    ]);
    callSupervisor.mockResolvedValueOnce({
      path: "synthetic.txt",
      status: "ready",
      modifiedAtMs: 1,
      content: "synthetic fixture",
    } as never);
    expect((await call("readProjectFile", payload)).status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith("readProjectFile", payload);
  });

  it("returns Git admission pressure as a typed retryable response", async () => {
    callSupervisor.mockRejectedValueOnce(
      new GitProcessAdmissionRefusalError("Git short admission queue is full.", {
        code: GIT_ADMISSION_QUEUE_FULL_CODE,
        retryAfterMs: 1_500,
      }),
    );
    const response = await call("getGitStatus", {
      projectLocation: { kind: "posix", path: "/tmp/repo" },
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("2");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: GIT_ADMISSION_QUEUE_FULL_CODE },
    });
  });
});
