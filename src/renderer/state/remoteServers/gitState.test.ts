import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GitBranchListResult,
  GitStatusResult,
  GitWorktreeInfo,
  GithubPollingProblem,
  PrData,
  PrDetails,
} from "@/shared/contracts";
import {
  emptyGitStateSnapshot,
  gitProjectKey,
  gitTargetKey,
  pullRequestKey,
  type GitProjectRef,
  type GitProjectState,
  type GitStateSnapshot,
  type GitTargetRef,
  type GitTargetState,
  type PullRequestState,
} from "@/shared/gitState";
import { resetGitStoreCache, useGitStore } from "@/renderer/state/gitStore";
import { buildBranchPrKey } from "@/renderer/state/gitSelectors";
import { remoteProjectId } from "@/renderer/state/remoteProjection";
import {
  clearRemoteGitState,
  syncRemoteGitStatePatch,
  syncRemoteGitStateSnapshot,
} from "./gitState";

const HOST = "desktop-1";
const PROJECT = "project-1";
const WORKTREE = "/repo/worktree";
const NOW = "2026-08-01T00:00:00.000Z";

function makeStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    isRepo: true,
    branch: "feature",
    tracking: "origin/feature",
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

function makeBranches(overrides: Partial<GitBranchListResult> = {}): GitBranchListResult {
  return {
    current: "feature",
    branches: [{ name: "feature", current: true, commit: "abc123", isRemote: false }],
    ...overrides,
  };
}

function makeWorktree(overrides: Partial<GitWorktreeInfo> = {}): GitWorktreeInfo {
  return { path: WORKTREE, branch: "feature", commit: "abc123", isMain: false, ...overrides };
}

function makePrData(title: string, overrides: Partial<PrData> = {}): PrData {
  return {
    number: 182,
    state: "open",
    title,
    url: "https://github.test/example/poracode/pull/182",
    baseBranch: "main",
    isDraft: false,
    checksStatus: "SUCCESS",
    updatedAt: NOW,
    ...overrides,
  };
}

function makePrDetails(title: string, overrides: Partial<PrDetails> = {}): PrDetails {
  return {
    number: 182,
    title,
    body: "",
    baseBranch: "main",
    headBranch: "feature",
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    commits: [],
    comments: [],
    reviews: [],
    checks: [{ name: "build", state: "COMPLETED", conclusion: "SUCCESS" }],
    ...overrides,
  };
}

function makePrState(
  title: string,
  options: {
    desktopId?: string;
    projectId?: string;
    prNumber?: number;
    data?: Partial<PrData>;
    details?: Partial<PrDetails>;
  } = {},
): PullRequestState {
  const prNumber = options.prNumber ?? 182;
  const ref = {
    hostId: options.desktopId ?? HOST,
    projectId: options.projectId ?? PROJECT,
    prNumber,
  };
  const details = makePrDetails(title, { ...options.details, number: prNumber });
  return {
    ref,
    data: makePrData(title, { number: prNumber, ...options.data }),
    details,
    freshness: { core: NOW, details: NOW },
  };
}

function makeProjectState(
  ref: GitProjectRef,
  overrides: Partial<GitProjectState> = {},
): GitProjectState {
  return {
    ref,
    status: makeStatus(),
    branches: makeBranches(),
    worktrees: [makeWorktree()],
    ghAvailable: true,
    refreshedAt: NOW,
    ...overrides,
  };
}

function makeTargetState(
  ref: GitTargetRef,
  overrides: Partial<GitTargetState> = {},
): GitTargetState {
  return { ref, status: makeStatus(), refreshedAt: NOW, ...overrides };
}

