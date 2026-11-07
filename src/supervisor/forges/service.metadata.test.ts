import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForgeRepository, GhGetPrDetailsResult } from "@/shared/contracts";
import { GitHubService } from "../github";
import { testSource, testTransport } from "./adapterTestKit";
import { GiteaReview } from "./gitea";
import { ForgeReviewService } from "./service";

const location = { kind: "windows" as const, path: "C:\\repo" };
const head = "a".repeat(40);
const commit = "c".repeat(40);

function details(headSha = head): GhGetPrDetailsResult {
  return {
    pr: {
      number: 7,
      title: "Review",
      state: "open",
      isDraft: false,
      baseBranch: "main",
      url: "https://forge.example/team/app/pulls/7",
      updatedAt: "now",
      headSha,
    },
    details: {
      number: 7,
      title: "Review",
      body: "",
      baseBranch: "main",
      headBranch: "feature",
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      comments: [],
      reviews: [],
      checks: [],
      commits: [
        {
          oid: commit,
          abbreviatedOid: commit.slice(0, 7),
          messageHeadline: "Change",
          authoredDate: "now",
        },
      ],
    },
  };
}

function fixture(configure?: (source: ForgeRepository) => void) {
  const source = testSource("gitea");
  configure?.(source);
  const { api } = testTransport({});
  const resolve = async () => ({ source: structuredClone(source), api });
  const service = new ForgeReviewService(new GitHubService(), { connections: { resolve } });
  vi.spyOn(GiteaReview.prototype, "details").mockImplementation(async () => details());
  const scope = {
    projectLocation: location,
    forgeAccount: source.account!,
    forgeRepository: source.repository,
    prNumber: 7,
  };
  return { service, scope };
}

afterEach(() => vi.restoreAllMocks());

describe("review metadata service gates", () => {
  it("nets out label changes before calling the host and skips an empty result", async () => {
    const { service, scope } = fixture();
    const setLabels = vi.spyOn(GiteaReview.prototype, "setLabels").mockResolvedValue(undefined);
    await service.setPrLabels({ ...scope, add: [" bug ", "bug", "docs"], remove: ["docs", "old"] });
    expect(setLabels).toHaveBeenCalledWith(7, ["bug"], ["old"]);
    setLabels.mockClear();
    await service.setPrLabels({ ...scope, add: ["x"], remove: ["x"] });
    expect(setLabels).not.toHaveBeenCalled();
  });

  it("refuses label and reviewer writes when the host lacks the capability", async () => {
    const { service, scope } = fixture((source) => {
      delete source.capabilities.labels;
      delete source.capabilities.reviewRequests;
      delete source.capabilities.convertToDraft;
    });
    const setLabels = vi.spyOn(GiteaReview.prototype, "setLabels");
    const request = vi.spyOn(GiteaReview.prototype, "requestReviewers");
    const setState = vi.spyOn(GiteaReview.prototype, "setState");
    await expect(service.setPrLabels({ ...scope, add: ["bug"], remove: [] })).rejects.toThrow(
      /not supported/,
    );
    await expect(
      service.requestPrReviewers({ ...scope, add: [{ id: "alice" }], remove: [] }),
    ).rejects.toThrow(/not supported/);
    await expect(service.convertPrToDraft(scope)).rejects.toThrow(/not supported/);
    expect(setLabels).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
  });

  it("keeps users and teams with the same id distinct when netting reviewer requests", async () => {
    const { service, scope } = fixture();
    const request = vi
      .spyOn(GiteaReview.prototype, "requestReviewers")
      .mockResolvedValue(undefined);
    await service.requestPrReviewers({
      ...scope,
      add: [{ id: "core" }, { id: "core", team: true }, { id: "core" }],
      remove: [{ id: "core", team: true }, { id: "bob" }],
    });
    expect(request).toHaveBeenCalledWith(7, [{ id: "core" }], [{ id: "bob" }]);
  });

  it("diffs only a commit listed on the review, resolving an abbreviated id", async () => {
    const { service, scope } = fixture();
    const commitDiff = vi
      .spyOn(GiteaReview.prototype, "commitDiff")
      .mockResolvedValue("diff --git a/a b/a\n");
    await expect(
      service.getPrCommitDiff({ ...scope, commit: commit.slice(0, 9) }),
    ).resolves.toEqual({ diff: "diff --git a/a b/a\n" });
    expect(commitDiff).toHaveBeenCalledWith(7, commit);
    await expect(service.getPrCommitDiff({ ...scope, commit: "d".repeat(40) })).rejects.toThrow(
      /not part of this pull request/,
    );
    expect(commitDiff).toHaveBeenCalledTimes(1);
  });

  it("accepts only advertised reaction names", async () => {
    const { service, scope } = fixture((source) => {
      source.capabilities.reactions = ["+1"];
    });
    const react = vi.spyOn(GiteaReview.prototype, "react").mockResolvedValue(undefined);
    await service.setPrReaction({ ...scope, content: "+1", reacted: true });
    expect(react).toHaveBeenCalledWith(7, undefined, "+1", true);
    await expect(
      service.setPrReaction({ ...scope, subjectId: "5", content: "rocket", reacted: true }),
    ).rejects.toThrow(/not supported/);
    expect(react).toHaveBeenCalledTimes(1);
  });

  it("submits a draft review only on the head its anchors were drawn on", async () => {
    const { service, scope } = fixture();
    const submit = vi.spyOn(GiteaReview.prototype, "submitDraft").mockResolvedValue(undefined);
    const comments = [
      { path: "a.ts", side: "RIGHT" as const, line: 4, startLine: 2, body: "Range" },
      { path: "a.ts", side: "RIGHT" as const, line: 4, startLine: 4, body: "Single" },
    ];
    await service.submitPrReviewDraft({
      ...scope,
      decision: "comment",
      body: "",
      expectedHeadSha: head.toUpperCase(),
      comments,
    });
    expect(submit).toHaveBeenCalledWith(7, {
      decision: "comment",
      body: "",
      headSha: head,
      comments: [comments[0], { path: "a.ts", side: "RIGHT", line: 4, body: "Single" }],
    });
    await expect(
      service.submitPrReviewDraft({
        ...scope,
        decision: "comment",
        body: "",
        expectedHeadSha: "b".repeat(40),
        comments,
      }),
    ).rejects.toThrow(/changed after these line comments/);
    await expect(
      service.submitPrReviewDraft({
        ...scope,
        decision: "request-changes",
        body: " ",
        expectedHeadSha: head,
        comments,
      }),
    ).rejects.toThrow(/body is required/);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("lists closed and merged reviews through the adapter's state filter", async () => {
    const { service } = fixture();
    const list = vi.spyOn(GiteaReview.prototype, "list").mockResolvedValue([]);
    await expect(
      service.listPullRequestsInState({ projectLocation: location, state: "merged" }),
    ).resolves.toEqual({ pullRequests: [], viewerLogin: "viewer" });
    expect(list).toHaveBeenCalledWith("merged");
  });
});
