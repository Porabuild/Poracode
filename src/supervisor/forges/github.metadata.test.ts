import { beforeEach, describe, expect, it, vi } from "vitest";
import { ghGetPrDetailsResultSchema } from "@/shared/contracts";
import { msg } from "@/shared/messages";

const execFileAsyncMock = vi.hoisted(() =>
  vi.fn<(command: string, args: string[], options: unknown) => Promise<{ stdout: string }>>(),
);
const files = vi.hoisted(() => new Map<string, string>());

vi.mock("node:child_process", () => {
  const { promisify } = require("node:util") as typeof import("node:util");
  return {
    execFile: Object.assign(() => undefined, { [promisify.custom]: execFileAsyncMock }),
  };
});
vi.mock("node:fs/promises", () => ({
  mkdtemp: async (prefix: string) => `${prefix}fixture`,
  writeFile: async (path: string, body: string) => void files.set(path, body),
  rm: async () => undefined,
}));
vi.mock("../agents/base", () => ({
  buildAgentCommand: (_location: unknown, command: string, args: string[]) => ({ command, args }),
  primeProjectShellEnv: async () => undefined,
}));

import { GitHubService } from "../github";
import { PR_METADATA_QUERY, REACTION_SUBJECT_QUERY } from "../githubPrMetadata";
import { testSource } from "./adapterTestKit";
import { GitHubReview } from "./github";

const location = { kind: "windows" as const, path: "C:\\repo" };
type Route = (args: string[]) => unknown;

/** Each gh call is recorded with its JSON `--input` body, if any. */
function setup(route: Route) {
  const calls: { args: string[]; input?: unknown }[] = [];
  execFileAsyncMock.mockImplementation(async (_command, args) => {
    const inputIndex = args.indexOf("--input");
    const input = inputIndex >= 0 ? files.get(args[inputIndex + 1]!) : undefined;
    const callArgs = inputIndex >= 0 ? args.slice(0, inputIndex) : args;
    calls.push({ args: callArgs, ...(input ? { input: JSON.parse(input) as unknown } : {}) });
    const result = route(callArgs);
    if (result instanceof Error) throw result;
    return { stdout: typeof result === "string" ? result : JSON.stringify(result) };
  });
  return {
    adapter: new GitHubReview(testSource("github"), new GitHubService(), location),
    calls,
    writes: () =>
      calls.filter(
        ({ args }) =>
          args.includes("--method") ||
          args.some((arg) => arg.startsWith("query=mutation")) ||
          args[1] === "ready",
      ),
  };
}
const query = (args: string[]) => args.find((arg) => arg.startsWith("query=")) ?? "";
const field = (args: string[], name: string) =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

