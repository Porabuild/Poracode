import { describe, expect, it } from "vitest";
import { ghGetPrDetailsResultSchema } from "@/shared/contracts";
import { testSource, testTransport } from "./adapterTestKit";
import { BitbucketReview } from "./bitbucket";

const head = "a".repeat(40);
const p = "repositories/team/app/pullrequests";
const user = (uuid: string, nickname: string) => ({
  uuid,
  nickname,
  display_name: `${nickname} name`,
  links: { avatar: { href: `https://avatars.example/${nickname}` } },
});
const alice = user("{alice}", "alice"),
  bob = user("{bob}", "bob"),
  carol = user("{carol}", "carol"),
  owner = user("{owner}", "owner"),
  viewer = user("{viewer}", "viewer");
const pr = {
  id: 7,
  title: "Review",
  description: "Body",
  state: "OPEN",
  draft: false,
  author: owner,
  created_on: "2026-10-01T00:00:00+00:00",
  updated_on: "2026-10-05T00:00:00+00:00",
  source: {
    branch: { name: "feature" },
    commit: { hash: head },
    repository: { full_name: "team/app" },
  },
  destination: { branch: { name: "main" } },
  reviewers: [alice, bob],
  participants: [
    { user: alice, role: "REVIEWER", approved: false, state: null },
    { user: bob, role: "REVIEWER", approved: true, state: "approved" },
  ],
  links: { html: { href: "https://bitbucket.org/team/app/pull-requests/7" } },
};

/** Each read of `key` returns the next body; the last one repeats. */
function sequence(routes: Record<string, unknown>, key: string, bodies: unknown[]) {
  let index = 0;
  Object.defineProperty(routes, key, {
    configurable: true,
    enumerable: true,
    get: () => bodies[Math.min(index++, bodies.length - 1)],
  });
}
function fixture(extra: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    [`GET ${p}`]: { values: [pr] },
    [`GET ${p}/7`]: pr,
    [`GET ${p}/7/comments`]: { values: [] },
    [`GET ${p}/7/commits`]: { values: [{ hash: head, message: "Change", date: "now" }] },
    [`GET ${p}/7/diffstat`]: { values: [] },
    [`GET ${p}/7/statuses`]: { values: [] },
    ...extra,
  };
  const http = testTransport(routes);
  return { ...http, routes, adapter: new BitbucketReview(testSource("bitbucket"), http.api) };
}
const snapshot = (date: string, fields: Record<string, unknown> = {}) => ({
  update: {
    date,
    state: "OPEN",
    draft: true,
    title: "Draft review",
    author: owner,
    destination: { branch: { name: "develop" } },
    reviewers: [alice],
    ...fields,
  },
});

