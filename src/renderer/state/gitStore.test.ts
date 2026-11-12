import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitBranchListResult,
  GitStatusResult,
  GitWorktreeInfo,
  PrData,
  PrDetails,
  ForgeRepository,
} from "@/shared/contracts";
import { resetGitStoreCache, summaryBackfillMissed, useGitStore } from "./gitStore";
import { repoIdentityKey } from "@/shared/repoIdentity";

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

const forgeSource: ForgeRepository = {
  forge: "github",
  host: "https://github.com",
  repository: "owner/repo",
  remote: "origin",
  account: { forge: "github", host: "https://github.com", login: "alice" },
  capabilities: {
    mergeMethods: ["merge", "squash", "rebase"],
    reviewDecisions: ["approve", "request-changes", "comment"],
    draft: true,
    reopen: true,
    updateBranch: true,
    rebaseBranch: true,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: true,
    autoFix: true,
    adminMerge: true,
  },
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

  it("clears in-memory and persisted cache state immediately", () => {
    useGitStore.getState().setStatus("p1", baseStatus);
    localStorage.setItem("poracode-git-cache-v2", "stale-desktop-cache");

    resetGitStoreCache();

    expect(useGitStore.getState().statuses).toEqual({});
    expect(localStorage.getItem("poracode-git-cache-v2")).toBeNull();
  });

  it("recomputes released v1 GitHub availability and repository caches without rewriting them", async () => {
    resetGitStoreCache();
    const previous = JSON.stringify({
      v: 1,
      ts: Date.now(),
      statuses: { p1: baseStatus },
      ghAvailable: { p1: true },
      prData: { "/wt/a": basePr },
    });
    localStorage.setItem("poracode-git-cache-v1", previous);
    vi.resetModules();
    const upgraded = await import("./gitStore");
    try {
      expect(upgraded.useGitStore.getState().statuses).toEqual({});
      expect(upgraded.useGitStore.getState().ghAvailable).toEqual({});
      expect(upgraded.useGitStore.getState().prData).toEqual({});
      expect(localStorage.getItem("poracode-git-cache-v1")).toBe(previous);
    } finally {
      upgraded.resetGitStoreCache();
      localStorage.removeItem("poracode-git-cache-v1");
      vi.resetModules();
    }
  });

  it("keeps released v2 raw SSH statuses but treats their origins as unconfirmed until a canonical refresh", async () => {
    resetGitStoreCache();
    const alias = {
      ...baseStatus,
      remoteInfo: { ...baseStatus.remoteInfo!, url: "git@github.com-personal:owner/repo.git" },
    };
    const resolvedSsh = {
      ...baseStatus,
      remoteInfo: { ...baseStatus.remoteInfo!, url: "ssh://git@github.com/owner/repo.git" },
    };
    localStorage.setItem(
      "poracode-git-cache-v2",
      JSON.stringify({ v: 2, ts: Date.now(), statuses: { p1: alias, p2: resolvedSsh } }),
    );
    vi.resetModules();
    const upgraded = await import("./gitStore");
    try {
      expect(upgraded.useGitStore.getState().statuses).toEqual({ p1: alias, p2: resolvedSsh });
      expect(repoIdentityKey(alias.remoteInfo)).toBeNull();
      expect(repoIdentityKey(resolvedSsh.remoteInfo)).toBeNull();

      const canonical = {
        ...alias,
        remoteInfo: { ...alias.remoteInfo!, url: "https://github.com/owner/repo.git" },
      };
      upgraded.useGitStore.getState().setProjectSnapshot("p1", { status: canonical });
      expect(upgraded.useGitStore.getState().statuses.p1).toEqual(canonical);
      expect(repoIdentityKey(canonical.remoteInfo)).toBe("https://github.com/owner/repo");
      expect(repoIdentityKey(upgraded.useGitStore.getState().statuses.p2?.remoteInfo)).toBeNull();
    } finally {
      upgraded.resetGitStoreCache();
      vi.resetModules();
    }
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

  it.each(["main", "worktree"] as const)(
    "preserves matching full diff stats when a summary %s status lands",
    (root) => {
      const apply = (status: GitStatusResult) =>
        root === "main"
          ? useGitStore.getState().setStatus("p1", status)
          : useGitStore.getState().setWorktreeStatuses({ "/wt/a": status });
      apply({
        ...baseStatus,
        unstaged: [
          {
            path: "src/changed.ts",
            status: "M",
            staged: false,
            insertions: 8,
            deletions: 2,
          },
        ],
        totalInsertions: 8,
        totalDeletions: 2,
      });

      apply({
        detail: "summary",
        ...baseStatus,
        remoteInfo: null,
        unstaged: [
          {
            path: "src/changed.ts",
            status: "M",
            staged: false,
            insertions: 0,
            deletions: 0,
          },
        ],
        totalInsertions: 0,
        totalDeletions: 0,
      });

      const status = (
        root === "main"
          ? useGitStore.getState().statuses.p1
          : useGitStore.getState().worktreeStatuses["/wt/a"]
      )!;
      expect(status.detail).toBe("summary");
      expect(status.remoteInfo).toBe(baseStatus.remoteInfo);
      expect(status.unstaged[0]).toMatchObject({ insertions: 8, deletions: 2 });
      expect(status.totalInsertions).toBe(8);
      expect(status.totalDeletions).toBe(2);
    },
  );

  it("sums stats when staging a file that already has a staged entry (MM)", () => {
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
    // Git's HEAD→index diff is cumulative: 10+3 insertions, 2+1 deletions.
    expect(status.staged[0]).toMatchObject({
      path: "src/foo.ts",
      staged: true,
      insertions: 13,
      deletions: 3,
    });
    expect(status.unstaged).toHaveLength(0);
  });

  it("sums stats when unstaging a file that already has an unstaged entry", () => {
    useGitStore.getState().setStatus("p1", {
      ...baseStatus,
      staged: [{ path: "src/foo.ts", status: "M", staged: true, insertions: 4, deletions: 1 }],
      unstaged: [{ path: "src/foo.ts", status: "M", staged: false, insertions: 3, deletions: 2 }],
    });

    useGitStore.getState().optimisticUnstageFile("p1", "src/foo.ts", false);

    const status = useGitStore.getState().statuses["p1"]!;
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged).toHaveLength(1);
    expect(status.unstaged[0]).toMatchObject({
      path: "src/foo.ts",
      staged: false,
      insertions: 7,
      deletions: 3,
    });
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

  it("sums stats when stage-all merges unstaged into already-staged entries", () => {
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
    // a.ts already staged (5/0) + newly staged hunk (2/1) → cumulative 7/1.
    expect(byPath.get("a.ts")).toMatchObject({ insertions: 7, deletions: 1, staged: true });
    expect(byPath.get("b.ts")).toMatchObject({ insertions: 50, deletions: 0, staged: true });
    expect(byPath.get("c.ts")).toMatchObject({ insertions: 7, status: "A", staged: true });
    expect(status.unstaged).toHaveLength(0);
  });

  it("sums stats when unstage-all merges staged into already-unstaged entries", () => {
    useGitStore.getState().setStatus("p1", {
      ...baseStatus,
      staged: [
        { path: "a.ts", status: "M", staged: true, insertions: 5, deletions: 1 },
        { path: "b.ts", status: "M", staged: true, insertions: 8, deletions: 0 },
      ],
      unstaged: [{ path: "a.ts", status: "M", staged: false, insertions: 2, deletions: 3 }],
    });

    useGitStore.getState().optimisticUnstageAll("p1", false);

    const status = useGitStore.getState().statuses["p1"]!;
    const byPath = new Map(status.unstaged.map((f) => [f.path, f]));
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged).toHaveLength(2);
    // a.ts already unstaged (2/3) + unstaged staged hunk (5/1) → cumulative 7/4.
    expect(byPath.get("a.ts")).toMatchObject({ insertions: 7, deletions: 4, staged: false });
    expect(byPath.get("b.ts")).toMatchObject({ insertions: 8, deletions: 0, staged: false });
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

  it.each(["single", "batch"])("preserves a merged PR after a late %s refresh", (mode) => {
    const merged: PrData = { ...basePr, state: "merged" };
    useGitStore.getState().setPrData("/wt/a", merged);
    const apply = (pr: PrData) => {
      if (mode === "single") useGitStore.getState().setPrData("/wt/a", pr);
      else useGitStore.getState().setPrDataBatch({ "/wt/a": pr });
    };

    apply(basePr);
    expect(useGitStore.getState().prData["/wt/a"]).toBe(merged);

    const next = { ...basePr, number: 43, url: "https://github.com/owner/repo/pull/43" };
    apply(next);
    expect(useGitStore.getState().prData["/wt/a"]).toBe(next);
  });

  it.each(["single", "batch"])(
    "upgrades a pre-forge cache and refreshes identity and safeguards via %s writes",
    (mode) => {
      useGitStore.getState().setPrData("/wt/a", basePr);
      const apply = (value: PrData) =>
        mode === "single"
          ? useGitStore.getState().setPrData("/wt/a", value)
          : useGitStore.getState().setPrDataBatch({ "/wt/a": value });
      const upgraded = { ...basePr, source: forgeSource, isCrossRepository: false };
      apply(upgraded);
      expect(useGitStore.getState().prData["/wt/a"]).toBe(upgraded);
      apply(structuredClone(upgraded));
      expect(useGitStore.getState().prData["/wt/a"]).toBe(upgraded);
      const changed = {
        ...upgraded,
        isCrossRepository: true,
        source: { ...forgeSource, capabilities: { ...forgeSource.capabilities, autoFix: false } },
      };
      apply(changed);
      expect(useGitStore.getState().prData["/wt/a"]).toBe(changed);
      const switched = {
        ...changed,
        source: { ...changed.source, account: { ...forgeSource.account!, login: "bob" } },
      };
      apply(switched);
      expect(useGitStore.getState().prData["/wt/a"]).toBe(switched);
    },
  );

  it("refreshes detail metadata even when the review content is unchanged", () => {
    useGitStore.getState().setPrDetails("p1#42", basePrDetails);
    const upgraded = { ...basePrDetails, source: forgeSource };
    useGitStore.getState().setPrDetails("p1#42", upgraded);
    expect(useGitStore.getState().prDetails["p1#42"]).toBe(upgraded);
    const changed = {
      ...upgraded,
      source: { ...forgeSource, capabilities: { ...forgeSource.capabilities, autoMerge: false } },
    };
    useGitStore.getState().setPrDetails("p1#42", changed);
    expect(useGitStore.getState().prDetails["p1#42"]).toBe(changed);
  });

  it("preserves merged PR details after a late refresh", () => {
    const merged = { ...basePrDetails, mergedAt: "2026-04-04T00:10:00.000Z" };
    useGitStore.getState().setPrDetails("p1#42", merged);
    useGitStore.getState().setPrDetails("p1#42", basePrDetails);
    expect(useGitStore.getState().prDetails["p1#42"]).toBe(merged);

    const updated = { ...merged, body: "Updated after merge" };
    useGitStore.getState().setPrDetails("p1#42", updated);
    expect(useGitStore.getState().prDetails["p1#42"]).toBe(updated);
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

  it("replaces PR details when only labels, reviewers, reactions or the timeline change", () => {
    useGitStore.getState().setPrDetails("p1#42", basePrDetails);
    const comment = {
      id: "c1",
      author: { login: "ann" },
      body: "hi",
      createdAt: "2026-04-04T00:00:00.000Z",
    };
    const changes: Partial<PrDetails>[] = [
      { labels: [{ name: "bug" }] },
      { requestedReviewers: [{ id: "u1", login: "ann" }] },
      { reactions: [{ content: "+1", count: 1, viewerReacted: true }] },
      {
        timeline: [{ id: "e1", kind: "closed", createdAt: "2026-04-04T00:00:00.000Z" }],
      },
    ];
    let current: PrDetails = { ...basePrDetails, comments: [comment] };
    useGitStore.getState().setPrDetails("p1#42", current);
    for (const change of changes) {
      current = { ...current, ...change };
      useGitStore.getState().setPrDetails("p1#42", current);
      expect(useGitStore.getState().prDetails["p1#42"]).toBe(current);
    }
    current = {
      ...current,
      comments: [{ ...comment, reactions: [{ content: "heart", count: 1, viewerReacted: true }] }],
    };
    useGitStore.getState().setPrDetails("p1#42", current);
    expect(useGitStore.getState().prDetails["p1#42"]).toBe(current);
  });

  it("replaces PR details when check timing changes", () => {
    useGitStore.getState().setPrDetails("p1#42", basePrDetails);
    const firstDetails = useGitStore.getState().prDetails;

    useGitStore.getState().setPrDetails("p1#42", {
      ...basePrDetails,
      checks: [
        {
          ...basePrDetails.checks[0]!,
          startedAt: "2026-07-13T11:25:03Z",
          completedAt: "2026-07-13T11:25:49Z",
        },
      ],
    });

    const secondDetails = useGitStore.getState().prDetails;
    expect(secondDetails).not.toBe(firstDetails);
    expect(secondDetails["p1#42"]?.checks[0]?.completedAt).toBe("2026-07-13T11:25:49Z");
  });
});

describe("summaryBackfillMissed", () => {
  const summaryOf = (overrides: Partial<GitStatusResult>): GitStatusResult => ({
    ...baseStatus,
    detail: "summary",
    ...overrides,
  });

  it("returns false for a non-summary incoming status", () => {
    const incoming: GitStatusResult = {
      ...baseStatus,
      unstaged: [{ path: "a.ts", status: "M", staged: false, insertions: 0, deletions: 0 }],
    };
    expect(summaryBackfillMissed(undefined, incoming)).toBe(false);
  });

  it("returns false when every summary row matches a previous entry", () => {
    const previous: GitStatusResult = {
      ...baseStatus,
      staged: [{ path: "a.ts", status: "M", staged: true, insertions: 5, deletions: 1 }],
      unstaged: [{ path: "b.ts", status: "M", staged: false, insertions: 2, deletions: 0 }],
    };
    const incoming = summaryOf({
      staged: [{ path: "a.ts", status: "M", staged: true, insertions: 0, deletions: 0 }],
      unstaged: [{ path: "b.ts", status: "M", staged: false, insertions: 0, deletions: 0 }],
    });
    expect(summaryBackfillMissed(previous, incoming)).toBe(false);
  });

  it("returns true when a file moved sections (external git add) — key no longer matches", () => {
    // Previously unstaged/modified; an external `git add` now reports it staged.
    const previous: GitStatusResult = {
      ...baseStatus,
      unstaged: [{ path: "a.ts", status: "M", staged: false, insertions: 5, deletions: 1 }],
    };
    const incoming = summaryOf({
      staged: [{ path: "a.ts", status: "M", staged: true, insertions: 0, deletions: 0 }],
    });
    expect(summaryBackfillMissed(previous, incoming)).toBe(true);
  });

  it("returns true when the previous snapshot is missing entirely", () => {
    const incoming = summaryOf({
      unstaged: [{ path: "a.ts", status: "M", staged: false, insertions: 0, deletions: 0 }],
    });
    expect(summaryBackfillMissed(undefined, incoming)).toBe(true);
  });

  it("treats a brand-new untracked row as a miss (full refresh fills its counts)", () => {
    const previous: GitStatusResult = { ...baseStatus };
    const incoming = summaryOf({
      unstaged: [{ path: "new.ts", status: "?", staged: false, insertions: 0, deletions: 0 }],
    });
    expect(summaryBackfillMissed(previous, incoming)).toBe(true);
  });
});

describe("setBranches", () => {
  it("publishes a branch list whose only change is the remote default branch", () => {
    const list: GitBranchListResult = {
      current: "main",
      branches: [{ name: "main", current: true, commit: "abc", isRemote: false }],
    };
    useGitStore.setState({ branches: { p1: list } });

    useGitStore.getState().setBranches("p1", { ...list, defaultBranch: "origin/main" });

    expect(useGitStore.getState().branches.p1?.defaultBranch).toBe("origin/main");
  });
});

describe("Git cache persistence", () => {
  beforeEach(() => {
    resetGitStoreCache();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetGitStoreCache();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("writes changed status fields without rewriting cached PRs or branches", async () => {
    useGitStore.getState().setPrData("/wt/a", basePr);
    useGitStore.getState().setBranches("p1", baseBranches);
    await vi.advanceTimersByTimeAsync(1_600);
    const prSnapshot = localStorage.getItem("poracode-git-cache-v3:prData");
    const write = vi.spyOn(Storage.prototype, "setItem");

    useGitStore.getState().setStatus("p1", baseStatus);
    await vi.advanceTimersByTimeAsync(1_600);

    expect(write.mock.calls.map(([key]) => key)).toEqual([
      "poracode-git-cache-v3:statuses",
      "poracode-git-cache-v3",
    ]);
    expect(localStorage.getItem("poracode-git-cache-v3:prData")).toBe(prSnapshot);
    expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3:statuses")!)).toEqual({
      p1: baseStatus,
    });
  });

  it("checkpoints continuous updates within the existing maximum wait", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    for (let i = 0; i < 18; i++) {
      useGitStore.getState().setWorktreeSourceInfo("/wt/a", {
        sourceBranch: "main",
        commitsAhead: i,
        sourceAhead: 0,
      });
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(write.mock.calls.some(([key]) => key === "poracode-git-cache-v3")).toBe(true);
    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3:worktreeSourceInfo")!)).toEqual({
      "/wt/a": { sourceBranch: "main", commitsAhead: 17, sourceAhead: 0 },
    });
  });

  it("migrates released v2 data without needing quota for two snapshots", async () => {
    const previous = JSON.stringify({
      v: 2,
      ts: Date.now(),
      statuses: { p1: baseStatus },
      branches: { p1: baseBranches },
      prData: { "/wt/a": basePr },
    });
    localStorage.setItem("poracode-git-cache-v2", previous);
    vi.resetModules();
    const upgraded = await import("./gitStore");
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith("poracode-git-cache-v3") && this.getItem("poracode-git-cache-v2")) {
        throw new DOMException("Two snapshots exceed quota", "QuotaExceededError");
      }
      setItem.call(this, key, value);
    });
    try {
      expect(upgraded.useGitStore.getState().prData["/wt/a"]).toEqual(basePr);
      upgraded.useGitStore.getState().setStatus("p1", { ...baseStatus, ahead: 1 });
      await vi.advanceTimersByTimeAsync(1_600);
      expect(localStorage.getItem("poracode-git-cache-v2")).toBeNull();
      expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3:prData")!)).toEqual({
        "/wt/a": basePr,
      });
      expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3:branches")!)).toEqual({
        p1: baseBranches,
      });
      expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3")!)).toMatchObject({ v: 3 });
    } finally {
      upgraded.resetGitStoreCache();
      vi.resetModules();
    }
  });

  it("reloads split fields and persists deletion without reviving the old entry", async () => {
    useGitStore.getState().setStatus("p1", baseStatus);
    useGitStore.getState().setPrData("/wt/a", basePr);
    await vi.advanceTimersByTimeAsync(1_600);
    useGitStore.getState().clearStatus("p1");
    window.dispatchEvent(new Event("pagehide"));
    vi.resetModules();
    const reloaded = await import("./gitStore");
    try {
      expect(reloaded.useGitStore.getState().statuses).toEqual({});
      expect(reloaded.useGitStore.getState().prData["/wt/a"]).toEqual(basePr);
    } finally {
      reloaded.resetGitStoreCache();
      vi.resetModules();
    }
  });

  it("restores v2 after a partial migration failure and retries the latest state", async () => {
    const previous = JSON.stringify({
      v: 2,
      ts: Date.now(),
      statuses: { p1: baseStatus },
      prData: { "/wt/a": basePr },
    });
    localStorage.setItem("poracode-git-cache-v2", previous);
    vi.resetModules();
    const upgraded = await import("./gitStore");
    const setItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === "poracode-git-cache-v3:prData") {
        throw new DOMException("Split representation exceeds quota", "QuotaExceededError");
      }
      setItem.call(this, key, value);
    });
    try {
      upgraded.useGitStore.getState().setStatus("p1", { ...baseStatus, ahead: 1 });
      await vi.advanceTimersByTimeAsync(1_600);
      expect(localStorage.getItem("poracode-git-cache-v2")).toBe(previous);
      expect(
        Object.keys(localStorage).filter((key) => key.startsWith("poracode-git-cache-v3")),
      ).toEqual([]);
      write.mockRestore();
      upgraded.useGitStore.getState().setStatus("p1", { ...baseStatus, ahead: 2 });
      await vi.advanceTimersByTimeAsync(1_600);
      expect(localStorage.getItem("poracode-git-cache-v2")).toBeNull();
      expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3:statuses")!).p1.ahead).toBe(2);
      expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3:prData")!)["/wt/a"]).toEqual(
        basePr,
      );
    } finally {
      upgraded.resetGitStoreCache();
      vi.resetModules();
    }
  });

  it("releases quota occupied by expired v2 data without hydrating stale values", async () => {
    localStorage.setItem(
      "poracode-git-cache-v2",
      JSON.stringify({ v: 2, ts: Date.now() - 8 * 24 * 60 * 60 * 1000, prData: { old: basePr } }),
    );
    vi.resetModules();
    const upgraded = await import("./gitStore");
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      expect(this.getItem("poracode-git-cache-v2")).toBeNull();
      setItem.call(this, key, value);
    });
    try {
      expect(upgraded.useGitStore.getState().prData).toEqual({});
      await vi.advanceTimersByTimeAsync(1_600);
      expect(localStorage.getItem("poracode-git-cache-v2")).toBeNull();
      expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3:prData")!)).toEqual({});
      expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3")!).v).toBe(3);
    } finally {
      upgraded.resetGitStoreCache();
      vi.resetModules();
    }
  });

  it("retries a field whose storage write failed", async () => {
    useGitStore.getState().setPrData("/wt/a", basePr);
    await vi.advanceTimersByTimeAsync(1_600);
    const setItem = Storage.prototype.setItem;
    let fail = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "poracode-git-cache-v3:statuses" && fail) {
        fail = false;
        throw new DOMException("Storage is full", "QuotaExceededError");
      }
      setItem.call(this, key, value);
    });
    useGitStore.getState().setStatus("p1", baseStatus);
    await vi.advanceTimersByTimeAsync(1_600);
    useGitStore.getState().setStatus("p2", baseStatus);
    await vi.advanceTimersByTimeAsync(1_600);
    expect(JSON.parse(localStorage.getItem("poracode-git-cache-v3:statuses")!)).toEqual({
      p1: baseStatus,
      p2: baseStatus,
    });
  });

  it("preserves an unknown future cache without reading or overwriting it", async () => {
    const future = JSON.stringify({ v: 4, ts: Date.now(), futureField: true });
    localStorage.setItem("poracode-git-cache-v3", future);
    localStorage.setItem("poracode-git-cache-v3:statuses", "future-format");
    vi.resetModules();
    const older = await import("./gitStore");
    try {
      expect(older.useGitStore.getState().statuses).toEqual({});
      older.useGitStore.getState().setStatus("p1", baseStatus);
      await vi.advanceTimersByTimeAsync(1_600);
      older.resetGitStoreCache();
      expect(localStorage.getItem("poracode-git-cache-v3")).toBe(future);
      expect(localStorage.getItem("poracode-git-cache-v3:statuses")).toBe("future-format");
    } finally {
      older.resetGitStoreCache();
      vi.resetModules();
    }
  });
});
