import { describe, expect, it } from "vitest";
import { ghGetPrDetailsResultSchema } from "@/shared/contracts";
import { testSource, testTransport } from "./adapterTestKit";
import { GiteaReview } from "./gitea";

const head = "a".repeat(40),
  older = "c".repeat(40);
const p = "repos/team/app/pulls";
const i = "repos/team/app/issues";
const user = (login: string) => ({
  id: login.length,
  login,
  full_name: `${login} name`,
  avatar_url: `https://avatars.example/${login}`,
});
const bug = { id: 11, name: "bug", color: "#D73A4A", description: "Broken" },
  docs = { id: 12, name: "docs", color: "0075ca" },
  ops = { id: 13, name: "ops", color: "zzz" };
const pr = {
  number: 7,
  title: "Review",
  body: "Body",
  html_url: "https://forge.example/team/app/pulls/7",
  state: "open",
  merged: false,
  head: { ref: "feature", sha: head, repo: { full_name: "team/app" } },
  base: { ref: "main" },
  user: user("author"),
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-05T00:00:00Z",
  mergeable: true,
  labels: [bug],
  requested_reviewers: [user("alice")],
  requested_reviewers_teams: [{ id: 3, name: "core" }],
};
const timelineRows = [
  { id: 101, type: "comment", body: "hello", user: user("bob"), created_at: "t1" },
  { id: 102, type: "label", body: "1", label: docs, user: user("bob"), created_at: "t2" },
  { id: 103, type: "label", body: "", label: docs, user: user("bob"), created_at: "t3" },
  {
    id: 104,
    type: "review_request",
    assignee: user("alice"),
    removed_assignee: false,
    user: user("author"),
    created_at: "t4",
  },
  {
    id: 105,
    type: "review_request",
    assignee_team: { name: "core" },
    removed_assignee: true,
    user: user("author"),
    created_at: "t5",
  },
  {
    id: 106,
    type: "pull_push",
    body: JSON.stringify({ is_force_push: true, commit_ids: [older, head] }),
    user: user("author"),
    created_at: "t6",
  },
  {
    id: 107,
    type: "pull_push",
    body: JSON.stringify({ is_force_push: false, commit_ids: [head] }),
    created_at: "t7",
  },
  {
    id: 108,
    type: "change_title",
    old_title: "WIP: Review",
    new_title: "Review",
    created_at: "t8",
  },
  {
    id: 109,
    type: "change_title",
    old_title: "Review",
    new_title: "[WIP] Review",
    created_at: "t9",
  },
  { id: 110, type: "change_title", old_title: "Old", new_title: "Review", created_at: "t10" },
  { id: 111, type: "change_target_branch", old_ref: "dev", new_ref: "main", created_at: "t11" },
  { id: 112, type: "close", user: user("bob"), created_at: "t12" },
  { id: 113, type: "reopen", user: user("bob"), created_at: "t13" },
  { id: 114, type: "merge_pull", user: user("bob"), created_at: "t14" },
  { id: 115, type: "review", review_id: 5, created_at: "t15" },
  { id: 116, type: "pull_ref", ref_issue: { number: 3 }, created_at: "t16" },
  { id: 117, type: "milestone", created_at: "t17" },
];

/** Each read of `key` returns the next body; the last one repeats. */
function sequence(routes: Record<string, unknown>, key: string, bodies: unknown[]) {
  let index = 0;
  Object.defineProperty(routes, key, {
    configurable: true,
    enumerable: true,
    get: () => bodies[Math.min(index++, bodies.length - 1)],
  });
}
function fixture(forge: "gitea" | "forgejo", extra: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    [`GET ${p}`]: [
      pr,
      { ...pr, number: 8, state: "closed", merged: true, labels: [] },
      { ...pr, number: 9, state: "closed", merged: false, labels: undefined },
    ],
    [`GET ${p}/7`]: pr,
    [`GET ${p}/7/commits`]: [{ sha: head, commit: { message: "Change", author: { date: "t" } } }],
    [`GET ${p}/7/reviews`]: [],
    [`GET repos/team/app/statuses/${head}`]: [],
    [`GET ${i}/7/comments`]: [
      { id: 21, body: "first", user: user("bob"), created_at: "t1" },
      { id: 22, body: "second", user: user("alice"), created_at: "t2" },
    ],
    [`GET ${i}/7/timeline`]: timelineRows,
    [`GET ${i}/7/reactions`]: [
      { content: "+1", user: user("viewer") },
      { content: "+1", user: user("bob") },
      { content: "heart", user: user("bob") },
      { content: "smile", user: user("bob") },
    ],
    [`GET ${i}/comments/21/reactions`]: [{ content: "rocket", user: user("viewer") }],
    [`GET ${i}/comments/22/reactions`]: [],
    ...extra,
  };
  const transport = testTransport(routes);
  return { routes, ...transport, adapter: new GiteaReview(testSource(forge), transport.api) };
}

