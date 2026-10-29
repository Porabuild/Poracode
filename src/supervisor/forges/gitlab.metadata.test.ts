import { describe, expect, it } from "vitest";
import { ghGetPrDetailsResultSchema } from "@/shared/contracts";
import { splitUnifiedDiff } from "@/shared/reviewDiff";
import { testSource, testTransport } from "./adapterTestKit";
import { ForgeHttpError } from "./api";
import { GitLabReview } from "./gitlab";
import { gitlabLinePosition } from "./gitlabMetadata";

const head = "a".repeat(40),
  base = "b".repeat(40),
  start = "c".repeat(40);
const p = "projects/team%2Fapp/merge_requests";
const mr = {
  id: 99,
  iid: 7,
  title: "Review",
  description: "Body",
  web_url: "https://forge.example/team/app/-/merge_requests/7",
  source_branch: "feature",
  target_branch: "main",
  state: "opened",
  draft: false,
  sha: head,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-05T00:00:00Z",
  author: { id: 1, username: "author" },
  labels: ["bug"],
  reviewers: [
    { id: 5, username: "rev", name: "Rev", avatar_url: "https://forge.example/rev.png" },
    { id: 6, username: "other" },
  ],
  diff_refs: { base_sha: base, start_sha: start, head_sha: head },
  detailed_merge_status: "mergeable",
};
const fileDiff =
  "@@ -1,3 +1,4 @@\n line1\n-old\n+new\n+added\n line3\n@@ -10,2 +11,2 @@\n x\n-y\n+z\n";

function fixture(extra: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    [`GET ${p}`]: [
      {
        ...mr,
        labels: [{ name: "bug", color: "#D9534F", description: "Broken" }],
      },
    ],
    [`GET ${p}/7`]: mr,
    [`GET ${p}/7/notes`]: [
      { id: 1, body: "first", author: { username: "a" }, created_at: "2026-10-01T01:00:00Z" },
      {
        id: 2,
        body: "added 2 commits\n\n* abc",
        system: true,
        created_at: "2026-10-01T02:00:00Z",
      },
      {
        id: 3,
        body: "marked this merge request as **draft**",
        system: true,
        author: { username: "author" },
        created_at: "2026-10-01T03:00:00Z",
      },
      {
        id: 4,
        body: "requested review from @rev",
        system: true,
        author: { username: "author" },
        created_at: "2026-10-01T04:00:00Z",
      },
      { id: 5, body: "approved this merge request", system: true, created_at: "x" },
    ],
    [`GET ${p}/7/commits`]: [{ id: head, short_id: "aaaaaaa", title: "Change" }],
    [`GET ${p}/7/diffs`]: [{ old_path: "a.ts", new_path: "a.ts", diff: fileDiff }],
    [`GET ${p}/7/approvals`]: { approved_by: [], approvals_left: 0 },
    [`GET ${p}/7/resource_state_events`]: [
      { id: 10, state: "closed", user: { username: "rev" }, created_at: "2026-10-02T00:00:00Z" },
      { id: 11, state: "reopened", user: { username: "rev" }, created_at: "2026-10-03T00:00:00Z" },
    ],
    [`GET ${p}/7/resource_label_events`]: [
      {
        id: 20,
        action: "add",
        label: { name: "bug", color: "#d9534f" },
        user: { username: "author" },
        created_at: "2026-10-01T05:00:00Z",
      },
      { id: 21, action: "remove", label: null, created_at: "2026-10-01T06:00:00Z" },
    ],
    [`GET ${p}/7/award_emoji`]: [
      { id: 30, name: "thumbsup", user: { username: "viewer" } },
      { id: 31, name: "thumbsup", user: { username: "rev" } },
      { id: 32, name: "tada", user: { username: "rev" } },
      { id: 33, name: "party_parrot", user: { username: "rev" } },
    ],
    [`GET ${p}/7/notes/1/award_emoji`]: [{ id: 40, name: "heart", user: { username: "rev" } }],
    ...extra,
  };
  const http = testTransport(routes);
  return { ...http, routes, adapter: new GitLabReview(testSource("gitlab"), http.api) };
}

