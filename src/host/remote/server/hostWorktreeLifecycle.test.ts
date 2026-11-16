import { describe, expect, it, vi } from "vitest";
import { emptyGitStateSnapshot, gitTargetKey, pullRequestKey } from "@/shared/gitState";
import type { GitWorktreeInfo } from "@/shared/contracts";
import { worktreeScriptShellId } from "@/shared/worktreeScriptShell";
import { RemoteHttpError } from "../auth";
import type { RemoteBroadcastEvent, RemoteServerContext } from "./context";
import {
  buildHostScriptWithExitOnSuccess,
  normalizeHostShellScript,
  prepareHostWorktree,
  removeHostWorktree,
  worktreeHasUnmergedPullRequest,
} from "./hostWorktreeLifecycle";

vi.mock("@/host/db", () => ({
  dbGetProjects: vi.fn<() => unknown[]>(),
  dbGetThreads: vi.fn<() => unknown[]>(),
  dbGetState: vi.fn<() => null>(() => null),
}));

import { dbGetProjects, dbGetThreads } from "@/host/db";

function createContext(
  callSupervisor: RemoteServerContext["options"]["callSupervisor"],
  waitForSupervisorEvent: RemoteServerContext["waitForSupervisorEvent"] = async () =>
    ({ type: "thread-exited", threadId: "shell", exitCode: 0 }) as never,
): RemoteServerContext {
  return {
    options: { callSupervisor } as RemoteServerContext["options"],
    waitForSupervisorEvent,
  } as RemoteServerContext;
}

const linkedWorktree: GitWorktreeInfo = {
  path: "/repo/wt",
  branch: "feat/x",
  commit: "abc123",
  isMain: false,
};

function removalSupervisor(worktrees: GitWorktreeInfo[] = [linkedWorktree]) {
  return vi.fn<RemoteServerContext["options"]["callSupervisor"]>(async (name) =>
    name === "gitListWorktrees" ? ({ worktrees } as never) : (undefined as never),
  );
}

