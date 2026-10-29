import { expect, it, vi } from "vitest";
import { ghGetPrDetailsResultSchema } from "@/shared/contracts";
import { testSource, testTransport } from "./adapterTestKit";
import { AzureReview } from "./azure";
import { ForgeRuntime } from "./runtime";

const head = "a".repeat(40),
  base = "b".repeat(40),
  parent = "c".repeat(40);
const location = { kind: "windows" as const, path: process.cwd() };
const repo = "team/_apis/git/repositories/app";
const p = `${repo}/pullRequests`;
const patch = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n";
const identity = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  displayName: `${name} name`,
  uniqueName: `${name}@example.com`,
  imageUrl: `https://avatars.example/${name}`,
  ...extra,
});
const pr = {
  pullRequestId: 7,
  title: "Review",
  description: "Body",
  status: "active",
  isDraft: false,
  sourceRefName: "refs/heads/feature",
  targetRefName: "refs/heads/main",
  lastMergeSourceCommit: { commitId: head },
  lastMergeTargetCommit: { commitId: base },
  mergeStatus: "succeeded",
  repository: { project: { id: "project-guid" } },
  createdBy: identity("owner", "owner"),
  creationDate: "2026-10-01T00:00:00Z",
  reviewers: [
    identity("alice", "alice", { vote: 0 }),
    identity("bob", "bob", { vote: 10 }),
    identity("core-team", "Core", { vote: 0, isContainer: true }),
  ],
};
const systemThread = (id: number, type: string, content: string, publishedDate: string) => ({
  id,
  status: "active",
  properties: { CodeReviewThreadType: { $type: "System.String", $value: type } },
  comments: [{ id: 1, content, commentType: "system", publishedDate, author: { id: "tfs" } }],
});

function fixture(extra: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    [`GET ${p}`]: { value: [{ ...pr, labels: [{ id: "l1", name: "bug", active: true }] }] },
    [`GET ${p}/7`]: pr,
    [`GET ${p}/7/statuses`]: { value: [] },
    ["GET team/_apis/policy/evaluations"]: { value: [] },
    [`GET ${p}/7/threads`]: {
      value: [
        {
          id: 1,
          status: "active",
          comments: [
            { id: 1, content: "hello", commentType: "text", author: identity("bob", "bob") },
          ],
        },
        systemThread(2, "VoteUpdate", "bob voted 10", "2026-10-02T00:00:00Z"),
        systemThread(3, "RefUpdate", "owner pushed 1 commit", "2026-10-02T01:00:00Z"),
        systemThread(4, "ReviewersUpdate", "owner added alice", "2026-10-03T00:00:00Z"),
        {
          ...systemThread(5, "StatusUpdate", "deleted notice", "2026-10-04T00:00:00Z"),
          isDeleted: true,
        },
      ],
    },
    [`GET ${p}/7/commits`]: {
      value: [{ commitId: head, comment: "Change", author: { date: "now" } }],
    },
    [`GET ${p}/7/labels`]: {
      value: [
        { id: "l1", name: "bug", active: true },
        { id: "l2", name: "stale", active: false },
      ],
    },
    [`GET ${repo}/diffs/commits`]: {
      commonCommit: base,
      allChangesIncluded: true,
      changes: [{ item: { path: "/a.ts" }, changeType: "edit" }],
    },
    [`GET ${repo}/items`]: { content: "content\n" },
    ...extra,
  };
  const http = testTransport(routes);
  const runtime = new ForgeRuntime(() => undefined);
  const patches = vi.spyOn(runtime, "patch").mockResolvedValue(patch);
  return {
    ...http,
    routes,
    patches,
    adapter: new AzureReview(testSource("azure-devops"), http.api, runtime, location),
  };
}
const query = (url: string) => Object.fromEntries(new URL(url).searchParams);

it("maps list states to Azure statuses and carries labels the list returns", async () => {
  const f = fixture();
  for (const state of ["open", "all", "closed", "merged"] as const) await f.adapter.list(state);
  expect(f.requests.map((r) => query(r.url)["searchCriteria.status"])).toEqual([
    "active",
    "all",
    "abandoned",
    "completed",
  ]);
  expect((await f.adapter.list("open"))[0]?.labels).toEqual([{ name: "bug" }]);
  f.routes[`GET ${p}`] = { value: [pr] };
  expect((await f.adapter.list("open"))[0]).not.toHaveProperty("labels");
});