describe.each(["gitea", "forgejo"] as const)("%s review metadata", (forge) => {
  it("maps list states to the host filter and the merged flag, with labels", async () => {
    const f = fixture(forge);
    const states = async (state: "open" | "all" | "closed" | "merged") => {
      const list = await f.adapter.list(state);
      const query = new URL(f.requests.at(-1)!.url).searchParams.get("state");
      return { query, numbers: list.map((entry) => entry.pr.number) };
    };
    expect(await states("open")).toEqual({ query: "open", numbers: [7, 8, 9] });
    expect(await states("all")).toEqual({ query: "all", numbers: [7, 8, 9] });
    expect(await states("closed")).toEqual({ query: "closed", numbers: [7, 9] });
    expect(await states("merged")).toEqual({ query: "closed", numbers: [8] });
    const [first, second, third] = await f.adapter.list("all");
    expect(first?.labels).toEqual([{ name: "bug", color: "d73a4a", description: "Broken" }]);
    expect(second?.labels).toEqual([]);
    expect(third && "labels" in third).toBe(false);
  });

  it("marks a review as awaiting the viewer only while their request is still the newest review row", async () => {
    const viewer = user("viewer");
    const f = fixture(forge, {
      [`GET ${p}`]: [
        { ...pr, number: 7, requested_reviewers: [viewer] },
        { ...pr, number: 10, requested_reviewers: [viewer] },
        { ...pr, number: 11, requested_reviewers: [user("alice")] },
      ],
      // Number 7: the viewer already approved, though the host still lists them as requested.
      [`GET ${p}/7/reviews`]: [
        { id: 1, state: "REQUEST_REVIEW", user: viewer, team: null, comments_count: 0 },
        { id: 2, state: "APPROVED", user: viewer, team: null, comments_count: 0 },
      ],
      [`GET ${p}/10/reviews`]: [
        { id: 3, state: "REQUEST_REVIEW", user: viewer, team: null, comments_count: 0 },
      ],
    });
    const list = await f.adapter.list("open");
    expect(list.map((entry) => [entry.pr.number, entry.reviewRequested])).toEqual([
      [7, false],
      [10, true],
      [11, false],
    ]);
    // Only reviews of rows that name the viewer are read.
    expect(f.requests.filter((request) => request.url.includes("/reviews")).length).toBe(2);
  });

  it("keeps the host's answer when a review read fails during the list", async () => {
    const viewer = user("viewer");
    const f = fixture(forge, {
      [`GET ${p}`]: [{ ...pr, number: 7, requested_reviewers: [viewer] }],
    });
    // The review read now fails: the transport rejects requests with no route.
    delete f.routes[`GET ${p}/7/reviews`];
    const [row] = await f.adapter.list("open");
    expect(row?.reviewRequested).toBe(true);
  });

  it("reads labels, requested reviewers, timeline, and reactions", async () => {
    const f = fixture(forge);
    const result = ghGetPrDetailsResultSchema.parse(await f.adapter.details(7));
    const details = result.details;
    expect(details.labels).toEqual([{ name: "bug", color: "d73a4a", description: "Broken" }]);
    expect(details.requestedReviewers).toEqual([
      {
        id: "alice",
        login: "alice",
        name: "alice name",
        avatarUrl: "https://avatars.example/alice",
      },
      { id: "core", login: "core", team: true },
    ]);
    expect(details.timeline?.map((event) => [event.id, event.kind])).toEqual([
      ["opened", "opened"],
      ["102", "labeled"],
      ["103", "unlabeled"],
      ["104", "review-requested"],
      ["105", "review-request-removed"],
      ["106", "force-pushed"],
      ["108", "ready"],
      ["109", "draft"],
      ["110", "renamed"],
      ["111", "base-changed"],
      ["112", "closed"],
      ["113", "reopened"],
      ["114", "merged"],
    ]);
    const byId = new Map(details.timeline?.map((event) => [event.id, event]));
    expect(byId.get("opened")).toMatchObject({
      createdAt: pr.created_at,
      actor: { login: "author" },
    });
    expect(byId.get("102")).toMatchObject({
      actor: { login: "bob" },
      label: { name: "docs", color: "0075ca" },
    });
    expect(byId.get("105")?.reviewer).toEqual({ id: "core", login: "core", team: true });
    expect(byId.get("106")).toMatchObject({ fromRef: older, toRef: head });
    expect(byId.get("110")).toMatchObject({ fromRef: "Old", toRef: "Review" });
    expect(byId.get("111")).toMatchObject({ fromRef: "dev", toRef: "main" });
    expect(details.reactions).toEqual([
      { content: "+1", count: 2, viewerReacted: true },
      { content: "heart", count: 1, viewerReacted: false },
    ]);
    expect(details.comments.map((c) => [c.id, c.reactions])).toEqual([
      ["21", [{ content: "rocket", count: 1, viewerReacted: true }]],
      ["22", []],
    ]);
  });

  it("leaves optional fields absent when their reads fail", async () => {
    const f = fixture(forge);
    delete f.routes[`GET ${i}/7/timeline`];
    delete f.routes[`GET ${i}/7/reactions`];
    delete f.routes[`GET ${i}/comments/21/reactions`];
    const { details } = ghGetPrDetailsResultSchema.parse(await f.adapter.details(7));
    expect(details).not.toHaveProperty("timeline");
    expect(details).not.toHaveProperty("reactions");
    expect(details.comments[0]).not.toHaveProperty("reactions");
    expect(details.comments[1]?.reactions).toEqual([]);
    expect(details.labels).toHaveLength(1);
  });

  it("reads reactions only for the newest comments", async () => {
    const comments = Array.from({ length: 25 }, (_, n) => ({
      id: 300 + n,
      body: `c${n}`,
      user: user("bob"),
    }));
    const extra: Record<string, unknown> = { [`GET ${i}/7/comments`]: comments };
    for (const c of comments) extra[`GET ${i}/comments/${c.id}/reactions`] = [];
    const f = fixture(forge, extra);
    const { details } = await f.adapter.details(7);
    expect(details.comments.filter((c) => c.reactions).map((c) => c.id)).toEqual(
      comments.slice(-20).map((c) => String(c.id)),
    );
  });

  it("converts to draft with the work-in-progress prefix, once", async () => {
    const f = fixture(forge, { [`PATCH ${p}/7`]: {} });
    await f.adapter.setState(7, "draft");
    sequence(f.routes, `GET ${p}/7`, [{ ...pr, title: "WIP: Review", draft: true }]);
    await f.adapter.setState(7, "draft");
    await f.adapter.setState(7, "ready");
    expect(f.writes()).toEqual([
      { method: "PATCH", path: `/api/${p}/7`, query: "", body: { title: "WIP: Review" } },
      { method: "PATCH", path: `/api/${p}/7`, query: "", body: { title: "Review" } },
    ]);
  });

  it("bounds label candidates and reports truncation", async () => {
    const page = (start: number, count: number) =>
      Array.from({ length: count }, (_, n) => ({ id: start + n, name: `l${start + n}` }));
    const full = fixture(forge);
    sequence(full.routes, "GET repos/team/app/labels", [
      page(1, 30),
      page(31, 30),
      page(61, 30),
      page(91, 1),
    ]);
    const truncated = await full.adapter.labelCandidates();
    expect(truncated.labels).toHaveLength(90);
    expect(truncated.truncated).toBe(true);
    expect(
      full.requests.map((r) => new URL(r.url).searchParams.get("page")).filter(Boolean),
    ).toEqual(["1", "2", "3", "4"]);

    const small = fixture(forge);
    sequence(small.routes, "GET repos/team/app/labels", [[bug, docs, ops], []]);
    expect(await small.adapter.labelCandidates()).toEqual({
      labels: [
        { name: "bug", color: "d73a4a", description: "Broken" },
        { name: "docs", color: "0075ca" },
        { name: "ops" },
      ],
      truncated: false,
    });
  });

  it("adds and removes labels by id and rejects unknown names before writing", async () => {
    const f = fixture(forge, {
      "GET repos/team/app/labels": [bug, docs],
      [`POST ${i}/7/labels`]: [],
      [`DELETE ${i}/7/labels/11`]: "",
    });
    await f.adapter.setLabels(7, ["docs"], ["bug"]);
    expect(f.writes()).toEqual([
      { method: "POST", path: `/api/${i}/7/labels`, query: "", body: { labels: [12] } },
      { method: "DELETE", path: `/api/${i}/7/labels/11`, query: "", body: undefined },
    ]);
    await expect(f.adapter.setLabels(7, ["docs", "missing"], [])).rejects.toThrow(
      "label does not exist",
    );
    expect(f.writes()).toHaveLength(2);
  });

  it("lists reviewer candidates without the author, filtered and bounded", async () => {
    const users = [
      user("author"),
      user("alice"),
      ...Array.from({ length: 55 }, (_, n) => user(`dev${n}`)),
    ];
    const f = fixture(forge, {
      "GET repos/team/app/reviewers": users,
      "GET repos/team/app/teams": [{ id: 3, name: "Core" }],
    });
    const all = await f.adapter.reviewerCandidates(7);
    expect(all.truncated).toBe(true);
    expect(all.reviewers).toHaveLength(50);
    expect(all.reviewers.some((r) => r.login === "author")).toBe(false);
    expect(await f.adapter.reviewerCandidates(7, "CO")).toEqual({
      reviewers: [{ id: "Core", login: "Core", team: true }],
      truncated: false,
    });
    expect((await f.adapter.reviewerCandidates(7, "alice NAME")).reviewers).toEqual([
      expect.objectContaining({ id: "alice" }),
    ]);

    // A personal repository has no teams endpoint.
    const personal = fixture(forge, { "GET repos/team/app/reviewers": [user("alice")] });
    expect((await personal.adapter.reviewerCandidates(7)).reviewers.map((r) => r.id)).toEqual([
      "alice",
    ]);
  });

  it("requests and removes user and team reviewers", async () => {
    const f = fixture(forge, {
      [`POST ${p}/7/requested_reviewers`]: [],
      [`DELETE ${p}/7/requested_reviewers`]: "",
    });
    await f.adapter.requestReviewers(
      7,
      [{ id: "alice" }, { id: "core", team: true }],
      [{ id: "bob" }],
    );
    expect(f.writes()).toEqual([
      {
        method: "POST",
        path: `/api/${p}/7/requested_reviewers`,
        query: "",
        body: { reviewers: ["alice"], team_reviewers: ["core"] },
      },
      {
        method: "DELETE",
        path: `/api/${p}/7/requested_reviewers`,
        query: "",
        body: { reviewers: ["bob"], team_reviewers: [] },
      },
    ]);
  });

  it("reads a single commit diff", async () => {
    const diff = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n";
    const f = fixture(forge, { [`GET repos/team/app/git/commits/${head}.diff`]: diff });
    expect(await f.adapter.commitDiff(7, head)).toBe(diff);
  });

  it("adds and removes reactions on the description and on comments", async () => {
    const f = fixture(forge, {
      [`POST ${i}/7/reactions`]: {},
      [`DELETE ${i}/comments/21/reactions`]: "",
    });
    await f.adapter.react(7, undefined, "heart", true);
    await f.adapter.react(7, "21", "+1", false);
    expect(f.writes()).toEqual([
      { method: "POST", path: `/api/${i}/7/reactions`, query: "", body: { content: "heart" } },
      {
        method: "DELETE",
        path: `/api/${i}/comments/21/reactions`,
        query: "",
        body: { content: "+1" },
      },
    ]);
  });

  // Shapes below were captured from Gitea 28.2.0 and Forgejo 16.0.6 servers.
  it("lists only outstanding review requests, though the host keeps reviewers who already reviewed", async () => {
    const carol = user("carol"),
      bob = user("bob");
    const f = fixture(forge, {
      [`GET ${p}/7`]: {
        ...pr,
        // The host still lists carol (approved) and bob (commented) here.
        requested_reviewers: [carol, bob, user("dave"), user("erin"), user("frank")],
        requested_reviewers_teams: [
          { id: 3, name: "reviewers" },
          { id: 4, name: "ops" },
        ],
      },
      [`GET ${p}/7/reviews`]: [
        { id: 1, state: "REQUEST_REVIEW", user: carol, team: null, comments_count: 0 },
        { id: 2, state: "COMMENT", user: bob, team: null, comments_count: 1, submitted_at: "t2" },
        {
          id: 3,
          state: "APPROVED",
          user: carol,
          team: null,
          comments_count: 0,
          submitted_at: "t3",
        },
        { id: 4, state: "REQUEST_REVIEW", user: user("dave"), team: null, comments_count: 0 },
        // Re-requested after an approval.
        { id: 5, state: "REQUEST_REVIEW", user: user("frank"), team: null, comments_count: 0 },
        { id: 6, state: "APPROVED", user: user("frank"), team: null, submitted_at: "t6" },
        { id: 7, state: "REQUEST_REVIEW", user: user("frank"), team: null, comments_count: 0 },
        { id: 8, state: "REQUEST_REVIEW", user: null, team: { id: 3, name: "reviewers" } },
        { id: 9, state: "REQUEST_REVIEW", user: null, team: { id: 4, name: "ops" } },
        { id: 10, state: "APPROVED", user: user("ops-member"), team: null, submitted_at: "t10" },
        { id: 11, state: "COMMENT", user: null, team: { id: 4, name: "ops" }, submitted_at: "t11" },
      ],
    });
    const { details } = ghGetPrDetailsResultSchema.parse(await f.adapter.details(7));
    // erin has no review row at all, so the host's list is trusted for her.
    expect(details.requestedReviewers?.map((r) => (r.team ? `team:${r.id}` : r.id))).toEqual([
      "dave",
      "erin",
      "frank",
      "team:reviewers",
    ]);
    // Request rows are not reviews, and they do not replace a requested-changes decision.
    expect(details.reviews.map((r) => [r.id, r.state])).toEqual([
      ["2", "COMMENTED"],
      ["3", "APPROVED"],
      ["6", "APPROVED"],
      ["10", "APPROVED"],
      ["11", "COMMENTED"],
    ]);
  });

  it("keeps a requested-changes decision when the reviewer is asked again", async () => {
    const carol = user("carol");
    const f = fixture(forge, {
      [`GET ${p}/7/reviews`]: [
        { id: 1, state: "REQUEST_CHANGES", user: carol, submitted_at: "2026-10-02T00:00:00Z" },
        { id: 2, state: "REQUEST_REVIEW", user: carol, submitted_at: "2026-10-03T00:00:00Z" },
      ],
    });
    const result = ghGetPrDetailsResultSchema.parse(await f.adapter.details(7));
    expect(result.pr?.reviewDecision).toBe("CHANGES_REQUESTED");
  });

  it("trusts the host's draft flag over the title prefix", async () => {
    const f = fixture(forge, {
      [`GET ${p}`]: [
        { ...pr, number: 7, title: "Draft: not a draft here", draft: false },
        { ...pr, number: 8, title: "WIP: draft", draft: true },
        // Older hosts omit the flag; the default prefixes decide.
        { ...pr, number: 9, title: "[WIP] legacy" },
        { ...pr, number: 10, title: "Draft: legacy" },
      ],
    });
    const list = await f.adapter.list("open");
    expect(list.map((entry) => [entry.pr.number, entry.pr.isDraft, entry.pr.state])).toEqual([
      [7, false, "open"],
      [8, true, "draft"],
      [9, true, "draft"],
      [10, false, "open"],
    ]);
  });

  it("changes the draft state only when the host says it differs", async () => {
    const f = fixture(forge, { [`PATCH ${p}/7`]: {} });
    // "Draft:" is not a work-in-progress prefix by default, so the review is not a draft.
    sequence(f.routes, `GET ${p}/7`, [
      { ...pr, title: "Draft: keep", draft: false },
      { ...pr, title: "Draft: keep", draft: false },
      // An operator-configured "Draft:" prefix: the host flags it, and it is stripped.
      { ...pr, title: "Draft: custom", draft: true },
    ]);
    await f.adapter.setState(7, "ready");
    await f.adapter.setState(7, "draft");
    await f.adapter.setState(7, "ready");
    expect(f.writes()).toEqual([
      { method: "PATCH", path: `/api/${p}/7`, query: "", body: { title: "WIP: Draft: keep" } },
      { method: "PATCH", path: `/api/${p}/7`, query: "", body: { title: "custom" } },
    ]);
  });

  it("reads the line of an inline comment from either side of the diff", async () => {
    const comment = (id: number, position: number, original: number) => ({
      id,
      body: `c${id}`,
      user: user("bob"),
      path: "src/app.ts",
      position,
      original_position: original,
      created_at: "t",
    });
    const f = fixture(forge, {
      [`GET ${p}/7/reviews`]: [
        { id: 2, state: "COMMENT", comments_count: 4, user: user("bob") },
        { id: 3, state: "REQUEST_REVIEW", comments_count: 0, user: user("alice") },
      ],
      [`GET ${p}/7/reviews/2/comments`]: [
        comment(21, 2, 0), // new side
        comment(22, 0, 3), // old side: the host reports it as original_position
        comment(23, 0, 0), // no anchor left
      ],
    });
    const threads = await f.adapter.threads(7);
    expect(threads.map((t) => [t.id, t.line, t.isOutdated])).toEqual([
      ["21", 2, false],
      ["22", 3, false],
      ["23", undefined, true],
    ]);
    // The old-side anchor is drawn on the LEFT of the diff; a thread with no anchor has no side.
    expect(threads.map((t) => [t.id, t.side])).toEqual([
      ["21", "RIGHT"],
      ["22", "LEFT"],
      ["23", undefined],
    ]);
  });

  it("refuses a draft while the viewer has an unfinished review with comments", async () => {
    const input = {
      decision: "comment" as const,
      body: "",
      headSha: head,
      comments: [{ path: "a.ts", side: "RIGHT" as const, line: 1, body: "note" }],
    };
    const pending = (login: string, count: number) => ({
      id: 9,
      state: "PENDING",
      comments_count: count,
      user: user(login),
    });
    const blocked = fixture(forge, {
      [`GET ${p}/7/reviews`]: [pending("viewer", 2)],
      [`POST ${p}/7/reviews`]: {},
    });
    await expect(blocked.adapter.submitDraft(7, input)).rejects.toThrow("unfinished review");
    expect(blocked.writes()).toEqual([]);
    // Another account's review (visible to site administrators) and an empty one do not block.
    const free = fixture(forge, {
      [`GET ${p}/7/reviews`]: [pending("other", 2), { ...pending("viewer", 0), id: 10 }],
      [`POST ${p}/7/reviews`]: {},
    });
    await free.adapter.submitDraft(7, input);
    expect(free.writes()).toHaveLength(1);
  });

  it("submits a draft review with every line comment in one request", async () => {
    const f = fixture(forge, { [`POST ${p}/7/reviews`]: {} });
    await f.adapter.submitDraft(7, {
      decision: "request-changes",
      body: "Please fix",
      headSha: head,
      comments: [
        { path: "a.ts", side: "RIGHT", line: 4, body: "new side" },
        { path: "b.ts", side: "LEFT", line: 9, startLine: 7, body: "old range" },
      ],
    });
    await f.adapter.submitDraft(7, {
      decision: "comment",
      body: "",
      headSha: head,
      comments: [{ path: "a.ts", side: "RIGHT", line: 1, body: "note" }],
    });
    expect(f.writes()).toEqual([
      {
        method: "POST",
        path: `/api/${p}/7/reviews`,
        query: "",
        body: {
          commit_id: head,
          event: "REQUEST_CHANGES",
          body: "Please fix",
          comments: [
            { path: "a.ts", body: "new side", new_position: 4 },
            { path: "b.ts", body: "old range", old_position: 9 },
          ],
        },
      },
      {
        method: "POST",
        path: `/api/${p}/7/reviews`,
        query: "",
        body: {
          commit_id: head,
          event: "COMMENT",
          body: "",
          comments: [{ path: "a.ts", body: "note", new_position: 1 }],
        },
      },
    ]);
  });
});
