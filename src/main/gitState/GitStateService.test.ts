import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, PrData, PrDetails, Project } from "@/shared/contracts";
import { gitTargetKey, pullRequestBranchKey, pullRequestKey } from "@/shared/gitState";
import {
  GitStateService,
  type GitStateExecutor,
  type GitStateServiceOptions,
} from "./GitStateService";

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-28T00:00:00.000Z",
};

function status(branch = "feature/unified"): GitStatusResult {
  return {
    isRepo: true,
    branch,
    tracking: `origin/${branch}`,
    hasRemote: true,
    remoteInfo: {
      url: "git@github.com:poracode/repo.git",
      platform: "github",
      owner: "poracode",
      repo: "repo",
    },
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
  };
}

function pr(overrides: Partial<PrData> = {}): PrData {
  return {
    number: 42,
    state: "open",
    title: "Unify Git state",
    url: "https://github.test/poracode/repo/pull/42",
    baseBranch: "main",
    isDraft: false,
    checksStatus: "PENDING",
    updatedAt: "2026-07-28T12:00:00.000Z",
    ...overrides,
  };
}

function details(conclusion = ""): PrDetails {
  return {
    number: 42,
    title: "Unify Git state",
    body: "",
    baseBranch: "main",
    headBranch: "feature/unified",
    additions: 12,
    deletions: 3,
    changedFiles: 4,
    commits: [],
    comments: [],
    reviews: [],
    checks: [{ name: "build", state: "IN_PROGRESS", conclusion }],
  };
}

function executor(): GitStateExecutor {
  return {
    gitFetch: vi.fn<GitStateExecutor["gitFetch"]>(async () => undefined),
    gitProjectSnapshot: vi.fn<GitStateExecutor["gitProjectSnapshot"]>(async () => ({
      status: status(),
      branches: { current: "feature/unified", branches: [] },
      worktrees: [],
      ghAvailable: true,
    })),
    getGitStatus: vi.fn<GitStateExecutor["getGitStatus"]>(async () => status()),
    gitWorktreeStatusBatch: vi.fn<GitStateExecutor["gitWorktreeStatusBatch"]>(async () => ({
      statuses: {},
    })),
    gitGetWorktreeSourceBranch: vi.fn<GitStateExecutor["gitGetWorktreeSourceBranch"]>(async () => ({
      sourceBranch: "main",
      commitsAhead: 1,
      sourceAhead: 0,
    })),
    ghGetPrForBranch: vi.fn<GitStateExecutor["ghGetPrForBranch"]>(async () => pr()),
    ghGetPrDetails: vi.fn<GitStateExecutor["ghGetPrDetails"]>(async () => ({
      details: details(),
    })),
    ghGetPrFiles: vi.fn<GitStateExecutor["ghGetPrFiles"]>(async () => ({ files: [] })),
    ghGetPrDiff: vi.fn<GitStateExecutor["ghGetPrDiff"]>(async () => ({ diff: "" })),
    ghGetPrReviewComments: vi.fn<GitStateExecutor["ghGetPrReviewComments"]>(async () => ({
      threads: [],
      comments: [],
    })),
    ghListPullRequests: vi.fn<GitStateExecutor["ghListPullRequests"]>(async () => ({
      pullRequests: [],
      viewerLogin: "viewer",
    })),
  };
}

function createService(overrides: Partial<GitStateServiceOptions> = {}): {
  service: GitStateService;
  executor: GitStateExecutor;
  patches: ReturnType<typeof vi.fn<NonNullable<GitStateServiceOptions["onPatch"]>>>;
} {
  const fakeExecutor = executor();
  const patches = vi.fn<NonNullable<GitStateServiceOptions["onPatch"]>>();
  return {
    executor: fakeExecutor,
    patches,
    service: new GitStateService({
      hostId: "host-1",
      executor: fakeExecutor,
      getProject: (projectId) => (projectId === project.id ? project : null),
      onPatch: patches,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
      ...overrides,
    }),
  };
}