function makeSnapshot(
  options: {
    desktopId?: string;
    projectId?: string;
    revision?: number;
    targetRef?: GitTargetRef;
    targetPullRequestKey?: string | null;
    targetStatus?: GitStatusResult;
    project?: GitProjectState;
    pr?: PullRequestState | null;
    prTitle?: string;
    prNumber?: number;
    prData?: Partial<PrData>;
    prDetails?: Partial<PrDetails>;
  } = {},
): GitStateSnapshot {
  const desktopId = options.desktopId ?? HOST;
  const projectId = options.projectId ?? PROJECT;
  const ref = { hostId: desktopId, projectId };
  const targetRef = options.targetRef ?? { ...ref, worktreePath: WORKTREE };
  const pr =
    options.pr === null
      ? undefined
      : (options.pr ??
        makePrState(options.prTitle ?? "Initial", {
          desktopId,
          projectId,
          prNumber: options.prNumber ?? 182,
          ...(options.prData ? { data: options.prData } : {}),
          ...(options.prDetails !== undefined ? { details: options.prDetails } : {}),
        }));
  const targetPullRequestKey =
    options.targetPullRequestKey !== undefined
      ? options.targetPullRequestKey
      : pr
        ? pullRequestKey(pr.ref)
        : null;
  return {
    ...emptyGitStateSnapshot(),
    revision: options.revision ?? 1,
    projects: {
      [gitProjectKey(ref)]: options.project ?? makeProjectState(ref),
    },
    targets: {
      [gitTargetKey(targetRef)]: makeTargetState(targetRef, {
        pullRequestKey: targetPullRequestKey,
        ...(options.targetStatus ? { status: options.targetStatus } : {}),
      }),
    },
    pullRequests: pr ? { [pullRequestKey(pr.ref)]: pr } : {},
  };
}

beforeEach(() => {
  resetGitStoreCache();
  clearRemoteGitState();
});

afterEach(() => {
  clearRemoteGitState();
  resetGitStoreCache();
});

