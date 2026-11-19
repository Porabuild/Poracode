import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, testThread } from "@/host/db/runtimeItems.testFixtures";
import { GitWorktreeService } from "@/supervisor/git/worktreeService";
import type { GitAddWorktreePayload, Project } from "@/shared/contracts";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import type { RemoteServerContext } from "./context";
import { moveHostThreadToWorktree } from "./threadWorktreeMove";
import { applyRemoteThreadCommand, startPersistedThread } from "./threadCommands";

const threadId = "thread-1";
const input = { threadId, withChanges: true, operationKey: "move-00001" };
let project: Project;
let directory: string;

beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(":memory:");
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(resolve("tmp/thread-worktree-move-"));
  const path = join(directory, "source");
  mkdirSync(path);
  project = {
    id: "project-1",
    name: "Project",
    location: process.platform === "win32" ? { kind: "windows", path } : { kind: "posix", path },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  dbUpsertProject(project, 0);
  dbUpsertThread({ ...testThread(), status: "idle" }, 19);
});

afterEach(() => {
  closeDatabase();
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  rmSync(directory, { recursive: true, force: true });
});

function fixture(options?: {
  confirmed?: boolean;
  captureThreadControlState?: NonNullable<
    RemoteServerContext["options"]["captureThreadControlState"]
  >;
  preflight?: () => void;
  onClose?: () => void;
  add?: (payload: GitAddWorktreePayload) => Promise<{ path: string; changesTransferred?: boolean }>;
  reopen?: () => void;
}) {
  const observeProjection =
    vi.fn<NonNullable<RemoteServerContext["options"]["dispatchThreadCommand"]>>();
  const publishThreadsChanged = vi.fn<RemoteServerContext["publishThreadsChanged"]>();
  const call = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
    async (name, payload, callOptions) => {
      switch (name) {
        case "getGitStatus":
          options?.preflight?.();
          return { isRepo: true } as never;
        case "closeThreadConfirmed":
          options?.onClose?.();
          return { confirmed: options?.confirmed ?? true } as never;
        case "gitAddWorktree":
          return (
            options?.add
              ? await options.add(payload as GitAddWorktreePayload)
              : { path: join(directory, "target"), changesTransferred: false }
          ) as never;
        case "gitWatchWorktrees":
          return undefined as never;
        case "ensureThreadRunning":
          callOptions?.assertLaunchCurrent?.();
          options?.reopen?.();
          return { threadId } as never;
        default:
          throw new Error(`Unexpected procedure ${name}`);
      }
    },
  );
  const ctx = {
    publishThreadsChanged,
    options: {
      callSupervisor: call,
      runThreadMutation: vi.fn<NonNullable<RemoteServerContext["options"]["runThreadMutation"]>>(
        (_threadId, operation) => operation(),
      ),
      captureThreadControlState: options?.captureThreadControlState ?? (() => () => true),
      resolveWorktreePlacement: () => ({ root: join(directory, "worktrees"), omitRepoDir: true }),
      dispatchThreadCommand: observeProjection,
    },
  } as unknown as RemoteServerContext;
  return { ctx, call, publishThreadsChanged, observeProjection };
}

