/**
 * gh commands for review metadata: labels, reviewer requests, reactions,
 * line-comment review drafts, and single-commit diffs. They run through the
 * owning GitHubService's account- and repository-pinned `gh` environment;
 * `{owner}`/`{repo}` placeholders resolve from that pinned GH_REPO.
 */

import type {
  ForgePrLabelCandidatesResult,
  ForgePrReviewerCandidatesResult,
  ForgeReviewDraftComment,
  ForgeReviewerRef,
  PrLabel,
  PrReactionContent,
  PrReviewDecision,
  PrReviewer,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { mapPrLabel } from "./githubMappers";
import {
  GITHUB_REACTION_CONTENT,
  mapRequestedReviewer,
  PR_METADATA_QUERY,
  reactionMutation,
  REACTION_SUBJECT_QUERY,
  reactionSubjectReviewId,
  REVIEWER_TEAMS_QUERY,
  REVIEWER_USERS_QUERY,
} from "./githubPrMetadata";

export interface GhMetadataRunner {
  run(args: string[], operation: string, options?: { maxBufferBytes?: number }): Promise<string>;
  /** Runs with `body` as the JSON request body, passed through a private temp file. */
  runWithInput(args: string[], body: unknown, operation: string): Promise<string>;
}

const LABEL_PAGE_SIZE = 100;
const LABEL_MAX_PAGES = 3;
const COMMIT_DIFF_MAX_BUFFER_BYTES = 50 * 1024 * 1024;
const REVIEW_EVENTS: Record<PrReviewDecision, string> = {
  approve: "APPROVE",
  "request-changes": "REQUEST_CHANGES",
  comment: "COMMENT",
};

function graphql(query: string, variables: string[]): string[] {
  return ["api", "graphql", "-F", "owner={owner}", ...variables, "-f", `query=${query}`];
}
function repositoryGraphql(query: string, number: number, variables: string[] = []): string[] {
  return graphql(query, ["-F", "name={repo}", "-F", `number=${number}`, ...variables]);
}
function json(output: string): Record<string, unknown> {
  const value = JSON.parse(output) as unknown;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function at(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      current && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined,
    value,
  );
}
function connection(value: unknown): { nodes: unknown[]; totalCount: number } {
  const nodes = at(value, "nodes");
  const totalCount = at(value, "totalCount");
  const list = Array.isArray(nodes) ? nodes : [];
  return { nodes: list, totalCount: typeof totalCount === "number" ? totalCount : list.length };
}

export class GitHubPrMetadataCommands {
  constructor(private readonly gh: GhMetadataRunner) {}

  /** Reactions and lifecycle events; the caller treats a failure as "unavailable". */
  readMetadata(number: number): Promise<string> {
    return this.gh.run(repositoryGraphql(PR_METADATA_QUERY, number), "api pull request metadata");
  }

  async labelCandidates(): Promise<ForgePrLabelCandidatesResult> {
    const labels: PrLabel[] = [];
    for (let page = 1; page <= LABEL_MAX_PAGES; page++) {
      const items = JSON.parse(
        await this.gh.run(
          ["api", `repos/{owner}/{repo}/labels?per_page=${LABEL_PAGE_SIZE}&page=${page}`],
          "api labels",
        ),
      ) as unknown;
      if (!Array.isArray(items)) throw new Error(msg("forge.responseInvalid"));
      labels.push(...items.map(mapPrLabel).filter((label): label is PrLabel => label !== null));
      // A full last page may hide more; one bounded read reports that instead of paging on.
      if (items.length < LABEL_PAGE_SIZE) return { labels, truncated: false };
    }
    return { labels, truncated: true };
  }

  /**
   * Adding a missing label through the issues API silently creates it, so each
   * added name is looked up first and an unknown name fails before any write.
   */
  async setLabels(number: number, add: string[], remove: string[]): Promise<void> {
    const issue = `repos/{owner}/{repo}/issues/${number}/labels`;
    const names = await Promise.all(
      add.map(async (name) => {
        const label = mapPrLabel(
          json(
            await this.gh.run(
              ["api", `repos/{owner}/{repo}/labels/${encodeURIComponent(name)}`],
              "api label",
            ),
          ),
        );
        if (!label) throw new Error(msg("forge.responseInvalid"));
        return label.name;
      }),
    );
    if (names.length)
      await this.gh.runWithInput(
        ["api", "--method", "POST", issue],
        { labels: names },
        "api add labels",
      );
    for (const name of remove)
      await this.gh.run(
        ["api", "--method", "DELETE", `${issue}/${encodeURIComponent(name)}`],
        "api remove label",
      );
  }

  async reviewerCandidates(
    number: number,
    search?: string,
  ): Promise<ForgePrReviewerCandidatesResult> {
    const searchArgs = search ? ["-f", `search=${search}`] : [];
    const [users, teams] = await Promise.all([
      this.gh.run(
        repositoryGraphql(REVIEWER_USERS_QUERY, number, searchArgs),
        "api reviewer candidates",
      ),
      this.gh
        .run(graphql(REVIEWER_TEAMS_QUERY, searchArgs), "api team reviewer candidates")
        .then((output) => connection(at(json(output), "data", "organization", "teams")))
        .catch(() => ({ nodes: [], totalCount: 0 })),
    ]);
    const repository = at(json(users), "data", "repository");
    if (!repository) throw new Error(msg("forge.responseInvalid"));
    const assignable = connection(at(repository, "assignableUsers"));
    const author = at(repository, "pullRequest", "author", "login");
    // GitHub refuses a review request to the review's own author.
    const reviewers = [
      ...assignable.nodes
        .map((node) => mapRequestedReviewer({ ...(node as object), __typename: "User" }))
        .filter((user) => user && user.login !== author),
      ...teams.nodes.map((node) =>
        mapRequestedReviewer({ ...(node as object), __typename: "Team" }),
      ),
    ].filter((reviewer): reviewer is PrReviewer => reviewer !== undefined);
    return {
      reviewers,
      truncated:
        assignable.totalCount > assignable.nodes.length || teams.totalCount > teams.nodes.length,
    };
  }

  /** Team ids are `org/slug`; the REST endpoint takes the slug within the repository's org. */
  async requestReviewers(
    number: number,
    owner: string,
    add: ForgeReviewerRef[],
    remove: ForgeReviewerRef[],
  ): Promise<void> {
    const body = (refs: ForgeReviewerRef[]) => ({
      reviewers: refs.filter((ref) => !ref.team).map((ref) => ref.id),
      team_reviewers: refs
        .filter((ref) => ref.team)
        .map((ref) => {
          const [org, slug, extra] = ref.id.split("/");
          if (
            extra !== undefined ||
            (slug !== undefined && org!.toLowerCase() !== owner.toLowerCase())
          )
            throw new Error(msg("forge.responseInvalid"));
          return slug ?? org!;
        }),
    });
    const path = `repos/{owner}/{repo}/pulls/${number}/requested_reviewers`;
    const added = body(add);
    const removed = body(remove);
    if (add.length)
      await this.gh.runWithInput(["api", "--method", "POST", path], added, "api request reviewers");
    if (remove.length)
      await this.gh.runWithInput(
        ["api", "--method", "DELETE", path],
        removed,
        "api remove reviewers",
      );
  }

  /**
   * GitHub ids from `gh` and GraphQL are node ids, which reactions take directly.
   * A comment subject must belong to this review, so a client cannot react
   * elsewhere through it.
   */
  async react(
    number: number,
    subjectId: string | undefined,
    content: PrReactionContent,
    reacted: boolean,
  ): Promise<void> {
    let subject: string;
    if (subjectId) {
      const data = at(
        json(
          await this.gh.run(
            repositoryGraphql(REACTION_SUBJECT_QUERY, number, ["-f", `subject=${subjectId}`]),
            "api reaction subject",
          ),
        ),
        "data",
      );
      const review = at(data, "repository", "pullRequest", "id");
      if (typeof review !== "string" || reactionSubjectReviewId(at(data, "node")) !== review)
        throw new Error(msg("forge.responseInvalid"));
      subject = subjectId;
    } else {
      subject = (
        await this.gh.run(
          ["pr", "view", String(number), "--json", "id", "--jq", ".id"],
          "pr view --json id",
        )
      ).trim();
      if (!subject) throw new Error(msg("forge.responseInvalid"));
    }
    await this.gh.run(
      [
        "api",
        "graphql",
        "-f",
        `query=${reactionMutation(reacted)}`,
        "-f",
        `subject=${subject}`,
        "-f",
        `content=${GITHUB_REACTION_CONTENT[content]}`,
      ],
      reacted ? "api add reaction" : "api remove reaction",
    );
  }

  /** One review carrying every line comment, pinned to `headSha`: atomic on GitHub. */
  async submitDraft(
    number: number,
    input: {
      decision: PrReviewDecision;
      body: string;
      headSha: string;
      comments: ForgeReviewDraftComment[];
    },
  ): Promise<void> {
    await this.gh.runWithInput(
      ["api", "--method", "POST", `repos/{owner}/{repo}/pulls/${number}/reviews`],
      {
        commit_id: input.headSha,
        event: REVIEW_EVENTS[input.decision],
        ...(input.body.trim() ? { body: input.body } : {}),
        comments: input.comments.map((comment) => ({
          path: comment.path,
          body: comment.body,
          line: comment.line,
          side: comment.side,
          // GitHub rejects a range whose start equals its end.
          ...(comment.startLine !== undefined && comment.startLine < comment.line
            ? { start_line: comment.startLine, start_side: comment.side }
            : {}),
        })),
      },
      "api submit review",
    );
  }

  /** GitHub serves a commit as a unified diff against its first parent. */
  commitDiff(sha: string): Promise<string> {
    return this.gh.run(
      ["api", "-H", "Accept: application/vnd.github.diff", `repos/{owner}/{repo}/commits/${sha}`],
      "api commit diff",
      { maxBufferBytes: COMMIT_DIFF_MAX_BUFFER_BYTES },
    );
  }
}