describe("syncRemoteGitStateSnapshot", () => {
  it("projects the initial state and applies a genuine host change", () => {
    const projectId = remoteProjectId(HOST, PROJECT);
    syncRemoteGitStateSnapshot(HOST, makeSnapshot());

    let store = useGitStore.getState();
    expect(store.statuses[projectId]).toMatchObject({ branch: "feature", behind: 0 });
    expect(store.branches[projectId]).toEqual(makeBranches());
    expect(store.worktrees[projectId]).toEqual([makeWorktree()]);
    expect(store.ghAvailable[projectId]).toBe(true);
    expect(store.worktreeStatuses[WORKTREE]).toMatchObject({ branch: "feature", behind: 0 });
    expect(store.prData[WORKTREE]).toMatchObject({
      number: 182,
      title: "Initial",
      checksStatus: "SUCCESS",
    });
    expect(store.prDetails[`${projectId}#182`]).toMatchObject({
      title: "Initial",
      headBranch: "feature",
    });

    const changedProject = makeProjectState(
      { hostId: HOST, projectId: PROJECT },
      {
        status: makeStatus({ branch: "release", behind: 3 }),
        branches: makeBranches({ current: "release" }),
        worktrees: [makeWorktree({ branch: "release", commit: "def456" })],
        ghAvailable: false,
      },
    );
    syncRemoteGitStateSnapshot(
      HOST,
      makeSnapshot({
        revision: 2,
        project: changedProject,
        targetStatus: makeStatus({ branch: "release", behind: 3 }),
        prTitle: "Changed",
        prData: { title: "Changed", checksStatus: "FAILURE" },
        prDetails: { title: "Changed details" },
      }),
    );

    store = useGitStore.getState();
    expect(store.statuses[projectId]).toMatchObject({ branch: "release", behind: 3 });
    expect(store.branches[projectId]?.current).toBe("release");
    expect(store.worktrees[projectId]?.[0]?.commit).toBe("def456");
    expect(store.ghAvailable[projectId]).toBe(false);
    expect(store.worktreeStatuses[WORKTREE]).toMatchObject({ branch: "release", behind: 3 });
    expect(store.prData[WORKTREE]).toMatchObject({
      title: "Changed",
      checksStatus: "FAILURE",
    });
    expect(store.prDetails[`${projectId}#182`]?.title).toBe("Changed details");
  });

  it("applies changed details without replacing a newer direct PR core", () => {
    const projectId = remoteProjectId(HOST, PROJECT);
    syncRemoteGitStateSnapshot(
      HOST,
      makeSnapshot({ prTitle: "Initial", prDetails: { title: "Initial details" } }),
    );

    useGitStore.getState().setPrData(WORKTREE, makePrData("Direct core"));
    syncRemoteGitStateSnapshot(
      HOST,
      makeSnapshot({
        revision: 2,
        prTitle: "Initial",
        prDetails: { title: "Changed details" },
      }),
    );

    const store = useGitStore.getState();
    expect(store.prData[WORKTREE]).toMatchObject({ title: "Direct core" });
    expect(store.prDetails[`${projectId}#182`]?.title).toBe("Changed details");
  });

  it("does not erase a directly polled PR when a null target is replayed unchanged", () => {
    syncRemoteGitStateSnapshot(HOST, makeSnapshot({ pr: null, targetPullRequestKey: null }));
    expect(useGitStore.getState().prData[WORKTREE]).toBeNull();

    useGitStore.getState().setPrData(WORKTREE, makePrData("Direct after null"));
    useGitStore
      .getState()
      .setPrDetails(
        `${remoteProjectId(HOST, PROJECT)}#182`,
        makePrDetails("Direct details after null"),
      );

    syncRemoteGitStateSnapshot(
      HOST,
      makeSnapshot({ revision: 2, pr: null, targetPullRequestKey: null }),
    );

    expect(useGitStore.getState().prData[WORKTREE]).toMatchObject({
      title: "Direct after null",
    });
    expect(useGitStore.getState().prDetails[`${remoteProjectId(HOST, PROJECT)}#182`]?.title).toBe(
      "Direct details after null",
    );
  });

  it("clears the cached PR when the host explicitly loses the association", () => {
    syncRemoteGitStateSnapshot(HOST, makeSnapshot());
    expect(useGitStore.getState().prData[WORKTREE]).toMatchObject({ number: 182 });

    syncRemoteGitStateSnapshot(
      HOST,
      makeSnapshot({ revision: 2, pr: null, targetPullRequestKey: null }),
    );

    expect(useGitStore.getState().prData[WORKTREE]).toBeNull();
  });

  it("preserves an associated PR through blocked and recovery project patches, then clears on explicit loss", () => {
    const projectRef = { hostId: HOST, projectId: PROJECT };
    const targetRef = { ...projectRef, worktreePath: WORKTREE };
    const projectKey = gitProjectKey(projectRef);
    const targetKey = gitTargetKey(targetRef);
    const problem: GithubPollingProblem = {
      kind: "authentication",
      executionHost: "remote",
      retryAt: "2026-08-01T00:01:00.000Z",
    };

    syncRemoteGitStateSnapshot(HOST, makeSnapshot());
    syncRemoteGitStatePatch(HOST, {
      revision: 2,
      projects: {
        [projectKey]: makeProjectState(projectRef, { githubPollingProblem: problem }),
      },
    });
    expect(useGitStore.getState().prData[WORKTREE]).toMatchObject({
      number: 182,
      title: "Initial",
    });
    expect(useGitStore.getState().githubPollingProblems[remoteProjectId(HOST, PROJECT)]).toEqual(
      problem,
    );

    syncRemoteGitStatePatch(HOST, {
      revision: 3,
      projects: {
        [projectKey]: makeProjectState(projectRef),
      },
    });
    expect(useGitStore.getState().prData[WORKTREE]).toMatchObject({
      number: 182,
      title: "Initial",
    });

    syncRemoteGitStatePatch(HOST, {
      revision: 4,
      targets: {
        [targetKey]: makeTargetState(targetRef, { pullRequestKey: null }),
      },
    });
    expect(useGitStore.getState().prData[WORKTREE]).toBeNull();
  });

  it("ignores a stale snapshot and a stale patch", () => {
    const projectRef = { hostId: HOST, projectId: PROJECT };
    syncRemoteGitStateSnapshot(
      HOST,
      makeSnapshot({
        revision: 2,
        prTitle: "Latest",
        project: makeProjectState(projectRef, { status: makeStatus({ behind: 4 }) }),
      }),
    );

    syncRemoteGitStateSnapshot(
      HOST,
      makeSnapshot({
        revision: 1,
        prTitle: "Stale",
        project: makeProjectState(projectRef, { status: makeStatus({ behind: 9 }) }),
      }),
    );
    syncRemoteGitStatePatch(HOST, {
      revision: 1,
      projects: {
        [gitProjectKey(projectRef)]: makeProjectState(projectRef, {
          status: makeStatus({ behind: 9 }),
        }),
      },
    });

    const store = useGitStore.getState();
    expect(store.prData[WORKTREE]).toMatchObject({ title: "Latest" });
    expect(store.statuses[remoteProjectId(HOST, PROJECT)]?.behind).toBe(4);
  });
});