/** Replaces a route with a sequence of responses; an `Error` entry fails that request. */
function sequence(routes: Record<string, unknown>, key: string, ...responses: unknown[]) {
  let call = 0;
  Object.defineProperty(routes, key, {
    enumerable: true,
    configurable: true,
    get() {
      const response = responses[Math.min(call++, responses.length - 1)];
      if (response instanceof Error) throw response;
      return response;
    },
  });
}

describe("GitLab list", () => {
  it.each([
    ["open", "opened"],
    ["closed", "closed"],
    ["merged", "merged"],
    ["all", "all"],
  ] as const)("maps %s to the host state filter with label details", async (state, host) => {
    const { adapter, requests } = fixture();
    const [summary] = await adapter.list(state);
    const query = new URL(requests[0]!.url).searchParams;
    expect(query.get("state")).toBe(host);
    expect(query.get("with_labels_details")).toBe("true");
    expect(summary?.labels).toEqual([{ name: "bug", color: "d9534f", description: "Broken" }]);
  });
});

describe("GitLab details metadata", () => {
  it("returns labels, requested reviewers, timeline and reactions", async () => {
    const { adapter } = fixture();
    const result = await adapter.details(7);
    expect(ghGetPrDetailsResultSchema.safeParse(result).success).toBe(true);
    const { details } = result;
    expect(details.labels).toEqual([{ name: "bug", color: "d9534f", description: "Broken" }]);
    expect(details.requestedReviewers).toEqual([
      { id: "5", login: "rev", name: "Rev", avatarUrl: "https://forge.example/rev.png" },
      { id: "6", login: "other" },
    ]);
    expect(details.timeline?.map((e) => [e.id, e.kind])).toEqual([
      ["opened", "opened"],
      ["note:3", "draft"],
      ["note:4", "system"],
      ["label:20", "labeled"],
      ["state:10", "closed"],
      ["state:11", "reopened"],
    ]);
    expect(details.timeline?.find((e) => e.id === "note:4")).toMatchObject({
      text: "requested review from @rev",
      actor: { login: "author" },
    });
    expect(details.timeline?.find((e) => e.kind === "labeled")?.label).toEqual({
      name: "bug",
      color: "d9534f",
    });
    expect(details.reactions).toEqual([
      { content: "+1", count: 2, viewerReacted: true },
      { content: "hooray", count: 1, viewerReacted: false },
    ]);
    expect(details.comments).toEqual([
      expect.objectContaining({
        id: "1",
        reactions: [{ content: "heart", count: 1, viewerReacted: false }],
      }),
    ]);
  });

  it("derives merged from timestamps when the state feed lacks it", async () => {
    const { adapter } = fixture({
      [`GET ${p}/7`]: {
        ...mr,
        state: "merged",
        merged_at: "2026-10-04T00:00:00Z",
        merge_user: { username: "rev" },
      },
      [`GET ${p}/7/resource_state_events`]: [],
    });
    const timeline = (await adapter.details(7)).details.timeline;
    expect(timeline?.at(-1)).toMatchObject({ kind: "merged", actor: { login: "rev" } });
  });

  it("leaves optional fields absent when their reads fail", async () => {
    const { adapter, routes } = fixture();
    for (const key of [
      `GET ${p}`,
      `GET ${p}/7/resource_state_events`,
      `GET ${p}/7/award_emoji`,
      `GET ${p}/7/notes/1/award_emoji`,
    ])
      delete routes[key];
    const result = await adapter.details(7);
    expect(ghGetPrDetailsResultSchema.safeParse(result).success).toBe(true);
    expect(result.details.timeline).toBeUndefined();
    expect(result.details.reactions).toBeUndefined();
    expect(result.details.comments[0]?.reactions).toBeUndefined();
    // Label names from the merge request itself still show without details.
    expect(result.details.labels).toEqual([{ name: "bug" }]);
  });

  it("reads award emoji for the newest comments only", async () => {
    const notes = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      body: `comment ${index + 1}`,
      created_at: "2026-10-01T00:00:00Z",
    }));
    const extra: Record<string, unknown> = { [`GET ${p}/7/notes`]: notes };
    for (const note of notes) extra[`GET ${p}/7/notes/${note.id}/award_emoji`] = [];
    const { adapter, requests } = fixture(extra);
    const { comments } = (await adapter.details(7)).details;
    const awardReads = requests.filter((r) => /\/notes\/\d+\/award_emoji/.test(r.url));
    expect(awardReads).toHaveLength(20);
    expect(comments[4]?.reactions).toBeUndefined();
    expect(comments[5]?.reactions).toEqual([]);
  });
});

