import { beforeEach, describe, expect, it } from "vitest";
import {
  emptyGitStateSnapshot,
  gitTargetKey,
  pullRequestKey,
  type GitStateSnapshot,
} from "@/shared/gitState";
import { resetGitStoreCache, useGitStore } from "./gitStore";
import { projectGitReadModelIntoLegacyStore } from "./gitReadModelLegacyProjection";

describe("projectGitReadModelIntoLegacyStore", () => {
  beforeEach(() => resetGitStoreCache());

  it("projects a canonical PR update into the existing worktree panel cache", () => {
    const targetRef = {
      hostId: "desktop-1",
      projectId: "project-1",
      worktreePath: "/repo/worktree",
    };
    const prRef = { hostId: "desktop-1", projectId: "project-1", prNumber: 42 };
    const prKey = pullRequestKey(prRef);
    const snapshot: GitStateSnapshot = {
      ...emptyGitStateSnapshot(),
      revision: 3,
      targets: {
        [gitTargetKey(targetRef)]: {
          ref: targetRef,
          pullRequestKey: prKey,
          refreshedAt: "2026-07-28T00:00:00.000Z",
        },
      },
      pullRequests: {
        [prKey]: {
          ref: prRef,
          data: {
            number: 42,
            state: "open",
            title: "Fresh title",
            url: "https://github.test/pr/42",
            baseBranch: "main",
            isDraft: false,
            checksStatus: "SUCCESS",
            updatedAt: "2026-07-28T00:00:00.000Z",
          },
          details: {
            number: 42,
            title: "Fresh title",
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
          },
          freshness: {
            core: "2026-07-28T00:00:00.000Z",
            details: "2026-07-28T00:00:00.000Z",
          },
        },
      },
    };

    projectGitReadModelIntoLegacyStore(snapshot);

    expect(useGitStore.getState().prData["/repo/worktree"]).toMatchObject({
      title: "Fresh title",
      checksStatus: "SUCCESS",
    });
    expect(useGitStore.getState().prDetails["project-1#42"]?.checks).toEqual([
      { name: "build", state: "COMPLETED", conclusion: "SUCCESS" },
    ]);
  });
});
