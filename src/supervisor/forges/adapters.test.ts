import { describe, expect, it, vi } from "vitest";
import type { ForgeKind, ForgeRepository } from "@/shared/contracts";
import { ghGetPrDetailsResultSchema } from "@/shared/contracts";
import { ForgeApi, type ForgeHttpRequest } from "./api";
import { FORGE_CAPABILITIES } from "./connection";
import { GitLabReview } from "./gitlab";
import { GiteaReview } from "./gitea";
import { BitbucketReview } from "./bitbucket";
import { AzureReview } from "./azure";
import { GitCafeReview } from "./gitcafe";
import { ForgeRuntime } from "./runtime";
import type { ForgeReviewAdapter } from "./types";

const head = "a".repeat(40),
  base = "b".repeat(40);
const location = { kind: "windows" as const, path: process.cwd() };
const patch = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n";
const input = {
  projectLocation: location,
  branch: "feature",
  baseBranch: "main",
  title: "Review",
  body: "Body",
  isDraft: false,
};

it.each([
  [
    "gitlab",
    "PUT",
    "projects/team%2Fsubgroup%2Fapp/merge_requests/7/notes/123",
    { body: "Updated" },
  ],
  ["gitea", "PATCH", "repos/team/app/issues/comments/123", { body: "Updated" }],
  ["forgejo", "PATCH", "repos/team/app/issues/comments/123", { body: "Updated" }],
  [
    "bitbucket",
    "PUT",
    "repositories/team/app/pullrequests/7/comments/123",
    { content: { raw: "Updated" } },
  ],
  [
    "gitcafe",
    "PATCH",
    "repos/team/app/pulls/7/comments/123",
    { body: "Updated", expectedVersion: 4 },
  ],
] as const)(
  "edits a %s comment with its host-native request",
  async (forge, method, path, body) => {
    const f = fixture(forge);
    f.routes[`${method} ${path}`] = {};
    if (forge === "gitcafe")
      f.routes[`GET ${path}/detail`] = { id: "123", version: 4, body: "Original" };
    await f.adapter.editComment!({
      ...input,
      prNumber: 7,
      commentId: "123",
      body: "Updated",
      expectedBody: "Original",
      forgeAccount: f.source.account!,
      forgeRepository: f.source.repository,
    });
    expect(f.writes()).toEqual([{ method, path: `/api/${path}`, body }]);
  },
);

it("refuses a GitCafe comment changed after the service preflight", async () => {
  const f = fixture("gitcafe");
  f.routes["GET repos/team/app/pulls/7/comments/123/detail"] = { body: "Newer", version: 5 };
  await expect(
    f.adapter.editComment!({
      ...input,
      prNumber: 7,
      commentId: "123",
      body: "Overwrite",
      expectedBody: "Original",
      forgeAccount: f.source.account!,
      forgeRepository: f.source.repository,
    }),
  ).rejects.toThrow(/changed/);
  expect(f.writes()).toEqual([]);
});

