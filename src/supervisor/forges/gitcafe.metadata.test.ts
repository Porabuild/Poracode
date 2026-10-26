import { describe, expect, it } from "vitest";
import { ghGetPrDetailsResultSchema } from "@/shared/contracts";
import { testSource, testTransport } from "./adapterTestKit";
import { GitCafeReview } from "./gitcafe";

const head = "a".repeat(40),
  base = "b".repeat(40),
  parent = "c".repeat(40);
const p = "repos/team/app/pulls";
const actor = (id: string, handle: string) => ({
  id,
  actor: { kind: "local", actorId: id, handle, displayName: null, avatarUrl: null },
  handle,
  displayName: `${handle} name`,
  avatarUrl: null,
});
const hunk = {
  oldStart: 1,
  oldLines: 1,
  newStart: 1,
  newLines: 1,
  lines: [
    { origin: "-", content: "old\n" },
    { origin: "+", content: "new\n" },
  ],
};

function fixture() {
  const source = testSource("gitcafe");
  const pr = {
    id: "pull-7",
    number: 7,
    title: "Review",
    state: "open",
    draft: false,
    sourceBranch: "feature",
    targetBranch: "main",
    headOid: head,
    version: 3,
    description: "Body",
    isCrossFork: false,
    sourceRepo: null,
    author: { kind: "local", actorId: "u-author", handle: "author" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    closedAt: null,
    mergedAt: null,
    capabilities: { edit: true, moderate: false, review: true, merge: true, comment: true },
  };
  const routes: Record<string, unknown> = {
    [`GET ${p}/`]: {
      items: [{ ...pr, labels: [{ id: "l1", name: "bug", color: "#D73A4A" }] }],
      next: null,
    },
    [`GET ${p}/7`]: pr,
    [`GET ${p}/7/status`]: {
      baseOid: base,
      headOid: head,
      checks: { contexts: [] },
      merge: { strategies: ["merge"], conflicts: "unknown", verdict: { kind: "waiting" } },
    },
    [`GET ${p}/7/changes`]: { items: [{ path: "a.ts", additions: 1, deletions: 1 }] },
    [`GET ${p}/7/commits`]: { items: [{ oid: head, summary: "Change", time: 1 }] },
    [`GET ${p}/7/comments/`]: {
      items: [
        { id: "c1", threadId: "c1", body: "general", author: { handle: "reviewer" } },
        { id: "c2", threadId: "c2", body: "quiet", author: { handle: "reviewer" } },
      ],
    },
    [`GET ${p}/7/reviews`]: { items: [] },
    [`GET ${p}/7/labels`]: {
      items: [
        { id: "l1", name: "bug", color: "#D73A4A", description: "Broken" },
        { id: "l2", name: "ui", color: "teal", description: null },
      ],
      next: null,
    },
    [`GET ${p}/7/reviewers`]: {
      items: [
        { ...actor("u-pending", "pending"), latestReview: null },
        {
          ...actor("u-done", "done"),
          latestReview: { id: "r", verdict: "approve", dismissedAt: null, stale: false },
        },
        {
          ...actor("u-dismissed", "dismissed"),
          latestReview: { id: "r2", verdict: "approve", dismissedAt: "2026-01-02T00:00:00Z" },
        },
      ],
      next: null,
    },
    [`GET ${p}/7/reactions/`]: {
      items: [
        {
          subject: { kind: "pull_request", id: "pull-7" },
          emoji: { kind: "unicode", value: "\u{1F44D}" },
          count: 2,
          viewerReactionId: "re-1",
          reactors: [],
        },
        {
          subject: { kind: "pull_request", id: "pull-7" },
          emoji: { kind: "unicode", value: "\u{2764}" },
          count: 1,
          viewerReactionId: null,
          reactors: [],
        },
        {
          subject: { kind: "pull_request_comment", id: "c1" },
          emoji: { kind: "unicode", value: "\u{1F44D}\u{1F3FD}" },
          count: 1,
          viewerReactionId: null,
          reactors: [],
        },
        {
          subject: { kind: "pull_request_comment", id: "c1" },
          emoji: { kind: "unicode", value: "\u{1F984}" },
          count: 4,
          viewerReactionId: null,
          reactors: [],
        },
        {
          subject: { kind: "pull_request_comment", id: "c1" },
          emoji: { kind: "custom", id: "party" },
          count: 1,
          viewerReactionId: null,
          reactors: [],
        },
      ],
      next: null,
    },
    ["GET repos/team/app/labels"]: {
      items: [
        { id: "l1", name: "bug", color: "#d73a4a" },
        { id: "l2", name: "ui", color: "#00ffaa" },
        { id: "l3", name: "docs", color: "#0000ff", description: "Docs" },
      ],
      next: null,
    },
  };
  const http = testTransport(routes);
  return { ...http, routes, adapter: new GitCafeReview(source, http.api) };
}

describe("GitCafe review metadata", () => {
  it.each([
    ["open", "open"],
    ["closed", "closed"],
    ["merged", "merged"],
    ["all", null],
  ] as const)("lists %s reviews with the host state filter and labels", async (state, query) => {
    const { adapter, requests } = fixture();
    const [summary] = await adapter.list(state);
    expect(new URL(requests[0]!.url).searchParams.get("state")).toBe(query);
    expect(summary?.labels).toEqual([{ name: "bug", color: "d73a4a" }]);
  });

  it("reads labels, outstanding reviewers, the lifecycle timeline, and reactions", async () => {
    const { adapter } = fixture();
    const result = await adapter.details(7);
    expect(ghGetPrDetailsResultSchema.safeParse(result).success).toBe(true);
    const { details } = result;
    expect(details.labels).toEqual([
      { name: "bug", color: "d73a4a", description: "Broken" },
      { name: "ui" },
    ]);
    expect(details.requestedReviewers).toEqual([
      { id: "u-pending", login: "pending", name: "pending name" },
      { id: "u-dismissed", login: "dismissed", name: "dismissed name" },
    ]);
    expect(details.timeline).toEqual([
      {
        id: "opened",
        kind: "opened",
        createdAt: "2026-01-01T00:00:00Z",
        actor: { login: "author" },
      },
    ]);
    expect(details.reactions).toEqual([
      { content: "+1", count: 2, viewerReacted: true },
      { content: "heart", count: 1, viewerReacted: false },
    ]);
    expect(details.comments.map((c) => c.reactions)).toEqual([
      [{ content: "+1", count: 1, viewerReacted: false }],
      [],
    ]);
    expect(result.pr?.source?.capabilities).toMatchObject({
      labels: true,
      convertToDraft: true,
      reviewRequests: true,
      reviewDrafts: true,
    });
  });

  it("derives merged and closed lifecycle events from the review timestamps", async () => {
    const { adapter, routes } = fixture();
    routes[`GET ${p}/7`] = {
      ...(routes[`GET ${p}/7`] as object),
      state: "merged",
      mergedAt: "2026-01-03T00:00:00Z",
      closedAt: "2026-01-03T00:00:00Z",
    };
    expect((await adapter.details(7)).details.timeline?.map((e) => e.kind)).toEqual([
      "opened",
      "merged",
    ]);
  });

  it("narrows metadata writes to the viewer's per-review permissions", async () => {
    const { adapter, routes } = fixture();
    routes[`GET ${p}/7`] = {
      ...(routes[`GET ${p}/7`] as object),
      capabilities: { edit: false, moderate: false, review: false, merge: false, comment: true },
    };
    const capabilities = (await adapter.details(7)).pr?.source?.capabilities;
    expect(capabilities).not.toHaveProperty("labels");
    expect(capabilities).not.toHaveProperty("convertToDraft");
    expect(capabilities).not.toHaveProperty("reviewRequests");
    expect(capabilities).not.toHaveProperty("reviewDrafts");
    expect(capabilities?.reactions).toHaveLength(8);
  });

  it("leaves a field absent when its optional read fails", async () => {
    const { adapter, routes } = fixture();
    delete routes[`GET ${p}/7/labels`];
    delete routes[`GET ${p}/7/reviewers`];
    delete routes[`GET ${p}/7/reactions/`];
    const result = await adapter.details(7);
    expect(ghGetPrDetailsResultSchema.safeParse(result).success).toBe(true);
    expect(result.details).not.toHaveProperty("labels");
    expect(result.details).not.toHaveProperty("requestedReviewers");
    expect(result.details).not.toHaveProperty("reactions");
    expect(result.details.comments.every((c) => !("reactions" in c))).toBe(true);
    expect(result.details.timeline).toHaveLength(1);
  });

  it("converts an open review back to draft at the read version", async () => {
    const { adapter, routes, writes } = fixture();
    routes[`POST ${p}/7/draft`] = {};
    await adapter.setState(7, "draft");
    expect(writes()).toEqual([
      { method: "POST", path: `/api/${p}/7/draft`, query: "", body: { expectedVersion: 3 } },
    ]);
  });

  it("bounds repository label candidates and reports truncation", async () => {
    const { adapter, routes, requests } = fixture();
    expect(await adapter.labelCandidates()).toEqual({
      labels: [
        { name: "bug", color: "d73a4a" },
        { name: "ui", color: "00ffaa" },
        { name: "docs", color: "0000ff", description: "Docs" },
      ],
      truncated: false,
    });
    routes["GET repos/team/app/labels"] = {
      items: [{ id: "l1", name: "bug", color: "#d73a4a" }],
      next: "cursor",
    };
    requests.length = 0;
    const result = await adapter.labelCandidates();
    expect(result.truncated).toBe(true);
    expect(requests).toHaveLength(3);
    expect(new URL(requests[1]!.url).searchParams.get("after")).toBe("cursor");
  });

  it("replaces the label set by host ids and refuses an unknown name", async () => {
    const { adapter, routes, writes } = fixture();
    routes[`PUT ${p}/7/labels`] = { version: 4, items: [] };
    await adapter.setLabels(7, ["docs"], ["ui"]);
    expect(writes()).toEqual([
      {
        method: "PUT",
        path: `/api/${p}/7/labels`,
        query: "",
        body: { expectedVersion: 3, labelIds: ["l1", "l3"] },
      },
    ]);
    await expect(adapter.setLabels(7, ["missing"], [])).rejects.toThrow(/label does not exist/);
    expect(writes()).toHaveLength(1);
  });

  it("filters assignee candidates as reviewers and bounds them", async () => {
    const { adapter, routes } = fixture();
    routes[`GET ${p}/7/assignee-candidates`] = {
      items: [
        actor("u1", "alice"),
        actor("u2", "bob"),
        { id: "u3", actor: { kind: "unavailable" } },
      ],
      next: null,
    };
    expect(await adapter.reviewerCandidates(7, "ALI")).toEqual({
      reviewers: [{ id: "u1", login: "alice", name: "alice name" }],
      truncated: false,
    });
    routes[`GET ${p}/7/assignee-candidates`] = {
      items: Array.from({ length: 60 }, (_, i) => actor(`u${i}`, `user${i}`)),
      next: null,
    };
    const many = await adapter.reviewerCandidates(7);
    expect(many.reviewers).toHaveLength(50);
    expect(many.truncated).toBe(true);
  });

  it("replaces the reviewer set, keeping reviewers who already reviewed", async () => {
    const { adapter, routes, writes } = fixture();
    routes[`PUT ${p}/7/reviewers`] = { version: 4, items: [] };
    await adapter.requestReviewers(7, [{ id: "u-new" }], [{ id: "u-pending" }]);
    expect(writes()).toEqual([
      {
        method: "PUT",
        path: `/api/${p}/7/reviewers`,
        query: "",
        body: { expectedVersion: 3, actorIds: ["u-done", "u-dismissed", "u-new"] },
      },
    ]);
  });

  it("adds reactions to the description and comments and removes the viewer's own", async () => {
    const { adapter, routes, writes } = fixture();
    routes[`POST ${p}/7/reactions/`] = { id: "re-2" };
    routes[`DELETE ${p}/7/reactions/re-1`] = "";
    await adapter.react(7, undefined, "heart", true);
    await adapter.react(7, "c1", "rocket", true);
    await adapter.react(7, undefined, "+1", false);
    // Nothing of the viewer's to remove is a no-op.
    await adapter.react(7, "c1", "+1", false);
    expect(writes()).toEqual([
      {
        method: "POST",
        path: `/api/${p}/7/reactions/`,
        query: "",
        body: {
          subject: { kind: "pull_request", id: "pull-7" },
          emoji: { kind: "unicode", value: "\u{2764}\u{FE0F}" },
        },
      },
      {
        method: "POST",
        path: `/api/${p}/7/reactions/`,
        query: "",
        body: {
          subject: { kind: "pull_request_comment", id: "c1" },
          emoji: { kind: "unicode", value: "\u{1F680}" },
        },
      },
      { method: "DELETE", path: `/api/${p}/7/reactions/re-1`, query: "", body: undefined },
    ]);
  });

  describe("draft reviews", () => {
    const comments = [
      { path: "a.ts", side: "RIGHT" as const, line: 4, startLine: 2, body: "range" },
      { path: "b.ts", side: "LEFT" as const, line: 1, body: "old" },
    ];
    function draftRoutes(routes: Record<string, unknown>) {
      routes[`GET ${p}/7/review-draft/`] = { draft: null };
      routes[`PUT ${p}/7/review-draft/`] = { id: "d1", version: 0 };
      routes[`POST ${p}/7/review-draft/comments`] = { draft: { id: "d1", version: 1 } };
      routes[`POST ${p}/7/reviews`] = { id: "review" };
      routes[`DELETE ${p}/7/review-draft/`] = { discarded: true };
    }

    it("publishes one review with every comment pinned to the head", async () => {
      const { adapter, routes, writes } = fixture();
      draftRoutes(routes);
      await adapter.submitDraft(7, {
        decision: "request-changes",
        body: "Fix",
        headSha: head,
        comments,
      });
      expect(writes()).toEqual([
        {
          method: "PUT",
          path: `/api/${p}/7/review-draft/`,
          query: "",
          body: {
            expected: null,
            verdict: "request_changes",
            body: "Fix",
            commitOid: head,
            baseOid: base,
            expectedPullVersion: 3,
          },
        },
        {
          method: "POST",
          path: `/api/${p}/7/review-draft/comments`,
          query: "",
          body: {
            body: "range",
            path: "a.ts",
            subjectType: "line",
            line: 4,
            side: "right",
            startLine: 2,
            startSide: "right",
            commitOid: head,
            expected: { id: "d1", version: 0 },
          },
        },
        {
          method: "POST",
          path: `/api/${p}/7/review-draft/comments`,
          query: "",
          body: {
            body: "old",
            path: "b.ts",
            subjectType: "line",
            line: 1,
            side: "left",
            commitOid: head,
            expected: { id: "d1", version: 1 },
          },
        },
        {
          method: "POST",
          path: `/api/${p}/7/reviews`,
          query: "",
          body: {
            verdict: "request_changes",
            body: "Fix",
            commitOid: head,
            expectedVersion: 3,
            draft: { id: "d1", version: 1 },
            requestId: expect.any(String),
          },
        },
      ]);
    });

    it("reuses an empty host draft and discards it when publishing fails", async () => {
      const { adapter, routes, writes } = fixture();
      draftRoutes(routes);
      routes[`GET ${p}/7/review-draft/`] = { draft: { id: "d0", version: 5, comments: [] } };
      delete routes[`POST ${p}/7/reviews`];
      await expect(
        adapter.submitDraft(7, { decision: "comment", body: "", headSha: head, comments }),
      ).rejects.toThrow(/Unexpected request/);
      const sent = writes();
      expect(sent[0]?.body).toMatchObject({ expected: { id: "d0", version: 5 }, body: "" });
      expect(sent.at(-1)).toEqual({
        method: "DELETE",
        path: `/api/${p}/7/review-draft/`,
        query: "",
        body: { expected: { id: "d1", version: 1 } },
      });
    });

    it("refuses a host draft that already holds other comments", async () => {
      const { adapter, routes, writes } = fixture();
      draftRoutes(routes);
      routes[`GET ${p}/7/review-draft/`] = {
        draft: { id: "d0", version: 5, comments: [{ id: "x", body: "elsewhere" }] },
      };
      await expect(
        adapter.submitDraft(7, { decision: "approve", body: "", headSha: head, comments }),
      ).rejects.toThrow(/unfinished review/);
      expect(writes()).toEqual([]);
    });

    it("refuses a head that moved before the draft was saved", async () => {
      const { adapter, routes, writes } = fixture();
      draftRoutes(routes);
      await expect(
        adapter.submitDraft(7, { decision: "approve", body: "", headSha: parent, comments }),
      ).rejects.toThrow(/head changed/);
      expect(writes()).toEqual([]);
    });
  });

  describe("commit diffs", () => {
    function commitRoutes(routes: Record<string, unknown>, repo = "repos/team/app") {
      routes[`GET ${repo}/commit`] = { oid: head, parents: [parent] };
      routes[`GET ${repo}/compare`] = {
        base: parent,
        head,
        items: [{ path: "a.ts" }, { path: "img.png", binary: true }],
        next: null,
      };
      routes[`POST ${repo}/compare/files`] = {
        base: parent,
        head,
        items: [
          { path: "a.ts", oldPath: "old.ts", status: "renamed", hunks: [hunk] },
          { path: "img.png", binary: true },
        ],
      };
    }

    it("diffs one commit against its first parent", async () => {
      const { adapter, routes, requests, writes } = fixture();
      commitRoutes(routes);
      const diff = await adapter.commitDiff(7, head);
      expect(diff).toBe(
        'diff --git "a/old.ts" "b/a.ts"\n--- "a/old.ts"\n+++ "b/a.ts"\n@@ -1,1 +1,1 @@\n-old\n+new\n' +
          'diff --git "a/img.png" "b/img.png"\nBinary files "a/img.png" and "b/img.png" differ\n',
      );
      const commit = requests.find((r) => new URL(r.url).pathname.endsWith("/commit"));
      expect(new URL(commit!.url).searchParams.get("oid")).toBe(head);
      const compare = new URL(requests.find((r) => r.url.includes("/compare?"))!.url);
      expect(Object.fromEntries(compare.searchParams)).toMatchObject({
        base: parent,
        baseOid: parent,
        head,
        headOid: head,
      });
      expect(writes()[0]?.body).toEqual({
        base: parent,
        baseOid: parent,
        head,
        headOid: head,
        paths: ["a.ts", "img.png"],
      });
    });

    it("reads a cross-fork commit from the source repository", async () => {
      const { adapter, routes } = fixture();
      routes[`GET ${p}/7`] = {
        ...(routes[`GET ${p}/7`] as object),
        isCrossFork: true,
        sourceRepo: { owner: "fork", name: "app" },
      };
      commitRoutes(routes, "repos/fork/app");
      expect(await adapter.commitDiff(7, head)).toContain("+new\n");
    });

    it("refuses a root commit and an omitted patch", async () => {
      const { adapter, routes } = fixture();
      commitRoutes(routes);
      routes["GET repos/team/app/commit"] = { oid: head, parents: [] };
      await expect(adapter.commitDiff(7, head)).rejects.toThrow(/omitted this file's diff/);
      commitRoutes(routes);
      routes["POST repos/team/app/compare/files"] = {
        items: [
          { path: "a.ts", hunksOmitted: true },
          { path: "img.png", binary: true },
        ],
      };
      await expect(adapter.commitDiff(7, head)).rejects.toThrow(/omitted this file's diff/);
    });
  });

  it("reads the diff side of an inline comment and ignores an unknown one", async () => {
    const { adapter, routes } = fixture();
    const inline = (id: string, fields: Record<string, unknown>) => ({
      id,
      threadId: id,
      body: id,
      author: { handle: "reviewer" },
      path: "a.ts",
      ...fields,
    });
    routes[`GET ${p}/7/comments/`] = {
      items: [
        inline("old", { line: 3, side: "left" }),
        inline("new", { line: 4, side: "right" }),
        inline("unsaid", { line: 5, side: null }),
        inline("future", { line: 6, side: "both" }),
        { id: "general", threadId: "general", body: "general", author: { handle: "reviewer" } },
      ],
    };
    expect((await adapter.threads(7)).map((t) => [t.id, t.line, t.side])).toEqual([
      ["old", 3, "LEFT"],
      ["new", 4, "RIGHT"],
      ["unsaid", 5, undefined],
      ["future", 6, undefined],
      ["general", undefined, undefined],
    ]);
  });
});
