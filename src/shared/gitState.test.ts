import { describe, expect, it } from "vitest";
import {
  applyGitStatePatch,
  emptyGitStateSnapshot,
  gitProjectKey,
  gitTargetKey,
  pullRequestBranchKey,
  pullRequestKey,
} from "./gitState";

describe("git state references", () => {
  it("namespaces project, target, branch, and PR identities by host", () => {
    const project = { hostId: "host-a", projectId: "project-a" };
    expect(gitProjectKey(project)).not.toBe(
      gitProjectKey({ hostId: "host-b", projectId: "project-a" }),
    );
    expect(gitTargetKey(project)).not.toBe(
      gitTargetKey({ ...project, worktreePath: "/repo/worktree" }),
    );
    expect(pullRequestBranchKey(project, "feature/a")).not.toBe(
      pullRequestBranchKey(project, "feature/b"),
    );
    expect(pullRequestKey({ ...project, prNumber: 42 })).not.toBe(
      pullRequestKey({ ...project, prNumber: 43 }),
    );
  });

  it("does not collide when key parts contain separators", () => {
    expect(
      gitTargetKey({
        hostId: "host\u0000project",
        projectId: "a",
        worktreePath: "/worktree",
      }),
    ).not.toBe(
      gitTargetKey({
        hostId: "host",
        projectId: "project\u0000a",
        worktreePath: "/worktree",
      }),
    );
  });
});

describe("applyGitStatePatch", () => {
  it("applies normalized upserts and removals in revision order", () => {
    const projectRef = { hostId: "host-a", projectId: "project-a" };
    const projectKey = gitProjectKey(projectRef);
    const prKey = pullRequestKey({ ...projectRef, prNumber: 42 });
    const branchKey = pullRequestBranchKey(projectRef, "feature/a");
    const now = "2026-07-28T12:00:00.000Z";
    const project = { ref: projectRef, refreshedAt: now };
    const pr = {
      ref: { ...projectRef, prNumber: 42 },
      data: {
        number: 42,
        state: "open" as const,
        title: "Unify PR state",
        url: "https://example.test/pull/42",
        baseBranch: "main",
        isDraft: false,
        updatedAt: now,
      },
      freshness: { core: now },
    };

    const first = applyGitStatePatch(emptyGitStateSnapshot(), {
      revision: 1,
      projects: { [projectKey]: project },
      pullRequests: { [prKey]: pr },
      pullRequestKeyByBranch: { [branchKey]: prKey },
    });
    expect(first.projects[projectKey]).toBe(project);
    expect(first.pullRequests[prKey]).toBe(pr);
    expect(first.pullRequestKeyByBranch[branchKey]).toBe(prKey);

    const stale = applyGitStatePatch(first, {
      revision: 1,
      removePullRequests: [prKey],
    });
    expect(stale).toBe(first);

    const removed = applyGitStatePatch(first, {
      revision: 2,
      removePullRequests: [prKey],
      pullRequestKeyByBranch: { [branchKey]: null },
    });
    expect(removed.pullRequests[prKey]).toBeUndefined();
    expect(removed.pullRequestKeyByBranch[branchKey]).toBeUndefined();
  });
});