it("reads labels, outstanding reviewers and the system-thread timeline", async () => {
  const f = fixture();
  const result = await f.adapter.details(7);
  expect(ghGetPrDetailsResultSchema.safeParse(result).success).toBe(true);
  expect(result.details.labels).toEqual([{ name: "bug" }]);
  expect(result.details.requestedReviewers).toEqual([
    {
      id: "alice",
      login: "alice",
      name: "alice name",
      avatarUrl: "https://avatars.example/alice",
    },
    {
      id: "core-team",
      login: "core-team",
      name: "Core name",
      avatarUrl: "https://avatars.example/Core",
      team: true,
    },
  ]);
  expect(result.details.timeline).toEqual([
    {
      id: "opened",
      kind: "opened",
      createdAt: "2026-10-01T00:00:00Z",
      actor: { login: "owner", avatarUrl: "https://avatars.example/owner" },
    },
    {
      id: "system:4:1",
      kind: "system",
      createdAt: "2026-10-03T00:00:00Z",
      text: "owner added alice",
    },
  ]);
  expect(result.details.comments.map((c) => c.body)).toEqual(["hello"]);
  expect(result.details).not.toHaveProperty("reactions");
  expect(query(f.requests.find((r) => r.url.includes("/labels"))!.url)["api-version"]).toBe(
    "7.1-preview.1",
  );
});

it("derives merged and closed lifecycle events from the closed date", async () => {
  const f = fixture();
  f.routes[`GET ${p}/7`] = {
    ...pr,
    status: "completed",
    closedDate: "2026-10-05T00:00:00Z",
    closedBy: identity("bob", "bob"),
  };
  expect((await f.adapter.details(7)).details.timeline?.at(-1)).toEqual({
    id: "merged",
    kind: "merged",
    createdAt: "2026-10-05T00:00:00Z",
    actor: { login: "bob", avatarUrl: "https://avatars.example/bob" },
  });
  f.routes[`GET ${p}/7`] = { ...pr, status: "abandoned", closedDate: "2026-10-06T00:00:00Z" };
  expect((await f.adapter.details(7)).details.timeline?.at(-1)).toEqual({
    id: "closed",
    kind: "closed",
    createdAt: "2026-10-06T00:00:00Z",
  });
});

it("leaves labels absent when the optional label read fails", async () => {
  const f = fixture();
  delete f.routes[`GET ${p}/7/labels`];
  const result = await f.adapter.details(7);
  expect(ghGetPrDetailsResultSchema.safeParse(result).success).toBe(true);
  expect(result.details).not.toHaveProperty("labels");
  expect(result.details.timeline?.[0]?.kind).toBe("opened");
});

it("converts an open review back to draft", async () => {
  const f = fixture({ [`PATCH ${p}/7`]: {} });
  await f.adapter.setState(7, "draft");
  await f.adapter.setState(7, "ready");
  expect(f.writes().map((w) => w.body)).toEqual([{ isDraft: true }, { isDraft: false }]);
});

it("lists project tags as label candidates, sorted and bounded", async () => {
  const tags = Array.from({ length: 301 }, (_, i) => ({
    id: `t${i}`,
    name: `tag-${String(i).padStart(3, "0")}`,
    active: true,
  }));
  const f = fixture({
    ["GET team/_apis/wit/tags"]: {
      value: [
        { id: "z", name: "zeta", active: true },
        { id: "x", name: "gone", active: false },
      ],
    },
  });
  expect(await f.adapter.labelCandidates()).toEqual({
    labels: [{ name: "zeta" }],
    truncated: false,
  });
  expect(query(f.requests.at(-1)!.url)["api-version"]).toBe("7.1-preview.1");
  f.routes["GET team/_apis/wit/tags"] = { value: tags.toReversed() };
  const bounded = await f.adapter.labelCandidates();
  expect(bounded.truncated).toBe(true);
  expect(bounded.labels).toHaveLength(300);
  expect(bounded.labels[0]).toEqual({ name: "tag-000" });
});

