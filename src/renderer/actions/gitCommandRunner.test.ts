import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult } from "@/shared/contracts";
import {
  pullMergedPrBaseIfPossible,
  refreshGitStatusForWorktree,
  runGitSyncCommand,
  showGitActionError,
} from "./gitCommandRunner";

const bridgeMock = vi.hoisted(() => ({
  gitPull: vi.fn<() => Promise<void>>(),
  gitPullRebase: vi.fn<() => Promise<void>>(),
  gitPush: vi.fn<() => Promise<void>>(),
  gitSync: vi.fn<() => Promise<void>>(),
  gitSyncRebase: vi.fn<() => Promise<void>>(),
  getGitStatus: vi.fn<() => Promise<GitStatusResult>>(),
}));

const setWorktreeStatusMock = vi.hoisted(() =>
  vi.fn<(worktreePath: string, status: GitStatusResult) => void>(),
);

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string, options?: Record<string, unknown>) => void>(),
}));

const captureRendererExceptionMock = vi.hoisted(() => vi.fn<() => void>());

vi.mock("@heroui/react", () => ({
  toast: toastMock,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

vi.mock("@/renderer/diagnostics/sentry", () => ({
  captureRendererException: captureRendererExceptionMock,
}));

vi.mock("@/renderer/state/gitStore", () => ({
  useGitStore: {
    getState: () => ({ setWorktreeStatus: setWorktreeStatusMock }),
  },
}));

const projectLocation = { kind: "posix" as const, path: "/repo" };
const cleanMainStatus: GitStatusResult = {
  isRepo: true,
  branch: "main",
  tracking: "origin/main",
  hasRemote: true,
  remoteInfo: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
};

describe("gitCommandRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes push commands through the shared bridge payload builder", async () => {
    bridgeMock.gitPush.mockResolvedValueOnce(undefined);

    await runGitSyncCommand({
      command: "push",
      projectLocation,
      remote: "origin",
      branch: "feature/a",
      setUpstream: true,
    });

    expect(bridgeMock.gitPush).toHaveBeenCalledWith({
      projectLocation,
      remote: "origin",
      branch: "feature/a",
      setUpstream: true,
    });
  });

  it("shows shared git action errors and captures only when requested", () => {
    const error = new Error("pull failed");

    showGitActionError(error, { capture: true });

    expect(toastMock.danger).toHaveBeenCalledWith("pull failed");
    expect(captureRendererExceptionMock).toHaveBeenCalledWith(error, {
      featureArea: "git",
    });
  });

  it("offers stash and pull for dirty remote pull errors", async () => {
    const onStashAndPull = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const error = new Error(
      "Git pull failed: Command failed: git pull --no-rebase origin\nYour local changes would be overwritten by merge",
    );

    showGitActionError(error, { onStashAndPull });

    const [, options] = toastMock.danger.mock.calls[0]!;
    expect(options).toMatchObject({
      actionProps: {
        children: "Stash & Pull",
        onPress: expect.any(Function),
      },
      timeout: 0,
    });
    const actionProps = options?.actionProps as { onPress: () => void };
    actionProps.onPress();
    await vi.waitFor(() => expect(onStashAndPull).toHaveBeenCalledOnce());
  });

  it("refreshes the cached worktree status after a remote git mutation", async () => {
    const worktreeLocation = { kind: "posix" as const, path: "/repo-worktree" };
    const conflictStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature",
      tracking: "",
      hasRemote: true,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 1,
      totalDeletions: 1,
      mergeInProgress: true,
      conflictFiles: [
        {
          path: "src/conflict.ts",
          status: "UU",
          staged: false,
          insertions: 1,
          deletions: 1,
        },
      ],
    };
    bridgeMock.getGitStatus.mockResolvedValueOnce(conflictStatus);

    await refreshGitStatusForWorktree(worktreeLocation, "/repo-worktree");

    expect(bridgeMock.getGitStatus).toHaveBeenCalledWith({
      projectLocation: worktreeLocation,
    });
    expect(setWorktreeStatusMock).toHaveBeenCalledWith("/repo-worktree", conflictStatus);
  });

  it("pulls after a PR merge when the clean project checkout is on the base branch", async () => {
    bridgeMock.getGitStatus.mockResolvedValueOnce(cleanMainStatus);
    bridgeMock.gitPull.mockResolvedValueOnce(undefined);

    await pullMergedPrBaseIfPossible(projectLocation, "main");

    expect(bridgeMock.getGitStatus).toHaveBeenCalledWith({
      projectLocation,
      detail: "summary",
    });
    expect(bridgeMock.gitPull).toHaveBeenCalledWith({
      projectLocation,
      remote: "origin",
    });
  });

  it.each<[string, Partial<GitStatusResult>]>([
    ["another branch", { branch: "feature" }],
    ["local commits", { ahead: 1 }],
    [
      "local changes",
      {
        unstaged: [
          {
            path: "file.ts",
            status: "M",
            staged: false,
            insertions: 0,
            deletions: 0,
          },
        ],
      },
    ],
    ["no tracking branch", { tracking: "" }],
  ])("skips the post-merge pull with %s", async (_name, override) => {
    bridgeMock.getGitStatus.mockResolvedValueOnce({
      ...cleanMainStatus,
      ...override,
    });

    await pullMergedPrBaseIfPossible(projectLocation, "main");

    expect(bridgeMock.gitPull).not.toHaveBeenCalled();
  });

  it("keeps a successful PR merge successful when the local pull fails", async () => {
    bridgeMock.getGitStatus.mockResolvedValueOnce(cleanMainStatus);
    bridgeMock.gitPull.mockRejectedValueOnce(new Error("network unavailable"));

    await expect(pullMergedPrBaseIfPossible(projectLocation, "main")).resolves.toBeUndefined();
  });
});
// @vitest-environment node
