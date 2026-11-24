import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { persistedGroupExperiment } from "@/shared/test/threadGroups";
import {
  dbAssertNoRunningCheckpointRevert,
  dbDeleteThread,
  dbGetProject,
  dbGetState,
  dbGetThreads,
  dbUpsertThread,
} from "../../db";
import { assertRemoteThreadCommandExperimentSafe } from "../experimentOwnership";
import type { RemoteServerContext } from "./context";
import { removeHostWorktree } from "./hostWorktreeLifecycle";
import { applyRemoteThreadCommand } from "./threadCommands";

vi.mock("../../db", () => ({
  dbAssertNoRunningCheckpointRevert: vi.fn<(threadIds: readonly string[]) => void>(),
  dbDeleteThread: vi.fn<(threadId: string) => void>(),
  dbGetProject: vi.fn<(projectId: string) => Project | null>(() => null),
  dbGetState: vi.fn<(key: string) => string | null>(() => null),
  dbGetThreads: vi.fn<() => Thread[]>(() => []),
  dbUpsertThread: vi.fn<typeof dbUpsertThread>(),
}));

vi.mock("./hostWorktreeLifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./hostWorktreeLifecycle")>();
  return {
    ...actual,
    removeHostWorktree: vi.fn<typeof removeHostWorktree>(async () => undefined),
  };
});

const PROJECT: Project = {
  id: "proj-1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function makeThread(id: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    projectId: PROJECT.id,
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: true,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setup(initialThreads: Thread[]) {
  const threads = [...initialThreads];
  vi.mocked(dbGetThreads).mockImplementation(() => threads);
  vi.mocked(dbGetProject).mockImplementation((projectId) =>
    projectId === PROJECT.id ? PROJECT : null,
  );
  vi.mocked(dbUpsertThread).mockImplementation((row) => {
    const idx = threads.findIndex((entry) => entry.id === row.id);
    if (idx >= 0) threads[idx] = row;
  });
  vi.mocked(dbDeleteThread).mockImplementation((threadId) => {
    const idx = threads.findIndex((entry) => entry.id === threadId);
    if (idx >= 0) threads.splice(idx, 1);
  });
  const callSupervisor = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
  const publishThreadsChanged = vi.fn<(threadIds: string[]) => void>();
  const ctx = {
    options: { callSupervisor },
    publishThreadsChanged,
  } as unknown as RemoteServerContext;
  return { ctx, threads, callSupervisor, publishThreadsChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbGetState).mockReturnValue(null);
  vi.mocked(removeHostWorktree).mockResolvedValue(undefined);
});

describe("remove-threads host command", () => {
  it("archives every existing thread in one command and ignores already-missing ids", async () => {
    const { ctx, threads, callSupervisor } = setup([makeThread("t1"), makeThread("t2")]);

    await expect(
      applyRemoteThreadCommand(ctx, {
        kind: "remove-threads",
        threadId: "t1",
        threadIds: ["t1", "t2", "missing"],
        action: "archive",
      }),
    ).resolves.toBe(false);

    expect(callSupervisor).toHaveBeenCalledWith("closeThread", { threadId: "t1" });
    expect(callSupervisor).toHaveBeenCalledWith("closeThread", { threadId: "t2" });
    expect(threads.every((thread) => thread.archived)).toBe(true);
    expect(dbDeleteThread).not.toHaveBeenCalled();
  });

  it("deletes threads without removing worktrees when removeOwnedWorktrees is false", async () => {
    const { ctx, threads } = setup([
      makeThread("t1", { worktreePath: "/repo/.poracode/worktrees/a", worktreeBranch: "feat/a" }),
      makeThread("t2"),
    ]);

    await applyRemoteThreadCommand(ctx, {
      kind: "remove-threads",
      threadId: "t1",
      threadIds: ["t1", "t2"],
      action: "delete",
    });

    expect(removeHostWorktree).not.toHaveBeenCalled();
    expect(threads).toEqual([]);
  });

  it("removes exclusively-owned worktrees and preserves worktrees with surviving siblings", async () => {
    const { ctx, threads } = setup([
      makeThread("t1", {
        worktreePath: "/repo/.poracode/worktrees/owned",
        worktreeBranch: "feat/owned",
      }),
      makeThread("t2", {
        worktreePath: "/repo/.poracode/worktrees/owned",
        worktreeBranch: "feat/owned",
      }),
      makeThread("t3", {
        worktreePath: "/repo/.poracode/worktrees/shared",
        worktreeBranch: "feat/shared",
      }),
      makeThread("keep", {
        worktreePath: "/repo/.poracode/worktrees/shared",
        worktreeBranch: "feat/shared",
        done: false,
      }),
    ]);

    await applyRemoteThreadCommand(ctx, {
      kind: "remove-threads",
      threadId: "t1",
      threadIds: ["t1", "t2", "t3"],
      action: "delete",
      removeOwnedWorktrees: true,
    });

    expect(removeHostWorktree).toHaveBeenCalledTimes(1);
    expect(removeHostWorktree).toHaveBeenCalledWith(ctx, {
      projectId: PROJECT.id,
      worktreePath: "/repo/.poracode/worktrees/owned",
      worktreeBranch: "feat/owned",
      expectedThreadIds: ["t1", "t2"],
    });
    expect(threads.map((thread) => thread.id)).toEqual(["keep"]);
  });

  it("preserves threads whose owned worktree failed to remove while publishing other deletions", async () => {
    const { ctx, threads, publishThreadsChanged } = setup([
      makeThread("wt-fail", {
        worktreePath: "/repo/.poracode/worktrees/fail",
        worktreeBranch: "feat/fail",
      }),
      makeThread("plain"),
    ]);
    vi.mocked(removeHostWorktree).mockRejectedValueOnce(new Error("branch not fully merged"));

    await expect(
      applyRemoteThreadCommand(ctx, {
        kind: "remove-threads",
        threadId: "wt-fail",
        threadIds: ["wt-fail", "plain"],
        action: "delete",
        removeOwnedWorktrees: true,
      }),
    ).rejects.toThrow("branch not fully merged");

    expect(threads.map((thread) => thread.id)).toEqual(["wt-fail"]);
    expect(publishThreadsChanged).toHaveBeenCalledWith(["plain"]);
  });

  it("rejects anchor mismatches and duplicate ids before any effect", async () => {
    const { ctx } = setup([makeThread("t1"), makeThread("t2")]);

    await expect(
      applyRemoteThreadCommand(ctx, {
        kind: "remove-threads",
        threadId: "t2",
        threadIds: ["t1", "t2"],
        action: "archive",
      }),
    ).rejects.toThrow(/anchor/i);

    await expect(
      applyRemoteThreadCommand(ctx, {
        kind: "remove-threads",
        threadId: "t1",
        threadIds: ["t1", "t1"],
        action: "delete",
      }),
    ).rejects.toThrow(/duplicate/i);

    expect(dbUpsertThread).not.toHaveBeenCalled();
    expect(dbDeleteThread).not.toHaveBeenCalled();
    expect(dbAssertNoRunningCheckpointRevert).not.toHaveBeenCalled();
  });

  it("blocks bulk removal when any thread is an experiment candidate", () => {
    vi.mocked(dbGetState).mockReturnValue(persistedGroupExperiment());
    expect(() =>
      assertRemoteThreadCommandExperimentSafe({
        kind: "remove-threads",
        threadId: "ordinary",
        threadIds: ["ordinary", "a"],
        action: "delete",
      }),
    ).toThrow(/Experiment candidates/);
  });
});