it("adds labels by name and removes them by name", async () => {
  const f = fixture({
    [`POST ${p}/7/labels`]: { id: "l3", name: "needs review" },
    [`DELETE ${p}/7/labels/old%20label`]: null,
  });
  await f.adapter.setLabels(7, ["needs review"], ["old label"]);
  expect(f.writes()).toEqual([
    {
      method: "POST",
      path: `/api/${p}/7/labels`,
      query: "?api-version=7.1-preview.1",
      body: { name: "needs review" },
    },
    {
      method: "DELETE",
      path: `/api/${p}/7/labels/old%20label`,
      query: "?api-version=7.1-preview.1",
      body: undefined,
    },
  ]);
});

it("offers default-team members and project teams, filtered and bounded", async () => {
  const members = {
    value: [
      { identity: identity("alice", "alice") },
      { identity: identity("bob", "bob") },
      { identity: identity("ops", "Ops", { isContainer: true }) },
    ],
  };
  const f = fixture({
    ["GET _apis/projects/team"]: { defaultTeam: { id: "default-team" } },
    ["GET _apis/projects/team/teams"]: { value: [{ id: "core-team", name: "Core" }] },
    ["GET _apis/projects/team/teams/default-team/members"]: members,
  });
  expect(await f.adapter.reviewerCandidates(7)).toEqual({
    reviewers: [
      {
        id: "alice",
        login: "alice",
        name: "alice name",
        avatarUrl: "https://avatars.example/alice",
      },
      { id: "bob", login: "bob", name: "bob name", avatarUrl: "https://avatars.example/bob" },
      {
        id: "ops",
        login: "ops",
        name: "Ops name",
        avatarUrl: "https://avatars.example/Ops",
        team: true,
      },
      { id: "core-team", login: "core-team", name: "Core", team: true },
    ],
    truncated: false,
  });
  expect((await f.adapter.reviewerCandidates(7, "ALICE@")).reviewers.map((r) => r.id)).toEqual([
    "alice",
  ]);
  expect((await f.adapter.reviewerCandidates(7, "core")).reviewers.map((r) => r.id)).toEqual([
    "core-team",
  ]);
  const membersRequest = f.requests.find((r) => r.url.includes("/members"))!;
  expect(query(membersRequest.url).$top).toBe("200");
  f.routes["GET _apis/projects/team/teams/default-team/members"] = {
    value: Array.from({ length: 200 }, (_, i) => ({ identity: identity(`u${i}`, `user${i}`) })),
  };
  const bounded = await f.adapter.reviewerCandidates(7);
  expect(bounded.reviewers).toHaveLength(50);
  expect(bounded.truncated).toBe(true);
});

it("adds reviewers in one bulk request and removes them one by one", async () => {
  const f = fixture({
    [`POST ${p}/7/reviewers`]: [],
    [`DELETE ${p}/7/reviewers/bob`]: null,
    [`DELETE ${p}/7/reviewers/core-team`]: null,
  });
  await f.adapter.requestReviewers(
    7,
    [{ id: "alice" }, { id: "ops", team: true }],
    [{ id: "bob" }, { id: "core-team", team: true }],
  );
  expect(f.writes().map((w) => [w.method, w.path, w.body])).toEqual([
    ["POST", `/api/${p}/7/reviewers`, [{ id: "alice" }, { id: "ops" }]],
    ["DELETE", `/api/${p}/7/reviewers/bob`, undefined],
    ["DELETE", `/api/${p}/7/reviewers/core-team`, undefined],
  ]);
});

it("diffs one commit against its first parent through the shared patch path", async () => {
  const f = fixture({ [`GET ${repo}/commits/${head}`]: { commitId: head, parents: [parent] } });
  f.routes[`GET ${repo}/diffs/commits`] = {
    commonCommit: parent,
    allChangesIncluded: true,
    changes: [{ item: { path: "/a.ts" }, changeType: "edit" }],
  };
  expect(await f.adapter.commitDiff(7, head)).toBe(patch);
  const diff = f.requests.find((r) => r.url.includes("/diffs/commits"))!;
  expect(query(diff.url)).toMatchObject({ baseVersion: parent, targetVersion: head });
  const items = f.requests.filter((r) => new URL(r.url).pathname.endsWith("/items"));
  expect(items.map((r) => query(r.url)["versionDescriptor.version"]).toSorted()).toEqual([
    head,
    parent,
  ]);
  f.routes[`GET ${repo}/commits/${head}`] = { commitId: head, parents: [] };
  await expect(f.adapter.commitDiff(7, head)).rejects.toThrow(/diff/i);
});

