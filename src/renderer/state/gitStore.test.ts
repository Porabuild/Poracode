import { beforeEach, describe, expect, it } from "vitest";
import type { GitBranchListResult, GitStatusResult, GitWorktreeInfo, PrData } from "../../shared/contracts";
import { useGitStore } from "./gitStore";

const baseStatus: GitStatusResult = {
  isRepo: true,
  branch: "main",
  tracking: "origin/main",
  hasRemote: true,
  remoteInfo: {
    url: "https://github.com/owner/repo.git",
    platform: "github",
    owner: "owner",
    repo: "repo",
  },
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
};

const baseBranches: GitBranchListResult = {
  current: "main",
  branches: [
    {
      name: "main",
      current: true,
      commit: "abc123",
      isRemote: false,
    },
  ],
};

const baseWorktrees: GitWorktreeInfo[] = [
  {
    path: "C:\\repo",
    branch: "main",
    commit: "abc123",
    isMain: true,
  },
];

const basePr: PrData = {
  number: 42,
  state: "open",
  title: "Improve git polling",
  url: "https://github.com/owner/repo/pull/42",
  baseBranch: "main",
  isDraft: false,
  reviewDecision: "approved",
  checksStatus: "success",
  updatedAt: "2026-04-04T00:00:00.000Z",
};

describe("gitStore batch updates", () => {
  beforeEach(() => {
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: {},
      prData: {},
    });
  });

  it("skips replacing project records when snapshot data is unchanged", () => {
    useGitStore.getState().setProjectSnapshot("p1", {
      status: baseStatus,
      branches: baseBranches,
      worktrees: baseWorktrees,
      ghAvailable: true,
    });

    const firstState = useGitStore.getState();
    const firstStatuses = firstState.statuses;
    const firstBranches = firstState.branches;
    const firstWorktrees = firstState.worktrees;
    const firstGhAvailable = firstState.ghAvailable;

    useGitStore.getState().setProjectSnapshot("p1", {
      status: { ...baseStatus },
      branches: {
        ...baseBranches,
        branches: baseBranches.branches.map((branch) => ({ ...branch })),
      },
      worktrees: baseWorktrees.map((worktree) => ({ ...worktree })),
      ghAvailable: true,
    });

    const secondState = useGitStore.getState();
    expect(secondState.statuses).toBe(firstStatuses);
    expect(secondState.branches).toBe(firstBranches);
    expect(secondState.worktrees).toBe(firstWorktrees);
    expect(secondState.ghAvailable).toBe(firstGhAvailable);
  });

  it("batches worktree status writes and preserves untouched entries", () => {
    useGitStore.getState().setWorktreeStatus("/wt/a", baseStatus);
    useGitStore.getState().setWorktreeStatus("/wt/b", { ...baseStatus, branch: "feature/b" });

    const firstStatuses = useGitStore.getState().worktreeStatuses;
    const preservedEntry = firstStatuses["/wt/a"];

    useGitStore.getState().setWorktreeStatuses({
      "/wt/a": { ...baseStatus },
      "/wt/b": { ...baseStatus, branch: "feature/b", ahead: 1 },
    });

    const secondStatuses = useGitStore.getState().worktreeStatuses;
    expect(secondStatuses).not.toBe(firstStatuses);
    expect(secondStatuses["/wt/a"]).toBe(preservedEntry);
    expect(secondStatuses["/wt/b"]?.ahead).toBe(1);
  });

  it("batches PR updates without rewriting equal entries", () => {
    useGitStore.getState().setPrData("/wt/a", basePr);
    useGitStore.getState().setPrData("/wt/b", { ...basePr, number: 43, updatedAt: "2026-04-04T01:00:00.000Z" });

    const firstPrData = useGitStore.getState().prData;
    const preservedEntry = firstPrData["/wt/a"];

    useGitStore.getState().setPrDataBatch({
      "/wt/a": { ...basePr },
      "/wt/b": { ...basePr, number: 43, updatedAt: "2026-04-04T02:00:00.000Z" },
    });

    const secondPrData = useGitStore.getState().prData;
    expect(secondPrData).not.toBe(firstPrData);
    expect(secondPrData["/wt/a"]).toBe(preservedEntry);
    expect(secondPrData["/wt/b"]?.updatedAt).toBe("2026-04-04T02:00:00.000Z");
  });
});