describe("GitStateService", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("normalizes a branch PR once and associates every matching target", async () => {
    const { service, executor: fakeExecutor } = createService();
    const worktreeA = "/repo/.poracode/worktrees/a";
    const worktreeB = "/repo/.poracode/worktrees/b";

    await Promise.all([
      service.refreshTarget({
        projectId: project.id,
        worktreePath: worktreeA,
        branch: "feature/unified",
      }),
      service.refreshTarget({
        projectId: project.id,
        worktreePath: worktreeB,
        branch: "feature/unified",
      }),
    ]);

    const snapshot = service.getSnapshot();
    const prRef = { hostId: "host-1", projectId: project.id, prNumber: 42 };
    const prKey = pullRequestKey(prRef);
    expect(snapshot.pullRequests[prKey]?.data.title).toBe("Unify Git state");
    expect(
      snapshot.targets[
        gitTargetKey({
          hostId: "host-1",
          projectId: project.id,
          worktreePath: worktreeA,
        })
      ]?.pullRequestKey,
    ).toBe(prKey);
    expect(
      snapshot.targets[
        gitTargetKey({
          hostId: "host-1",
          projectId: project.id,
          worktreePath: worktreeB,
        })
      ]?.pullRequestKey,
    ).toBe(prKey);
    expect(fakeExecutor.ghGetPrForBranch).toHaveBeenCalledTimes(1);
  });

  it("publishes same-branch core and details changes through one canonical PR", async () => {
    const { service, executor: fakeExecutor, patches } = createService();
    const getPr = vi.mocked(fakeExecutor.ghGetPrForBranch);
    const getDetails = vi.mocked(fakeExecutor.ghGetPrDetails);
    getPr.mockResolvedValueOnce(pr()).mockResolvedValueOnce(
      pr({
        checksStatus: "SUCCESS",
        updatedAt: "2026-07-28T12:01:00.000Z",
      }),
    );
    getDetails
      .mockResolvedValueOnce({ details: details("") })
      .mockResolvedValueOnce({ details: details("SUCCESS") });

    await service.refreshPullRequestForBranch(project.id, "feature/unified", {
      includeDetails: true,
    });
    await service.refreshPullRequestForBranch(project.id, "feature/unified", {
      includeDetails: true,
    });

    const key = pullRequestKey({ hostId: "host-1", projectId: project.id, prNumber: 42 });
    expect(service.getSnapshot().pullRequests[key]?.data.checksStatus).toBe("SUCCESS");
    expect(service.getSnapshot().pullRequests[key]?.details?.checks[0]?.conclusion).toBe("SUCCESS");
    expect(
      service.getSnapshot().pullRequestKeyByBranch[
        pullRequestBranchKey({ hostId: "host-1", projectId: project.id }, "feature/unified")
      ],
    ).toBe(key);
    expect(patches).toHaveBeenCalledTimes(2);
  });

  it("refreshes visible interests on a host timer without renderer focus", async () => {
    vi.useFakeTimers();
    const { service, executor: fakeExecutor } = createService({ pollIntervalMs: 1000 });
    service.start();
    service.setInterests("remote-session", [
      {
        kind: "target",
        projectId: project.id,
        worktreePath: "/repo/.poracode/worktrees/a",
        branch: "feature/unified",
        includePrDetails: true,
      },
    ]);
    await vi.waitFor(() => {
      expect(fakeExecutor.ghGetPrForBranch).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(fakeExecutor.ghGetPrForBranch).toHaveBeenCalledTimes(2);
    expect(fakeExecutor.ghGetPrDetails).toHaveBeenCalledTimes(2);
    service.dispose();
  });

  it("does not arm a recurring timer until a remote client has interests", async () => {
    vi.useFakeTimers();
    const { service, executor: fakeExecutor } = createService({ pollIntervalMs: 1000 });

    service.start();
    expect(vi.getTimerCount()).toBe(0);

    await service.refreshInterests(
      [
        {
          kind: "target",
          projectId: project.id,
          worktreePath: "/repo/.poracode/worktrees/a",
        },
      ],
      { fetchRemote: true },
    );

    expect(fakeExecutor.gitFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    service.dispose();
  });

  it("ignores repeated identical retained interests and stops polling after disconnect", async () => {
    vi.useFakeTimers();
    const { service, executor: fakeExecutor } = createService({ pollIntervalMs: 1000 });
    const interests = [
      {
        kind: "target" as const,
        projectId: project.id,
        worktreePath: "/repo/.poracode/worktrees/a",
      },
    ];
    service.start();
    service.setInterests("remote-session", interests);
    await vi.waitFor(() => {
      expect(fakeExecutor.getGitStatus).toHaveBeenCalledTimes(1);
    });

    service.setInterests(
      "remote-session",
      interests.map((interest) => ({ ...interest })),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeExecutor.getGitStatus).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    service.clearInterests("remote-session");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fakeExecutor.getGitStatus).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it("fetches and prunes once per project before refreshing several target sources", async () => {
    const { service, executor: fakeExecutor } = createService({ remoteFetchIntervalMs: 0 });

    await service.refreshInterests(
      [
        {
          kind: "target",
          projectId: project.id,
          worktreePath: "/repo/.poracode/worktrees/a",
        },
        {
          kind: "target",
          projectId: project.id,
          worktreePath: "/repo/.poracode/worktrees/b",
        },
      ],
      { fetchRemote: true },
    );

    expect(fakeExecutor.gitFetch).toHaveBeenCalledTimes(1);
    expect(fakeExecutor.gitFetch).toHaveBeenCalledWith({
      projectLocation: project.location,
      remote: "origin",
      prune: true,
    });
    expect(fakeExecutor.gitGetWorktreeSourceBranch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fakeExecutor.gitFetch).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fakeExecutor.gitGetWorktreeSourceBranch).mock.invocationCallOrder[0]!,
    );
  });

  it("publishes an externally observed PR without spawning gh", async () => {
    const { service, executor: fakeExecutor, patches } = createService();
    const worktree = "/repo/.poracode/worktrees/a";
    await service.refreshTarget({
      projectId: project.id,
      worktreePath: worktree,
      branch: "feature/unified",
    });
    patches.mockClear();
    vi.mocked(fakeExecutor.ghGetPrForBranch).mockClear();

    const merged = pr({ state: "merged", checksStatus: "SUCCESS" });
    service.applyObservedPullRequest(
      { projectId: project.id, headBranch: "feature/unified" },
      merged,
      details("SUCCESS"),
    );

    const prKey = pullRequestKey({ hostId: "host-1", projectId: project.id, prNumber: 42 });
    const snapshot = service.getSnapshot();
    expect(snapshot.pullRequests[prKey]?.data.state).toBe("merged");
    expect(snapshot.pullRequests[prKey]?.details?.checks[0]?.conclusion).toBe("SUCCESS");
    expect(
      snapshot.pullRequestKeyByBranch[
        pullRequestBranchKey({ hostId: "host-1", projectId: project.id }, "feature/unified")
      ],
    ).toBe(prKey);
    expect(
      snapshot.targets[
        gitTargetKey({ hostId: "host-1", projectId: project.id, worktreePath: worktree })
      ]?.pullRequestKey,
    ).toBe(prKey);
    expect(patches).toHaveBeenCalledOnce();
    expect(fakeExecutor.ghGetPrForBranch).not.toHaveBeenCalled();
  });

  it("leaves the branch alias pointing at a newer PR for the same branch", async () => {
    const { service } = createService();
    await service.refreshTarget({
      projectId: project.id,
      worktreePath: "/repo/.poracode/worktrees/a",
      branch: "feature/unified",
    });
    const branchKey = pullRequestBranchKey(
      { hostId: "host-1", projectId: project.id },
      "feature/unified",
    );
    const newerKey = pullRequestKey({ hostId: "host-1", projectId: project.id, prNumber: 42 });

    service.applyObservedPullRequest(
      { projectId: project.id, headBranch: "feature/unified" },
      pr({ number: 7, state: "merged" }),
    );

    const snapshot = service.getSnapshot();
    expect(snapshot.pullRequestKeyByBranch[branchKey]).toBe(newerKey);
    expect(
      snapshot.pullRequests[
        pullRequestKey({ hostId: "host-1", projectId: project.id, prNumber: 7 })
      ]?.data.state,
    ).toBe("merged");
  });
});