describe("GitLab metadata writes", () => {
  it("converts an open review to draft through the title prefix", async () => {
    const { adapter, writes, routes } = fixture({ [`PUT ${p}/7`]: {} });
    await adapter.setState(7, "draft");
    expect(writes()).toEqual([
      { method: "PUT", path: `/api/${p}/7`, query: "", body: { title: "Draft: Review" } },
    ]);
    routes[`GET ${p}/7`] = { ...mr, title: "Draft: Review", draft: true };
    await adapter.setState(7, "draft");
    expect(writes()).toHaveLength(1);
  });

  it("lists label candidates and reports truncation past three pages", async () => {
    const small = fixture({
      ["GET projects/team%2Fapp/labels"]: [{ name: "bug", color: "#ff0000" }, { name: "docs" }],
    });
    expect(await small.adapter.labelCandidates()).toEqual({
      labels: [{ name: "bug", color: "ff0000" }, { name: "docs" }],
      truncated: false,
    });
    expect(small.requests).toHaveLength(1);
    const full = Array.from({ length: 100 }, (_, index) => ({ name: `l${index}` }));
    const large = fixture({ ["GET projects/team%2Fapp/labels"]: full });
    const result = await large.adapter.labelCandidates();
    expect(result.labels).toHaveLength(300);
    expect(result.truncated).toBe(true);
    expect(new URL(large.requests.at(-1)!.url).search).toBe(
      "?per_page=1&page=301&with_counts=false",
    );
  });

  it("adds and removes known labels in one update", async () => {
    const { adapter, writes } = fixture({
      ["GET projects/team%2Fapp/labels/needs%20review"]: { name: "needs review" },
      [`PUT ${p}/7`]: {},
    });
    await adapter.setLabels!(7, ["needs review"], ["bug", "stale"]);
    expect(writes()).toEqual([
      {
        method: "PUT",
        path: `/api/${p}/7`,
        query: "",
        body: { add_labels: "needs review", remove_labels: "bug,stale" },
      },
    ]);
  });

  it("refuses unknown or comma-containing label names without writing", async () => {
    const { adapter, writes, routes } = fixture({ [`PUT ${p}/7`]: {} });
    sequence(routes, "GET projects/team%2Fapp/labels/missing", new ForgeHttpError(404, "host"));
    await expect(adapter.setLabels!(7, ["missing"], [])).rejects.toThrow(/label does not exist/);
    await expect(adapter.setLabels!(7, [], ["a,b"])).rejects.toThrow(/label does not exist/);
    expect(writes()).toEqual([]);
  });

  it("searches active project members and bounds reviewer candidates", async () => {
    const members = Array.from({ length: 51 }, (_, index) => ({
      id: index + 1,
      username: `user${index + 1}`,
      state: index === 0 ? "blocked" : "active",
    }));
    const { adapter, requests } = fixture({ ["GET projects/team%2Fapp/members/all"]: members });
    const result = await adapter.reviewerCandidates!(7, "us");
    expect(new URL(requests[0]!.url).search).toBe("?per_page=51&query=us");
    expect(result.truncated).toBe(true);
    expect(result.reviewers).toHaveLength(49);
    expect(result.reviewers[0]).toEqual({ id: "2", login: "user2" });
  });

  it("replaces the reviewer list with current ids plus additions minus removals", async () => {
    const { adapter, writes } = fixture({ [`PUT ${p}/7`]: {} });
    await adapter.requestReviewers!(7, [{ id: "9" }], [{ id: "6" }]);
    expect(writes()).toEqual([
      { method: "PUT", path: `/api/${p}/7`, query: "", body: { reviewer_ids: [5, 9] } },
    ]);
    await expect(adapter.requestReviewers!(7, [{ id: "3", team: true }], [])).rejects.toThrow(
      /not supported/,
    );
    expect(writes()).toHaveLength(1);
  });

  it("keeps reviewer rows that carry an id but no username", async () => {
    const { adapter, writes } = fixture({
      [`GET ${p}/7`]: { ...mr, reviewers: [{ id: 8 }] },
      [`PUT ${p}/7`]: {},
    });
    await adapter.requestReviewers!(7, [], []);
    expect(writes()).toEqual([
      { method: "PUT", path: `/api/${p}/7`, query: "", body: { reviewer_ids: [8] } },
    ]);
  });

  it("rejects a reviewer row without a numeric id instead of un-requesting it", async () => {
    const { adapter, writes } = fixture({
      [`GET ${p}/7`]: { ...mr, reviewers: [{ username: "ghost" }] },
      [`PUT ${p}/7`]: {},
    });
    await expect(adapter.requestReviewers!(7, [], [])).rejects.toThrow(/invalid/i);
    expect(writes()).toHaveLength(0);
  });

  it("builds a unified diff for one commit", async () => {
    const { adapter, routes } = fixture({
      [`GET projects/team%2Fapp/repository/commits/${head}/diff`]: [
        { old_path: "a.ts", new_path: "a.ts", diff: "@@ -1 +1 @@\n-old\n+new\n" },
        {
          old_path: "n.ts",
          new_path: "n.ts",
          new_file: true,
          b_mode: "100644",
          diff: "@@ -0,0 +1 @@\n+n\n",
        },
        {
          old_path: "gone.ts",
          new_path: "gone.ts",
          deleted_file: true,
          a_mode: "100644",
          diff: "@@ -1 +0,0 @@\n-g",
        },
        { old_path: "old name.ts", new_path: "new name.ts", renamed_file: true, diff: "" },
      ],
    });
    const diff = await adapter.commitDiff!(7, head);
    expect(diff).toContain(
      "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n",
    );
    expect(diff).toContain("new file mode 100644\n--- /dev/null\n+++ b/n.ts\n");
    expect(diff).toContain(
      "deleted file mode 100644\n--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-g\n",
    );
    expect(diff).toContain("rename from old name.ts\nrename to new name.ts\n");
    expect([...splitUnifiedDiff(diff).keys()]).toEqual(["a.ts", "n.ts", "gone.ts", "new name.ts"]);
    routes[`GET projects/team%2Fapp/repository/commits/${head}/diff`] = [
      { new_path: "big.bin", too_large: true, diff: "" },
    ];
    await expect(adapter.commitDiff!(7, head)).rejects.toThrow(/diff/i);
  });

  it("adds a description reaction and removes the viewer's own comment reaction", async () => {
    const { adapter, writes } = fixture({
      [`POST ${p}/7/award_emoji`]: {},
      [`GET ${p}/7/notes/1/award_emoji`]: [
        { id: 40, name: "heart", user: { username: "rev" } },
        { id: 41, name: "heart", user: { username: "viewer" } },
      ],
      [`DELETE ${p}/7/notes/1/award_emoji/41`]: {},
    });
    await adapter.react!(7, undefined, "hooray", true);
    await adapter.react!(7, undefined, "+1", true); // already awarded by the viewer
    await adapter.react!(7, "1", "heart", false);
    await adapter.react!(7, "1", "eyes", false); // nothing to remove
    expect(writes()).toEqual([
      { method: "POST", path: `/api/${p}/7/award_emoji`, query: "", body: { name: "tada" } },
      {
        method: "DELETE",
        path: `/api/${p}/7/notes/1/award_emoji/41`,
        query: "",
        body: undefined,
      },
    ]);
  });
});

