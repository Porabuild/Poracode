import { describe, expect, it } from "vitest";
import { emptyGitStateSnapshot, pullRequestKey, type PullRequestState } from "@/shared/gitState";
import {
  projectGitStatePatchForInterests,
  projectGitStateSnapshotForRemote,
} from "./gitStateProjection";

const ref = { hostId: "host-1", projectId: "project-1", prNumber: 42 };
const otherRef = { hostId: "host-1", projectId: "project-1", prNumber: 7 };
const key = pullRequestKey(ref);
const otherKey = pullRequestKey(otherRef);

function prState(overrides: Partial<PullRequestState> = {}): PullRequestState {
  return {
    ref,
    data: { number: 42, title: "A PR" } as PullRequestState["data"],
    diff: "diff --git a/x b/x\n+lots of text",
    files: [{ path: "x" }] as unknown as PullRequestState["files"],
    reviewThreads: [{ id: "t1" }] as unknown as PullRequestState["reviewThreads"],
    freshness: { core: "2026-01-01T00:00:00.000Z", diff: "2026-01-01T00:00:00.000Z" },
    ...overrides,
  };
}

describe("projectGitStateSnapshotForRemote", () => {
  it("removes every pull-request body but keeps core data and freshness", () => {
    const snapshot = {
      ...emptyGitStateSnapshot(),
      revision: 3,
      pullRequests: { [key]: prState() },
    };
    const projected = projectGitStateSnapshotForRemote(snapshot);
    const state = projected.pullRequests[key]!;
    expect(state.diff).toBeUndefined();
    expect(state.files).toBeUndefined();
    expect(state.reviewThreads).toBeUndefined();
    // The badge/summary data the thread list needs is untouched.
    expect(state.data).toEqual(snapshot.pullRequests[key]!.data);
    expect(state.freshness).toEqual(snapshot.pullRequests[key]!.freshness);
    expect(projected.revision).toBe(3);
  });

  it("does not copy a snapshot that has no bodies to strip", () => {
    const snapshot = {
      ...emptyGitStateSnapshot(),
      pullRequests: {
        [key]: prState({ diff: undefined, files: undefined, reviewThreads: undefined }),
      },
    };
    expect(projectGitStateSnapshotForRemote(snapshot)).toBe(snapshot);
  });

  it("leaves an empty snapshot alone", () => {
    const snapshot = emptyGitStateSnapshot();
    expect(projectGitStateSnapshotForRemote(snapshot)).toBe(snapshot);
  });
});

describe("projectGitStatePatchForInterests", () => {
  const patch = {
    revision: 5,
    pullRequests: { [key]: prState(), [otherKey]: prState({ ref: otherRef }) },
  };

  it("strips bodies for a connection that asked for nothing", () => {
    const scoped = projectGitStatePatchForInterests(patch, []);
    expect(scoped.pullRequests?.[key]?.diff).toBeUndefined();
    expect(scoped.pullRequests?.[otherKey]?.diff).toBeUndefined();
  });

  it("keeps bodies only for the pull request this connection is reviewing", () => {
    const scoped = projectGitStatePatchForInterests(patch, [
      { kind: "pull-request", projectId: "project-1", prNumber: 42, includeReviewBundle: true },
    ]);
    expect(scoped.pullRequests?.[key]?.diff).toBe(patch.pullRequests[key]!.diff);
    expect(scoped.pullRequests?.[key]?.files).toBeDefined();
    // A different PR in the same patch is still stripped.
    expect(scoped.pullRequests?.[otherKey]?.diff).toBeUndefined();
  });

  it("strips when the interest does not ask for the review bundle", () => {
    const scoped = projectGitStatePatchForInterests(patch, [
      { kind: "pull-request", projectId: "project-1", prNumber: 42 },
    ]);
    expect(scoped.pullRequests?.[key]?.diff).toBeUndefined();
  });

  it("ignores interests of other kinds", () => {
    const scoped = projectGitStatePatchForInterests(patch, [
      { kind: "target", projectId: "project-1" },
      { kind: "project-pull-requests", projectId: "project-1" },
    ]);
    expect(scoped.pullRequests?.[key]?.diff).toBeUndefined();
  });

  it("passes through a patch with no pull requests by identity", () => {
    const targetsOnly = { revision: 6, targets: {} };
    expect(projectGitStatePatchForInterests(targetsOnly, [])).toBe(targetsOnly);
  });

  it("does not copy a patch whose pull requests carry no bodies", () => {
    const light = {
      revision: 7,
      pullRequests: {
        [key]: prState({ diff: undefined, files: undefined, reviewThreads: undefined }),
      },
    };
    expect(projectGitStatePatchForInterests(light, [])).toBe(light);
  });

  it("never mutates the input patch", () => {
    const before = JSON.stringify(patch);
    projectGitStatePatchForInterests(patch, []);
    expect(JSON.stringify(patch)).toBe(before);
  });
});