describe("Bitbucket review metadata", () => {
  it.each([
    ["open", ["OPEN"]],
    ["all", ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]],
    ["closed", ["DECLINED", "SUPERSEDED"]],
    ["merged", ["MERGED"]],
  ] as const)("lists %s reviews with host state filters", async (state, expected) => {
    const { adapter, requests } = fixture();
    await adapter.list(state);
    const query = new URL(requests[0]!.url).searchParams;
    expect(query.getAll("state")).toEqual(expected);
    expect(query.get("fields")).toBe("+values.reviewers,+values.participants");
  });

  it("marks a review requested only while the viewer's review is outstanding", async () => {
    const { adapter, routes } = fixture();
    routes[`GET ${p}`] = {
      values: [{ ...pr, reviewers: [viewer] }],
    };
    const [summary] = await adapter.list("open");
    expect(summary?.reviewRequested).toBe(true);
    expect(summary?.labels).toBeUndefined();
    routes[`GET ${p}`] = {
      values: [
        {
          ...pr,
          reviewers: [viewer],
          participants: [{ user: viewer, approved: false, state: "changes_requested" }],
        },
      ],
    };
    expect((await adapter.list("open"))[0]?.reviewRequested).toBe(false);
  });

  it("reads requested reviewers and an activity timeline across bounded pages", async () => {
    const merged = { ...pr, state: "MERGED", closed_by: carol };
    const { adapter, routes } = fixture({ [`GET ${p}/7`]: merged });
    sequence(routes, `GET ${p}/7/activity`, [
      {
        values: [
          snapshot("2026-10-04T00:00:00+00:00", {
            state: "MERGED",
            draft: false,
            title: "Review",
            destination: { branch: { name: "main" } },
            reviewers: [bob],
          }),
          { approval: { date: "2026-10-03T12:00:00+00:00", user: bob } },
          { comment: { id: 5, content: { raw: "hi" } } },
        ],
        next: `https://forge.example/api/${p}/7/activity?page=2`,
      },
      {
        values: [
          snapshot("2026-10-03T00:00:00+00:00", {
            draft: false,
            title: "Review",
            destination: { branch: { name: "main" } },
            reviewers: [alice, bob],
          }),
          snapshot("2026-10-01T00:00:00+00:00"),
        ],
      },
    ]);
    const result = await adapter.details(7);
    expect(ghGetPrDetailsResultSchema.safeParse(result).success).toBe(true);
    const { details } = result;
    expect(details.requestedReviewers).toEqual([
      {
        id: "{alice}",
        login: "alice",
        name: "alice name",
        avatarUrl: "https://avatars.example/alice",
      },
    ]);
    expect(details.labels).toBeUndefined();
    expect(details.reactions).toBeUndefined();
    expect(details.comments.every((c) => c.reactions === undefined)).toBe(true);
    expect(details.timeline?.map((e) => [e.kind, e.fromRef, e.toRef, e.reviewer?.id])).toEqual([
      ["opened", undefined, undefined, undefined],
      ["ready", undefined, undefined, undefined],
      ["renamed", "Draft review", "Review", undefined],
      ["base-changed", "develop", "main", undefined],
      ["review-requested", undefined, undefined, "{bob}"],
      ["merged", undefined, undefined, undefined],
      ["review-request-removed", undefined, undefined, "{alice}"],
    ]);
    expect(details.timeline?.[0]?.actor?.login).toBe("{owner}");
    expect(details.timeline?.find((e) => e.kind === "merged")?.actor?.login).toBe("{carol}");
    expect(new Set(details.timeline?.map((e) => e.id)).size).toBe(details.timeline?.length);
  });

  it("stops reading activity after three pages", async () => {
    const { adapter, requests, routes } = fixture();
    routes[`GET ${p}/7/activity`] = {
      values: [snapshot("2026-10-02T00:00:00+00:00")],
      next: `https://forge.example/api/${p}/7/activity?page=2`,
    };
    const { details } = await adapter.details(7);
    expect(requests.filter((r) => r.url.includes("/activity")).length).toBe(3);
    expect(details.timeline?.map((e) => e.kind)).toEqual(["opened"]);
  });

  it("leaves the timeline absent when the activity read fails", async () => {
    const { adapter } = fixture();
    const result = await adapter.details(7);
    expect(ghGetPrDetailsResultSchema.safeParse(result).success).toBe(true);
    expect(result.details.timeline).toBeUndefined();
    expect(result.details.requestedReviewers).toHaveLength(1);
  });

  it("converts an open review back to draft", async () => {
    const { adapter, writes } = fixture({ [`PUT ${p}/7`]: {} });
    await adapter.setState(7, "draft");
    expect(writes()).toEqual([
      { method: "PUT", path: `/api/${p}/7`, query: "", body: { draft: true } },
    ]);
  });

  it("lists bounded workspace members as reviewer candidates without the author", async () => {
    const { adapter, requests, routes } = fixture();
    sequence(routes, "GET workspaces/team/members", [
      {
        values: [{ user: owner }, { user: alice }, { user: { display_name: "No uuid" } }],
        next: "https://forge.example/api/workspaces/team/members?page=2",
      },
      {
        values: [{ user: bob }],
        next: "https://forge.example/api/workspaces/team/members?page=3",
      },
      {
        values: [{ user: carol }],
        next: "https://forge.example/api/workspaces/team/members?page=4",
      },
    ]);
    const all = await adapter.reviewerCandidates(7);
    expect(all.reviewers.map((r) => r.id)).toEqual(["{alice}", "{bob}", "{carol}"]);
    expect(all.truncated).toBe(true);
    expect(requests.filter((r) => r.url.includes("/members")).length).toBe(3);

    sequence(routes, "GET workspaces/team/members", [
      { values: [{ user: alice }, { user: bob }, { user: { ...carol, display_name: "Bobby C" } }] },
    ]);
    const found = await adapter.reviewerCandidates(7, "BOB");
    expect(found).toEqual({
      reviewers: [
        expect.objectContaining({ id: "{bob}" }),
        expect.objectContaining({ id: "{carol}" }),
      ],
      truncated: false,
    });
  });

  it("caps reviewer candidates at fifty", async () => {
    const { adapter } = fixture({
      "GET workspaces/team/members": {
        values: Array.from({ length: 60 }, (_, i) => ({ user: user(`{u${i}}`, `u${i}`) })),
      },
    });
    const result = await adapter.reviewerCandidates(7);
    expect(result.reviewers).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it("replaces the reviewer list with the current title", async () => {
    const { adapter, writes } = fixture({ [`PUT ${p}/7`]: {} });
    await adapter.requestReviewers(7, [{ id: "{carol}" }], [{ id: "{alice}" }]);
    expect(writes()).toEqual([
      {
        method: "PUT",
        path: `/api/${p}/7`,
        query: "",
        body: { title: "Review", reviewers: [{ uuid: "{bob}" }, { uuid: "{carol}" }] },
      },
    ]);
    await expect(adapter.requestReviewers(7, [{ id: "group", team: true }], [])).rejects.toThrow(
      /not supported/,
    );
    expect(writes()).toHaveLength(1);
  });

  it("reads one commit's diff against its parent", async () => {
    const patch = "diff --git a/a.ts b/a.ts\n";
    const { adapter, requests } = fixture({ [`GET repositories/team/app/diff/${head}`]: patch });
    expect(await adapter.commitDiff(7, head)).toBe(patch);
    expect(new URL(requests[0]!.url).pathname).toBe(`/api/repositories/team/app/diff/${head}`);
  });

  it("posts each draft comment, then the decision, then the summary", async () => {
    const { adapter, writes } = fixture({
      [`POST ${p}/7/comments`]: { id: 9 },
      [`POST ${p}/7/request-changes`]: {},
    });
    await adapter.submitDraft(7, {
      decision: "request-changes",
      body: "Please fix",
      headSha: head,
      comments: [
        { path: "a.ts", side: "RIGHT", line: 4, startLine: 2, body: "range" },
        { path: "b.ts", side: "LEFT", line: 3, body: "removed" },
      ],
    });
    expect(writes().map((w) => [w.method, w.path, w.body])).toEqual([
      [
        "POST",
        `/api/${p}/7/comments`,
        { content: { raw: "range" }, inline: { path: "a.ts", to: 4, start_to: 2 } },
      ],
      [
        "POST",
        `/api/${p}/7/comments`,
        { content: { raw: "removed" }, inline: { path: "b.ts", from: 3 } },
      ],
      ["POST", `/api/${p}/7/request-changes`, undefined],
      ["POST", `/api/${p}/7/comments`, { content: { raw: "Please fix" } }],
    ]);
  });

  it("submits a comment-only draft without an empty summary", async () => {
    const { adapter, writes } = fixture({ [`POST ${p}/7/comments`]: { id: 9 } });
    await adapter.submitDraft(7, {
      decision: "comment",
      body: " ",
      headSha: head,
      comments: [{ path: "a.ts", side: "RIGHT", line: 1, body: "note" }],
    });
    expect(writes()).toHaveLength(1);
  });

  it("reports a partial draft once a comment was posted", async () => {
    const { adapter, writes } = fixture({ [`POST ${p}/7/comments`]: { id: 9 } });
    await expect(
      adapter.submitDraft(7, {
        decision: "approve",
        body: "",
        headSha: head,
        comments: [{ path: "a.ts", side: "RIGHT", line: 1, body: "note" }],
      }),
    ).rejects.toThrow(/Some line comments were posted/);
    expect(writes()).toHaveLength(2);
  });

  it("propagates the original error when nothing was written", async () => {
    const { adapter } = fixture();
    await expect(
      adapter.submitDraft(7, {
        decision: "approve",
        body: "",
        headSha: head,
        comments: [{ path: "a.ts", side: "RIGHT", line: 1, body: "note" }],
      }),
    ).rejects.toThrow(/Unexpected request: POST/);
  });

  it("reads the diff side of an inline comment from `to` and `from`", async () => {
    const inline = (id: number, path: string, fields: Record<string, number | null>) => ({
      id,
      content: { raw: `c${id}` },
      user: bob,
      inline: { path, ...fields },
    });
    const { adapter } = fixture({
      [`GET ${p}/7/comments`]: {
        values: [
          inline(1, "a.ts", { from: null, to: 4 }),
          inline(2, "a.ts", { from: 7, to: null }),
          // A context line carries both; it keeps the new-side placement.
          inline(3, "a.ts", { from: 5, to: 6 }),
          { id: 4, content: { raw: "general" }, user: bob },
        ],
      },
    });
    const threads = await adapter.threads(7);
    expect(threads.map((t) => [t.id, t.line, t.side])).toEqual([
      ["1", 4, "RIGHT"],
      ["2", 7, "LEFT"],
      ["3", 6, "RIGHT"],
      ["4", undefined, undefined],
    ]);
  });
});
