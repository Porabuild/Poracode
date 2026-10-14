import { describe, expect, it, vi } from "vitest";
import { emptyGitStateSnapshot, gitTargetKey, pullRequestKey } from "@/shared/gitState";
import { worktreeScriptShellId } from "@/shared/worktreeScriptShell";
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
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
      async () => undefined as never,
    );
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
    const callSupervisor = vi.fn<RemoteServerContext["options"]["callSupervisor"]>(
      async () => undefined as never,
    );
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
