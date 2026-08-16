import { beforeEach, describe, expect, it } from "vitest";
import type { GitStatusResult, Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { syncRemoteGitSummaries } from "./gitSummaries";

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
    useAppStore.setState({ projects: [project], threads: [thread] });
    useGitStore.setState({ statuses: {}, worktreeStatuses: {} });
  });

  it("applies a newer host summary without discarding cached detailed files", () => {
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
      detail: "summary",
      totalInsertions: 6,
      totalDeletions: 1,
    });
  });

  it("creates an immediately displayable status from the first host summary", () => {
    syncRemoteGitSummaries("desktop-1", {
      "thread-1": {
        isRepo: true,
        branch: "feature/test",
        totalInsertions: 9,
        totalDeletions: 4,
        ahead: 2,
        behind: 1,
        pr: null,
      },
    });

    expect(useGitStore.getState().worktreeStatuses[thread.worktreePath!]).toMatchObject({
      detail: "summary",
      isRepo: true,
      branch: "feature/test",
      staged: [],
      unstaged: [],
      ahead: 2,
      behind: 1,
      totalInsertions: 9,
      totalDeletions: 4,
    });
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
  });
});