function source(forge: ForgeKind): ForgeRepository {
  return {
    forge,
    host: "https://forge.example",
    repository: "team/app",
    remote: "origin",
    account: { forge, host: "https://forge.example", login: "viewer" },
    capabilities: structuredClone(FORGE_CAPABILITIES[forge]),
  };
}
function transport(routes: Record<string, unknown>) {
  const requests: ForgeHttpRequest[] = [];
  const api = new ForgeApi(
    "https://forge.example/api",
    { Authorization: "Bearer fixture" },
    async (request) => {
      requests.push(request);
      const path = new URL(request.url).pathname.replace(/^\/api\//, "");
      const key = `${request.method} ${path}`;
      if (!(key in routes)) throw new Error(`Unexpected request: ${key}`);
      const body = routes[key];
      return {
        status: 200,
        headers: {},
        body: typeof body === "string" ? body : JSON.stringify(body),
      };
    },
  );
  return {
    api,
    requests,
    writes: () =>
      requests
        .filter((r) => r.method !== "GET")
        .map((r) => ({
          method: r.method,
          path: new URL(r.url).pathname,
          body: r.body ? (JSON.parse(r.body) as unknown) : undefined,
        })),
  };
}

function fixture(forge: Exclude<ForgeKind, "github">) {
  const s = source(forge);
  let routes: Record<string, unknown>, adapter: (api: ForgeApi) => ForgeReviewAdapter;
  if (forge === "gitlab") {
    s.repository = "team/subgroup/app";
    const p = "projects/team%2Fsubgroup%2Fapp/merge_requests";
    const pr = {
      id: 999,
      iid: 7,
      title: "Review",
      description: "Body",
      web_url: "https://forge.example/team/subgroup/app/-/merge_requests/7",
      source_branch: "feature",
      target_branch: "main",
      state: "opened",
      draft: false,
      sha: head,
      updated_at: "2026-10-16T00:00:00Z",
      author: { username: "author" },
      source_project_id: 1,
      target_project_id: 1,
      detailed_merge_status: "mergeable",
      head_pipeline: { id: 2, status: "success" },
    };
    routes = {
      [`GET ${p}`]: [pr],
      [`GET ${p}/7`]: pr,
      [`POST ${p}`]: pr,
      [`GET ${p}/7/diffs`]: [{ new_path: "a.ts", diff: "@@ -1 +1 @@\n-old\n+new\n" }],
      [`GET ${p}/7/raw_diffs`]: patch,
      [`GET ${p}/7/notes`]: [
        { id: 1, body: "note", author: { username: "author" }, created_at: "now" },
      ],
      [`GET ${p}/7/discussions`]: [
        {
          id: "thread",
          individual_note: false,
          notes: [
            {
              id: 2,
              body: "fix",
              resolvable: true,
              resolved: false,
              author: { username: "reviewer" },
              position: { new_path: "a.ts", new_line: 1, head_sha: head },
            },
          ],
        },
      ],
      [`GET ${p}/7/commits`]: [
        {
          id: head,
          short_id: head.slice(0, 7),
          title: "Change",
          message: "Change",
          authored_date: "now",
        },
      ],
      [`GET ${p}/7/approvals`]: { approved_by: [], approvals_left: 0 },
      ["GET projects/team%2Fsubgroup%2Fapp/pipelines/2/jobs"]: [
        { name: "test", status: "success" },
      ],
      [`POST ${p}/7/approve`]: {},
      [`POST ${p}/7/notes`]: { id: 3, body: "feedback", author: { username: "viewer" } },
      [`PUT ${p}/7/merge`]: {},
      [`PUT ${p}/7`]: {},
      [`PUT ${p}/7/rebase`]: {},
    };
    adapter = (api) => new GitLabReview(s, api);
  } else if (forge === "gitea" || forge === "forgejo") {
    const p = "repos/team/app/pulls",
      pr = {
        number: 7,
        title: "Review",
        body: "Body",
        html_url: "https://forge.example/team/app/pulls/7",
        state: "open",
        head: { ref: "feature", sha: head, repo: { full_name: "team/app" } },
        base: { ref: "main" },
        user: { login: "author" },
        updated_at: "now",
        mergeable: true,
        additions: 1,
        deletions: 1,
        changed_files: 1,
      };
    routes = {
      [`GET ${p}`]: [pr],
      [`GET ${p}/7`]: pr,
      [`POST ${p}`]: pr,
      [`GET ${p}/7/files`]: [{ filename: "a.ts", additions: 1, deletions: 1 }],
      [`GET ${p}/7.diff`]: patch,
      [`GET repos/team/app/statuses/${head}`]: [
        { id: 1, context: "test", status: "failure" },
        { id: 2, context: "test", status: "success" },
      ],
      [`GET ${p}/7/reviews`]: [
        {
          id: 5,
          user: { login: "reviewer" },
          state: "REQUEST_CHANGES",
          body: "fix",
          comments_count: 1,
        },
      ],
      [`GET ${p}/7/reviews/5/comments`]: [
        { id: 6, path: "a.ts", position: 1, body: "fix", user: { login: "reviewer" } },
      ],
      ["GET repos/team/app/issues/7/comments"]: [],
      [`GET ${p}/7/commits`]: [
        { sha: head, commit: { message: "Change", author: { date: "now" } } },
      ],
      [`POST ${p}/7/reviews`]: {},
      ["POST repos/team/app/issues/7/comments"]: {
        id: 3,
        body: "feedback",
        user: { login: "viewer" },
      },
      [`POST ${p}/7/merge`]: {},
      [`PATCH ${p}/7`]: {},
      [`POST ${p}/7/update`]: {},
    };
    adapter = (api) => new GiteaReview(s, api);
  } else if (forge === "bitbucket") {
    const p = "repositories/team/app/pullrequests",
      pr = {
        id: 7,
        title: "Review",
        description: "Body",
        state: "OPEN",
        author: { uuid: "author" },
        source: {
          branch: { name: "feature" },
          commit: { hash: head },
          repository: { full_name: "team/app" },
        },
        destination: { branch: { name: "main" } },
        participants: [],
        links: { html: { href: "https://forge.example/team/app/pull-requests/7" } },
        updated_on: "now",
      };
    routes = {
      [`GET ${p}`]: { values: [pr] },
      [`GET ${p}/7`]: pr,
      [`POST ${p}`]: pr,
      [`GET ${p}/7/diffstat`]: {
        values: [{ new: { path: "a.ts" }, lines_added: 1, lines_removed: 1 }],
      },
      [`GET ${p}/7/diff`]: patch,
      [`GET ${p}/7/statuses`]: { values: [{ name: "test", state: "SUCCESSFUL" }] },
      [`GET ${p}/7/comments`]: {
        values: [
          {
            id: 1,
            content: { raw: "fix" },
            user: { uuid: "reviewer" },
            inline: { path: "a.ts", to: 1 },
          },
        ],
      },
      [`GET ${p}/7/commits`]: { values: [{ hash: head, message: "Change", date: "now" }] },
      [`POST ${p}/7/approve`]: {},
      [`POST ${p}/7/request-changes`]: {},
      [`POST ${p}/7/comments`]: { id: 3, content: { raw: "feedback" }, user: { uuid: "viewer" } },
      [`POST ${p}/7/merge`]: {},
      [`PUT ${p}/7`]: {},
      [`POST ${p}/7/decline`]: {},
    };
    adapter = (api) => new BitbucketReview(s, api);
  } else if (forge === "azure-devops") {
    const p = "team/_apis/git/repositories/app/pullRequests",
      pr = {
        pullRequestId: 7,
        title: "Review",
        description: "Body",
        status: "active",
        sourceRefName: "refs/heads/feature",
        targetRefName: "refs/heads/main",
        lastMergeSourceCommit: { commitId: head },
        lastMergeTargetCommit: { commitId: base },
        mergeStatus: "succeeded",
        repository: { project: { id: "project-guid" } },
        createdBy: { id: "author" },
        reviewers: [],
      };
    routes = {
      [`GET ${p}`]: { value: [pr] },
      [`GET ${p}/7`]: pr,
      [`POST ${p}`]: pr,
      [`GET ${p}/7/statuses`]: {
        value: [{ id: 1, context: { name: "test" }, state: "succeeded" }],
      },
      ["GET team/_apis/policy/evaluations"]: {
        value: [
          {
            configuration: { isEnabled: true, isBlocking: true, type: { displayName: "Build" } },
            status: "approved",
          },
        ],
      },
      [`GET ${p}/7/threads`]: {
        value: [
          {
            id: 1,
            status: "active",
            threadContext: { filePath: "/a.ts", rightFileStart: { line: 1 } },
            comments: [{ id: 1, content: "fix", author: { id: "reviewer" } }],
          },
        ],
      },
      [`GET ${p}/7/commits`]: {
        value: [{ commitId: head, comment: "Change", author: { date: "now" } }],
      },
      ["GET team/_apis/git/repositories/app/diffs/commits"]: {
        commonCommit: base,
        allChangesIncluded: true,
        changes: [{ item: { path: "/a.ts" }, changeType: "edit" }],
      },
      ["GET team/_apis/git/repositories/app/items"]: { content: "content\n" },
      ["GET _apis/connectionData"]: { authenticatedUser: { id: "viewer" } },
      [`PUT ${p}/7/reviewers/viewer`]: {},
      [`POST ${p}/7/threads`]: {
        id: 3,
        comments: [{ id: 1, content: "feedback", author: { id: "viewer" } }],
      },
      [`PATCH ${p}/7`]: {},
    };
    adapter = (api) => {
      const runtime = new ForgeRuntime(() => undefined);
      vi.spyOn(runtime, "patch").mockResolvedValue(patch);
      return new AzureReview(s, api, runtime, location);
    };
  } else {
    const p = "repos/team/app/pulls",
      pr = {
        number: 7,
        title: "Review",
        description: "Body",
        state: "open",
        sourceBranch: "feature",
        targetBranch: "main",
        headOid: head,
        version: 3,
        repoId: "repo-id",
        isCrossFork: false,
        author: { handle: "author" },
        updatedAt: "now",
        capabilities: { edit: true, merge: true, review: true, comment: true },
      };
    routes = {
      [`GET ${p}/`]: { items: [pr] },
      [`GET ${p}/7`]: pr,
      [`POST ${p}/`]: pr,
      [`GET ${p}/7/status`]: {
        baseOid: base,
        headOid: head,
        version: 3,
        checks: { contexts: [{ context: "test", state: "success" }] },
        merge: {
          strategies: ["merge", "squash", "rebase"],
          conflicts: "none",
          verdict: { kind: "mergeable" },
        },
      },
      [`GET ${p}/7/changes`]: { items: [{ path: "a.ts", additions: 1, deletions: 1 }] },
      [`GET ${p}/7/diff-file`]: {
        file: {
          path: "a.ts",
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: [
                { origin: "-", content: "old\n" },
                { origin: "+", content: "new\n" },
              ],
            },
          ],
        },
      },
      [`GET ${p}/7/comments/`]: {
        items: [
          {
            id: "thread",
            threadId: "thread",
            body: "fix",
            path: "a.ts",
            line: 1,
            author: { handle: "reviewer" },
          },
        ],
      },
      [`GET ${p}/7/commits`]: {
        items: [{ oid: head, summary: "Change", message: "Change", time: 1 }],
      },
      [`GET ${p}/7/reviews`]: { items: [] },
      ["GET repos/team/app/"]: { id: "repo-id" },
      [`POST ${p}/7/reviews`]: {},
      [`POST ${p}/7/comments/`]: { id: "3", body: "feedback", author: { handle: "viewer" } },
      [`POST ${p}/7/merge`]: { id: "merge-op", state: "accepted" },
      [`PATCH ${p}/7`]: {},
      [`POST ${p}/7/close`]: {},
      [`POST ${p}/7/reopen`]: {},
      [`POST ${p}/7/ready`]: {},
      [`POST ${p}/7/draft`]: { ...pr, draft: true },
    };
    adapter = (api) => new GitCafeReview(s, api);
  }
  const http = transport(routes);
  return { ...http, adapter: adapter(http.api), source: s, routes };
}

