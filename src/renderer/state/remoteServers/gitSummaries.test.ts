import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { syncRemoteGitSummaries } from "./gitSummaries";

const refreshGitProject = vi.hoisted(() =>
  vi.fn<(project: Project, reason: string, mode: string) => Promise<void>>(),
);

vi.mock("@/renderer/state/gitRefresh", () => ({ refreshGitProject }));

const project: Project = {
  id: "remote-project",
  remoteId: "project-1",
  remoteServerId: "desktop-1",
  name: "Remote project",
  location: { kind: "posix", path: "/repo", remoteServerId: "desktop-1" },
  createdAt: "2026-08-01T00:00:00.000Z",
};

const thread = {
  id: "remote-thread",
  remoteId: "thread-1",
  remoteServerId: "desktop-1",
  projectId: project.id,
  worktreePath: "/repo/worktree",
  worktreeBranch: "feature/test",
  archived: false,
} as Thread;

function status(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    isRepo: true,
    branch: "feature/test",
    tracking: "origin/feature/test",
    hasRemote: true,
    remoteInfo: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
    ...overrides,
  };
}

describe("syncRemoteGitSummaries", () => {
  beforeEach(() => {
    refreshGitProject.mockReset();
    useAppStore.setState({ projects: [project], threads: [thread] });
    useGitStore.setState({ statuses: {}, worktreeStatuses: {} });
  });

  it("does not overwrite detailed file state with conflicting aggregate counts", () => {
    useGitStore.getState().setWorktreeStatus(thread.worktreePath!, status());

    syncRemoteGitSummaries("desktop-1", {
      "thread-1": {
        isRepo: true,
        branch: "feature/test",
        totalInsertions: 6,
        totalDeletions: 1,
        ahead: 0,
        behind: 0,
        pr: null,
      },
    });

    expect(useGitStore.getState().worktreeStatuses[thread.worktreePath!]).toMatchObject({
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    });
    expect(refreshGitProject).toHaveBeenCalledWith(project, "watcher", "status");
  });

  it("updates summary metadata when aggregate counts match the detailed files", () => {
    const unstaged = [
      {
        path: "src/changed.ts",
        status: "M",
        staged: false,
        insertions: 6,
        deletions: 1,
      },
    ];
    useGitStore
      .getState()
      .setWorktreeStatus(
        thread.worktreePath!,
        status({ unstaged, totalInsertions: 6, totalDeletions: 1, behind: 2 }),
      );

    syncRemoteGitSummaries("desktop-1", {
      "thread-1": {
        isRepo: true,
        branch: "feature/test",
        totalInsertions: 6,
        totalDeletions: 1,
        ahead: 1,
        behind: 0,
        pr: null,
      },
    });

    expect(useGitStore.getState().worktreeStatuses[thread.worktreePath!]).toMatchObject({
      unstaged,
      ahead: 1,
      behind: 0,
      totalInsertions: 6,
      totalDeletions: 1,
    });
    expect(refreshGitProject).not.toHaveBeenCalled();
  });
});
