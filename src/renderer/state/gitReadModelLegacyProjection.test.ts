import { beforeEach, describe, expect, it } from "vitest";
import {
  emptyGitStateSnapshot,
  gitTargetKey,
  pullRequestKey,
  type GitStateSnapshot,
} from "@/shared/gitState";
import { buildBranchPrKey } from "./gitSelectors";
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

  it("projects the project-root PR under the __branch: key legacy readers use", () => {
    const targetRef = { hostId: "desktop-1", projectId: "project-1" };
    const prRef = { hostId: "desktop-1", projectId: "project-1", prNumber: 7 };
    const prKey = pullRequestKey(prRef);
    const snapshot: GitStateSnapshot = {
      ...emptyGitStateSnapshot(),
      revision: 1,
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
            number: 7,
            state: "merged",
            title: "Root branch PR",
            url: "https://github.test/pr/7",
            baseBranch: "main",
            isDraft: false,
            checksStatus: "SUCCESS",
            updatedAt: "2026-07-28T00:00:00.000Z",
          },
          freshness: { core: "2026-07-28T00:00:00.000Z" },
        },
      },
    };

    projectGitReadModelIntoLegacyStore(snapshot);

    expect(useGitStore.getState().prData[buildBranchPrKey("project-1")]).toMatchObject({
      number: 7,
      state: "merged",
    });
    expect(useGitStore.getState().prData["project-1"]).toBeUndefined();
  });

  it("clears the __branch: key when the project root loses its PR", () => {
    const targetRef = { hostId: "desktop-1", projectId: "project-1" };
    useGitStore.getState().setPrData(buildBranchPrKey("project-1"), {
      number: 7,
      state: "open",
      title: "Root branch PR",
      url: "https://github.test/pr/7",
      baseBranch: "main",
      isDraft: false,
      updatedAt: "2026-07-28T00:00:00.000Z",
    });

    projectGitReadModelIntoLegacyStore({
      ...emptyGitStateSnapshot(),
      revision: 2,
      targets: {
        [gitTargetKey(targetRef)]: {
          ref: targetRef,
          pullRequestKey: null,
          refreshedAt: "2026-07-28T00:00:00.000Z",
        },
      },
    });

    expect(useGitStore.getState().prData[buildBranchPrKey("project-1")]).toBeNull();
  });
});