describe.each(["gitlab", "forgejo", "gitea", "bitbucket", "azure-devops", "gitcafe"] as const)(
  "%s review integration",
  (forge) => {
    it("discovers, reads details/checks/commits/conversations and returns unified diffs", async () => {
      const { adapter } = fixture(forge);
      expect((await adapter.list("open"))[0]?.pr.number).toBe(7);
      expect((await adapter.list("all", "feature"))[0]?.headBranch).toBe("feature");
      const result = await adapter.details(7);
      expect(ghGetPrDetailsResultSchema.safeParse(result).success).toBe(true);
      expect(result.details).toMatchObject({
        headBranch: "feature",
        baseBranch: "main",
        changedFiles: 1,
      });
      expect(result.pr?.checksStatus).toBe("SUCCESS");
      expect(result.details.commits[0]?.oid).toBe(head);
      expect((await adapter.threads(7))[0]).toMatchObject({
        isResolved: false,
        path: "a.ts",
        comments: [{ body: "fix" }],
      });
      expect(await adapter.files(7)).toEqual([{ path: "a.ts", additions: 1, deletions: 1 }]);
      expect(await adapter.diff(7)).toContain("+new\n");
    });
    it("creates, edits, comments, submits a review and closes the review", async () => {
      const { adapter, writes } = fixture(forge);
      expect((await adapter.create(input)).number).toBe(7);
      await adapter.edit({
        projectLocation: location,
        prNumber: 7,
        title: "Updated",
        body: "Updated body",
        baseBranch: "release",
      });
      expect((await adapter.comment(7, "feedback")).body).toBe("feedback");
      await adapter.review(7, "approve", "feedback");
      await adapter.setState(7, "closed");
      expect(writes().length).toBeGreaterThanOrEqual(5);
      expect(JSON.stringify(writes())).toContain("Updated");
    });
    it.skipIf(forge === "bitbucket")(
      "sends the host's merge precondition and never bypasses policies",
      async () => {
        const { adapter, writes } = fixture(forge);
        await expect(adapter.merge(7, "squash", "c".repeat(40))).rejects.toThrow(/head changed/);
        expect(writes()).toEqual([]);
        await adapter.merge(7, "squash", head);
        const body = writes()[0]?.body;
        const expected = {
          gitlab: { sha: head, squash: true, should_remove_source_branch: false },
          gitea: {
            head_commit_id: head,
            force_merge: false,
            delete_branch_after_merge: false,
            do: "squash",
          },
          forgejo: {
            head_commit_id: head,
            force_merge: false,
            delete_branch_after_merge: false,
            do: "squash",
          },
          "azure-devops": {
            lastMergeSourceCommit: { commitId: head },
            completionOptions: { bypassPolicy: false, mergeStrategy: "squash" },
          },
          gitcafe: {
            headOid: head,
            baseOid: base,
            expectedVersion: 3,
            strategy: "squash",
            requestId: expect.any(String),
          },
          bitbucket: {},
        };
        expect(body).toMatchObject(expected[forge]);
      },
    );
  },
);

