import { describe, expect, it } from "vitest";
import {
  forgeReviewCapabilitiesSchema,
  ghGetPrDetailsResultSchema,
  ghGetPrReviewThreadsResultSchema,
  ghListPullRequestsResultSchema,
} from "@/shared/contracts";
import { FORGE_CAPABILITIES } from "./connection";

// Shapes exactly as the multi-forge review release (#926) produced them, before
// labels, reviewer requests, timeline events, reactions and the new capabilities.
const releasedCapabilities = {
  mergeMethods: ["merge", "squash"],
  reviewDecisions: ["approve", "comment"],
  draft: true,
  reopen: true,
  updateBranch: false,
  rebaseBranch: true,
  edit: true,
  checks: true,
  reviewThreads: true,
  viewedFiles: "host",
  commentEditing: ["conversation", "inline"],
  reviewGuides: true,
  expectedHeadMerge: true,
  autoMerge: true,
  autoFix: true,
  adminMerge: false,
};
const releasedSource = {
  forge: "gitlab",
  host: "https://gitlab.example",
  repository: "team/app",
  remote: "origin",
  account: { forge: "gitlab", host: "https://gitlab.example", login: "viewer" },
  capabilities: releasedCapabilities,
};
const releasedDetails = {
  source: releasedSource,
  number: 7,
  title: "Review",
  body: "Body",
  author: { login: "author" },
  baseBranch: "main",
  headBranch: "feature",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  createdAt: "2026-10-01T00:00:00Z",
  commits: [],
  comments: [{ id: "1", author: { login: "a" }, body: "Hi", createdAt: "2026-10-01T00:00:00Z" }],
  reviews: [],
  checks: [],
};

describe("review metadata compatibility", () => {
  it("still reads released review details, list rows and capabilities without the new fields", () => {
    const parsed = ghGetPrDetailsResultSchema.parse({ details: releasedDetails });
    expect(parsed.details.labels).toBeUndefined();
    expect(parsed.details.requestedReviewers).toBeUndefined();
    expect(parsed.details.timeline).toBeUndefined();
    expect(parsed.details.reactions).toBeUndefined();
    expect(parsed.details.comments[0]!.reactions).toBeUndefined();
    const capabilities = forgeReviewCapabilitiesSchema.parse(releasedCapabilities);
    expect(capabilities.labels).toBeUndefined();
    expect(capabilities.reviewDrafts).toBeUndefined();
    expect(
      ghListPullRequestsResultSchema.parse({
        pullRequests: [
          {
            pr: {
              source: releasedSource,
              number: 7,
              state: "open",
              title: "Review",
              url: "https://gitlab.example/team/app/-/merge_requests/7",
              baseBranch: "main",
              isDraft: false,
              updatedAt: "2026-10-01T00:00:00Z",
            },
            headBranch: "feature",
            additions: 1,
            deletions: 0,
            repository: "team/app",
            reviewRequested: false,
          },
        ],
      }).pullRequests[0]!.labels,
    ).toBeUndefined();
  });

  it("accepts event kinds and reaction names a newer host may add", () => {
    const parsed = ghGetPrDetailsResultSchema.parse({
      details: {
        ...releasedDetails,
        labels: [{ name: "bug", color: "D73A4A" }],
        requestedReviewers: [{ id: "team/core", login: "core", team: true }],
        timeline: [
          { id: "1", kind: "opened", createdAt: "2026-10-01T00:00:00Z" },
          { id: "2", kind: "a-kind-from-the-future", createdAt: "2026-10-02T00:00:00Z" },
        ],
        reactions: [{ content: "a-future-reaction", count: 1, viewerReacted: false }],
      },
    });
    expect(parsed.details.timeline?.map((event) => event.kind)).toEqual([
      "opened",
      "a-kind-from-the-future",
    ]);
    expect(parsed.details.reactions?.[0]?.content).toBe("a-future-reaction");
  });

  it("still reads review threads released without a diff side", () => {
    // Threads as #926 produced them: a path and a line, no `side`.
    const released = {
      id: "t1",
      isResolved: false,
      isOutdated: false,
      path: "src/app.ts",
      line: 40,
      comments: [
        { id: "1", author: { login: "a" }, body: "Hi", createdAt: "2026-10-01T00:00:00Z" },
      ],
    };
    const parsed = ghGetPrReviewThreadsResultSchema.parse({
      comments: released.comments,
      threads: [released],
    });
    expect(parsed.threads[0]).toEqual(released);
    expect(parsed.threads[0]).not.toHaveProperty("side");
    const details = ghGetPrDetailsResultSchema.parse({
      details: { ...releasedDetails, reviewThreads: [released] },
    });
    expect(details.details.reviewThreads?.[0]?.side).toBeUndefined();
  });

  it("accepts a diff side a newer host may add", () => {
    const thread = (side: string) => ({
      id: side,
      isResolved: false,
      isOutdated: false,
      path: "src/app.ts",
      line: 40,
      side,
      comments: [],
    });
    const parsed = ghGetPrReviewThreadsResultSchema.parse({
      comments: [],
      threads: [thread("LEFT"), thread("RIGHT"), thread("a-side-from-the-future")],
    });
    expect(parsed.threads.map((t) => t.side)).toEqual(["LEFT", "RIGHT", "a-side-from-the-future"]);
  });

  it("drops fields an older reader does not know instead of rejecting the review", () => {
    // Older readers were plain objects; stripping is what keeps them correct.
    const parsed = ghGetPrDetailsResultSchema.parse({
      details: { ...releasedDetails, aFieldFromTheFuture: true },
    });
    expect(parsed.details).not.toHaveProperty("aFieldFromTheFuture");
  });

  it("declares every new capability as optional so released hosts stay valid", () => {
    for (const capabilities of Object.values(FORGE_CAPABILITIES))
      expect(forgeReviewCapabilitiesSchema.parse(capabilities)).toEqual(capabilities);
    const shape = forgeReviewCapabilitiesSchema.shape;
    for (const key of [
      "labels",
      "reviewRequests",
      "convertToDraft",
      "commitDiffs",
      "reactions",
      "reviewDrafts",
    ] as const)
      expect(shape[key].safeParse(undefined).success).toBe(true);
  });
});