describe("GitLab review drafts", () => {
  const comments = [
    { path: "a.ts", side: "RIGHT" as const, line: 1, body: "context" },
    { path: "a.ts", side: "RIGHT" as const, line: 3, startLine: 2, body: "added" },
    { path: "a.ts", side: "LEFT" as const, line: 2, body: "removed" },
  ];
  const draftRoutes = (existing: unknown[] = []) => ({
    [`GET ${p}/7/draft_notes`]: existing,
    [`POST ${p}/7/draft_notes`]: { id: 1 },
    [`POST ${p}/7/draft_notes/bulk_publish`]: {},
    [`POST ${p}/7/approve`]: {},
    [`DELETE ${p}/7/draft_notes/1`]: {},
    [`DELETE ${p}/7/draft_notes/2`]: {},
    [`DELETE ${p}/7/draft_notes/3`]: {},
    [`PUT ${p}/7/draft_notes/1/publish`]: {},
    [`PUT ${p}/7/draft_notes/2/publish`]: {},
  });
  const position = { position_type: "text", base_sha: base, start_sha: start, head_sha: head };

  it("creates positioned draft notes, approves, then bulk publishes", async () => {
    const { adapter, writes, routes } = fixture(draftRoutes());
    sequence(routes, `POST ${p}/7/draft_notes`, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 });
    await adapter.submitDraft!(7, {
      decision: "approve",
      body: "Summary",
      headSha: head,
      comments,
    });
    expect(writes().map((w) => [w.method, w.path, w.body])).toEqual([
      ["POST", `/api/${p}/7/draft_notes`, { note: "Summary" }],
      [
        "POST",
        `/api/${p}/7/draft_notes`,
        {
          note: "context",
          position: { ...position, old_path: "a.ts", new_path: "a.ts", old_line: 1, new_line: 1 },
        },
      ],
      [
        "POST",
        `/api/${p}/7/draft_notes`,
        {
          note: "added",
          position: { ...position, old_path: "a.ts", new_path: "a.ts", new_line: 3 },
        },
      ],
      [
        "POST",
        `/api/${p}/7/draft_notes`,
        {
          note: "removed",
          position: { ...position, old_path: "a.ts", new_path: "a.ts", old_line: 2 },
        },
      ],
      ["POST", `/api/${p}/7/approve`, { sha: head }],
      ["POST", `/api/${p}/7/draft_notes/bulk_publish`, undefined],
    ]);
  });

  it("refuses a moved head before writing", async () => {
    const { adapter, writes } = fixture(draftRoutes());
    await expect(
      adapter.submitDraft!(7, { decision: "comment", body: "", headSha: "d".repeat(40), comments }),
    ).rejects.toThrow(/changed after these line comments/);
    expect(writes()).toEqual([]);
  });

  it("deletes the drafts it created when a later draft fails", async () => {
    const { adapter, writes, routes } = fixture(draftRoutes());
    sequence(routes, `POST ${p}/7/draft_notes`, { id: 1 }, { id: 2 }, new Error("rejected"));
    await expect(
      adapter.submitDraft!(7, { decision: "comment", body: "", headSha: head, comments }),
    ).rejects.toThrow("rejected");
    expect(
      writes()
        .filter((w) => w.method === "DELETE")
        .map((w) => w.path),
    ).toEqual([`/api/${p}/7/draft_notes/1`, `/api/${p}/7/draft_notes/2`]);
    expect(writes().some((w) => w.path.endsWith("bulk_publish"))).toBe(false);
  });

  it("deletes the drafts and rethrows when approval is refused", async () => {
    const { adapter, writes, routes } = fixture(draftRoutes());
    sequence(routes, `POST ${p}/7/approve`, new Error("forbidden"));
    await expect(
      adapter.submitDraft!(7, {
        decision: "approve",
        body: "",
        headSha: head,
        comments: [comments[0]!],
      }),
    ).rejects.toThrow("forbidden");
    expect(writes().map((w) => w.method)).toEqual(["POST", "POST", "DELETE"]);
  });

  it("publishes its own drafts one by one when the viewer has other drafts", async () => {
    const { adapter, writes, routes } = fixture(draftRoutes([{ id: 99 }]));
    sequence(routes, `POST ${p}/7/draft_notes`, { id: 1 }, { id: 2 });
    sequence(routes, `PUT ${p}/7/draft_notes/2/publish`, new Error("failed"));
    await expect(
      adapter.submitDraft!(7, {
        decision: "comment",
        body: "",
        headSha: head,
        comments: comments.slice(0, 2),
      }),
    ).rejects.toThrow(/did not finish/);
    expect(
      writes()
        .slice(2)
        .map((w) => [w.method, w.path]),
    ).toEqual([
      ["PUT", `/api/${p}/7/draft_notes/1/publish`],
      ["PUT", `/api/${p}/7/draft_notes/2/publish`],
      ["DELETE", `/api/${p}/7/draft_notes/2`],
    ]);
    expect(writes().some((w) => w.path.endsWith("bulk_publish"))).toBe(false);
  });

  it("refuses request-changes, which GitLab reviews do not have", async () => {
    const { adapter, writes } = fixture(draftRoutes());
    await expect(
      adapter.submitDraft!(7, { decision: "request-changes", body: "x", headSha: head, comments }),
    ).rejects.toThrow(/not supported/);
    expect(writes()).toEqual([]);
  });
});