it("refuses Bitbucket expected-head merge but supports its explicit manual rebase strategy", async () => {
  const { adapter, writes } = fixture("bitbucket");
  await expect(adapter.merge(7, "squash", head)).rejects.toThrow(/not supported/);
  expect(writes()).toEqual([]);
  await adapter.merge(7, "rebase");
  expect(writes()[0]?.body).toMatchObject({
    merge_strategy: "rebase_merge",
    close_source_branch: false,
  });
  expect(adapter.source.capabilities.autoMerge).toBe(false);
});

it("reports unsupported host actions without sending a write", async () => {
  const gitlab = fixture("gitlab"),
    bitbucket = fixture("bitbucket");
  await expect(gitlab.adapter.review(7, "request-changes", "fix")).rejects.toThrow(/not supported/);
  await expect(gitlab.adapter.merge(7, "rebase")).rejects.toThrow(/not supported/);
  await expect(bitbucket.adapter.setState(7, "open")).rejects.toThrow(/not supported/);
  expect(gitlab.writes()).toEqual([]);
  expect(bitbucket.writes()).toEqual([]);
});

it("does not treat an unresolvable GitLab conversation as resolved", async () => {
  const { adapter, routes } = fixture("gitlab");
  routes["GET projects/team%2Fsubgroup%2Fapp/merge_requests/7/discussions"] = [
    { id: "thread", notes: [{ id: 1, body: "question", resolvable: false }] },
  ];
  expect((await adapter.threads(7))[0]?.isResolved).toBe(false);
});