describe("host worktree lifecycle", () => {
  it("normalizes comments out of a setup script and exits on success", () => {
    expect(normalizeHostShellScript("# bootstrap\n\npnpm install\n")).toBe("pnpm install");
    expect(buildHostScriptWithExitOnSuccess("pnpm install\npnpm build", "posix")).toBe(
      "pnpm install && pnpm build && exit",
    );
    expect(buildHostScriptWithExitOnSuccess("pnpm install", "windows")).toBe(
      "pnpm install; if ($?) { exit }",
    );
  });

  it("treats only a non-merged PR on the worktree as blocking a force-delete", () => {
    const hostId = "desktop-1";
    const projectId = "project-1";
    const worktreePath = "/repo/wt";
    const prRef = { hostId, projectId, prNumber: 12 };
    const snapshot = {
      ...emptyGitStateSnapshot(),
      targets: {
        [gitTargetKey({ hostId, projectId, worktreePath })]: {
          ref: { hostId, projectId, worktreePath },
          pullRequestKey: pullRequestKey(prRef),
          refreshedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      pullRequests: {
        [pullRequestKey(prRef)]: {
          ref: prRef,
          data: {
            number: 12,
            title: "WIP",
            state: "open" as const,
            url: "https://example.test/12",
            baseBranch: "main",
            isDraft: false,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          freshness: {},
        },
      },
    };
    expect(worktreeHasUnmergedPullRequest(snapshot, projectId, worktreePath)).toBe(true);
    expect(worktreeHasUnmergedPullRequest(undefined, projectId, worktreePath)).toBe(false);
  });

  it("prepares a new worktree on the host without waiting for setup to finish", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      {
        id: "project-1",
        name: "Repo",
        location: { kind: "posix", path: "/repo" },
        scripts: { actions: [], setupScript: "# hi\npnpm install" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.mocked(dbGetThreads).mockReturnValue([]);
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
      async () => undefined as never,
    );
    const shellId = worktreeScriptShellId("project-1", "/repo/wt", false);
    let releasePrompt: ((event: RemoteBroadcastEvent) => void) | undefined;
    const waitForSupervisorEvent = vi.fn<RemoteServerContext["waitForSupervisorEvent"]>(
      () =>
        new Promise((resolve) => {
          releasePrompt = resolve;
        }),
    );

    await prepareHostWorktree(createContext(callSupervisor, waitForSupervisorEvent), {
      projectId: "project-1",
      worktreePath: "/repo/wt",
    });

    expect(callSupervisor).toHaveBeenNthCalledWith(1, "gitWatchWorktrees", {
      projectId: "project-1",
      worktreePaths: ["/repo/wt"],
    });
    expect(callSupervisor).toHaveBeenNthCalledWith(2, "startShell", {
      shellId,
      projectLocation: { kind: "posix", path: "/repo/wt" },
      worktreePath: "/repo/wt",
    });
    expect(callSupervisor).not.toHaveBeenCalledWith(
      "writeTerminal",
      expect.objectContaining({ data: "pnpm install && exit\r" }),
    );
    releasePrompt?.({
      type: "thread-output",
      threadId: shellId,
      data: "\u001B]133;B\u001B\\",
      outputLength: 1,
      terminalInstanceId: "gen",
    });
    await vi.waitFor(() => {
      expect(callSupervisor).toHaveBeenCalledWith("writeTerminal", {
        threadId: shellId,
        data: "pnpm install && exit\r",
      });
    });
  });

  it("removes a worktree on the host: cleanup, git remove, then branch delete", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      {
        id: "project-1",
        name: "Repo",
        location: { kind: "posix", path: "/repo" },
        scripts: { actions: [], cleanupScript: "rm -rf node_modules" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const callSupervisor = removalSupervisor();
    const prompt = {
      type: "thread-output" as const,
      threadId: "shell",
      data: "\u001B]133;B\u001B\\",
      outputLength: 1,
      terminalInstanceId: "gen",
    } satisfies RemoteBroadcastEvent;
    const waitForSupervisorEvent = vi.fn<RemoteServerContext["waitForSupervisorEvent"]>();
    waitForSupervisorEvent
      .mockResolvedValueOnce(prompt)
      .mockResolvedValueOnce({ type: "thread-exited", threadId: "shell", exitCode: 0 });

    await removeHostWorktree(createContext(callSupervisor, waitForSupervisorEvent), {
      projectId: "project-1",
      worktreePath: "/repo/wt",
      worktreeBranch: "feat/x",
    });

    expect(callSupervisor).toHaveBeenCalledWith(
      "startShell",
      expect.objectContaining({ worktreePath: "/repo/wt" }),
    );
    expect(callSupervisor).toHaveBeenCalledWith(
      "writeTerminal",
      expect.objectContaining({ data: "rm -rf node_modules && exit\r" }),
    );
    expect(waitForSupervisorEvent).toHaveBeenCalledTimes(2);
    expect(callSupervisor).toHaveBeenCalledWith(
      "gitRemoveWorktree",
      expect.objectContaining({
        path: "/repo/wt",
        force: true,
        deleteBranch: false,
        expectedBranch: "feat/x",
      }),
    );
    expect(callSupervisor).toHaveBeenCalledWith("gitDeleteBranch", {
      projectLocation: { kind: "posix", path: "/repo" },
      branch: "feat/x",
      force: true,
    });
  });

  it("does not wait again when the cleanup shell exits before the prompt", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      {
        id: "project-1",
        name: "Repo",
        location: { kind: "posix", path: "/repo" },
        scripts: { actions: [], cleanupScript: "rm -rf node_modules" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const callSupervisor = removalSupervisor();
    const waitForSupervisorEvent = vi.fn<RemoteServerContext["waitForSupervisorEvent"]>(
      async () =>
        ({
          type: "thread-exited",
          threadId: "shell",
          exitCode: 1,
        }) satisfies RemoteBroadcastEvent,
    );

    await removeHostWorktree(createContext(callSupervisor, waitForSupervisorEvent), {
      projectId: "project-1",
      worktreePath: "/repo/wt",
    });

    expect(callSupervisor).not.toHaveBeenCalledWith(
      "writeTerminal",
      expect.objectContaining({ data: expect.any(String) }),
    );
    expect(waitForSupervisorEvent).toHaveBeenCalledOnce();
    expect(callSupervisor).toHaveBeenCalledWith(
      "gitRemoveWorktree",
      expect.objectContaining({ path: "/repo/wt" }),
    );
  });

  it.each([
    { name: "renamed branch", path: "/repo/wt", branch: "feat/renamed" },
    { name: "moved worktree", path: "/repo/moved-wt", branch: "feat/x" },
  ])("removes a $name using Git's current registration", async ({ path, branch }) => {
    vi.mocked(dbGetProjects).mockReturnValue([
      {
        id: "project-1",
        name: "Repo",
        createdAt: "2026-01-01",
        location: { kind: "posix", path: "/repo" },
      },
    ]);
    const callSupervisor = removalSupervisor([{ ...linkedWorktree, path, branch }]);
    await removeHostWorktree(createContext(callSupervisor), {
      projectId: "project-1",
      worktreePath: "/repo/wt",
      worktreeBranch: "feat/x",
    });
    expect(callSupervisor).toHaveBeenCalledWith("gitRemoveWorktree", {
      projectLocation: { kind: "posix", path: "/repo" },
      path,
      force: true,
      deleteBranch: false,
      expectedBranch: branch,
    });
    expect(callSupervisor).toHaveBeenCalledWith("gitDeleteBranch", {
      projectLocation: { kind: "posix", path: "/repo" },
      branch,
      force: true,
    });
  });

  it.each(["missing", "detached"])(
    "does not delete a stale branch for a %s worktree",
    async (kind) => {
      vi.mocked(dbGetProjects).mockReturnValue([
        {
          id: "project-1",
          name: "Repo",
          createdAt: "2026-01-01",
          location: { kind: "posix", path: "/repo" },
        },
      ]);
      const callSupervisor = removalSupervisor(
        kind === "missing" ? [] : [{ ...linkedWorktree, branch: "detached" }],
      );
      await removeHostWorktree(createContext(callSupervisor), {
        projectId: "project-1",
        worktreePath: "/repo/wt",
        worktreeBranch: "feat/x",
      });
      expect(callSupervisor).not.toHaveBeenCalledWith("gitDeleteBranch", expect.anything());
      const removedPaths = callSupervisor.mock.calls.flatMap(([name, payload]) =>
        name === "gitRemoveWorktree" ? [(payload as { path: string }).path] : [],
      );
      expect(removedPaths).toEqual(kind === "missing" ? [] : ["/repo/wt"]);
    },
  );

  it("refuses the main worktree before running cleanup", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      {
        id: "project-1",
        name: "Repo",
        createdAt: "2026-01-01",
        location: { kind: "posix", path: "/repo" },
        scripts: { cleanupScript: "cleanup", actions: [] },
      },
    ]);
    const callSupervisor = removalSupervisor([{ ...linkedWorktree, isMain: true }]);
    await expect(
      removeHostWorktree(createContext(callSupervisor), {
        projectId: "project-1",
        worktreePath: "/repo/wt",
      }),
    ).rejects.toThrow("Cannot remove the main worktree.");
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("preserves a moved worktree with an additional linked sibling", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      {
        id: "project-1",
        name: "Repo",
        createdAt: "2026-01-01",
        location: { kind: "posix", path: "/repo" },
      },
    ]);
    vi.mocked(dbGetThreads).mockReturnValue([
      { id: "selected", projectId: "project-1", worktreePath: "/repo/wt" },
      { id: "sibling", projectId: "project-1", worktreePath: "/repo/moved-wt" },
    ] as never);
    const callSupervisor = removalSupervisor([{ ...linkedWorktree, path: "/repo/moved-wt" }]);
    await expect(
      removeHostWorktree(createContext(callSupervisor), {
        projectId: "project-1",
        worktreePath: "/repo/wt",
        worktreeBranch: "feat/x",
        expectedThreadIds: ["selected"],
      }),
    ).rejects.toMatchObject({ code: "worktree_threads_changed" });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("deletes the branch observed after the cleanup script", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      {
        id: "project-1",
        name: "Repo",
        createdAt: "2026-01-01",
        location: { kind: "posix", path: "/repo" },
        scripts: { actions: [], cleanupScript: "cleanup" },
      },
    ]);
    let branch = "feat/x";
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(async (name) => {
      if (name === "gitListWorktrees")
        return { worktrees: [{ ...linkedWorktree, branch }] } as never;
      if (name === "writeTerminal") branch = "feat/after-cleanup";
      return undefined as never;
    });
    const waitForSupervisorEvent = vi
      .fn<RemoteServerContext["waitForSupervisorEvent"]>()
      .mockResolvedValueOnce({
        type: "thread-output",
        threadId: "shell",
        data: "\u001B]133;B\u001B\\",
        outputLength: 1,
        terminalInstanceId: "gen",
      })
      .mockResolvedValueOnce({ type: "thread-exited", threadId: "shell", exitCode: 0 });
    await removeHostWorktree(createContext(callSupervisor, waitForSupervisorEvent), {
      projectId: "project-1",
      worktreePath: "/repo/wt",
      worktreeBranch: "feat/x",
    });
    expect(callSupervisor).toHaveBeenCalledWith(
      "gitRemoveWorktree",
      expect.objectContaining({ expectedBranch: "feat/after-cleanup" }),
    );
    expect(callSupervisor).toHaveBeenCalledWith(
      "gitDeleteBranch",
      expect.objectContaining({ branch: "feat/after-cleanup" }),
    );
    expect(callSupervisor).not.toHaveBeenCalledWith(
      "gitDeleteBranch",
      expect.objectContaining({ branch: "feat/x" }),
    );
  });

  it("retains an intermediate-path sibling created during cleanup before another move", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      {
        id: "project-1",
        name: "Repo",
        createdAt: "2026-01-01",
        location: { kind: "posix", path: "/repo" },
        scripts: { actions: [], cleanupScript: "cleanup" },
      },
    ]);
    const selected = { id: "selected", projectId: "project-1", worktreePath: "/repo/old-wt" };
    vi.mocked(dbGetThreads).mockReturnValue([selected] as never);
    let path = "/repo/middle-wt";
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(async (name) => {
      if (name === "gitListWorktrees") return { worktrees: [{ ...linkedWorktree, path }] } as never;
      if (name === "writeTerminal") {
        vi.mocked(dbGetThreads).mockReturnValue([
          selected,
          { ...selected, id: "sibling", worktreePath: path },
        ] as never);
        path = "/repo/final-wt";
      }
      return undefined as never;
    });
    const waitForSupervisorEvent = vi
      .fn<RemoteServerContext["waitForSupervisorEvent"]>()
      .mockResolvedValueOnce({
        type: "thread-output",
        threadId: "shell",
        data: "\u001B]133;B\u001B\\",
        outputLength: 1,
        terminalInstanceId: "gen",
      })
      .mockResolvedValueOnce({ type: "thread-exited", threadId: "shell", exitCode: 0 });
    await expect(
      removeHostWorktree(createContext(callSupervisor, waitForSupervisorEvent), {
        projectId: "project-1",
        worktreePath: selected.worktreePath,
        worktreeBranch: "feat/x",
        expectedThreadIds: [selected.id],
      }),
    ).rejects.toMatchObject({ code: "worktree_threads_changed" });
    expect(callSupervisor).not.toHaveBeenCalledWith("gitRemoveWorktree", expect.anything());
  });

  it.each([false, true])(
    "reconciles a concurrent branch change with bounded retries (continuous=%s)",
    async (continuous) => {
      vi.mocked(dbGetProjects).mockReturnValue([
        {
          id: "project-1",
          name: "Repo",
          createdAt: "2026-01-01",
          location: { kind: "posix", path: "/repo" },
        },
      ]);
      let branch = "feat/x";
      let attempts = 0;
      const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
        async (name) => {
          if (name === "gitListWorktrees")
            return { worktrees: [{ ...linkedWorktree, branch }] } as never;
          if (name === "gitRemoveWorktree") {
            attempts += 1;
            if (continuous || attempts === 1) {
              const previous = branch;
              branch = `${branch}-renamed`;
              throw new Error(`Expected worktree branch ${previous}, but found ${branch}`);
            }
          }
          return undefined as never;
        },
      );
      const removal = removeHostWorktree(createContext(callSupervisor), {
        projectId: "project-1",
        worktreePath: "/repo/wt",
        worktreeBranch: "feat/x",
      });
      const result = await removal.then(
        () => null,
        (error: unknown) => (error instanceof RemoteHttpError ? error.code : String(error)),
      );
      expect(result).toBe(continuous ? "worktree_remove_failed" : null);
      expect(attempts).toBe(continuous ? 3 : 2);
      const deletedBranches = callSupervisor.mock.calls.flatMap(([name, payload]) =>
        name === "gitDeleteBranch" ? [(payload as { branch: string }).branch] : [],
      );
      expect(deletedBranches).toEqual(continuous ? [] : ["feat/x-renamed"]);
    },
  );

  it("writes after a late spawn reset when the scrollback already has a prompt", async () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      {
        id: "project-1",
        name: "Repo",
        location: { kind: "posix", path: "/repo" },
        scripts: { actions: [], setupScript: "pnpm install" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.mocked(dbGetThreads).mockReturnValue([]);
    const shellId = worktreeScriptShellId("project-1", "/repo/wt", false);
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(async (name) =>
      name === "readTerminalScrollback" ? ("$ " as never) : (undefined as never),
    );
    let waits = 0;
    const waitForSupervisorEvent = vi.fn<RemoteServerContext["waitForSupervisorEvent"]>(
      (_match, timeout) => {
        waits += 1;
        if (waits === 1) {
          return Promise.resolve({
            type: "thread-output",
            threadId: shellId,
            data: "$ ",
            outputLength: 2,
            terminalInstanceId: "gen",
          } satisfies RemoteBroadcastEvent);
        }
        if (waits === 2) {
          return Promise.resolve({
            type: "thread-reset",
            threadId: shellId,
          } satisfies RemoteBroadcastEvent);
        }
        return new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Timed out waiting for supervisor event.")), timeout);
        });
      },
    );

    const started = Date.now();
    await prepareHostWorktree(createContext(callSupervisor, waitForSupervisorEvent), {
      projectId: "project-1",
      worktreePath: "/repo/wt",
    });
    await vi.waitFor(() => {
      expect(callSupervisor).toHaveBeenCalledWith("writeTerminal", {
        threadId: shellId,
        data: "pnpm install && exit\r",
      });
    });
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