describe("host-owned move to worktree", () => {
  it("moves real dirty files and the thread into the same new checkout, then replays its receipt", async () => {
    const root = join(directory, "source");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
    git("init", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.test");
    git("config", "core.autocrlf", "false");
    writeFileSync(join(root, "tracked"), "base\n");
    git("add", "tracked");
    git("commit", "-m", "base");
    writeFileSync(join(root, "tracked"), "changed\n");
    writeFileSync(join(root, "untracked"), "new work\n");

    const gitOwner = new GitWorktreeService();
    const f = fixture({
      add: (payload) =>
        gitOwner.addWorktree(
          payload.projectLocation,
          payload.path,
          payload.branch,
          payload.createBranch,
          payload.startPoint,
          payload.copyIgnoredPatterns,
          payload.transferUncommitted,
          payload.keepChangesInSource,
          { root: payload.worktreeRoot!, omitRepoDir: payload.worktreeOmitRepoDir! },
        ),
    });
    const before = dbGetThread(threadId);
    const result = await moveHostThreadToWorktree(f.ctx, input);
    expect(result).toMatchObject({
      threadId,
      outcome: "moved",
      runtime: "reopened",
      changesTransferred: true,
    });
    expect(normalizeWorktreePathForComparison(result.worktreePath, false)).toContain(
      normalizeWorktreePathForComparison(join(directory, "worktrees"), false),
    );
    expect(readFileSync(join(result.worktreePath, "tracked"), "utf8")).toBe("changed\n");
    expect(readFileSync(join(result.worktreePath, "untracked"), "utf8")).toBe("new work\n");
    expect(git("status", "--porcelain")).toBe("");
    expect(dbGetThread(threadId)).toMatchObject({
      title: before?.title,
      config: before?.config,
      worktreePath: result.worktreePath,
      worktreeBranch: result.branch,
    });
    expect(
      getSqlite().prepare("SELECT sort_order FROM threads WHERE id = ?").get(threadId),
    ).toEqual({ sort_order: 19 });
    expect(f.call.mock.calls.map(([name]) => name)).toEqual([
      "getGitStatus",
      "closeThreadConfirmed",
      "gitAddWorktree",
      "gitWatchWorktrees",
      "ensureThreadRunning",
    ]);
    expect(f.call).toHaveBeenLastCalledWith(
      "ensureThreadRunning",
      expect.objectContaining({
        config: before?.config,
        projectLocation: { ...project.location, path: result.worktreePath },
        prompt: "",
      }),
      expect.objectContaining({ skipThreadMutation: true }),
    );
    expect(f.publishThreadsChanged).toHaveBeenCalledExactlyOnceWith([threadId]);
    expect(f.observeProjection).toHaveBeenCalledExactlyOnceWith({
      kind: "prepare-worktree",
      threadId,
      projectId: project.id,
      worktreePath: result.worktreePath,
    });
    await expect(moveHostThreadToWorktree(f.ctx, input)).resolves.toEqual(result);
    expect(f.call).toHaveBeenCalledTimes(5);
    await expect(moveHostThreadToWorktree(f.ctx, { ...input, withChanges: false })).rejects.toThrow(
      "already used",
    );
  });

  it("keeps the thread and its checkout intact when runtime retirement is unconfirmed", async () => {
    const f = fixture({ confirmed: false });
    await expect(moveHostThreadToWorktree(f.ctx, input)).rejects.toThrow(
      "exit could not be confirmed",
    );
    expect(f.call.mock.calls.map(([name]) => name)).toEqual([
      "getGitStatus",
      "closeThreadConfirmed",
    ]);
    expect(dbGetThread(threadId)?.worktreePath).toBeUndefined();
  });

  it("returns the created checkout without overwriting an intervening thread move", async () => {
    const path = join(directory, "created");
    const intervening = join(directory, "existing");
    const f = fixture({
      add: async () => {
        dbUpsertThread({ ...testThread(), worktreePath: intervening }, 19);
        return { path };
      },
    });
    await expect(moveHostThreadToWorktree(f.ctx, input)).resolves.toMatchObject({
      worktreePath: path,
      outcome: "checkout_created",
      runtime: "not_reopened",
    });
    expect(dbGetThread(threadId)?.worktreePath).toBe(intervening);
    expect(f.publishThreadsChanged).not.toHaveBeenCalled();
  });

  it("preserves a committed move and reports an unconfirmed reopen without retrying it", async () => {
    const f = fixture({
      reopen: () => {
        throw new Error("Connection lost");
      },
    });
    const result = await moveHostThreadToWorktree(f.ctx, { ...input, withChanges: false });
    expect(result).toMatchObject({ outcome: "moved", runtime: "reopen_unconfirmed" });
    expect(dbGetThread(threadId)?.worktreePath).toBe(result.worktreePath);
    expect(f.call).toHaveBeenNthCalledWith(
      3,
      "gitAddWorktree",
      expect.objectContaining({
        transferUncommitted: false,
        keepChangesInSource: false,
      }),
    );
    await expect(
      moveHostThreadToWorktree(f.ctx, { ...input, withChanges: false }),
    ).resolves.toEqual(result);
    expect(f.call).toHaveBeenCalledTimes(5);
  });

  it.each([false, true])(
    "preserves the original checkout on a failed creation withChanges=%s",
    async (withChanges) => {
      const f = fixture({
        add: async () => {
          throw new Error("Git connection lost");
        },
      });
      const request = { ...input, withChanges };
      await expect(moveHostThreadToWorktree(f.ctx, request)).rejects.toThrow(
        withChanges
          ? "Check the original thread and any stashed changes"
          : "The thread was reopened in its source checkout",
      );
      expect(dbGetThread(threadId)?.worktreePath).toBeUndefined();
      const calls = f.call.mock.calls;
      const launch = calls.find(([name]) => name === "ensureThreadRunning");
      const payload = launch?.[1] as
        | Pick<import("@/shared/contracts").StartThreadPayload, "projectLocation" | "threadId">
        | undefined;
      expect(payload?.projectLocation).toEqual(withChanges ? undefined : project.location);
      expect(payload?.threadId).toBe(withChanges ? undefined : threadId);
      await expect(moveHostThreadToWorktree(f.ctx, request)).rejects.toThrow(
        "outcome is uncertain",
      );
      expect(f.call).toHaveBeenCalledTimes(withChanges ? 3 : 4);
    },
  );

  it.each(["preflight", "checkout"] as const)(
    "commits the checkout without reopening after a Stop during %s",
    async (phase) => {
      let epoch = 0;
      const f = fixture({
        captureThreadControlState: (_threadId, expectedControls) => {
          const captured = epoch + expectedControls;
          return () => captured === epoch;
        },
        preflight: () => {
          if (phase === "preflight") epoch++;
        },
        onClose: () => {
          epoch++;
        },
        add: async () => {
          if (phase === "checkout") epoch++;
          return { path: join(directory, "target") };
        },
      });
      const result = await moveHostThreadToWorktree(f.ctx, input);
      expect(result).toMatchObject({ outcome: "moved", runtime: "not_reopened" });
      expect(dbGetThread(threadId)?.worktreePath).toBe(result.worktreePath);
      expect(f.call.mock.calls.some(([name]) => name === "ensureThreadRunning")).toBe(false);
    },
  );

  it("rejects a stale client assignment after the move and launches legacy requests in the saved checkout", async () => {
    const f = fixture();
    const result = await moveHostThreadToWorktree(f.ctx, input);
    await expect(
      applyRemoteThreadCommand(f.ctx, {
        kind: "set-worktree",
        threadId,
        worktreePath: join(directory, "other-client"),
      }),
    ).rejects.toThrow("already linked");
    const legacy = {
      kind: "start" as const,
      threadId,
      projectId: project.id,
      agentKind: testThread().agentKind,
      config: testThread().config,
      prompt: "",
      title: "Legacy launch",
    };
    const dispatchLaunch = vi.fn<NonNullable<Parameters<typeof startPersistedThread>[3]>>(
      async () => ({ threadId }),
    );
    await startPersistedThread(f.ctx.options, legacy, undefined, dispatchLaunch);
    expect(dispatchLaunch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        projectLocation: { ...project.location, path: result.worktreePath },
      }),
    );
    expect(dbGetThread(threadId)?.worktreePath).toBe(result.worktreePath);
    await expect(
      startPersistedThread(
        f.ctx.options,
        {
          ...legacy,
          worktreePath: join(directory, "other-client"),
        },
        undefined,
        dispatchLaunch,
      ),
    ).rejects.toThrow("checkout changed");
    expect(dispatchLaunch).toHaveBeenCalledTimes(1);
  });

  it("keeps a legacy first assignment without a branch valid", async () => {
    const f = fixture();
    const worktreePath = join(directory, "legacy");
    const command = { kind: "set-worktree" as const, threadId, worktreePath };
    await expect(applyRemoteThreadCommand(f.ctx, command)).resolves.toBe(false);
    expect(dbGetThread(threadId)).toMatchObject({ worktreePath, title: testThread().title });
    await expect(applyRemoteThreadCommand(f.ctx, command)).resolves.toBe(false);
  });
});