const prView = {
  number: 7,
  state: "MERGED",
  title: "Fix",
  body: "Why",
  url: "https://forge.example/team/app/pull/7",
  baseRefName: "main",
  headRefName: "feature",
  headRefOid: "a".repeat(40),
  isDraft: false,
  updatedAt: "2026-10-02T00:00:00Z",
  createdAt: "2026-10-01T00:00:00Z",
  mergedAt: "2026-10-02T00:00:00Z",
  author: { login: "author" },
  comments: [
    { id: "IC_1", author: { login: "a" }, body: "hi", createdAt: "2026-10-01T01:00:00Z" },
    { id: "IC_old", author: { login: "b" }, body: "old", createdAt: "2026-10-01T00:30:00Z" },
  ],
  labels: [
    { id: "LA_1", name: "bug", color: "D73A4A", description: "Broken" },
    { id: "LA_2", name: "a, b", color: "nothex" },
  ],
  reviewRequests: [
    { __typename: "User", login: "octo" },
    { __typename: "Team", name: "Core", slug: "team/core" },
  ],
};
const actor = { login: "octo", avatarUrl: "https://avatars.example/octo" };
const group = (content: string, count: number, viewerHasReacted = false) => ({
  content,
  viewerHasReacted,
  reactors: { totalCount: count },
});
const metadata = {
  data: {
    repository: {
      pullRequest: {
        reactionGroups: [group("THUMBS_UP", 2, true), group("HEART", 0), group("ROCKET", 1)],
        comments: { nodes: [{ id: "IC_1", reactionGroups: [group("EYES", 1)] }] },
        timelineItems: {
          nodes: [
            {
              __typename: "RenamedTitleEvent",
              id: "E1",
              createdAt: "2026-10-01T02:00:00Z",
              actor,
              previousTitle: "Old",
              currentTitle: "Fix",
            },
            {
              __typename: "LabeledEvent",
              id: "E2",
              createdAt: "2026-10-01T03:00:00Z",
              actor,
              label: { name: "bug", color: "d73a4a" },
            },
            {
              __typename: "UnlabeledEvent",
              id: "E3",
              createdAt: "2026-10-01T03:01:00Z",
              actor,
              label: { name: "wip" },
            },
            {
              __typename: "ReviewRequestedEvent",
              id: "E4",
              createdAt: "2026-10-01T04:00:00Z",
              actor,
              requestedReviewer: {
                __typename: "Team",
                combinedSlug: "team/core",
                teamName: "Core",
                teamAvatarUrl: "https://avatars.example/core",
              },
            },
            {
              __typename: "ReviewRequestRemovedEvent",
              id: "E5",
              createdAt: "2026-10-01T04:01:00Z",
              actor,
              requestedReviewer: { __typename: "User", login: "x" },
            },
            {
              __typename: "ConvertToDraftEvent",
              id: "E6",
              createdAt: "2026-10-01T05:00:00Z",
              actor,
            },
            {
              __typename: "ReadyForReviewEvent",
              id: "E7",
              createdAt: "2026-10-01T05:01:00Z",
              actor,
            },
            {
              __typename: "HeadRefForcePushedEvent",
              id: "E8",
              createdAt: "2026-10-01T06:00:00Z",
              actor,
              beforeCommit: { oid: "b".repeat(40) },
              afterCommit: { oid: "c".repeat(40) },
            },
            {
              __typename: "BaseRefChangedEvent",
              id: "E9",
              createdAt: "2026-10-01T07:00:00Z",
              actor,
              previousRefName: "dev",
              currentRefName: "main",
            },
            { __typename: "ClosedEvent", id: "E10", createdAt: "2026-10-01T08:00:00Z", actor },
            { __typename: "ReopenedEvent", id: "E11", createdAt: "2026-10-01T09:00:00Z", actor },
            {
              __typename: "MergedEvent",
              id: "E12",
              createdAt: "2026-10-02T00:00:00Z",
              actor,
              mergeRefName: "main",
            },
            { __typename: "ClosedEvent", id: "E13", createdAt: "2026-10-02T00:00:00Z", actor },
          ],
        },
      },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  files.clear();
});

describe("GitHubReview metadata", () => {
  it.each([
    ["open", ["--state", "open", "--limit", "1000"]],
    ["closed", ["--state", "closed", "--search", "is:unmerged", "--limit", "100"]],
    ["merged", ["--state", "merged", "--limit", "100"]],
    ["all", ["--state", "all", "--limit", "100"]],
  ] as const)("lists %s reviews with labels", async (state, expected) => {
    const { adapter, calls } = setup((args) =>
      args[0] === "api" ? "viewer\n" : [{ ...prView, labels: [{ name: "bug", color: "#D73A4A" }] }],
    );
    const [row] = await adapter.list(state);
    const list = calls.find(({ args }) => args[0] === "pr")!.args;
    expect(list.slice(2, 2 + expected.length)).toEqual(expected);
    expect(list.at(-1)).toContain("labels");
    // Open rows carry the computed fields; history rows leave them out (they make GitHub time out).
    const fields = (list.at(-1) ?? "").split(",");
    const computed = ["statusCheckRollup", "mergeable", "mergeStateStatus"];
    expect(computed.filter((name) => fields.includes(name))).toEqual(
      state === "open" ? computed : [],
    );
    expect(row).toMatchObject({
      author: { login: "author" },
      labels: [{ name: "bug", color: "d73a4a" }],
    });
  });

  it("maps labels, requested reviewers, reactions and the event timeline", async () => {
    const { adapter, calls } = setup((args) =>
      args[0] === "pr" ? prView : args[1] === "graphql" ? metadata : "viewer\n",
    );
    const result = ghGetPrDetailsResultSchema.parse(await adapter.details(7));
    const view = calls.find(({ args }) => args[0] === "pr")!.args;
    expect(view.at(-1)).toContain("labels,reviewRequests");
    expect(query(calls.find(({ args }) => args[1] === "graphql")!.args)).toContain(
      "timelineItems(last: 100",
    );
    const { details } = result;
    expect(details.labels).toEqual([
      { name: "bug", color: "d73a4a", description: "Broken" },
      { name: "a, b" },
    ]);
    expect(details.requestedReviewers).toEqual([
      { id: "octo", login: "octo" },
      { id: "team/core", login: "team/core", name: "Core", team: true },
    ]);
    expect(details.reactions).toEqual([
      { content: "+1", count: 2, viewerReacted: true },
      { content: "rocket", count: 1, viewerReacted: false },
    ]);
    expect(details.comments.map((comment) => comment.reactions)).toEqual([
      [{ content: "eyes", count: 1, viewerReacted: false }],
      undefined,
    ]);
    expect(details.timeline?.map((event) => event.kind)).toEqual([
      "opened",
      "renamed",
      "labeled",
      "unlabeled",
      "review-requested",
      "review-request-removed",
      "draft",
      "ready",
      "force-pushed",
      "base-changed",
      "closed",
      "reopened",
      "merged",
    ]);
    expect(details.timeline?.[0]).toEqual({
      id: "opened",
      kind: "opened",
      createdAt: "2026-10-01T00:00:00Z",
      actor: { login: "author" },
    });
    expect(details.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "E1", fromRef: "Old", toRef: "Fix", actor }),
        expect.objectContaining({ id: "E2", label: { name: "bug", color: "d73a4a" } }),
        expect.objectContaining({
          id: "E4",
          reviewer: {
            id: "team/core",
            login: "team/core",
            name: "Core",
            avatarUrl: "https://avatars.example/core",
            team: true,
          },
        }),
        expect.objectContaining({ id: "E8", fromRef: "b".repeat(40), toRef: "c".repeat(40) }),
        expect.objectContaining({ id: "E9", fromRef: "dev", toRef: "main" }),
        expect.objectContaining({ id: "E12", toRef: "main" }),
      ]),
    );
  });

  it("leaves reactions and timeline absent when their read fails", async () => {
    const { adapter } = setup((args) =>
      args[0] === "pr" ? prView : args[1] === "graphql" ? new Error("HTTP 502") : "viewer\n",
    );
    const { details } = ghGetPrDetailsResultSchema.parse(await adapter.details(7));
    expect(details.labels).toHaveLength(2);
    expect(details).not.toHaveProperty("timeline");
    expect(details).not.toHaveProperty("reactions");
    expect(details.comments[0]).not.toHaveProperty("reactions");
  });

  it("reads checks without the optional metadata query", async () => {
    const { adapter, calls } = setup((args) => (args[0] === "pr" ? prView : "viewer\n"));
    await adapter.checks(7);
    expect(calls.some(({ args }) => args[1] === "graphql")).toBe(false);
  });

  it("returns an open review to draft", async () => {
    const { adapter, writes } = setup(() => "");
    await adapter.setState(7, "draft");
    expect(writes()).toEqual([{ args: ["pr", "ready", "7", "--undo"] }]);
  });

  it.each([
    [[100, 100, 100], true, 3],
    [[100, 20], false, 2],
  ])("bounds label candidates (%j)", async (pages, truncated, requests) => {
    const { adapter, calls } = setup((args) => {
      const page = Number(/page=(\d+)$/.exec(args[1]!)![1]);
      return Array.from({ length: pages[page - 1]! }, (_, index) => ({
        name: `l${page}-${index}`,
        color: "ededed",
      }));
    });
    const result = await adapter.labelCandidates();
    expect(result.truncated).toBe(truncated);
    expect(result.labels).toHaveLength(pages.reduce((sum, size) => sum + size, 0));
    expect(calls.map(({ args }) => args[1])).toEqual(
      Array.from(
        { length: requests },
        (_, index) => `repos/{owner}/{repo}/labels?per_page=100&page=${index + 1}`,
      ),
    );
  });

  it("adds known labels by canonical name and removes labels by encoded name", async () => {
    const { adapter, writes } = setup((args) =>
      args[1]?.startsWith("repos/{owner}/{repo}/labels/")
        ? { name: "Needs Review", color: "ffffff" }
        : [],
    );
    await adapter.setLabels(7, ["needs review"], ["a, b/c"]);
    expect(writes()).toEqual([
      {
        args: ["api", "--method", "POST", "repos/{owner}/{repo}/issues/7/labels"],
        input: { labels: ["Needs Review"] },
      },
      {
        args: ["api", "--method", "DELETE", "repos/{owner}/{repo}/issues/7/labels/a%2C%20b%2Fc"],
      },
    ]);
  });

  it("refuses an unknown label before writing", async () => {
    const { adapter, writes } = setup((args) =>
      args[1]?.includes("/labels/") ? new Error("gh: Not Found (HTTP 404)") : [],
    );
    await expect(adapter.setLabels(7, ["missing"], ["bug"])).rejects.toThrow(/HTTP 404/);
    expect(writes()).toEqual([]);
  });

  it("searches requestable users and teams, excluding the author", async () => {
    const { adapter, calls } = setup((args) =>
      query(args).includes("organization(")
        ? {
            data: {
              organization: {
                teams: { totalCount: 1, nodes: [{ combinedSlug: "team/core", name: "Core" }] },
              },
            },
          }
        : {
            data: {
              repository: {
                pullRequest: { author: { login: "author" } },
                assignableUsers: {
                  totalCount: 41,
                  nodes: [{ login: "author" }, { login: "octo", name: "Octo", avatarUrl: "a" }],
                },
              },
            },
          },
    );
    expect(await adapter.reviewerCandidates(7, "oc")).toEqual({
      reviewers: [
        { id: "octo", login: "octo", name: "Octo", avatarUrl: "a" },
        { id: "team/core", login: "team/core", name: "Core", team: true },
      ],
      truncated: true,
    });
    for (const { args } of calls) {
      expect(field(args, "search")).toBe("oc");
      expect(field(args, "owner")).toBe("{owner}");
    }
    expect(field(calls[0]!.args, "number")).toBe("7");
  });

  it("offers users only when teams cannot be read", async () => {
    const { adapter, calls } = setup((args) =>
      query(args).includes("organization(")
        ? new Error("Could not resolve to an Organization")
        : {
            data: {
              repository: {
                pullRequest: { author: { login: "author" } },
                assignableUsers: { totalCount: 1, nodes: [{ login: "octo" }] },
              },
            },
          },
    );
    expect(await adapter.reviewerCandidates(7)).toEqual({
      reviewers: [{ id: "octo", login: "octo" }],
      truncated: false,
    });
    expect(calls.every(({ args }) => field(args, "search") === undefined)).toBe(true);
  });

  it("requests and removes user and team reviewers", async () => {
    const { adapter, writes } = setup(() => "{}");
    await adapter.requestReviewers(
      7,
      [{ id: "octo" }, { id: "team/core", team: true }],
      [{ id: "hubot" }],
    );
    const path = "repos/{owner}/{repo}/pulls/7/requested_reviewers";
    expect(writes()).toEqual([
      {
        args: ["api", "--method", "POST", path],
        input: { reviewers: ["octo"], team_reviewers: ["core"] },
      },
      {
        args: ["api", "--method", "DELETE", path],
        input: { reviewers: ["hubot"], team_reviewers: [] },
      },
    ]);
  });

  it("refuses a team from another organization before writing", async () => {
    const { adapter, writes } = setup(() => "{}");
    await expect(
      adapter.requestReviewers(7, [{ id: "octo" }], [{ id: "other/core", team: true }]),
    ).rejects.toThrow(msg("forge.responseInvalid"));
    expect(writes()).toEqual([]);
  });

  it("reads one commit as a unified diff", async () => {
    const { adapter, calls } = setup(() => "diff --git a/x b/x\n");
    expect(await adapter.commitDiff(7, "d".repeat(40))).toBe("diff --git a/x b/x\n");
    expect(calls[0]!.args).toEqual([
      "api",
      "-H",
      "Accept: application/vnd.github.diff",
      `repos/{owner}/{repo}/commits/${"d".repeat(40)}`,
    ]);
  });

  it("reacts to the description through the review's node id", async () => {
    const { adapter, writes } = setup((args) => (args[0] === "pr" ? "PR_node\n" : "{}"));
    await adapter.react(7, undefined, "+1", true);
    const [mutation] = writes();
    expect(query(mutation!.args)).toContain("addReaction(input: {subjectId: $subject");
    expect(field(mutation!.args, "subject")).toBe("PR_node");
    expect(field(mutation!.args, "content")).toBe("THUMBS_UP");
  });

  it("removes a comment reaction only after confirming the comment is on this review", async () => {
    const subject = (node: Record<string, unknown>) => ({
      data: { repository: { pullRequest: { id: "PR_node" } }, node },
    });
    const own = setup((args) =>
      query(args).includes("node(id:") ? subject({ conversationReview: { id: "PR_node" } }) : "{}",
    );
    await own.adapter.react(7, "IC_1", "eyes", false);
    const [mutation] = own.writes();
    expect(query(mutation!.args)).toContain("removeReaction(");
    expect(field(mutation!.args, "subject")).toBe("IC_1");
    expect(field(mutation!.args, "content")).toBe("EYES");

    const inline = setup((args) =>
      query(args).includes("node(id:") ? subject({ inlineReview: { id: "PR_node" } }) : "{}",
    );
    await inline.adapter.react(7, "PRRC_1", "heart", true);
    expect(inline.writes()).toHaveLength(1);

    for (const node of [
      { conversationReview: { id: "PR_other" } },
      { inlineReview: { id: "PR_other" } },
      { conversationReview: null },
      {},
    ]) {
      const other = setup((args) => (query(args).includes("node(id:") ? subject(node) : "{}"));
      await expect(other.adapter.react(7, "IC_9", "eyes", true)).rejects.toThrow(
        msg("forge.responseInvalid"),
      );
      expect(other.writes()).toEqual([]);
    }
  });

  it("aliases fields whose GraphQL types differ in nullability", () => {
    // GitHub's field-merging rule rejects one response key with two nullabilities:
    // User.name/avatarUrl vs Team's, and IssueComment vs PullRequestReviewComment.pullRequest.
    expect(PR_METADATA_QUERY).toContain(
      "... on Team { combinedSlug teamName: name teamAvatarUrl: avatarUrl }",
    );
    expect(REACTION_SUBJECT_QUERY).toContain("conversationReview: pullRequest");
    expect(REACTION_SUBJECT_QUERY).toContain("inlineReview: pullRequest");
  });

  it("submits one review with every line comment pinned to the head", async () => {
    const { adapter, writes } = setup(() => "{}");
    await adapter.submitDraft(7, {
      decision: "comment",
      body: "",
      headSha: "e".repeat(40),
      comments: [
        { path: "src/a.ts", side: "RIGHT", line: 12, startLine: 10, body: "Range" },
        { path: "src/b.ts", side: "LEFT", line: 3, startLine: 3, body: "Line" },
      ],
    });
    expect(writes()).toEqual([
      {
        args: ["api", "--method", "POST", "repos/{owner}/{repo}/pulls/7/reviews"],
        input: {
          commit_id: "e".repeat(40),
          event: "COMMENT",
          comments: [
            {
              path: "src/a.ts",
              body: "Range",
              line: 12,
              side: "RIGHT",
              start_line: 10,
              start_side: "RIGHT",
            },
            { path: "src/b.ts", body: "Line", line: 3, side: "LEFT" },
          ],
        },
      },
    ]);
  });

  it("submits a request-changes decision with its body", async () => {
    const { adapter, writes } = setup(() => "{}");
    await adapter.submitDraft(7, {
      decision: "request-changes",
      body: "Fix it",
      headSha: "e".repeat(40),
      comments: [{ path: "a", side: "RIGHT", line: 1, body: "x" }],
    });
    expect(writes()[0]!.input).toMatchObject({ event: "REQUEST_CHANGES", body: "Fix it" });
  });
});