describe("syncRemoteGitStatePatch", () => {
  it("restores a cleared worktree status from an unchanged host row", () => {
    syncRemoteGitStateSnapshot(HOST, makeSnapshot());
    useGitStore.getState().clearWorktreeStatus(WORKTREE);
    expect(useGitStore.getState().worktreeStatuses[WORKTREE]).toBeUndefined();

    const projectRef = { hostId: HOST, projectId: PROJECT };
    syncRemoteGitStatePatch(HOST, {
      revision: 2,
      projects: {
        [gitProjectKey(projectRef)]: makeProjectState(projectRef, {
          refreshedAt: "2026-08-01T00:01:00.000Z",
        }),
      },
    });

    expect(useGitStore.getState().worktreeStatuses[WORKTREE]).toEqual(makeStatus());
    expect(useGitStore.getState().prData[WORKTREE]).toEqual(makePrData("Initial"));
  });

  it("preserves a newer direct PR, status, details, and gh flag across an unrelated patch", () => {
    const projectId = remoteProjectId(HOST, PROJECT);
    syncRemoteGitStateSnapshot(HOST, makeSnapshot({ prTitle: "Host old" }));

    const store = useGitStore.getState();
    store.setPrData(WORKTREE, makePrData("Direct newer"));
    store.setPrDetails(`${projectId}#182`, makePrDetails("Direct details"));
    store.setWorktreeStatus(WORKTREE, makeStatus({ behind: 9 }));
    store.setStatus(projectId, makeStatus({ behind: 8 }));
    store.setGhAvailable(projectId, false);
    expect(useGitStore.getState().prData[WORKTREE]).toMatchObject({ title: "Direct newer" });

    const otherRef = { hostId: HOST, projectId: "project-2" };
    syncRemoteGitStatePatch(HOST, {
      revision: 2,
      projects: {
        [gitProjectKey(otherRef)]: makeProjectState(otherRef, {
          status: makeStatus({ behind: 1 }),
        }),
      },
    });

    // A repeat of the unchanged host model after the patch ("reconnect") must
    // also leave the direct values alone.
    expect(useGitStore.getState().prData[WORKTREE]).toMatchObject({ title: "Direct newer" });
    syncRemoteGitStateSnapshot(HOST, makeSnapshot({ revision: 3, prTitle: "Host old" }));

    const current = useGitStore.getState();
    expect(current.prData[WORKTREE]).toMatchObject({ title: "Direct newer" });
    expect(current.prDetails[`${projectId}#182`]?.title).toBe("Direct details");
    expect(current.worktreeStatuses[WORKTREE]?.behind).toBe(9);
    expect(current.statuses[projectId]?.behind).toBe(8);
    expect(current.ghAvailable[projectId]).toBe(false);
  });

  it("keeps project-qualified root PRs separate across hosts and projects", () => {
    const hostOneRoot = { hostId: "desktop-1", projectId: "project-1" };
    const hostOneOtherRoot = { hostId: "desktop-1", projectId: "project-2" };
    const hostTwoRoot = { hostId: "desktop-2", projectId: "project-1" };

    syncRemoteGitStateSnapshot(
      "desktop-1",
      makeSnapshot({
        desktopId: "desktop-1",
        projectId: "project-1",
        targetRef: hostOneRoot,
        prNumber: 182,
        prTitle: "Host one",
      }),
    );
    syncRemoteGitStateSnapshot(
      "desktop-1",
      makeSnapshot({
        desktopId: "desktop-1",
        projectId: "project-2",
        targetRef: hostOneOtherRoot,
        prNumber: 9,
        prTitle: "Other project",
      }),
    );
    syncRemoteGitStateSnapshot(
      "desktop-2",
      makeSnapshot({
        desktopId: "desktop-2",
        projectId: "project-1",
        targetRef: hostTwoRoot,
        prNumber: 7,
        prTitle: "Host two",
      }),
    );

    const store = useGitStore.getState();
    expect(store.prData[buildBranchPrKey(remoteProjectId("desktop-1", "project-1"))]).toMatchObject(
      { number: 182 },
    );
    expect(store.prData[buildBranchPrKey(remoteProjectId("desktop-1", "project-2"))]).toMatchObject(
      { number: 9 },
    );
    expect(store.prData[buildBranchPrKey(remoteProjectId("desktop-2", "project-1"))]).toMatchObject(
      { number: 7 },
    );

    syncRemoteGitStatePatch("desktop-2", {
      revision: 2,
      projects: {
        [gitProjectKey(hostTwoRoot)]: makeProjectState(hostTwoRoot, {
          status: makeStatus({ behind: 5 }),
        }),
      },
    });

    expect(
      useGitStore.getState().prData[buildBranchPrKey(remoteProjectId("desktop-1", "project-1"))],
    ).toMatchObject({ number: 182 });
    expect(useGitStore.getState().statuses[remoteProjectId("desktop-2", "project-1")]?.behind).toBe(
      5,
    );
  });
});