describe("gitlabLinePosition", () => {
  it.each([
    ["RIGHT", 1, { old_line: 1, new_line: 1 }],
    ["RIGHT", 2, { new_line: 2 }],
    ["LEFT", 2, { old_line: 2 }],
    ["RIGHT", 4, { old_line: 3, new_line: 4 }],
    // Between hunks the offset of the earlier hunk applies.
    ["RIGHT", 7, { old_line: 6, new_line: 7 }],
    ["LEFT", 11, { old_line: 11 }],
    ["RIGHT", 12, { new_line: 12 }],
    ["LEFT", 1, { old_line: 1, new_line: 1 }],
    ["RIGHT", 20, { old_line: 19, new_line: 20 }],
  ] as const)("maps %s line %i", (side, line, expected) => {
    expect(gitlabLinePosition(fileDiff, side, line)).toEqual(expected);
  });

  it("anchors on the commented side alone without hunks", () => {
    expect(gitlabLinePosition("", "RIGHT", 4)).toEqual({ new_line: 4 });
  });

  describe("GitLab thread side", () => {
    const discussion = (id: string, position: Record<string, unknown> | null) => ({
      id,
      notes: [{ id: 1, body: "note", position, resolvable: true, resolved: false }],
    });
    it("places a thread on the old side only when the position has no new line", async () => {
      const { adapter } = fixture({
        [`GET ${p}/7/discussions`]: [
          discussion("removed", {
            old_path: "a.ts",
            new_path: "a.ts",
            old_line: 2,
            new_line: null,
          }),
          discussion("added", { old_path: "a.ts", new_path: "a.ts", old_line: null, new_line: 3 }),
          // A context line has both numbers and keeps today's new-side placement.
          discussion("context", { old_path: "a.ts", new_path: "a.ts", old_line: 4, new_line: 5 }),
          // A deleted file reports its path on the old side.
          discussion("deleted", { old_path: "gone.ts", old_line: 1 }),
          discussion("file-level", { old_path: "a.ts", new_path: "a.ts" }),
          { id: "general", notes: [{ id: 2, body: "no position" }] },
        ],
      });
      const threads = await adapter.threads(7);
      expect(threads.map((t) => [t.id, t.path, t.line, t.side])).toEqual([
        ["removed", "a.ts", 2, "LEFT"],
        ["added", "a.ts", 3, "RIGHT"],
        ["context", "a.ts", 5, "RIGHT"],
        ["deleted", "gone.ts", 1, "LEFT"],
        ["file-level", "a.ts", undefined, undefined],
        ["general", undefined, undefined, undefined],
      ]);
    });
  });
});
