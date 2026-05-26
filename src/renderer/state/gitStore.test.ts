import { beforeEach, describe, expect, it } from "vitest";
import type {
  GitBranchListResult,
  GitStatusResult,
  GitWorktreeInfo,
  PrData,
  PrDetails,
} from "@/shared/contracts";
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

const basePrDetails: PrDetails = {
  number: 42,
  title: "Improve git polling",
  body: "Body",
  author: { login: "author", avatarUrl: "https://example.com/a.png" },
  baseBranch: "main",
  headBranch: "feature/git-polling",
  additions: 1,
  deletions: 2,
  changedFiles: 1,
  createdAt: "2026-04-04T00:00:00.000Z",
  mergedAt: null,
  mergedBy: null,
  closedAt: null,
  commits: [
    {
      oid: "abc123",
      abbreviatedOid: "abc123",
      messageHeadline: "Improve git polling",
      authoredDate: "2026-04-04T00:00:00.000Z",
      author: { login: "author" },
    },
  ],
  comments: [
    {
      id: "comment-1",
      author: { login: "reviewer" },
      body: "Looks good",
      createdAt: "2026-04-04T00:05:00.000Z",
    },
  ],
  reviews: [
    {
      id: "review-1",
      author: { login: "reviewer" },
      state: "APPROVED",
      body: "",
      submittedAt: "2026-04-04T00:10:00.000Z",
    },
  ],
  checks: [{ name: "CI", state: "IN_PROGRESS", conclusion: "", workflowName: "CI" }],
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
      prDetails: {},
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

  it("dedupes by path when staging an MM file (one entry, latest stats win)", () => {
    const stagedM = {
      path: "src/foo.ts",
      status: "M",
      staged: true,
      insertions: 10,
      deletions: 2,
    };
    const unstagedM = {
      path: "src/foo.ts",
      status: "M",
      staged: false,
      insertions: 3,
      deletions: 1,
    };
    useGitStore.getState().setStatus("p1", {
      ...baseStatus,
      staged: [stagedM],
      unstaged: [unstagedM],
    });

    useGitStore.getState().optimisticStageFile("p1", "src/foo.ts", false);

    const status = useGitStore.getState().statuses["p1"]!;
    expect(status.staged).toHaveLength(1);
    expect(status.staged[0]).toMatchObject({
      path: "src/foo.ts",
      staged: true,
      insertions: 3,
      deletions: 1,
    });
    expect(status.unstaged).toHaveLength(0);
  });

  it("moves staged conflict files out of the conflict list", () => {
    useGitStore.getState().setStatus("p1", {
      ...baseStatus,
      mergeInProgress: true,
      conflictFiles: [
        { path: "src/conflict.ts", status: "U", staged: false, insertions: 4, deletions: 2 },
      ],
    });

    useGitStore.getState().optimisticStageFile("p1", "src/conflict.ts", false);

    const status = useGitStore.getState().statuses["p1"]!;
    expect(status.conflictFiles).toEqual([]);
    expect(status.mergeInProgress).toBe(true);
    expect(status.staged).toEqual([
      { path: "src/conflict.ts", status: "M", staged: true, insertions: 4, deletions: 2 },
    ]);
  });

  it("dedupes by path when stage-all merges unstaged into already-staged entries", () => {
    useGitStore.getState().setStatus("p1", {
      ...baseStatus,
      staged: [
        { path: "a.ts", status: "M", staged: true, insertions: 5, deletions: 0 },
        { path: "b.ts", status: "A", staged: true, insertions: 50, deletions: 0 },
      ],
      unstaged: [
        { path: "a.ts", status: "M", staged: false, insertions: 2, deletions: 1 },
        { path: "c.ts", status: "?", staged: false, insertions: 7, deletions: 0 },
      ],
    });

    useGitStore.getState().optimisticStageAll("p1", false);

    const status = useGitStore.getState().statuses["p1"]!;
    const byPath = new Map(status.staged.map((f) => [f.path, f]));
    expect(status.staged).toHaveLength(3);
    expect(byPath.get("a.ts")).toMatchObject({ insertions: 2, deletions: 1, staged: true });
    expect(byPath.get("b.ts")).toMatchObject({ insertions: 50, deletions: 0, staged: true });
    expect(byPath.get("c.ts")).toMatchObject({ insertions: 7, status: "A", staged: true });
    expect(status.unstaged).toHaveLength(0);
  });

  it("dedupes by path on repeated stage-all calls (no accumulation)", () => {
    useGitStore.getState().setStatus("p1", {
      ...baseStatus,
      staged: [{ path: "a.ts", status: "M", staged: true, insertions: 5, deletions: 0 }],
      unstaged: [{ path: "a.ts", status: "M", staged: false, insertions: 1, deletions: 0 }],
    });

    useGitStore.getState().optimisticStageAll("p1", false);
    // Simulate a second click before the real status fetch lands by re-introducing an unstaged entry.
    useGitStore.getState().setStatus("p1", {
      ...useGitStore.getState().statuses["p1"]!,
      unstaged: [{ path: "a.ts", status: "M", staged: false, insertions: 2, deletions: 0 }],
    });
    useGitStore.getState().optimisticStageAll("p1", false);

    const status = useGitStore.getState().statuses["p1"]!;
    expect(status.staged).toHaveLength(1);
    expect(status.staged[0]).toMatchObject({ path: "a.ts", insertions: 2, staged: true });
  });

  it("batches PR updates without rewriting equal entries", () => {
    useGitStore.getState().setPrData("/wt/a", basePr);
    useGitStore
      .getState()
      .setPrData("/wt/b", { ...basePr, number: 43, updatedAt: "2026-04-04T01:00:00.000Z" });

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

  it("skips replacing unchanged PR details", () => {
    useGitStore.getState().setPrDetails("p1#42", basePrDetails);
    const firstDetails = useGitStore.getState().prDetails;
    const firstEntry = firstDetails["p1#42"];

    useGitStore.getState().setPrDetails("p1#42", {
      ...basePrDetails,
      ...(basePrDetails.author ? { author: { ...basePrDetails.author } } : {}),
      commits: basePrDetails.commits.map((commit) => ({
        ...commit,
        ...(commit.author ? { author: { ...commit.author } } : {}),
      })),
      comments: basePrDetails.comments.map((comment) => ({
        ...comment,
        author: { ...comment.author },
      })),
      reviews: basePrDetails.reviews.map((review) => ({
        ...review,
        author: { ...review.author },
      })),
      checks: basePrDetails.checks.map((check) => ({ ...check })),
    });

    expect(useGitStore.getState().prDetails).toBe(firstDetails);
    expect(useGitStore.getState().prDetails["p1#42"]).toBe(firstEntry);
  });

  it("replaces PR details when check status changes", () => {
    useGitStore.getState().setPrDetails("p1#42", basePrDetails);
    const firstDetails = useGitStore.getState().prDetails;

    useGitStore.getState().setPrDetails("p1#42", {
      ...basePrDetails,
      checks: [{ ...basePrDetails.checks[0]!, state: "COMPLETED", conclusion: "SUCCESS" }],
    });

    const secondDetails = useGitStore.getState().prDetails;
    expect(secondDetails).not.toBe(firstDetails);
    expect(secondDetails["p1#42"]?.checks[0]?.conclusion).toBe("SUCCESS");
  });
});