it("exposes GitCafe per-review permissions and cannot claim a queued merge completed", async () => {
  const { adapter, routes, writes } = fixture("gitcafe");
  routes["GET repos/team/app/pulls/7"] = {
    ...(routes["GET repos/team/app/pulls/7"] as object),
    isCrossFork: true,
    capabilities: { edit: false, merge: false, review: false },
  };
  expect((await adapter.details(7)).pr?.source?.capabilities).toMatchObject({
    autoFix: false,
    edit: false,
    mergeMethods: [],
    reviewDecisions: [],
  });
  await adapter.merge(7, "squash", head);
  expect(writes()).toHaveLength(1);
  expect((await adapter.details(7)).pr?.state).toBe("open");
});

it("reads fork pipeline jobs from the pipeline project and ignores allowed failures", async () => {
  const { adapter, routes, requests } = fixture("gitlab");
  const key = "GET projects/team%2Fsubgroup%2Fapp/merge_requests/7";
  routes[key] = {
    ...(routes[key] as object),
    source_project_id: 3,
    target_project_id: 1,
    head_pipeline: { id: 2, project_id: 3, status: "success" },
  };
  routes["GET projects/3/pipelines/2/jobs"] = [
    { name: "optional manual", status: "manual", allow_failure: true },
    { name: "optional failed", status: "failed", allow_failure: true },
    { name: "optional canceled", status: "canceled", allow_failure: true },
  ];
  const result = await adapter.details(7);
  expect(result.pr?.checksStatus).toBe("SUCCESS");
  expect(result.pr?.source?.capabilities.autoFix).toBe(false);
  expect(result.details.checks.slice(1).every((check) => check.conclusion === "SKIPPED")).toBe(
    true,
  );
  expect(requests.some((request) => request.url.includes("projects/3/pipelines/2/jobs"))).toBe(
    true,
  );
  routes["GET projects/3/pipelines/2/jobs"] = [
    { name: "required manual", status: "manual", allow_failure: false },
  ];
  expect((await adapter.details(7)).pr?.checksStatus).toBe("PENDING");
});

