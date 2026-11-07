import { describe, expect, it } from "vitest";
import type { PrDetails, PrTimelineEvent } from "@/shared/contracts";
import { makeTestDetails } from "../testing/prDetailTestScope";
import {
  buildPrTimeline,
  filterPrTimeline,
  orderPrTimeline,
  type PrTimelineEntry,
} from "./prTimelineModel";

const alice = { login: "alice" };
const bob = { login: "bob" };

function event(overrides: Partial<PrTimelineEvent> & Pick<PrTimelineEvent, "id" | "kind">) {
  return { createdAt: "2026-07-01T10:00:00Z", actor: alice, ...overrides };
}

function build(overrides: Partial<PrDetails>) {
  return buildPrTimeline(makeTestDetails(overrides));
}

const ids = (entries: PrTimelineEntry[]) => entries.map((entry) => entry.id);

describe("buildPrTimeline", () => {
  it("returns nothing without details", () => {
    expect(buildPrTimeline(undefined)).toEqual([]);
  });

  it("merges every source into one chronological list", () => {
    const entries = build({
      timeline: [
        event({
          id: "e1",
          kind: "labeled",
          createdAt: "2026-07-01T12:00:00Z",
          label: { name: "bug" },
        }),
      ],
      commits: [
        {
          oid: "c".repeat(40),
          abbreviatedOid: "ccccccc",
          messageHeadline: "Fix it",
          authoredDate: "2026-07-01T11:00:00Z",
        },
      ],
      reviews: [
        { id: "r1", author: bob, state: "APPROVED", body: "", submittedAt: "2026-07-01T14:00:00Z" },
      ],
      comments: [{ id: "k1", author: bob, body: "hi", createdAt: "2026-07-01T13:00:00Z" }],
      reviewThreads: [
        {
          id: "t1",
          isResolved: false,
          isOutdated: false,
          path: "a.ts",
          line: 3,
          comments: [{ id: "tc1", author: bob, body: "nit", createdAt: "2026-07-01T09:00:00Z" }],
        },
      ],
    });
    expect(ids(entries)).toEqual([
      "thread:t1",
      `commit:${"c".repeat(40)}`,
      "event:e1",
      "comment:k1",
      "review:r1",
    ]);
  });

  it("anchors a thread on its first comment and skips empty threads", () => {
    const entries = build({
      reviewThreads: [
        {
          id: "t1",
          isResolved: true,
          isOutdated: false,
          comments: [
            { id: "a", author: alice, body: "first", createdAt: "2026-07-01T09:00:00Z" },
            { id: "b", author: bob, body: "reply", createdAt: "2026-07-02T09:00:00Z" },
          ],
        },
        { id: "t2", isResolved: false, isOutdated: false, comments: [] },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.at).toBe("2026-07-01T09:00:00Z");
  });

  it("keeps source order for equal timestamps and is stable", () => {
    const at = "2026-07-01T10:00:00Z";
    const entries = build({
      timeline: [
        event({ id: "x", kind: "closed", createdAt: at }),
        event({ id: "y", kind: "reopened", createdAt: at }),
      ],
      comments: [{ id: "k", author: bob, body: "same time", createdAt: at }],
    });
    expect(ids(entries)).toEqual(["event:x", "event:y", "comment:k"]);
  });

  it("dedupes entries by id", () => {
    const entries = build({
      timeline: [event({ id: "e1", kind: "closed" }), event({ id: "e1", kind: "closed" })],
      comments: [
        { id: "k", author: bob, body: "a", createdAt: "2026-07-01T10:00:00Z" },
        { id: "k", author: bob, body: "a", createdAt: "2026-07-01T10:00:00Z" },
      ],
    });
    expect(ids(entries)).toEqual(["event:e1", "comment:k"]);
  });

  it("adds an opened entry from createdAt and author when the host sent none", () => {
    const [first] = build({ createdAt: "2026-06-30T08:00:00Z", author: bob });
    expect(first?.type === "event" && first.event.kind).toBe("opened");
    expect(first?.type === "event" && first.event.actor).toEqual(bob);
  });

  it("does not duplicate opened when the host sent one", () => {
    const entries = build({
      createdAt: "2026-06-30T08:00:00Z",
      timeline: [event({ id: "o", kind: "opened", createdAt: "2026-06-30T08:00:00Z" })],
    });
    expect(ids(entries)).toEqual(["event:o"]);
  });

  it("adds a merged entry from mergedAt and mergedBy when no merged event exists", () => {
    const entries = build({ mergedAt: "2026-07-05T08:00:00Z", mergedBy: bob });
    const merged = entries.find((entry) => entry.type === "event" && entry.event.kind === "merged");
    expect(merged?.type === "event" && merged.event.actor).toEqual(bob);
    const withEvent = build({
      mergedAt: "2026-07-05T08:00:00Z",
      mergedBy: bob,
      timeline: [event({ id: "m", kind: "merged", createdAt: "2026-07-05T08:00:00Z" })],
    });
    expect(ids(withEvent)).toEqual(["event:m"]);
  });

  it("skips unknown kinds instead of failing", () => {
    const entries = build({
      timeline: [
        event({ id: "future", kind: "pinned-from-the-future" }),
        event({ id: "known", kind: "closed" }),
      ],
    });
    expect(ids(entries)).toEqual(["event:known"]);
  });

  it("puts entries without a valid date last, in source order", () => {
    const entries = build({
      timeline: [
        event({ id: "bad", kind: "closed", createdAt: "not a date" }),
        event({ id: "late", kind: "reopened", createdAt: "2026-07-09T00:00:00Z" }),
      ],
      reviews: [{ id: "r", author: bob, state: "APPROVED", body: "" }],
      comments: [{ id: "k", author: bob, body: "early", createdAt: "2026-07-01T00:00:00Z" }],
    });
    expect(ids(entries)).toEqual(["comment:k", "event:late", "event:bad", "review:r"]);
  });

  it("skips empty drive-by reviews like the conversation does", () => {
    const entries = build({
      reviews: [
        {
          id: "empty",
          author: bob,
          state: "COMMENTED",
          body: "",
          submittedAt: "2026-07-01T10:00:00Z",
        },
        {
          id: "dismissed",
          author: bob,
          state: "DISMISSED",
          body: "",
          submittedAt: "2026-07-01T10:00:00Z",
        },
        {
          id: "pending",
          author: bob,
          state: "PENDING",
          body: "draft",
          submittedAt: "2026-07-01T10:00:00Z",
        },
        {
          id: "words",
          author: bob,
          state: "COMMENTED",
          body: "ok",
          submittedAt: "2026-07-01T10:00:00Z",
        },
        {
          id: "approved",
          author: bob,
          state: "APPROVED",
          body: "",
          submittedAt: "2026-07-01T10:00:00Z",
        },
        {
          id: "changes",
          author: bob,
          state: "CHANGES_REQUESTED",
          body: "",
          submittedAt: "2026-07-01T10:00:00Z",
        },
      ],
    });
    expect(ids(entries)).toEqual(["review:words", "review:approved", "review:changes"]);
  });

  it("keeps reviewer and label events and drops ones without their payload", () => {
    const entries = build({
      timeline: [
        event({ id: "l", kind: "labeled", label: { name: "bug", color: "ff0000" } }),
        event({ id: "l2", kind: "unlabeled" }),
        event({ id: "r", kind: "review-requested", reviewer: { id: "1", login: "carol" } }),
        event({ id: "r2", kind: "review-request-removed" }),
        event({ id: "s", kind: "system", text: "  " }),
        event({ id: "s2", kind: "system", text: "Locked" }),
      ],
    });
    expect(ids(entries)).toEqual(["event:l", "event:r", "event:s2"]);
  });
});

describe("filterPrTimeline and orderPrTimeline", () => {
  const entries = build({
    timeline: [event({ id: "e", kind: "closed", createdAt: "2026-07-02T00:00:00Z" })],
    commits: [
      {
        oid: "a".repeat(40),
        abbreviatedOid: "aaaaaaa",
        messageHeadline: "x",
        authoredDate: "2026-07-01T00:00:00Z",
      },
    ],
    comments: [{ id: "k", author: bob, body: "c", createdAt: "2026-07-03T00:00:00Z" }],
    reviews: [{ id: "u", author: bob, state: "APPROVED", body: "" }],
  });

  it("filters by group", () => {
    expect(filterPrTimeline(entries, "all")).toHaveLength(4);
    expect(ids(filterPrTimeline(entries, "events"))).toEqual(["event:e"]);
    expect(ids(filterPrTimeline(entries, "commits"))).toEqual([`commit:${"a".repeat(40)}`]);
    expect(ids(filterPrTimeline(entries, "reviews"))).toEqual(["comment:k", "review:u"]);
  });

  it("reverses dated entries for newest first and keeps undated ones last", () => {
    expect(ids(orderPrTimeline(entries, "newest"))).toEqual([
      "comment:k",
      "event:e",
      `commit:${"a".repeat(40)}`,
      "review:u",
    ]);
    expect(ids(orderPrTimeline(entries, "oldest"))).toEqual(ids(entries));
  });
});