it("shares one in-flight patch computation between concurrent commit diffs", async () => {
  const f = fixture({ [`GET ${repo}/commits/${head}`]: { commitId: head, parents: [parent] } });
  await Promise.all([f.adapter.commitDiff(7, head), f.adapter.commitDiff(7, head)]);
  expect(f.requests.filter((r) => r.url.includes("/diffs/commits"))).toHaveLength(1);
});

const draftComments = [
  { path: "a.ts", side: "RIGHT" as const, line: 4, startLine: 2, body: "range" },
  { path: "b.ts", side: "LEFT" as const, line: 9, body: "old side" },
];
const threadReply = { id: 9, comments: [{ id: 1, content: "x", author: { id: "viewer" } }] };

it("posts each draft comment as a thread, then the vote and summary", async () => {
  const f = fixture({
    [`POST ${p}/7/threads`]: threadReply,
    ["GET _apis/connectionData"]: { authenticatedUser: { id: "viewer" } },
    [`PUT ${p}/7/reviewers/viewer`]: {},
  });
  await f.adapter.submitDraft(7, {
    decision: "approve",
    body: "looks good",
    headSha: head,
    comments: draftComments,
  });
  expect(f.writes().map((w) => [w.method, w.path, w.body])).toEqual([
    [
      "POST",
      `/api/${p}/7/threads`,
      {
        comments: [{ parentCommentId: 0, content: "range", commentType: 1 }],
        status: 1,
        threadContext: {
          filePath: "/a.ts",
          rightFileStart: { line: 2, offset: 1 },
          rightFileEnd: { line: 4, offset: 1 },
        },
      },
    ],
    [
      "POST",
      `/api/${p}/7/threads`,
      {
        comments: [{ parentCommentId: 0, content: "old side", commentType: 1 }],
        status: 1,
        threadContext: {
          filePath: "/b.ts",
          leftFileStart: { line: 9, offset: 1 },
          leftFileEnd: { line: 9, offset: 1 },
        },
      },
    ],
    ["PUT", `/api/${p}/7/reviewers/viewer`, { id: "viewer", vote: 10 }],
    [
      "POST",
      `/api/${p}/7/threads`,
      { comments: [{ parentCommentId: 0, content: "looks good", commentType: 1 }], status: 1 },
    ],
  ]);
});

it("submits comment-only drafts without an empty summary thread", async () => {
  const f = fixture({ [`POST ${p}/7/threads`]: threadReply });
  await f.adapter.submitDraft(7, {
    decision: "comment",
    body: "  ",
    headSha: head,
    comments: draftComments.slice(0, 1),
  });
  expect(f.writes()).toHaveLength(1);
});

it("reports a partial draft after a write and propagates a failure before any write", async () => {
  const f = fixture({ [`POST ${p}/7/threads`]: threadReply });
  await expect(
    f.adapter.submitDraft(7, {
      decision: "request-changes",
      body: "fix",
      headSha: head,
      comments: draftComments,
    }),
  ).rejects.toThrow(/did not finish/);
  expect(f.writes()).toHaveLength(2);
  delete f.routes[`POST ${p}/7/threads`];
  await expect(
    f.adapter.submitDraft(7, {
      decision: "comment",
      body: "",
      headSha: head,
      comments: draftComments,
    }),
  ).rejects.toThrow(/Unexpected request/);
});

it("reads the diff side of a thread from its right or left file anchor", async () => {
  const thread = (id: number, threadContext: Record<string, unknown>) => ({
    id,
    status: "active",
    threadContext: { filePath: "/a.ts", ...threadContext },
    comments: [{ id: 1, content: `c${id}`, commentType: "text", author: identity("bob", "bob") }],
  });
  const f = fixture({
    [`GET ${p}/7/threads`]: {
      value: [
        thread(1, { rightFileStart: { line: 4, offset: 1 } }),
        thread(2, { leftFileStart: { line: 9, offset: 1 } }),
        // Both anchors: the new side wins, as before.
        thread(3, { leftFileStart: { line: 5 }, rightFileStart: { line: 6 } }),
        thread(4, {}),
      ],
    },
  });
  expect((await f.adapter.threads(7)).map((t) => [t.id, t.line, t.side])).toEqual([
    ["1", 4, "RIGHT"],
    ["2", 9, "LEFT"],
    ["3", 6, "RIGHT"],
    ["4", undefined, undefined],
  ]);
});