it.each(["Draft: ", "WIP: ", "[Draft] ", "(Draft) "])(
  "removes GitLab's %s draft prefix when marking ready",
  async (prefix) => {
    const { adapter, routes, writes } = fixture("gitlab");
    const key = "GET projects/team%2Fsubgroup%2Fapp/merge_requests/7";
    routes[key] = { ...(routes[key] as object), title: `${prefix}Review`, draft: true };
    await adapter.setState(7, "ready");
    expect(writes()[0]?.body).toEqual({ title: "Review" });
  },
);

it("uses Azure JSON item content and the policy evaluation preview API", async () => {
  const { adapter, routes, requests } = fixture("azure-devops");
  routes["GET team/_apis/policy/evaluations"] = {
    value: [
      {
        configuration: { isEnabled: true, isBlocking: true, type: { displayName: "Build" } },
        status: "broken",
      },
    ],
  };
  expect((await adapter.checks(7)).find((check) => check.name === "Build")).toMatchObject({
    state: "COMPLETED",
    conclusion: "FAILURE",
  });
  await adapter.diff(7);
  const policies = requests.find((request) => request.url.includes("/_apis/policy/evaluations"));
  expect(new URL(policies!.url).searchParams.get("api-version")).toBe("7.1-preview.1");
  const items = requests.filter((request) => new URL(request.url).pathname.endsWith("/items"));
  expect(items).toHaveLength(2);
  for (const item of items) {
    expect(new URL(item.url).searchParams.get("$format")).toBe("json");
    expect(new URL(item.url).searchParams.get("includeContent")).toBe("true");
    expect(item.headers.Accept).toBe("application/json");
  }
  routes["GET team/_apis/git/repositories/app/items"] = { objectId: head };
  await expect(adapter.diff(7)).rejects.toThrow(/diff content/);
});

it.each(["gitlab", "gitea", "forgejo", "bitbucket", "azure-devops", "gitcafe"] as const)(
  "does not re-enable %s automation for a non-origin checkout",
  async (forge) => {
    const f = fixture(forge);
    f.source.capabilities.autoFix = false;
    expect((await f.adapter.details(7)).pr?.source?.capabilities.autoFix).toBe(false);
  },
);
