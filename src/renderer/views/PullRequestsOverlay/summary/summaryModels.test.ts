// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { PrDetails, PrReaction } from "@/shared/contracts";
import { makeTestDetails } from "../testing/prDetailTestScope";
import { buildActivity, filterActivity } from "./activityModel";
import { mergeLabelOptions, netLabelChange } from "./labelModel";
import { withReaction, withSubjectReactions } from "./reactionModel";
import { buildReviewerRows, latestReviewByLogin } from "./reviewerModel";

describe("withReaction", () => {
  it("adds a first reaction, increments an existing one and is idempotent", () => {
    const added = withReaction(undefined, "+1", true);
    expect(added).toEqual([{ content: "+1", count: 1, viewerReacted: true }]);
    expect(withReaction([{ content: "+1", count: 2, viewerReacted: false }], "+1", true)).toEqual([
      { content: "+1", count: 3, viewerReacted: true },
    ]);
    expect(withReaction(added, "+1", true)).toEqual(added);
  });

  it("removes only the viewer's own reaction and drops an emptied chip", () => {
    expect(
      withReaction(
        [
          { content: "+1", count: 3, viewerReacted: true },
          { content: "eyes", count: 1, viewerReacted: true },
        ],
        "+1",
        false,
      ),
    ).toEqual([
      { content: "+1", count: 2, viewerReacted: false },
      { content: "eyes", count: 1, viewerReacted: true },
    ]);
    expect(
      withReaction([{ content: "eyes", count: 1, viewerReacted: true }], "eyes", false),
    ).toEqual([]);
    const untouched = [{ content: "eyes", count: 1, viewerReacted: false }];
    expect(withReaction(untouched, "eyes", false)).toEqual(untouched);
  });
});

describe("withSubjectReactions", () => {
  const details: PrDetails = makeTestDetails({
    comments: [{ id: "c1", author: { login: "a" }, body: "", createdAt: "" }],
    reviewThreads: [
      {
        id: "t1",
        isResolved: false,
        isOutdated: false,
        comments: [{ id: "tc1", author: { login: "a" }, body: "", createdAt: "" }],
      },
    ],
  });
  const heart = (reactions: readonly PrReaction[] | undefined) =>
    withReaction(reactions, "heart", true);

  it("changes the description when no subject is given", () => {
    expect(withSubjectReactions(details, undefined, heart).reactions).toHaveLength(1);
  });

  it("finds a conversation comment and an inline comment by id", () => {
    expect(withSubjectReactions(details, "c1", heart).comments[0]?.reactions).toHaveLength(1);
    expect(
      withSubjectReactions(details, "tc1", heart).reviewThreads?.[0]?.comments[0]?.reactions,
    ).toHaveLength(1);
  });
});

describe("netLabelChange and mergeLabelOptions", () => {
  it("returns only what differs", () => {
    expect(netLabelChange([{ name: "a" }, { name: "b" }], new Set(["b", "c"]))).toEqual({
      add: ["c"],
      remove: ["a"],
    });
    expect(netLabelChange([{ name: "a" }], new Set(["a"]))).toEqual({ add: [], remove: [] });
  });

  it("keeps the review's own labels when a truncated read omits them", () => {
    expect(
      mergeLabelOptions([{ name: "z" }, { name: "b" }], [{ name: "q" }, { name: "b" }]).map(
        (label) => label.name,
      ),
    ).toEqual(["b", "q", "z"]);
  });
});

describe("reviewer rows", () => {
  it("takes each person's latest submitted review and ignores pending drafts", () => {
    const latest = latestReviewByLogin([
      { id: "1", author: { login: "Ann" }, state: "APPROVED", body: "", submittedAt: "2026-01-02" },
      {
        id: "2",
        author: { login: "ann" },
        state: "CHANGES_REQUESTED",
        body: "",
        submittedAt: "2026-01-03",
      },
      { id: "3", author: { login: "ann" }, state: "PENDING", body: "", submittedAt: "2026-01-04" },
    ]);
    expect(latest.get("ann")?.state).toBe("CHANGES_REQUESTED");
  });

  it("lists requested reviewers, then other reviewers, never the author", () => {
    const rows = buildReviewerRows({
      requested: [{ id: "u1", login: "alice" }],
      reviews: [
        { id: "1", author: { login: "bob" }, state: "COMMENTED", body: "x" },
        { id: "2", author: { login: "Author" }, state: "COMMENTED", body: "x" },
      ],
      authorLogin: "author",
    });
    expect(rows.map((row) => [row.login, row.requested ? "requested" : "reviewed"])).toEqual([
      ["alice", "requested"],
      ["bob", "reviewed"],
    ]);
  });
});

describe("activity", () => {
  const details = makeTestDetails({
    comments: [
      { id: "b", author: { login: "x" }, body: "", createdAt: "2026-01-02" },
      { id: "a", author: { login: "x" }, body: "", createdAt: "2026-01-01" },
    ],
    reviews: [
      { id: "r", author: { login: "x" }, state: "APPROVED", body: "", submittedAt: "2026-01-03" },
    ],
  });

  it("sorts oldest first and reverses for newest first", () => {
    const entries = buildActivity(details);
    expect(entries.map((e) => e.data.id)).toEqual(["a", "b", "r"]);
    expect(filterActivity(entries, "all", "newest").map((e) => e.data.id)).toEqual(["r", "b", "a"]);
    expect(filterActivity(entries, "comments", "oldest").map((e) => e.data.id)).toEqual(["a", "b"]);
    expect(filterActivity(entries, "reviews", "oldest").map((e) => e.data.id)).toEqual(["r"]);
  });
});
